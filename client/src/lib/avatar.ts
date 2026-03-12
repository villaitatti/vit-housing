export function getInitials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}
