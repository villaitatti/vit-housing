import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { sendSuccess, sendError } from '../lib/response.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema, vitIdCallbackSchema, forgotPasswordSchema, resetPasswordSchema, changeEmailSchema, confirmEmailChangeSchema, EMAIL_CHANGE_EXPIRY_HOURS } from '@vithousing/shared';
import { Role as PrismaRole, Prisma } from '../generated/prisma/client.js';
import { getUserAuth0Roles } from '../services/auth0.service.js';
import { verifyAuth0Token } from '../lib/auth0-jwt.js';
import { hashInvitationToken, getInvitationStatus } from '../lib/invitations.js';
import { generatePasswordResetToken, hashPasswordResetToken, buildPasswordResetExpiryDate } from '../lib/password-reset.js';
import { sendPasswordResetEmail, sendEmailChangeVerification, sendEmailChangedNotification } from '../services/email.service.js';
import { normalizeEmail } from '../lib/email.js';
import { hashPassword, needsPasswordRehash, validatePasswordPolicy, verifyPassword } from '../lib/password.js';
import { createRateLimitMiddleware } from '../middleware/rateLimit.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
  path: '/',
};
const loginRateLimit = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  code: 'RATE_LIMITED',
  message: 'Too many login attempts. Please try again later.',
});
const registrationRateLimit = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  code: 'RATE_LIMITED',
  message: 'Too many registration attempts. Please try again later.',
});
const passwordResetRateLimit = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  code: 'RATE_LIMITED',
  message: 'Too many password reset attempts. Please try again later.',
});
const emailChangeRateLimit = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  code: 'RATE_LIMITED',
  message: 'Too many email change attempts. Please try again later.',
  keyGenerator: (req) => req.user?.userId ? `user:${req.user.userId}` : (req.ip || 'unknown'),
});

class InvitationUnavailableError extends Error {
  constructor() {
    super('This invitation is no longer available');
    this.name = 'InvitationUnavailableError';
  }
}

class EmailExistsError extends Error {
  constructor() {
    super('An account with this email already exists');
    this.name = 'EmailExistsError';
  }
}

// POST /api/v1/auth/login — Local email/password login
router.post('/login', loginRateLimit, validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.password) {
      sendError(res, 'Invalid email or password', 'INVALID_CREDENTIALS', 401);
      return;
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      sendError(res, 'Invalid email or password', 'INVALID_CREDENTIALS', 401);
      return;
    }

    const passwordUpdate = needsPasswordRehash(user.password)
      ? { password: await hashPassword(password) }
      : {};

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { last_login: new Date(), ...passwordUpdate },
    });

    const token = signToken({
      userId: updatedUser.id,
      email: updatedUser.email,
      roles: updatedUser.roles,
      preferred_language: updatedUser.preferred_language,
      token_version: updatedUser.token_version,
    });

    res.cookie('token', token, COOKIE_OPTIONS);
    sendSuccess(res, {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        first_name: updatedUser.first_name,
        last_name: updatedUser.last_name,
        roles: updatedUser.roles,
        preferred_language: updatedUser.preferred_language,
      },
    });
  } catch (err) {
    sendError(res, 'Login failed', 'LOGIN_ERROR', 500);
  }
});

