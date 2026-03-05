export const ALL_ROLES = ['HOUSE_USER', 'HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'] as const;
export const ADMIN_ROLES = ['HOUSE_ADMIN', 'HOUSE_IT_ADMIN'] as const;
export const IT_ADMIN_ROLES = ['HOUSE_IT_ADMIN'] as const;

export type Role = (typeof ALL_ROLES)[number];

export const ROLE_PRIORITY: Record<Role, number> = {
  HOUSE_USER: 0,
  HOUSE_LANDLORD: 1,
  HOUSE_ADMIN: 2,
  HOUSE_IT_ADMIN: 3,
};
