import { z } from 'zod';
import { listingFiltersSchema } from './listing';

const favoriteNoteSchema = z.string().max(1000).optional().nullable();
const requiredFavoriteNoteSchema = z.string().max(1000).nullable();

export const createFavoriteSchema = z.object({
  listing_id: z.number().int().positive(),
  note: favoriteNoteSchema,
});

export const updateFavoriteSchema = z.object({
  note: requiredFavoriteNoteSchema,
});

export const favoriteFiltersSchema = listingFiltersSchema.omit({
  owner: true,
  sortBy: true,
  sortOrder: true,
}).extend({
  sortBy: z.enum(['favorited_at', 'monthly_rent']).default('favorited_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;
export type UpdateFavoriteInput = z.infer<typeof updateFavoriteSchema>;
export type FavoriteFilters = z.infer<typeof favoriteFiltersSchema>;
