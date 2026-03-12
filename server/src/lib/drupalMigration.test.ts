import test from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '../generated/prisma/enums.js';
import {
  buildDrupalListingSlug,
  buildNewUserMigrationCreate,
  findUnambiguousLegacyListingMatch,
  generateUniqueDrupalListingSlug,
  planExistingUserMigrationUpdate,
} from './drupalMigration.js';

function createMockSlugClient(existingSlugs: string[]) {
  const slugSet = new Set(existingSlugs);

  return {
    listing: {
      findUnique: async ({ where: { slug } }: { where: { slug: string }; select: { id: true } }) =>
        (slugSet.has(slug) ? { id: 1 } : null),
    },
  };
}

test('planExistingUserMigrationUpdate preserves local profile state while backfilling migration fields', () => {
  const plan = planExistingUserMigrationUpdate(
    {
      id: 42,
      email: 'person@example.com',
      legacy_drupal_uid: null,
      password: null,
      last_login: null,
      profile_photo_path: null,
      profile_photo_url: null,
      first_name: 'Local',
      last_name: 'Admin',
      roles: [Role.HOUSE_ADMIN],
      preferred_language: 'EN',
      phone_number: '111',
      mobile_number: '222',
    },
    {
      uid: 7,
      first_name: 'Drupal',
      last_name: 'User',
      roles: [Role.HOUSE_USER],
      preferred_language: 'IT',
      phone_number: '333',
      mobile_number: '444',
      password: 'legacy-hash',
      shouldKeepDrupalPassword: true,
      last_login: new Date('2026-03-01T10:00:00.000Z'),
      processedUserPicture: {
        filePath: 'profiles/avatar.webp',
        url: '/uploads/profiles/avatar.webp',
      },
    },
  );

  assert.equal(plan.preservedLocalState, true);
  assert.deepEqual(plan.data, {
    legacy_drupal_uid: 7,
    last_login: new Date('2026-03-01T10:00:00.000Z'),
    password: 'legacy-hash',
    profile_photo_path: 'profiles/avatar.webp',
    profile_photo_url: '/uploads/profiles/avatar.webp',
  });
});

test('buildNewUserMigrationCreate keeps the imported Drupal profile for new users', () => {
  const createdAt = new Date('2026-03-02T10:00:00.000Z');
  const data = buildNewUserMigrationCreate(
    'person@example.com',
    {
      uid: 7,
      first_name: 'Drupal',
      last_name: 'User',
      roles: [Role.HOUSE_LANDLORD],
      preferred_language: 'IT',
      phone_number: '333',
      mobile_number: '444',
      password: 'legacy-hash',
      shouldKeepDrupalPassword: true,
      last_login: new Date('2026-03-01T10:00:00.000Z'),
      processedUserPicture: {
        filePath: 'profiles/avatar.webp',
        url: '/uploads/profiles/avatar.webp',
      },
    },
    createdAt,
  );

  assert.deepEqual(data, {
    email: 'person@example.com',
    legacy_drupal_uid: 7,
    first_name: 'Drupal',
    last_name: 'User',
    roles: [Role.HOUSE_LANDLORD],
    preferred_language: 'IT',
    phone_number: '333',
    mobile_number: '444',
    password: 'legacy-hash',
    profile_photo_path: 'profiles/avatar.webp',
    profile_photo_url: '/uploads/profiles/avatar.webp',
    created_at: createdAt,
    last_login: new Date('2026-03-01T10:00:00.000Z'),
  });
});

test('generateUniqueDrupalListingSlug creates a suffixed slug for a colliding app listing', async () => {
  const preferredSlug = buildDrupalListingSlug('listing/renes-house', 'Rene House', 100);
  const result = await generateUniqueDrupalListingSlug(
    createMockSlugClient(['renes-house']),
    preferredSlug,
  );

  assert.deepEqual(result, {
    slug: 'renes-house-2',
    collided: true,
  });
});

test('generateUniqueDrupalListingSlug separates two Drupal aliases that normalize to the same slug', async () => {
  const firstPreferredSlug = buildDrupalListingSlug('listing/renes-house', 'Rene House', 100);
  const secondPreferredSlug = buildDrupalListingSlug('listing/renes house', 'Rene House', 101);

  assert.equal(firstPreferredSlug, 'renes-house');
  assert.equal(secondPreferredSlug, 'renes-house');

  const result = await generateUniqueDrupalListingSlug(
    createMockSlugClient(['renes-house']),
    secondPreferredSlug,
  );

  assert.equal(result.slug, 'renes-house-2');
});

test('findUnambiguousLegacyListingMatch returns the single exact legacy candidate', () => {
  const createdAt = new Date('2026-03-03T10:00:00.000Z');
  const match = findUnambiguousLegacyListingMatch(
    [
      {
        id: 3,
        slug: 'villa-rosa',
        owner_id: 9,
        created_at: createdAt,
        legacy_drupal_nid: null,
      },
    ],
    'villa-rosa',
    9,
    createdAt,
  );

  assert.equal(match?.id, 3);
});

test('findUnambiguousLegacyListingMatch rejects ambiguous or already-linked candidates', () => {
  const createdAt = new Date('2026-03-03T10:00:00.000Z');

  assert.equal(
    findUnambiguousLegacyListingMatch(
      [
        { id: 3, slug: 'villa-rosa', owner_id: 9, created_at: createdAt, legacy_drupal_nid: null },
        { id: 4, slug: 'villa-rosa', owner_id: 9, created_at: createdAt, legacy_drupal_nid: null },
      ],
      'villa-rosa',
      9,
      createdAt,
    ),
    null,
  );

  assert.equal(
    findUnambiguousLegacyListingMatch(
      [
        { id: 3, slug: 'villa-rosa', owner_id: 9, created_at: createdAt, legacy_drupal_nid: 44 },
      ],
      'villa-rosa',
      9,
      createdAt,
    ),
    null,
  );
});