// POST /api/v1/auth/register — Register via invitation token
router.post('/register', registrationRateLimit, validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const { token, first_name, last_name, password, preferred_language, phone_number, mobile_number } =
      req.body;

    const passwordPolicyError = validatePasswordPolicy(password);
    if (passwordPolicyError) {
      sendError(res, passwordPolicyError, 'WEAK_PASSWORD', 400);
      return;
    }

    const invitation = await prisma.invitation.findUnique({ where: { token_hash: hashInvitationToken(token) } });
    if (!invitation) {
      sendError(res, 'Invalid invitation token', 'INVALID_TOKEN', 400);
      return;
    }

    const status = getInvitationStatus(invitation);
    if (status === 'used') {
      sendError(res, 'This invitation has already been used', 'TOKEN_USED', 400);
      return;
    }

    if (status === 'expired') {
      sendError(res, 'This invitation has expired', 'TOKEN_EXPIRED', 400);
      return;
    }

    if (status === 'revoked') {
      sendError(res, 'This invitation has been replaced by a newer link', 'TOKEN_REVOKED', 400);
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (existingUser) {
      sendError(res, 'An account with this email already exists', 'EMAIL_EXISTS', 400);
      return;
    }

    const hashedPassword = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      const transactionNow = new Date();
      const transactionalExistingUser = await tx.user.findUnique({
        where: { email: invitation.email },
      });

      if (transactionalExistingUser) {
        throw new EmailExistsError();
      }

      const markInvitationUsed = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          used: false,
          revoked_at: null,
          expires_at: { gte: transactionNow },
        },
        data: {
          used: true,
        },
      });

      if (markInvitationUsed.count !== 1) {
        throw new InvitationUnavailableError();
      }

      await tx.user.create({
        data: {
          email: invitation.email,
          password: hashedPassword,
          first_name,
          last_name,
          roles: [invitation.role],
          preferred_language,
          phone_number: phone_number || null,
          mobile_number: mobile_number || null,
        },
      });
    });

    sendSuccess(res, { message: 'Registration successful' }, 201);
  } catch (err) {
    if (err instanceof InvitationUnavailableError) {
      sendError(res, 'This invitation is no longer available', 'TOKEN_UNAVAILABLE', 409);
      return;
    }

    if (
      err instanceof EmailExistsError ||
      (err && typeof err === 'object' && 'code' in err && err.code === 'P2002')
    ) {
      sendError(res, 'An account with this email already exists', 'EMAIL_EXISTS', 400);
      return;
    }

    sendError(res, 'Registration failed', 'REGISTER_ERROR', 500);
  }
});

// POST /api/v1/auth/vit-id/callback — Auth0 VIT ID callback
router.post('/vit-id/callback', validate(vitIdCallbackSchema), async (req: Request, res: Response) => {
  try {
    const { access_token } = req.body;

    // Verify Auth0 JWT signature against JWKS + validate issuer, audience, expiry, email_verified
    let auth0Payload: Awaited<ReturnType<typeof verifyAuth0Token>>;
    try {
      auth0Payload = await verifyAuth0Token(access_token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid token';
      sendError(res, message, 'INVALID_TOKEN', 401);
      return;
    }

    const normalizedAuth0Email = normalizeEmail(auth0Payload.email);

    // Look up existing user by auth0_user_id
    let user = await prisma.user.findUnique({
      where: { auth0_user_id: auth0Payload.sub },
    });

    // Resolve local roles from Auth0 roles via mappings
    let resolvedRoles: PrismaRole[] = [];
    try {
      const auth0Roles = await getUserAuth0Roles(auth0Payload.sub);
      if (auth0Roles.length > 0) {
        const mappings = await prisma.auth0RoleMapping.findMany({
          where: { auth0_role_id: { in: auth0Roles.map((r: { id: string }) => r.id) } },
        });
        if (mappings.length > 0) {
          resolvedRoles = [...new Set(mappings.map(m => m.local_role))];
        }
      }
    } catch (err) {
      // If Auth0 Management API is not configured, skip role resolution
      console.warn('Could not resolve Auth0 roles:', err);
    }

    if (!user) {
      // Check if a user with this email already exists (e.g., created via invitation)
      const existingByEmail = await prisma.user.findUnique({
        where: { email: normalizedAuth0Email },
      });

      if (existingByEmail) {
        // Only auto-link if account has no Auth0 identity or already matches this subject
        if (existingByEmail.auth0_user_id && existingByEmail.auth0_user_id !== auth0Payload.sub) {
          sendError(res, 'Email already linked to a different Auth0 account', 'ACCOUNT_CONFLICT', 403);
          return;
        }
        // Link Auth0 identity to existing account and merge roles
        const mergedRoles = resolvedRoles.length > 0
          ? [...new Set([...existingByEmail.roles, ...resolvedRoles])]
          : existingByEmail.roles;
        user = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            auth0_user_id: auth0Payload.sub,
            first_name: auth0Payload.given_name || existingByEmail.first_name,
            last_name: auth0Payload.family_name || existingByEmail.last_name,
            last_login: new Date(),
            roles: mergedRoles,
          },
        });
      } else {
        // Auto-provision new user; fall back to HOUSE_USER if no roles resolved
        user = await prisma.user.create({
          data: {
            email: normalizedAuth0Email,
            auth0_user_id: auth0Payload.sub,
            first_name: auth0Payload.given_name || '',
            last_name: auth0Payload.family_name || '',
            roles: resolvedRoles.length > 0 ? resolvedRoles : [PrismaRole.HOUSE_USER],
            preferred_language: 'EN',
            last_login: new Date(),
          },
        });
      }
    } else {
      // Update last login; merge resolved roles with existing roles
      const mergedRoles = resolvedRoles.length > 0
        ? [...new Set([...user.roles, ...resolvedRoles])]
        : user.roles;
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          last_login: new Date(),
          roles: mergedRoles,
        },
      });
    }

    // Issue local JWT
    const token = signToken({
      userId: user.id,
      email: user.email,
      roles: user.roles,
      preferred_language: user.preferred_language,
      token_version: user.token_version,
    });

    res.cookie('token', token, COOKIE_OPTIONS);
    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        roles: user.roles,
        preferred_language: user.preferred_language,
      },
    });
  } catch (err) {
    sendError(res, 'VIT ID login failed', 'VIT_ID_ERROR', 500);
  }
});

