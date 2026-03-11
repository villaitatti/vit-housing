import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { sendSuccess, sendError } from '../lib/response.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { createInvitationSchema, validateInvitationTokenSchema } from '@vithousing/shared';
import { sendInvitationEmail } from '../services/email.service.js';
import {
  buildInvitationExpiryDate,
  generateInvitationToken,
  getInvitationStatus,
  hashInvitationToken,
  normalizeEmail,
} from '../lib/invitations.js';
import { createRateLimitMiddleware } from '../middleware/rateLimit.js';

const router = Router();
const invitationValidationRateLimit = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
  code: 'RATE_LIMITED',
  message: 'Too many invitation link attempts. Please try again later.',
});

const invitationSelect = {
  id: true,
  email: true,
  first_name: true,
  last_name: true,
  role: true,
  language: true,
  used: true,
  revoked_at: true,
  created_at: true,
  expires_at: true,
  invited_by: true,
} as const;

class InvitationDeliveryError extends Error {
  constructor() {
    super('INVITATION_DELIVERY_FAILED');
    this.name = 'InvitationDeliveryError';
  }
}

function redactEmail(email: string): string {
  const [localPart, domain = ''] = email.split('@');
  if (!localPart) {
    return `***@${domain}`;
  }

  return `${localPart[0]}***@${domain}`;
}

function sanitizeErrorIdentifier(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const code = 'code' in err ? err.code : null;
    if (typeof code === 'string' && code.trim().length > 0) {
      return code.trim().slice(0, 64);
    }

    const name = 'name' in err ? err.name : null;
    if (typeof name === 'string' && name.trim().length > 0) {
      return name.trim().slice(0, 64);
    }
  }

  return 'unknown';
}

function isActiveInvitationConflictError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }

  const targets = Array.isArray(err.meta?.target)
    ? err.meta.target
    : err.meta?.target
      ? [err.meta.target]
      : [];

  return targets.some((target) => String(target).includes('Invitation_active_email_key') || String(target).includes('email'))
    || err.message.includes('Invitation_active_email_key');
}

async function acquireInvitationEmailLock(tx: Prisma.TransactionClient, email: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email})::bigint)`;
}

// POST /api/v1/invitations — Admin creates invitation
router.post(
  '/',
  authenticate,
  requireRole('HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  validate(createInvitationSchema),
  async (req: Request, res: Response) => {
    try {
      const { email, first_name, last_name, role, language } = req.body;
      const normalizedEmail = normalizeEmail(email);

      const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existingUser) {
        sendError(res, 'A user with this email already exists', 'EMAIL_EXISTS', 400);
        return;
      }

      const token = generateInvitationToken();
      const expiresAt = buildInvitationExpiryDate();
      const stagedRevokedAt = new Date();

      const invitation = await prisma.invitation.create({
        data: {
          email: normalizedEmail,
          first_name: first_name ?? null,
          last_name: last_name ?? null,
          role,
          language,
          token_hash: hashInvitationToken(token),
          expires_at: expiresAt,
          invited_by: req.user!.userId,
          revoked_at: stagedRevokedAt,
        },
        select: invitationSelect,
      });

      try {
        await sendInvitationEmail({
          to: normalizedEmail,
          token,
          role,
          lang: language,
          firstName: first_name,
          lastName: last_name,
          expiresAt,
        });
      } catch (emailError) {
        console.error('Invitation email send error:', {
          invitationId: invitation.id,
          redactedEmail: redactEmail(normalizedEmail),
          error: sanitizeErrorIdentifier(emailError),
        });
        try {
          await prisma.invitation.delete({
            where: { id: invitation.id },
          });
        } catch (cleanupError) {
          console.error('Invitation cleanup error:', {
            invitationId: invitation.id,
            redactedEmail: redactEmail(normalizedEmail),
            error: sanitizeErrorIdentifier(cleanupError),
          });
        }

        throw new InvitationDeliveryError();
      }

      const activatedInvitation = await prisma.$transaction(async (tx) => {
        await acquireInvitationEmailLock(tx, normalizedEmail);

        await tx.invitation.updateMany({
          where: {
            email: normalizedEmail,
            used: false,
            revoked_at: null,
          },
          data: {
            revoked_at: new Date(),
          },
        });

        return tx.invitation.update({
          where: { id: invitation.id },
          data: { revoked_at: null },
          select: invitationSelect,
        });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });

      sendSuccess(res, { invitation: activatedInvitation }, 201);
    } catch (err) {
      if (err instanceof InvitationDeliveryError) {
        sendError(res, 'Failed to create invitation', 'INVITE_ERROR', 500);
        return;
      }

      if (isActiveInvitationConflictError(err)) {
        sendError(res, 'An active invitation for this email already exists', 'INVITATION_EXISTS', 409);
        return;
      }

      console.error('Create invitation error:', {
        error: sanitizeErrorIdentifier(err),
      });
      sendError(res, 'Failed to create invitation', 'INVITE_ERROR', 500);
    }
  },
);

// GET /api/v1/invitations — Admin lists all invitations
router.get(
  '/',
  authenticate,
  requireRole('HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  async (_req: Request, res: Response) => {
    try {
      const invitations = await prisma.invitation.findMany({
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          role: true,
          language: true,
          used: true,
          revoked_at: true,
          created_at: true,
          expires_at: true,
          inviter: {
            select: {
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
      });
      sendSuccess(res, { invitations });
    } catch (err) {
      sendError(res, 'Failed to fetch invitations', 'FETCH_ERROR', 500);
    }
  },
);

// POST /api/v1/invitations/validate — Public token validation
router.post('/validate', invitationValidationRateLimit, validate(validateInvitationTokenSchema), async (req: Request, res: Response) => {
  try {
    const tokenHash = hashInvitationToken(req.body.token as string);
    const invitation = await prisma.invitation.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!invitation) {
      sendError(res, 'Invalid invitation token', 'INVALID_TOKEN', 404);
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

    sendSuccess(res, {
      email: invitation.email,
      first_name: invitation.first_name,
      last_name: invitation.last_name,
      role: invitation.role,
      language: invitation.language,
      expires_at: invitation.expires_at,
      status,
    });
  } catch (err) {
    sendError(res, 'Failed to validate token', 'VALIDATE_ERROR', 500);
  }
});

export default router;
