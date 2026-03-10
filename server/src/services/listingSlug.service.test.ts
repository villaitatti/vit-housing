import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTING_SLUG_MAX_LENGTH,
  buildListingSlugCandidate,
  generateUniqueListingSlug,
  normalizeListingTitleToSlug,
  type ListingSlugLookupClient,
} from './listingSlug.service.js';

function createMockSlugClient(existingSlugs: string[]): ListingSlugLookupClient {
  const slugSet = new Set(existingSlugs);

  return {
    listing: {
      findUnique: async ({ where: { slug } }) => (slugSet.has(slug) ? { id: 1 } : null),
    },
  };
}

test('normalizeListingTitleToSlug transliterates accents and punctuation', () => {
  assert.equal(
    normalizeListingTitleToSlug("L'Appartamènto di Giúlia!!"),
    'l-appartamento-di-giulia',
  );
});

test('normalizeListingTitleToSlug falls back for punctuation-only titles', () => {
  assert.equal(normalizeListingTitleToSlug('!!!'), 'listing');
});

test('normalizeListingTitleToSlug prefixes numeric-only titles', () => {
  assert.equal(normalizeListingTitleToSlug('123 456'), 'listing-123-456');
});

test('normalizeListingTitleToSlug collapses repeated separators', () => {
  assert.equal(
    normalizeListingTitleToSlug('  Cozy   loft___near---campus  '),
    'cozy-loft-near-campus',
  );
});

test('buildListingSlugCandidate truncates long slugs and keeps suffixes inside the limit', () => {
  const baseSlug = 'a'.repeat(LISTING_SLUG_MAX_LENGTH);
  const candidate = buildListingSlugCandidate(baseSlug, 12);

  assert.equal(candidate.length, LISTING_SLUG_MAX_LENGTH);
  assert.ok(candidate.endsWith('-12'));
});

test('generateUniqueListingSlug appends numeric suffixes for duplicates', async () => {
  const slug = await generateUniqueListingSlug(
    createMockSlugClient([
      'name-of-the-listing',
      'name-of-the-listing-2',
    ]),
    'Name of the Listing',
  );

  assert.equal(slug, 'name-of-the-listing-3');
});
