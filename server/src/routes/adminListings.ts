import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AdminListingListInput } from '@vithousing/shared';
import { adminListingListSchema } from '@vithousing/shared';
import { prisma } from '../lib/prisma.js';
import { sendError, sendSuccess } from '../lib/response.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { buildAdminListingWhere } from '../lib/adminListings.js';

const router = Router();

router.get(
  '/',
  authenticate,
  requireRole('HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  validate(adminListingListSchema, 'query'),
  async (req: Request, res: Response) => {
    try {
      const filters = req.query as unknown as AdminListingListInput;
      const { page, limit } = filters;
      const skip = (page - 1) * limit;
      const where = buildAdminListingWhere(filters);

      const [items, total, totalListings] = await Promise.all([
        prisma.listing.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          include: {
            photos: {
              orderBy: { sort_order: 'asc' },
              take: 1,
              select: { url: true },
            },
            owner: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
        }),
        prisma.listing.count({ where }),
        prisma.listing.count(),
      ]);

      sendSuccess(res, {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        stats: {
          totalListings,
        },
      });
    } catch (err) {
      console.error('Fetch admin listings error:', err);
      sendError(res, 'Failed to fetch admin listings', 'FETCH_ERROR', 500);
    }
  },
);

export default router;
