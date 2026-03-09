import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { sendSuccess, sendError } from '../lib/response.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema, vitIdCallbackSchema } from '@vithousing/shared';
import { Role as PrismaRole } from '../generated/prisma/client.js';
import { getUserAuth0Roles } from '../services/auth0.service.js';

const router = Router();

const BCRYPT_ROUNDS = 12;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
  path: '/',
};

// POST /api/v1/auth/login — Local email/password login
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      sendError(res, 'Invalid email or password', 'INVALID_CREDENTIALS', 401);
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      sendError(res, 'Invalid email or password', 'INVALID_CREDENTIALS', 401);
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { last_login: new Date() },
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      roles: user.roles,
      preferred_language: user.preferred_language,
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
    sendError(res, 'Login failed', 'LOGIN_ERROR', 500);
  }
});

// POST /api/v1/auth/register — Register via invitation token
router.post('/register', validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const { token, first_name, last_name, password, preferred_language, phone_number, mobile_number } =
      req.body;

    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation) {
      sendError(res, 'Invalid invitation token', 'INVALID_TOKEN', 400);
      return;
    }

    if (invitation.used) {
      sendError(res, 'This invitation has already been used', 'TOKEN_USED', 400);
      return;
    }

    if (new Date() > invitation.expires_at) {
      sendError(res, 'This invitation has expired', 'TOKEN_EXPIRED', 400);
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (existingUser) {
      sendError(res, 'An account with this email already exists', 'EMAIL_EXISTS', 400);
      return;
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await prisma.$transaction([
      prisma.user.create({
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
      }),
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { used: true },
      }),
    ]);

    sendSuccess(res, { message: 'Registration successful' }, 201);
  } catch (err) {
    sendError(res, 'Registration failed', 'REGISTER_ERROR', 500);
  }
});

// POST /api/v1/auth/vit-id/callback — Auth0 VIT ID callback
router.post('/vit-id/callback', validate(vitIdCallbackSchema), async (req: Request, res: Response) => {
  try {
    // Validate Auth0 token using express-oauth2-jwt-bearer
    // For now, we extract the user info from the token
    const { access_token } = req.body;

    // Decode the Auth0 JWT to get user info
    // In production, this should be validated against Auth0 JWKS
    const parts = access_token.split('.');
    if (parts.length !== 3) {
      sendError(res, 'Invalid token format', 'INVALID_TOKEN', 400);
      return;
    }

    let auth0Payload: { sub?: string; email?: string; given_name?: string; family_name?: string };
    try {
      auth0Payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    } catch {
      sendError(res, 'Invalid token', 'INVALID_TOKEN', 400);
      return;
    }

    if (!auth0Payload.sub || !auth0Payload.email) {
      sendError(res, 'Token missing required claims', 'INVALID_TOKEN', 400);
      return;
    }

    // Look up existing user by auth0_user_id
    let user = await prisma.user.findUnique({
      where: { auth0_user_id: auth0Payload.sub },
    });

    // Resolve local roles from Auth0 roles via mappings
    let resolvedRoles: PrismaRole[] = [PrismaRole.HOUSE_USER];
    try {
      const auth0Roles = await getUserAuth0Roles(auth0Payload.sub);
      if (auth0Roles.length > 0) {
        const mappings = await prisma.auth0RoleMapping.findMany({
          where: { auth0_role_id: { in: auth0Roles.map((r: { id: string }) => r.id) } },
        });
        if (mappings.length > 0) {
          const mapped = [...new Set(mappings.map(m => m.local_role))];
          resolvedRoles = mapped;
        }
      }
    } catch (err) {
      // If Auth0 Management API is not configured, fall back to default roles
      console.warn('Could not resolve Auth0 roles, using default:', err);
    }

    if (!user) {
      // Auto-provision new user with resolved roles
      user = await prisma.user.create({
        data: {
          email: auth0Payload.email,
          auth0_user_id: auth0Payload.sub,
          first_name: auth0Payload.given_name || '',
          last_name: auth0Payload.family_name || '',
          roles: resolvedRoles,
          preferred_language: 'EN',
        },
      });
    } else {
      // Update last login and roles (roles re-evaluated on every login)
      user = await prisma.user.update({
        where: { id: user.id },
        data: { last_login: new Date(), roles: resolvedRoles },
      });
    }

    // Issue local JWT
    const token = signToken({
      userId: user.id,
      email: user.email,
      roles: user.roles,
      preferred_language: user.preferred_language,
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

// POST /api/v1/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token', { path: '/' });
  sendSuccess(res, { message: 'Logged out' });
});

export default router;
