import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { getAvatarUrl } from '../lib/avatar.js';
import { sendSuccess, sendError } from '../lib/response.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { createListingSchema, updateListingSchema, listingFiltersSchema, hasRole } from '@vithousing/shared';
import { uploadMiddleware, processAndSaveImage, deleteLocalFile } from '../services/upload.service.js';
import { geocodeAddress } from '../services/geocoding.service.js';
import { generateUniqueListingSlug } from '../services/listingSlug.service.js';
import { parseId } from '../lib/validators.js';

const router = Router();

const listingDetailInclude = {
  photos: { orderBy: { sort_order: 'asc' as const } },
  available_dates: { orderBy: { available_from: 'asc' as const } },
  owner: {
    select: {
      first_name: true,
      last_name: true,
      email: true,
      phone_number: true,
      mobile_number: true,
      auth0_user_id: true,
      profile_photo_path: true,
      profile_photo_url: true,
    },
  },
};

async function fetchFavoriteListingIds(userId: number, listingIds: number[]): Promise<Set<number>> {
  if (listingIds.length === 0) {
    return new Set();
  }

  const rows = await prisma.$queryRaw<Array<{ listing_id: number }>>(Prisma.sql`
    SELECT "listing_id"
    FROM "FavoriteListing"
    WHERE "user_id" = ${userId}
      AND "listing_id" IN (${Prisma.join(listingIds)})
  `);

  return new Set(rows.map((row) => row.listing_id));
}

async function isFavoriteListing(userId: number, listingId: number): Promise<boolean> {
  const favoriteIds = await fetchFavoriteListingIds(userId, [listingId]);
  return favoriteIds.has(listingId);
}

function isSlugUniqueConstraintError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }

  const targets = Array.isArray(err.meta?.target)
    ? err.meta.target
    : err.meta?.target
      ? [err.meta.target]
      : [];

  return targets.some((target) => String(target).includes('slug'));
}

async function checkListingOwnership(req: Request, res: Response, listingId: number): Promise<boolean> {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) {
    sendError(res, 'Listing not found', 'NOT_FOUND', 404);
    return false;
  }
  if (!hasRole(req.user!.roles, 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN') && listing.owner_id !== req.user!.userId) {
    sendError(res, 'Not authorized', 'FORBIDDEN', 403);
    return false;
  }
  return true;
}

async function fetchListingDetail(where: { id: number } | { slug: string }, userId: number) {
  const listing = await prisma.listing.findUnique({
    where,
    include: listingDetailInclude,
  });

  if (!listing) {
    return null;
  }

  return {
    ...listing,
    owner: listing.owner
      ? {
          first_name: listing.owner.first_name,
          last_name: listing.owner.last_name,
          email: listing.owner.email,
          phone_number: listing.owner.phone_number,
          mobile_number: listing.owner.mobile_number,
          avatar_url: getAvatarUrl(listing.owner),
        }
      : null,
    is_favorite: await isFavoriteListing(userId, listing.id),
  };
}

async function sendListingDetailResponse(
  req: Request,
  res: Response,
  where: { id: number } | { slug: string },
) {
  try {
    const listing = await fetchListingDetail(where, req.user!.userId);

    if (!listing) {
      sendError(res, 'Listing not found', 'NOT_FOUND', 404);
      return;
    }

    if (!listing.published) {
      const isOwner = listing.owner_id === req.user!.userId;
      if (!isOwner && !hasRole(req.user!.roles, 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN')) {
        sendError(res, 'Listing not found', 'NOT_FOUND', 404);
        return;
      }
    }

    sendSuccess(res, { listing });
  } catch (err) {
    sendError(res, 'Failed to fetch listing', 'FETCH_ERROR', 500);
  }
}

// GET /api/v1/listings — Browse listings (all authenticated users)
router.get('/', authenticate, validate(listingFiltersSchema, 'query'), async (req: Request, res: Response) => {
  try {
    const {
      minBathrooms, maxBathrooms,
      minBedrooms, maxBedrooms,
      minRent, maxRent,
      minFloorSpace, maxFloorSpace,
      owner,
      sortBy, sortOrder,
      page, limit,
    } = req.query as any;

    const where: any = {};

    if (owner === 'me') {
      where.owner_id = req.user!.userId;
    } else {
      where.published = true;
    }

    if (minBathrooms !== undefined || maxBathrooms !== undefined) {
      where.bathrooms = {};
      if (minBathrooms !== undefined) where.bathrooms.gte = minBathrooms;
      if (maxBathrooms !== undefined) where.bathrooms.lte = maxBathrooms;
    }

    if (minBedrooms !== undefined || maxBedrooms !== undefined) {
      where.bedrooms = {};
      if (minBedrooms !== undefined) where.bedrooms.gte = minBedrooms;
      if (maxBedrooms !== undefined) where.bedrooms.lte = maxBedrooms;
    }

    if (minRent !== undefined || maxRent !== undefined) {
      where.monthly_rent = {};
      if (minRent !== undefined) where.monthly_rent.gte = minRent;
      if (maxRent !== undefined) where.monthly_rent.lte = maxRent;
    }

    if (minFloorSpace !== undefined || maxFloorSpace !== undefined) {
      where.floor_space = {};
      if (minFloorSpace !== undefined) where.floor_space.gte = minFloorSpace;
      if (maxFloorSpace !== undefined) where.floor_space.lte = maxFloorSpace;
    }

    const skip = (page - 1) * limit;

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          photos: { orderBy: { sort_order: 'asc' } },
          owner: { select: { first_name: true, last_name: true } },
        },
      }),
      prisma.listing.count({ where }),
    ]);
    const favoriteIds = await fetchFavoriteListingIds(
      req.user!.userId,
      listings.map((listing) => listing.id),
    );

    sendSuccess(res, {
      items: listings.map((listing) => ({
        ...listing,
        is_favorite: favoriteIds.has(listing.id),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('Fetch listings error:', err);
    sendError(res, 'Failed to fetch listings', 'FETCH_ERROR', 500);
  }
});

// GET /api/v1/listings/by-slug/:slug — Single listing detail by slug
router.get('/by-slug/:slug', authenticate, async (req: Request, res: Response) => {
  const slug = (req.params.slug as string)?.trim();
  if (!slug) {
    sendError(res, 'Invalid slug', 'BAD_REQUEST', 400);
    return;
  }

  await sendListingDetailResponse(req, res, { slug });
});

// GET /api/v1/listings/:id — Single listing detail
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const id = parseId(req.params.id as string);
  if (!id) { sendError(res, 'Invalid ID', 'BAD_REQUEST', 400); return; }

  await sendListingDetailResponse(req, res, { id });
});

