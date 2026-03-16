import type { AdminListingListInput } from '@vithousing/shared';
import type { Prisma } from '../generated/prisma/client.js';

export function buildAdminListingWhere(filters: AdminListingListInput): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {};

  if (filters.title) {
    where.title = { contains: filters.title, mode: 'insensitive' };
  }

  if (filters.address) {
    where.address_1 = { contains: filters.address, mode: 'insensitive' };
  }

  if (filters.ownerId) {
    where.owner_id = filters.ownerId;
  } else if (filters.ownerSearch) {
    where.owner = {
      OR: [
        { first_name: { contains: filters.ownerSearch, mode: 'insensitive' } },
        { last_name: { contains: filters.ownerSearch, mode: 'insensitive' } },
        { email: { contains: filters.ownerSearch, mode: 'insensitive' } },
      ],
    };
  }

  if (filters.minRent !== undefined || filters.maxRent !== undefined) {
    where.monthly_rent = {};

    if (filters.minRent !== undefined) {
      where.monthly_rent.gte = filters.minRent;
    }

    if (filters.maxRent !== undefined) {
      where.monthly_rent.lte = filters.maxRent;
    }
  }

  return where;
}