// POST /api/v1/auth/forgot-password — Request a password reset email
router.post('/forgot-password', passwordResetRateLimit, validate(forgotPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    // If user not found or has no password (Auth0-only), return success anyway to prevent email enumeration
    if (!user || !user.password) {
      sendSuccess(res, { message: 'If an account exists, a reset link has been sent' });
      return;
    }

    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const expiresAt = buildPasswordResetExpiryDate();

    // Invalidate any existing unused tokens for this user, then create new one
    await prisma.$transaction([
      prisma.passwordReset.updateMany({
        where: { user_id: user.id, used: false },
        data: { used: true },
      }),
      prisma.passwordReset.create({
        data: {
          token_hash: tokenHash,
          user_id: user.id,
          expires_at: expiresAt,
        },
      }),
    ]);

    const lang = user.preferred_language === 'IT' ? 'it' : 'en';
    await sendPasswordResetEmail({
      to: user.email,
      token,
      lang,
      firstName: user.first_name,
    });

    sendSuccess(res, { message: 'If an account exists, a reset link has been sent' });
  } catch (err) {
    console.error('Password reset request failed:', err);
    // Always return success to prevent email enumeration
    sendSuccess(res, { message: 'If an account exists, a reset link has been sent' });
  }
});

// POST /api/v1/auth/reset-password — Reset password with token
router.post('/reset-password', passwordResetRateLimit, validate(resetPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    const passwordPolicyError = validatePasswordPolicy(password);
    if (passwordPolicyError) {
      sendError(res, passwordPolicyError, 'WEAK_PASSWORD', 400);
      return;
    }

    const tokenHash = hashPasswordResetToken(token);
    const hashedPassword = await hashPassword(password);

    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();

      // Atomically claim the token — if another request already marked it used, count will be 0
      const claimed = await tx.passwordReset.updateMany({
        where: {
          token_hash: tokenHash,
          used: false,
          expires_at: { gt: now },
        },
        data: { used: true },
      });

      if (claimed.count === 0) return false;

      // Token was valid and is now claimed; look up user_id and update password
      const resetRecord = await tx.passwordReset.findUnique({
        where: { token_hash: tokenHash },
        select: { user_id: true },
      });

      if (!resetRecord) return false;

      await tx.user.update({
        where: { id: resetRecord.user_id },
        data: { password: hashedPassword },
      });

      return true;
    });

    if (!result) {
      sendError(res, 'Invalid or expired reset token', 'INVALID_TOKEN', 400);
      return;
    }

    sendSuccess(res, { message: 'Password has been reset successfully' });
  } catch (err) {
    sendError(res, 'Password reset failed', 'RESET_ERROR', 500);
  }
});