// POST /api/v1/listings — Create listing (landlord + admin)
router.post(
  '/',
  authenticate,
  requireRole('HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  validate(createListingSchema),
  async (req: Request, res: Response) => {
    try {
      const { available_dates, ...listingData } = req.body;

      // Geocode address
      const geo = await geocodeAddress(
        listingData.address_1,
        listingData.city,
        listingData.province,
        listingData.postal_code,
      );

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const slug = await generateUniqueListingSlug(prisma, listingData.title);

        try {
          const listing = await prisma.listing.create({
            data: {
              ...listingData,
              slug,
              latitude: geo?.latitude || null,
              longitude: geo?.longitude || null,
              owner_id: req.user!.userId,
              available_dates: available_dates
                ? {
                    create: available_dates.map((d: any) => ({
                      available_from: new Date(d.available_from),
                      available_to: d.available_to ? new Date(d.available_to) : null,
                    })),
                  }
                : undefined,
            },
            include: {
              available_dates: true,
              photos: true,
            },
          });

          sendSuccess(res, { listing }, 201);
          return;
        } catch (err) {
          if (isSlugUniqueConstraintError(err) && attempt < 4) {
            continue;
          }

          throw err;
        }
      }

      sendError(res, 'Failed to create listing', 'CREATE_ERROR', 500);
    } catch (err) {
      console.error('Create listing error:', err);
      sendError(res, 'Failed to create listing', 'CREATE_ERROR', 500);
    }
  },
);

// PATCH /api/v1/listings/:id — Update listing
router.patch(
  '/:id',
  authenticate,
  requireRole('HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  validate(updateListingSchema),
  async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id as string);
      if (!id) { sendError(res, 'Invalid ID', 'BAD_REQUEST', 400); return; }

      if (!(await checkListingOwnership(req, res, id))) return;

      const { available_dates, ...listingData } = req.body;

      // Re-geocode if address changed
      if (listingData.address_1 || listingData.city || listingData.province || listingData.postal_code) {
        const current = await prisma.listing.findUnique({ where: { id } });
        if (current) {
          const geo = await geocodeAddress(
            listingData.address_1 || current.address_1,
            listingData.city || current.city,
            listingData.province || current.province,
            listingData.postal_code || current.postal_code,
          );
          if (geo) {
            listingData.latitude = geo.latitude;
            listingData.longitude = geo.longitude;
          }
        }
      }

      const listing = await prisma.$transaction(async (tx) => {
        // Replace available_dates atomically if provided
        if (available_dates !== undefined) {
          await tx.availableDate.deleteMany({ where: { listing_id: id } });
        }

        return tx.listing.update({
          where: { id },
          data: {
            ...listingData,
            ...(available_dates !== undefined && {
              available_dates: {
                create: available_dates.map((d: any) => ({
                  available_from: new Date(d.available_from),
                  available_to: d.available_to ? new Date(d.available_to) : null,
                })),
              },
            }),
          },
          include: { photos: true, available_dates: true },
        });
      });

      sendSuccess(res, { listing });
    } catch (err) {
      sendError(res, 'Failed to update listing', 'UPDATE_ERROR', 500);
    }
  },
);

