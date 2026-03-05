import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { sendSuccess, sendError } from '../lib/response.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { updateUserSchema, adminUpdateUserSchema } from '@vithousing/shared';

const router = Router();

// GET /api/v1/users/me — Current user profile
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        preferred_language: true,
        phone_number: true,
        mobile_number: true,
        auth0_user_id: true,
        created_at: true,
        last_login: true,
      },
    });

    if (!user) {
      sendError(res, 'User not found', 'NOT_FOUND', 404);
      return;
    }

    sendSuccess(res, { user });
  } catch (err) {
    sendError(res, 'Failed to fetch user', 'FETCH_ERROR', 500);
  }
});

// PATCH /api/v1/users/me — Update own profile
router.patch('/me', authenticate, validate(updateUserSchema), async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: req.body,
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        preferred_language: true,
        phone_number: true,
        mobile_number: true,
      },
    });

    sendSuccess(res, { user });
  } catch (err) {
    sendError(res, 'Failed to update profile', 'UPDATE_ERROR', 500);
  }
});

// GET /api/v1/users — Admin: list all users
router.get('/', authenticate, requireRole('HOUSE_ADMIN', 'HOUSE_IT_ADMIN'), async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          role: true,
          preferred_language: true,
          phone_number: true,
          mobile_number: true,
          created_at: true,
          last_login: true,
          auth0_user_id: true,
        },
      }),
      prisma.user.count(),
    ]);

    sendSuccess(res, {
      items: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    sendError(res, 'Failed to fetch users', 'FETCH_ERROR', 500);
  }
});

// PATCH /api/v1/users/:id — Admin: update user
router.patch(
  '/:id',
  authenticate,
  requireRole('HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  validate(adminUpdateUserSchema),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const user = await prisma.user.update({
        where: { id },
        data: req.body,
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          role: true,
          preferred_language: true,
          phone_number: true,
          mobile_number: true,
        },
      });

      sendSuccess(res, { user });
    } catch (err) {
      sendError(res, 'Failed to update user', 'UPDATE_ERROR', 500);
    }
  },
);

// DELETE /api/v1/users/:id — Admin: delete user (local DB only, never Auth0)
router.delete(
  '/:id',
  authenticate,
  requireRole('HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);

      if (id === req.user!.userId) {
        sendError(res, 'Cannot delete your own account', 'SELF_DELETE', 400);
        return;
      }

      await prisma.user.delete({ where: { id } });
      sendSuccess(res, { message: 'User deleted' });
    } catch (err) {
      sendError(res, 'Failed to delete user', 'DELETE_ERROR', 500);
    }
  },
);

export default router;
