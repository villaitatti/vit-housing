/**
 * Parse a string route parameter as a positive integer ID.
 * Returns null if the value is not a valid positive integer.
 */
export function parseId(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const id = Number(trimmed);
  return id > 0 ? id : null;
}
