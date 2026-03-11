export const ALL_ROLES = ['HOUSE_USER', 'HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'] as const;
export const MANAGED_LISTING_ROLES = ['HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'] as const;
export const ADMIN_ROLES = ['HOUSE_ADMIN', 'HOUSE_IT_ADMIN'] as const;
export const IT_ADMIN_ROLES = ['HOUSE_IT_ADMIN'] as const;
export const FAVORITE_LISTING_ROLES = ['HOUSE_USER', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'] as const;

export type Role = (typeof ALL_ROLES)[number];

export const ROLE_PRIORITY: Record<Role, number> = {
  HOUSE_USER: 0,
  HOUSE_LANDLORD: 1,
  HOUSE_ADMIN: 2,
  HOUSE_IT_ADMIN: 3,
};

export function hasRole(userRoles: readonly Role[], ...check: Role[]): boolean {
  return check.some(r => userRoles.includes(r));
}

export function canUseFavoriteListings(userRoles: readonly Role[]): boolean {
  return hasRole(userRoles, ...FAVORITE_LISTING_ROLES);
}

export function highestRole(roles: Role[]): Role {
  return roles.reduce<Role>((highest, r) => {
    return (ROLE_PRIORITY[r] ?? 0) > (ROLE_PRIORITY[highest] ?? 0) ? r : highest;
  }, roles[0] ?? 'HOUSE_USER');
}
