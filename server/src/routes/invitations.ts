import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { sendSuccess, sendError } from '../lib/response.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { createInvitationSchema } from '@vithousing/shared';
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

      const invitation = await prisma.$transaction(async (tx) => {
        await tx.invitation.updateMany({
          where: {
            email: normalizedEmail,
            used: false,
            revoked_at: null,
            expires_at: { gt: new Date() },
          },
          data: {
            revoked_at: new Date(),
          },
        });

        return tx.invitation.create({
          data: {
            email: normalizedEmail,
            first_name: first_name ?? null,
            last_name: last_name ?? null,
            role,
            language,
            token_hash: hashInvitationToken(token),
            expires_at: expiresAt,
            invited_by: req.user!.userId,
          },
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
            invited_by: true,
          },
        });
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
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: { revoked_at: new Date() },
        });
        throw emailError;
      }

      sendSuccess(res, { invitation }, 201);
    } catch (err) {
      console.error('Create invitation error:', err);
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

// GET /api/v1/invitations/validate/:token — Public token validation
router.get('/validate/:token', invitationValidationRateLimit, async (req: Request, res: Response) => {
  try {
    const tokenHash = hashInvitationToken(req.params.token as string);
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
