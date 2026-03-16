import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { sendError, sendSuccess } from '../lib/response.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import {
  canUseFavoriteListings,
  createFavoriteSchema,
  favoriteFiltersSchema,
  updateFavoriteSchema,
} from '@vithousing/shared';

const router = Router();

interface FavoriteRow {
  id: number;
  slug: string;
  title: string;
  address_1: string;
  city: string;
  province: string;
  monthly_rent: number | string;
  bedrooms: number;
  bathrooms: number;
  floor_space: number | null;
  created_at: Date;
  note: string | null;
  favorited_at: Date;
  photos: Array<{ url: string }> | string | null;
}

function normalizeFavoriteNote(note: string | null | undefined): string | null {
  if (typeof note !== 'string') {
    return null;
  }

  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ensureFavoriteAccess(req: Request, res: Response): boolean {
  if (!req.user) {
    sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
    return false;
  }

  if (!canUseFavoriteListings(req.user.roles)) {
    sendError(res, 'Insufficient permissions', 'FORBIDDEN', 403);
    return false;
  }

  return true;
}

router.get(
  '/',
  authenticate,
  validate(favoriteFiltersSchema, 'query'),
  async (req: Request, res: Response) => {
    if (!ensureFavoriteAccess(req, res)) {
      return;
    }

    try {
      const {
        minBathrooms, maxBathrooms,
        minBedrooms, maxBedrooms,
        minRent, maxRent,
        minFloorSpace, maxFloorSpace,
        sortBy, sortOrder,
        page, limit,
      } = req.query as any;

      const skip = (page - 1) * limit;
      const conditions = [
        Prisma.sql`f."user_id" = ${req.user!.userId}`,
        Prisma.sql`l."published" = true`,
      ];

      if (minBathrooms !== undefined) {
        conditions.push(Prisma.sql`l."bathrooms" >= ${minBathrooms}`);
      }

      if (maxBathrooms !== undefined) {
        conditions.push(Prisma.sql`l."bathrooms" <= ${maxBathrooms}`);
      }

      if (minBedrooms !== undefined) {
        conditions.push(Prisma.sql`l."bedrooms" >= ${minBedrooms}`);
      }

      if (maxBedrooms !== undefined) {
        conditions.push(Prisma.sql`l."bedrooms" <= ${maxBedrooms}`);
      }

      if (minRent !== undefined) {
        conditions.push(Prisma.sql`l."monthly_rent" >= ${minRent}`);
      }

      if (maxRent !== undefined) {
        conditions.push(Prisma.sql`l."monthly_rent" <= ${maxRent}`);
      }

      if (minFloorSpace !== undefined) {
        conditions.push(Prisma.sql`l."floor_space" >= ${minFloorSpace}`);
      }

      if (maxFloorSpace !== undefined) {
        conditions.push(Prisma.sql`l."floor_space" <= ${maxFloorSpace}`);
      }

      const whereSql = Prisma.join(conditions, ' AND ');
      const orderBySql = sortBy === 'monthly_rent'
        ? sortOrder === 'asc'
          ? Prisma.sql`ORDER BY l."monthly_rent" ASC, f."created_at" DESC`
          : Prisma.sql`ORDER BY l."monthly_rent" DESC, f."created_at" DESC`
        : sortOrder === 'asc'
          ? Prisma.sql`ORDER BY f."created_at" ASC, l."id" DESC`
          : Prisma.sql`ORDER BY f."created_at" DESC, l."id" DESC`;

      const [favorites, totalRows] = await Promise.all([
        prisma.$queryRaw<FavoriteRow[]>(Prisma.sql`
          SELECT
            l."id",
            l."slug",
            l."title",
            l."address_1",
            l."city",
            l."province",
            l."monthly_rent",
            l."bedrooms",
            l."bathrooms",
            l."floor_space",
            l."created_at",
            f."note",
            f."created_at" AS favorited_at,
            (
              SELECT json_agg(json_build_object('url', sub."url") ORDER BY sub."sort_order")
              FROM "ListingPhoto" sub
              WHERE sub."listing_id" = l."id"
            ) AS photos
          FROM "FavoriteListing" f
          INNER JOIN "Listing" l ON l."id" = f."listing_id"
          WHERE ${whereSql}
          ${orderBySql}
          LIMIT ${limit}
          OFFSET ${skip}
        `),
        prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
          SELECT COUNT(*)::int AS count
          FROM "FavoriteListing" f
          INNER JOIN "Listing" l ON l."id" = f."listing_id"
          WHERE ${whereSql}
        `),
      ]);
      const total = totalRows[0]?.count ?? 0;

      sendSuccess(res, {
        items: favorites.map((favorite) => {
          const photos = typeof favorite.photos === 'string'
            ? JSON.parse(favorite.photos) as Array<{ url: string }>
            : favorite.photos;

          return {
            id: favorite.id,
            slug: favorite.slug,
            title: favorite.title,
            address_1: favorite.address_1,
            city: favorite.city,
            province: favorite.province,
            monthly_rent: favorite.monthly_rent,
            bedrooms: favorite.bedrooms,
            bathrooms: favorite.bathrooms,
            floor_space: favorite.floor_space,
            created_at: favorite.created_at,
            photos: photos || [],
            is_favorite: true,
            note: favorite.note,
            favorited_at: favorite.favorited_at,
          };
        }),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (err) {
      console.error('Fetch favorites error:', err);
      sendError(res, 'Failed to fetch favorites', 'FETCH_ERROR', 500);
    }
  },
);

router.post(
  '/',
  authenticate,
  validate(createFavoriteSchema),
  async (req: Request, res: Response) => {
    if (!ensureFavoriteAccess(req, res)) {
      return;
    }

    try {
      const { listing_id, note } = req.body;

      const listing = await prisma.listing.findFirst({
        where: {
          id: listing_id,
          published: true,
        },
        select: { id: true },
      });

      if (!listing) {
        sendError(res, 'Listing not found', 'NOT_FOUND', 404);
        return;
      }

      const favoriteRows = await prisma.$queryRaw<Array<{
        id: number;
        user_id: number;
        listing_id: number;
        note: string | null;
        created_at: Date;
        updated_at: Date;
      }>>(Prisma.sql`
        INSERT INTO "FavoriteListing" ("user_id", "listing_id", "note", "updated_at")
        VALUES (${req.user!.userId}, ${listing_id}, ${normalizeFavoriteNote(note)}, CURRENT_TIMESTAMP)
        ON CONFLICT ("user_id", "listing_id") DO NOTHING
        RETURNING "id", "user_id", "listing_id", "note", "created_at", "updated_at"
      `);

      const favorite = favoriteRows[0];

      if (!favorite) {
        sendError(res, 'Listing is already in favorites', 'CONFLICT', 409);
        return;
      }

      sendSuccess(res, { favorite }, 201);
    } catch (err: any) {
      console.error('Create favorite error:', err);
      sendError(res, 'Failed to save favorite', 'CREATE_ERROR', 500);
    }
  },
);

router.patch(
  '/:listingId',
  authenticate,
  validate(updateFavoriteSchema),
  async (req: Request, res: Response) => {
    if (!ensureFavoriteAccess(req, res)) {
      return;
    }

    try {
      const listingId = Number(req.params.listingId);

      if (!Number.isInteger(listingId) || listingId <= 0) {
        sendError(res, 'Invalid listing ID', 'BAD_REQUEST', 400);
        return;
      }

      const favoriteRows = await prisma.$queryRaw<Array<{
        id: number;
        user_id: number;
        listing_id: number;
        note: string | null;
        created_at: Date;
        updated_at: Date;
      }>>(Prisma.sql`
        UPDATE "FavoriteListing"
        SET "note" = ${normalizeFavoriteNote(req.body.note)},
            "updated_at" = CURRENT_TIMESTAMP
        WHERE "user_id" = ${req.user!.userId}
          AND "listing_id" = ${listingId}
        RETURNING "id", "user_id", "listing_id", "note", "created_at", "updated_at"
      `);

      const favorite = favoriteRows[0];

      if (!favorite) {
        sendError(res, 'Favorite not found', 'NOT_FOUND', 404);
        return;
      }

      sendSuccess(res, { favorite });
    } catch (err: any) {
      console.error('Update favorite error:', err);
      sendError(res, 'Failed to update favorite note', 'UPDATE_ERROR', 500);
    }
  },
);

router.delete(
  '/:listingId',
  authenticate,
  async (req: Request, res: Response) => {
    if (!ensureFavoriteAccess(req, res)) {
      return;
    }

    try {
      const listingId = Number(req.params.listingId);

      if (!Number.isInteger(listingId) || listingId <= 0) {
        sendError(res, 'Invalid listing ID', 'BAD_REQUEST', 400);
        return;
      }

      const deletedRows = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
        DELETE FROM "FavoriteListing"
        WHERE "user_id" = ${req.user!.userId}
          AND "listing_id" = ${listingId}
        RETURNING "id"
      `);

      if (deletedRows.length === 0) {
        sendError(res, 'Favorite not found', 'NOT_FOUND', 404);
        return;
      }

      sendSuccess(res, { deleted: true });
    } catch (err: any) {
      console.error('Delete favorite error:', err);
      sendError(res, 'Failed to remove favorite', 'DELETE_ERROR', 500);
    }
  },
);

export default router;
