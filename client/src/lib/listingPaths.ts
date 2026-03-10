export function getListingDetailPath(lang: string, slug: string): string {
  return `/${lang}/listings/${slug}`;
}

export function getListingEditPath(lang: string, slug: string): string {
  return `/${lang}/listings/${slug}/edit`;
}

export function isLegacyListingIdParam(value: string | undefined): boolean {
  return /^\d+$/.test((value || '').trim());
}
