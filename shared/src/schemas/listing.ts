import { z } from 'zod';

const availableDateSchema = z.object({
  available_from: z.string().or(z.date()),
  available_to: z.string().or(z.date()).optional().nullable(),
});

export const createListingSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  address_1: z.string().min(1, 'Address is required'),
  address_2: z.string().optional().nullable(),
  postal_code: z.string().min(1, 'Postal code is required'),
  city: z.string().min(1, 'City is required'),
  province: z.string().min(1, 'Province is required'),
  monthly_rent: z.number().positive('Monthly rent must be positive'),
  deposit: z.number().positive().optional().nullable(),
  condominium_expenses: z.number().positive().optional().nullable(),
  utility_electricity: z.boolean().default(false),
  utility_gas: z.boolean().default(false),
  utility_water: z.boolean().default(false),
  utility_telephone: z.boolean().default(false),
  utility_internet: z.boolean().default(false),
  accommodation_type: z.string().min(1, 'Accommodation type is required'),
  floor: z.string().min(1, 'Floor is required'),
  bathrooms: z.number().int().min(0),
  bedrooms: z.number().int().min(0),
  floor_space: z.number().int().positive().optional().nullable(),
  feature_storage_room: z.boolean().default(false),
  feature_basement: z.boolean().default(false),
  feature_garden: z.boolean().default(false),
  feature_balcony: z.boolean().default(false),
  feature_air_con: z.boolean().default(false),
  feature_washing_machine: z.boolean().default(false),
  feature_dryer: z.boolean().default(false),
  feature_fireplace: z.boolean().default(false),
  feature_dishwasher: z.boolean().default(false),
  feature_elevator: z.boolean().default(false),
  feature_tv: z.boolean().default(false),
  feature_telephone: z.boolean().default(false),
  feature_wifi: z.boolean().default(false),
  feature_wired_internet: z.boolean().default(false),
  feature_parking: z.boolean().default(false),
  feature_pets_allowed: z.boolean().default(false),
  available_dates: z.array(availableDateSchema).optional(),
});

export const updateListingSchema = createListingSchema.partial();

export const listingFiltersSchema = z.object({
  minBathrooms: z.coerce.number().int().min(0).optional(),
  maxBathrooms: z.coerce.number().int().min(0).optional(),
  minBedrooms: z.coerce.number().int().min(0).optional(),
  maxBedrooms: z.coerce.number().int().min(0).optional(),
  minRent: z.coerce.number().min(0).optional(),
  maxRent: z.coerce.number().min(0).optional(),
  minFloorSpace: z.coerce.number().int().min(0).optional(),
  maxFloorSpace: z.coerce.number().int().min(0).optional(),
  owner: z.enum(['me']).optional(),
  sortBy: z.enum(['monthly_rent', 'created_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type ListingFilters = z.infer<typeof listingFiltersSchema>;
