import test from 'node:test';
import assert from 'node:assert/strict';
import { adminListingListSchema } from '@vithousing/shared';
import { buildAdminListingWhere } from './adminListings.js';

test('adminListingListSchema parses numeric filters and defaults', () => {
  const parsed = adminListingListSchema.parse({
    minRent: '1200',
    maxRent: '2200',
  });

  assert.deepEqual(parsed, {
    minRent: 1200,
    maxRent: 2200,
    page: 1,
    limit: 20,
  });
});

test('buildAdminListingWhere includes title, address, owner search, and rent range filters', () => {
  const where = buildAdminListingWhere({
    title: 'Villa',
    ownerSearch: 'doe@example.com',
    ownerId: undefined,
    address: 'Via Roma',
    minRent: 1000,
    maxRent: 1800,
    page: 1,
    limit: 20,
  });

  assert.deepEqual(where, {
    title: { contains: 'Villa', mode: 'insensitive' },
    address_1: { contains: 'Via Roma', mode: 'insensitive' },
    owner: {
      OR: [
        { first_name: { contains: 'doe@example.com', mode: 'insensitive' } },
        { last_name: { contains: 'doe@example.com', mode: 'insensitive' } },
        { email: { contains: 'doe@example.com', mode: 'insensitive' } },
      ],
    },
    monthly_rent: {
      gte: 1000,
      lte: 1800,
    },
  });
});

test('buildAdminListingWhere prioritizes ownerId over ownerSearch', () => {
  const where = buildAdminListingWhere({
    title: undefined,
    ownerSearch: 'john',
    ownerId: 42,
    address: undefined,
    minRent: undefined,
    maxRent: undefined,
    page: 1,
    limit: 20,
  });

  assert.deepEqual(where, {
    owner_id: 42,
  });
});
