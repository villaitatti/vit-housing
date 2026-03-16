import type { AdminUserListInput } from '@vithousing/shared';
import type { Role, Prisma } from '../generated/prisma/client.js';

type AdminUserWhereFilters = Pick<AdminUserListInput, 'search' | 'roles'>;

export function buildAdminUserWhere(filters: AdminUserWhereFilters): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};

  if (filters.search) {
    where.OR = [
      { first_name: { contains: filters.search, mode: 'insensitive' } },
      { last_name: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.roles && Array.isArray(filters.roles) && filters.roles.length > 0) {
    where.roles = { hasSome: filters.roles };
  }

  return where;
}

export function buildAdminUserRoleStatsWhere(role: Role): Prisma.UserWhereInput {
  return {
    roles: { has: role },
  };
}
