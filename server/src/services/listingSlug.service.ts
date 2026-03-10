const LISTING_SLUG_MAX_LENGTH = 80;
const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]+/g;
const EDGE_HYPHENS_REGEX = /^-+|-+$/g;
const TRAILING_HYPHENS_REGEX = /-+$/g;
const NUMERIC_ONLY_SLUG_REGEX = /^\d+(?:-\d+)*$/;

const CHARACTER_REPLACEMENTS: Record<string, string> = {
  'ß': 'ss',
  'æ': 'ae',
  'œ': 'oe',
  'ø': 'o',
  'đ': 'd',
  'ð': 'd',
  'ł': 'l',
  'þ': 'th',
  'ħ': 'h',
  'ı': 'i',
};

export interface ListingSlugLookupClient {
  listing: {
    findUnique(args: { where: { slug: string }; select: { id: true } }): Promise<{ id: number } | null>;
  };
}

function replaceSpecialCharacters(input: string): string {
  return input.replace(/[ßæœøđðłþħı]/g, (character) => CHARACTER_REPLACEMENTS[character] ?? character);
}

function trimSlug(input: string): string {
  return input.replace(EDGE_HYPHENS_REGEX, '');
}

function truncateSlug(input: string, maxLength: number): string {
  if (maxLength <= 0) {
    return 'listing';
  }

  const truncated = trimSlug(input.slice(0, maxLength).replace(TRAILING_HYPHENS_REGEX, ''));
  return truncated || 'listing';
}

export function normalizeListingTitleToSlug(title: string): string {
  const asciiTitle = replaceSpecialCharacters(title.toLowerCase())
    .normalize('NFKD')
    .replace(COMBINING_MARKS_REGEX, '');

  const normalizedSlug = trimSlug(
    asciiTitle
      .replace(NON_ALPHANUMERIC_REGEX, '-')
      .replace(/-+/g, '-'),
  );

  if (!normalizedSlug) {
    return 'listing';
  }

  const slugBase = NUMERIC_ONLY_SLUG_REGEX.test(normalizedSlug)
    ? `listing-${normalizedSlug}`
    : normalizedSlug;

  return truncateSlug(slugBase, LISTING_SLUG_MAX_LENGTH);
}

export function buildListingSlugCandidate(baseSlug: string, suffix?: number): string {
  if (!suffix || suffix <= 1) {
    return truncateSlug(baseSlug, LISTING_SLUG_MAX_LENGTH);
  }

  const suffixText = `-${suffix}`;
  const truncatedBase = truncateSlug(baseSlug, LISTING_SLUG_MAX_LENGTH - suffixText.length);
  return `${truncatedBase}${suffixText}`;
}

export async function generateUniqueListingSlug(
  client: ListingSlugLookupClient,
  title: string,
): Promise<string> {
  const baseSlug = normalizeListingTitleToSlug(title);

  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const candidate = buildListingSlugCandidate(baseSlug, suffix === 1 ? undefined : suffix);
    const existing = await client.listing.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }
  }

  throw new Error('Unable to generate a unique listing slug');
}

export { LISTING_SLUG_MAX_LENGTH };
