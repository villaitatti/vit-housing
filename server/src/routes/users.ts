import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { serializeUserAvatar } from '../lib/avatar.js';
import { sendSuccess, sendError } from '../lib/response.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { updateUserSchema, adminUpdateUserSchema, adminUserListSchema } from '@vithousing/shared';
import {
  deleteLocalFile,
  processAndSaveProfilePhoto,
  uploadMiddleware,
} from '../services/upload.service.js';
import { parseId } from '../lib/validators.js';

const router = Router();

const userProfileSelect = {
  id: true,
  email: true,
  first_name: true,
  last_name: true,
  roles: true,
  preferred_language: true,
  phone_number: true,
  mobile_number: true,
  auth0_user_id: true,
  profile_photo_path: true,
  profile_photo_url: true,
  created_at: true,
  last_login: true,
} satisfies Prisma.UserSelect;

const userAdminListSelect = {
  ...userProfileSelect,
  _count: { select: { listings: true } },
} satisfies Prisma.UserSelect;

// GET /api/v1/users/me — Current user profile
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: userProfileSelect,
    });

    if (!user) {
      sendError(res, 'User not found', 'NOT_FOUND', 404);
      return;
    }

    sendSuccess(res, { user: serializeUserAvatar(user) });
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
      select: userProfileSelect,
    });

    sendSuccess(res, { user: serializeUserAvatar(user) });
  } catch (err) {
    sendError(res, 'Failed to update profile', 'UPDATE_ERROR', 500);
  }
});

// POST /api/v1/users/me/photo — Upload profile photo
router.post('/me/photo', authenticate, uploadMiddleware.single('photo'), async (req: Request, res: Response) => {
  if (!req.file) {
    sendError(res, 'A profile photo is required', 'BAD_REQUEST', 400);
    return;
  }

  let savedPhoto: Awaited<ReturnType<typeof processAndSaveProfilePhoto>> | null = null;

  try {
    savedPhoto = await processAndSaveProfilePhoto(req.file.buffer);

    const existingUser = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: userProfileSelect,
    });

    if (!existingUser) {
      await deleteLocalFile(savedPhoto.filePath);
      sendError(res, 'User not found', 'NOT_FOUND', 404);
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        profile_photo_path: savedPhoto.filePath,
        profile_photo_url: savedPhoto.url,
      } satisfies Prisma.UserUpdateInput,
      select: userProfileSelect,
    });

    if (existingUser.profile_photo_path && existingUser.profile_photo_path !== savedPhoto.filePath) {
      await deleteLocalFile(existingUser.profile_photo_path);
    }

    sendSuccess(res, { user: serializeUserAvatar(user) });
  } catch (err) {
    if (savedPhoto) {
      await deleteLocalFile(savedPhoto.filePath);
    }
    const message = err instanceof Error ? err.message : 'Failed to upload profile photo';
    sendError(res, message, 'UPLOAD_ERROR', 400);
  }
});

// DELETE /api/v1/users/me/photo — Remove profile photo
router.delete('/me/photo', authenticate, async (req: Request, res: Response) => {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: userProfileSelect,
    });

    if (!existingUser) {
      sendError(res, 'User not found', 'NOT_FOUND', 404);
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        profile_photo_path: null,
        profile_photo_url: null,
      } satisfies Prisma.UserUpdateInput,
      select: userProfileSelect,
    });

    if (existingUser.profile_photo_path) {
      await deleteLocalFile(existingUser.profile_photo_path);
    }

    sendSuccess(res, { user: serializeUserAvatar(user) });
  } catch (err) {
    sendError(res, 'Failed to remove profile photo', 'DELETE_ERROR', 500);
  }
});

// GET /api/v1/users — Admin: list all users
router.get('/', authenticate, requireRole('HOUSE_ADMIN', 'HOUSE_IT_ADMIN'), validate(adminUserListSchema, 'query'), async (req: Request, res: Response) => {
  try {
    const { search, roles, sortBy, sortOrder, page, limit } = req.query as any;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { first_name: { contains: search, mode: 'insensitive' } },
        { last_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (roles && Array.isArray(roles) && roles.length > 0) {
      where.roles = { hasSome: roles };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        select: userAdminListSelect,
      }),
      prisma.user.count({ where }),
    ]);

    sendSuccess(res, {
      items: users.map((user) => serializeUserAvatar(user)),
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
      // Privilege ceiling: only HOUSE_IT_ADMIN callers can assign or remove the HOUSE_IT_ADMIN role
      const callerRoles = req.user!.roles;
      if (
        req.body.roles &&
        req.body.roles.includes('HOUSE_IT_ADMIN') &&
        !callerRoles.includes('HOUSE_IT_ADMIN')
      ) {
        sendError(res, 'Only IT admins can assign the IT admin role', 'FORBIDDEN', 403);
        return;
      }

      const id = parseId(req.params.id as string);
      if (!id) { sendError(res, 'Invalid user ID', 'BAD_REQUEST', 400); return; }

      if (req.body.roles && !callerRoles.includes('HOUSE_IT_ADMIN')) {
        const targetUser = await prisma.user.findUnique({ where: { id }, select: { roles: true } });
        if (
          targetUser &&
          targetUser.roles.includes('HOUSE_IT_ADMIN') &&
          !req.body.roles.includes('HOUSE_IT_ADMIN')
        ) {
          sendError(res, 'Only IT admins can remove the IT admin role', 'FORBIDDEN', 403);
          return;
        }
      }

      const user = await prisma.user.update({
        where: { id },
        data: req.body,
        select: userProfileSelect,
      });

      sendSuccess(res, { user: serializeUserAvatar(user) });
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
      const id = parseId(req.params.id as string);
      if (!id) { sendError(res, 'Invalid user ID', 'BAD_REQUEST', 400); return; }

      if (id === req.user!.userId) {
        sendError(res, 'Cannot delete your own account', 'SELF_DELETE', 400);
        return;
      }

      const deletedUser = await prisma.user.delete({
        where: { id },
        select: {
          profile_photo_path: true,
        },
      });

      if (deletedUser.profile_photo_path) {
        try {
          await deleteLocalFile(deletedUser.profile_photo_path);
        } catch (err) {
          console.warn(`Failed to delete profile photo for user ${id}:`, err);
        }
      }
      sendSuccess(res, { message: 'User deleted' });
    } catch (err) {
      sendError(res, 'Failed to delete user', 'DELETE_ERROR', 500);
    }
  },
);

export default router;