// DELETE /api/v1/listings/:id — Landlord (own) + Admin
router.delete(
  '/:id',
  authenticate,
  requireRole('HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id as string);
      if (!id) { sendError(res, 'Invalid ID', 'BAD_REQUEST', 400); return; }

      if (!(await checkListingOwnership(req, res, id))) return;

      // Delete local photos first
      const photos = await prisma.listingPhoto.findMany({ where: { listing_id: id } });
      for (const photo of photos) {
        try {
          await deleteLocalFile(photo.file_path);
        } catch {
          console.warn(`Failed to delete local file: ${photo.file_path}`);
        }
      }

      await prisma.listing.delete({ where: { id } });
      sendSuccess(res, { message: 'Listing deleted' });
    } catch (err) {
      sendError(res, 'Failed to delete listing', 'DELETE_ERROR', 500);
    }
  },
);

// POST /api/v1/listings/:id/photos — Upload photo
router.post(
  '/:id/photos',
  authenticate,
  requireRole('HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  uploadMiddleware.single('photo'),
  async (req: Request, res: Response) => {
    let savedFilePath: string | null = null;
    try {
      const listingId = parseId(req.params.id as string);
      if (!listingId) { sendError(res, 'Invalid ID', 'BAD_REQUEST', 400); return; }

      if (!(await checkListingOwnership(req, res, listingId))) return;

      if (!req.file) {
        sendError(res, 'No photo file provided', 'VALIDATION_ERROR', 400);
        return;
      }

      const { filePath, url } = await processAndSaveImage(req.file.buffer);
      savedFilePath = filePath;

      // Get current max sort order
      const maxPhoto = await prisma.listingPhoto.findFirst({
        where: { listing_id: listingId },
        orderBy: { sort_order: 'desc' },
      });

      const photo = await prisma.listingPhoto.create({
        data: {
          listing_id: listingId,
          file_path: filePath,
          url,
          sort_order: (maxPhoto?.sort_order ?? -1) + 1,
        },
      });

      sendSuccess(res, { photo }, 201);
    } catch (err) {
      if (savedFilePath) {
        try { await deleteLocalFile(savedFilePath); } catch { /* best-effort cleanup */ }
      }
      if (err instanceof Error && (err.message.includes('too small') || err.message.includes('dimensions') || err.message.includes('Invalid file'))) {
        sendError(res, err.message, 'VALIDATION_ERROR', 400);
        return;
      }
      console.error('Upload photo error:', err);
      sendError(res, 'Failed to upload photo', 'PHOTO_ERROR', 500);
    }
  },
);

// PATCH /api/v1/listings/:id/photos/reorder — Reorder photos
router.patch(
  '/:id/photos/reorder',
  authenticate,
  requireRole('HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const listingId = parseId(req.params.id as string);
      if (!listingId) { sendError(res, 'Invalid ID', 'BAD_REQUEST', 400); return; }

      if (!(await checkListingOwnership(req, res, listingId))) return;

      const { photoIds } = req.body; // ordered array of photo IDs

      if (!Array.isArray(photoIds) || !photoIds.every((id: unknown) => Number.isInteger(id) && (id as number) > 0)) {
        sendError(res, 'photoIds must be an array of positive integers', 'VALIDATION_ERROR', 400);
        return;
      }

      // Verify no duplicates and all photoIds cover every photo on this listing
      if (new Set(photoIds).size !== photoIds.length) {
        sendError(res, 'photoIds must not contain duplicates', 'VALIDATION_ERROR', 400);
        return;
      }

      const [photos, totalCount] = await Promise.all([
        prisma.listingPhoto.findMany({
          where: { id: { in: photoIds }, listing_id: listingId },
          select: { id: true },
        }),
        prisma.listingPhoto.count({ where: { listing_id: listingId } }),
      ]);
      if (photos.length !== photoIds.length || photoIds.length !== totalCount) {
        sendError(res, 'photoIds must include every photo for the listing exactly once', 'VALIDATION_ERROR', 400);
        return;
      }

      await prisma.$transaction(
        photoIds.map((photoId: number, index: number) =>
          prisma.listingPhoto.update({
            where: { id: photoId },
            data: { sort_order: index },
          }),
        ),
      );

      sendSuccess(res, { message: 'Photos reordered' });
    } catch (err) {
      sendError(res, 'Failed to reorder photos', 'REORDER_ERROR', 500);
    }
  },
);

// DELETE /api/v1/listings/:id/photos/:photoId — Delete photo
router.delete(
  '/:id/photos/:photoId',
  authenticate,
  requireRole('HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const listingId = parseId(req.params.id as string);
      const photoId = parseId(req.params.photoId as string);
      if (!listingId || !photoId) { sendError(res, 'Invalid ID', 'BAD_REQUEST', 400); return; }

      if (!(await checkListingOwnership(req, res, listingId))) return;

      const photo = await prisma.listingPhoto.findUnique({ where: { id: photoId } });
      if (!photo || photo.listing_id !== listingId) {
        sendError(res, 'Photo not found', 'NOT_FOUND', 404);
        return;
      }

      try {
        await deleteLocalFile(photo.file_path);
      } catch {
        console.warn(`Failed to delete local file: ${photo.file_path}`);
      }

      await prisma.listingPhoto.delete({ where: { id: photoId } });
      sendSuccess(res, { message: 'Photo deleted' });
    } catch (err) {
      sendError(res, 'Failed to delete photo', 'DELETE_ERROR', 500);
    }
  },
);

export default router;
