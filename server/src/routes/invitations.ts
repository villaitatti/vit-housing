import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { sendSuccess, sendError } from '../lib/response.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { createInvitationSchema } from '@vithousing/shared';
import { sendInvitationEmail } from '../services/email.service.js';

const router = Router();

// POST /api/v1/invitations — Admin creates invitation
router.post(
  '/',
  authenticate,
  requireRole('HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  validate(createInvitationSchema),
  async (req: Request, res: Response) => {
    try {
      const { email, role, language } = req.body;

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        sendError(res, 'A user with this email already exists', 'EMAIL_EXISTS', 400);
        return;
      }

      const existingInvitation = await prisma.invitation.findFirst({
        where: { email, used: false, expires_at: { gt: new Date() } },
      });
      if (existingInvitation) {
        sendError(res, 'An active invitation already exists for this email', 'INVITE_EXISTS', 400);
        return;
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invitation = await prisma.invitation.create({
        data: {
          email,
          role,
          language,
          token,
          expires_at: expiresAt,
          invited_by: req.user!.userId,
        },
      });

      await sendInvitationEmail(email, token, role, language);

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
        include: { inviter: { select: { first_name: true, last_name: true, email: true } } },
      });
      sendSuccess(res, { invitations });
    } catch (err) {
      sendError(res, 'Failed to fetch invitations', 'FETCH_ERROR', 500);
    }
  },
);

// GET /api/v1/invitations/validate/:token — Public token validation
router.get('/validate/:token', async (req: Request, res: Response) => {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { token: req.params.token as string },
    });

    if (!invitation) {
      sendError(res, 'Invalid invitation token', 'INVALID_TOKEN', 404);
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

    sendSuccess(res, {
      email: invitation.email,
      role: invitation.role,
      language: invitation.language,
    });
  } catch (err) {
    sendError(res, 'Failed to validate token', 'VALIDATE_ERROR', 500);
  }
});

export default router;
