import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInvitationExpiryDate,
  generateInvitationToken,
  getInvitationStatus,
  hashInvitationToken,
  normalizeEmail,
} from './invitations.js';

test('normalizeEmail trims and lowercases addresses', () => {
  assert.equal(normalizeEmail('  Person@Example.COM '), 'person@example.com');
});

test('hashInvitationToken is deterministic for the same token', () => {
  const token = generateInvitationToken();

  assert.equal(hashInvitationToken(token), hashInvitationToken(token));
});

test('buildInvitationExpiryDate adds seven days', () => {
  const expiresAt = buildInvitationExpiryDate(new Date('2026-03-10T12:00:00.000Z'));

  assert.equal(expiresAt.toISOString(), '2026-03-17T12:00:00.000Z');
});

test('getInvitationStatus prioritizes revoked and used over expiry', () => {
  const now = new Date('2026-03-10T12:00:00.000Z');
  const expiresAt = new Date('2026-03-09T12:00:00.000Z');

  assert.equal(
    getInvitationStatus({ used: false, revoked_at: new Date('2026-03-08T12:00:00.000Z'), expires_at: expiresAt }, now),
    'revoked',
  );
  assert.equal(
    getInvitationStatus({ used: true, revoked_at: null, expires_at: expiresAt }, now),
    'used',
  );
  assert.equal(
    getInvitationStatus({ used: false, revoked_at: null, expires_at: expiresAt }, now),
    'expired',
  );
});