// POST /api/v1/auth/change-email — Request email change (local users only)
router.post('/change-email', authenticate, emailChangeRateLimit, validate(changeEmailSchema), async (req: Request, res: Response) => {
  try {
    const { new_email, current_password } = req.body;
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      sendError(res, 'User not found', 'NOT_FOUND', 404);
      return;
    }

    // Auth0 users cannot change email locally
    if (user.auth0_user_id) {
      sendError(res, 'Auth0 users cannot change their email here. Please update your email through your VIT ID provider.', 'FORBIDDEN', 403);
      return;
    }

    // Local users must have a password
    if (!user.password) {
      sendError(res, 'Cannot change email for this account type', 'FORBIDDEN', 403);
      return;
    }

    const normalizedNewEmail = normalizeEmail(new_email);

    // Must be different from current
    if (normalizedNewEmail === user.email) {
      sendError(res, 'New email must be different from your current email', 'SAME_EMAIL', 400);
      return;
    }

    // Verify current password
    const passwordValid = await verifyPassword(current_password, user.password);
    if (!passwordValid) {
      sendError(res, 'Incorrect password', 'INVALID_PASSWORD', 401);
      return;
    }

    // Check new email isn't already taken
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedNewEmail } });
    if (existingUser) {
      sendError(res, 'An account with this email already exists', 'EMAIL_EXISTS', 409);
      return;
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + EMAIL_CHANGE_EXPIRY_HOURS);

    // Store pending email change
    await prisma.user.update({
      where: { id: userId },
      data: {
        pending_email: normalizedNewEmail,
        email_change_token_hash: tokenHash,
        email_change_expires_at: expiresAt,
      },
    });

    // Send verification email to the new address
    const lang = user.preferred_language === 'IT' ? 'it' : 'en';
    await sendEmailChangeVerification({
      to: normalizedNewEmail,
      token,
      lang,
      firstName: user.first_name,
    });

    sendSuccess(res, { message: 'Verification email sent to your new address' });
  } catch (err) {
    console.error('Email change request failed:', err);
    sendError(res, 'Email change request failed', 'EMAIL_CHANGE_ERROR', 500);
  }
});

// POST /api/v1/auth/confirm-email-change — Confirm email change via token
router.post('/confirm-email-change', validate(confirmEmailChangeSchema), async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        email_change_token_hash: tokenHash,
        email_change_expires_at: { gt: new Date() },
        pending_email: { not: null },
      },
    });

    if (!user || !user.pending_email) {
      sendError(res, 'Invalid or expired email change token', 'INVALID_TOKEN', 400);
      return;
    }

    const newEmail = user.pending_email;
    const oldEmail = user.email;

    // Atomic swap: update email, clear pending fields, invalidate password resets
    // The unique constraint on email will catch races where another user claims it
    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: {
            email: newEmail,
            pending_email: null,
            email_change_token_hash: null,
            email_change_expires_at: null,
            token_version: { increment: 1 },
          },
        }),
        prisma.passwordReset.updateMany({
          where: { user_id: user.id, used: false },
          data: { used: true },
        }),
      ]);
    } catch (txErr) {
      if (txErr instanceof Prisma.PrismaClientKnownRequestError && txErr.code === 'P2002') {
        sendError(res, 'An account with this email already exists', 'EMAIL_EXISTS', 409);
        return;
      }
      throw txErr;
    }

    // Send notification to old email
    const lang = user.preferred_language === 'IT' ? 'it' : 'en';
    try {
      await sendEmailChangedNotification({
        to: oldEmail,
        newEmail,
        lang,
        firstName: user.first_name,
      });
    } catch (emailErr) {
      console.error('Failed to send email change notification to old address:', emailErr);
    }

    // Clear auth cookie to force re-login
    res.clearCookie('token', { path: '/' });
    sendSuccess(res, { message: 'Email changed successfully. Please log in with your new email.' });
  } catch (err) {
    console.error('Email change confirmation failed:', err);
    sendError(res, 'Email change confirmation failed', 'CONFIRM_EMAIL_ERROR', 500);
  }
});

// POST /api/v1/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token', { path: '/' });
  sendSuccess(res, { message: 'Logged out' });
});

export default router;
