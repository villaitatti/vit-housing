import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminUserRoleStatsWhere, buildAdminUserWhere } from './adminUsers.js';

test('buildAdminUserWhere adds search and role filters for the table query', () => {
  const where = buildAdminUserWhere({
    search: 'john',
    roles: ['HOUSE_USER', 'HOUSE_LANDLORD'],
  });

  assert.deepEqual(where, {
    OR: [
      { first_name: { contains: 'john', mode: 'insensitive' } },
      { last_name: { contains: 'john', mode: 'insensitive' } },
      { email: { contains: 'john', mode: 'insensitive' } },
    ],
    roles: { hasSome: ['HOUSE_USER', 'HOUSE_LANDLORD'] },
  });
});

test('buildAdminUserWhere returns an empty filter object when no table filters are active', () => {
  const where = buildAdminUserWhere({
    search: undefined,
    roles: undefined,
  });

  assert.deepEqual(where, {});
});

test('buildAdminUserWhere supports search-only filters without a roles clause', () => {
  const where = buildAdminUserWhere({
    search: 'john',
    roles: undefined,
  });

  assert.deepEqual(where, {
    OR: [
      { first_name: { contains: 'john', mode: 'insensitive' } },
      { last_name: { contains: 'john', mode: 'insensitive' } },
      { email: { contains: 'john', mode: 'insensitive' } },
    ],
  });
});

test('buildAdminUserWhere supports role-only filters without a search clause', () => {
  const where = buildAdminUserWhere({
    search: undefined,
    roles: ['HOUSE_USER'],
  });

  assert.deepEqual(where, {
    roles: { hasSome: ['HOUSE_USER'] },
  });
});

test('buildAdminUserWhere ignores an empty roles array like an undefined roles filter', () => {
  const where = buildAdminUserWhere({
    search: undefined,
    roles: [],
  });

  assert.deepEqual(where, {});
});

test('buildAdminUserRoleStatsWhere stays global apart from the requested role', () => {
  assert.deepEqual(buildAdminUserRoleStatsWhere('HOUSE_USER'), {
    roles: { has: 'HOUSE_USER' },
  });
  assert.deepEqual(buildAdminUserRoleStatsWhere('HOUSE_LANDLORD'), {
    roles: { has: 'HOUSE_LANDLORD' },
  });
});
