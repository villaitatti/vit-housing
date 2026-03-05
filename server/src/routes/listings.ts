import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { sendSuccess, sendError } from '../lib/response.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { createListingSchema, updateListingSchema, listingFiltersSchema } from '@vithousing/shared';
import { generatePresignedUploadUrl, deleteS3Object } from '../services/s3.service.js';
import { geocodeAddress } from '../services/geocoding.service.js';
import crypto from 'crypto';

const router = Router();

// GET /api/v1/listings — Browse listings (all authenticated users)
router.get('/', authenticate, validate(listingFiltersSchema, 'query'), async (req: Request, res: Response) => {
  try {
    const {
      minBathrooms, maxBathrooms,
      minBedrooms, maxBedrooms,
      minRent, maxRent,
      minFloorSpace, maxFloorSpace,
      sortBy, sortOrder,
      page, limit,
    } = req.query as any;

    const where: any = {};

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
          photos: { orderBy: { sort_order: 'asc' }, take: 1 },
          owner: { select: { first_name: true, last_name: true } },
        },
      }),
      prisma.listing.count({ where }),
    ]);

    sendSuccess(res, {
      items: listings,
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

// GET /api/v1/listings/:id — Single listing detail
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { sort_order: 'asc' } },
        available_dates: { orderBy: { available_from: 'asc' } },
        owner: {
          select: {
            first_name: true,
            last_name: true,
            email: true,
            phone_number: true,
            mobile_number: true,
          },
        },
      },
    });

    if (!listing) {
      sendError(res, 'Listing not found', 'NOT_FOUND', 404);
      return;
    }

    sendSuccess(res, { listing });
  } catch (err) {
    sendError(res, 'Failed to fetch listing', 'FETCH_ERROR', 500);
  }
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

      const listing = await prisma.listing.create({
        data: {
          ...listingData,
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
      const id = parseInt(req.params.id as string);

      // Check ownership (landlords can only edit their own)
      if (req.user!.role === 'HOUSE_LANDLORD') {
        const existing = await prisma.listing.findUnique({ where: { id } });
        if (!existing || existing.owner_id !== req.user!.userId) {
          sendError(res, 'Not authorized to edit this listing', 'FORBIDDEN', 403);
          return;
        }
      }

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

      const listing = await prisma.listing.update({
        where: { id },
        data: listingData,
        include: { photos: true, available_dates: true },
      });

      sendSuccess(res, { listing });
    } catch (err) {
      sendError(res, 'Failed to update listing', 'UPDATE_ERROR', 500);
    }
  },
);

// DELETE /api/v1/listings/:id — Admin only
router.delete(
  '/:id',
  authenticate,
  requireRole('HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);

      // Delete S3 photos first
      const photos = await prisma.listingPhoto.findMany({ where: { listing_id: id } });
      for (const photo of photos) {
        try {
          await deleteS3Object(photo.s3_key);
        } catch {
          console.warn(`Failed to delete S3 object: ${photo.s3_key}`);
        }
      }

      await prisma.listing.delete({ where: { id } });
      sendSuccess(res, { message: 'Listing deleted' });
    } catch (err) {
      sendError(res, 'Failed to delete listing', 'DELETE_ERROR', 500);
    }
  },
);

// POST /api/v1/listings/photos/presign — Generate S3 presigned upload URL
router.post(
  '/photos/presign',
  authenticate,
  requireRole('HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { filename, contentType } = req.body;

      if (!filename || !contentType) {
        sendError(res, 'filename and contentType are required', 'VALIDATION_ERROR', 400);
        return;
      }

      const ext = filename.split('.').pop() || 'jpg';
      const key = `listings/${crypto.randomUUID()}.${ext}`;

      const result = await generatePresignedUploadUrl(key, contentType);
      sendSuccess(res, result);
    } catch (err) {
      sendError(res, 'Failed to generate upload URL', 'PRESIGN_ERROR', 500);
    }
  },
);

// POST /api/v1/listings/:id/photos — Confirm photo upload
router.post(
  '/:id/photos',
  authenticate,
  requireRole('HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const listingId = parseInt(req.params.id as string);
      const { s3_key, s3_url } = req.body;

      if (!s3_key || !s3_url) {
        sendError(res, 's3_key and s3_url are required', 'VALIDATION_ERROR', 400);
        return;
      }

      // Get current max sort order
      const maxPhoto = await prisma.listingPhoto.findFirst({
        where: { listing_id: listingId },
        orderBy: { sort_order: 'desc' },
      });

      const photo = await prisma.listingPhoto.create({
        data: {
          listing_id: listingId,
          s3_key,
          s3_url,
          sort_order: (maxPhoto?.sort_order ?? -1) + 1,
        },
      });

      sendSuccess(res, { photo }, 201);
    } catch (err) {
      sendError(res, 'Failed to save photo', 'PHOTO_ERROR', 500);
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
      const { photoIds } = req.body; // ordered array of photo IDs

      if (!Array.isArray(photoIds)) {
        sendError(res, 'photoIds must be an array', 'VALIDATION_ERROR', 400);
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
      const photoId = parseInt(req.params.photoId as string);

      const photo = await prisma.listingPhoto.findUnique({ where: { id: photoId } });
      if (!photo) {
        sendError(res, 'Photo not found', 'NOT_FOUND', 404);
        return;
      }

      try {
        await deleteS3Object(photo.s3_key);
      } catch {
        console.warn(`Failed to delete S3 object: ${photo.s3_key}`);
      }

      await prisma.listingPhoto.delete({ where: { id: photoId } });
      sendSuccess(res, { message: 'Photo deleted' });
    } catch (err) {
      sendError(res, 'Failed to delete photo', 'DELETE_ERROR', 500);
    }
  },
);

export default router;
