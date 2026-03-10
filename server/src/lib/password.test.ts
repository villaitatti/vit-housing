import test from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD_MAX_LENGTH } from '@vithousing/shared';
import { hashPassword, needsPasswordRehash, validatePasswordPolicy, verifyPassword } from './password.js';

test('validatePasswordPolicy rejects short passwords', () => {
  assert.equal(validatePasswordPolicy('short password'), 'Password must be at least 15 characters');
});

test('validatePasswordPolicy rejects common passwords', () => {
  assert.equal(validatePasswordPolicy('password123456789'), 'Choose a less common password');
});

test('validatePasswordPolicy rejects overlong passwords', () => {
  assert.equal(
    validatePasswordPolicy('a'.repeat(PASSWORD_MAX_LENGTH + 1)),
    `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  );
});

test('hashPassword produces verifiable scrypt hashes', async () => {
  const password = 'correct horse battery staple';
  const hash = await hashPassword(password);

  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(needsPasswordRehash(hash), false);
});

test('verifyPassword returns false for an incorrect password', async () => {
  const hash = await hashPassword('correct horse battery staple');

  assert.equal(await verifyPassword('wrong password', hash), false);
});

test('needsPasswordRehash returns true for bcrypt-style hashes', () => {
  assert.equal(needsPasswordRehash('$2b$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuu'), true);
});

test('verifyPassword returns false for malformed hashes', async () => {
  assert.equal(await verifyPassword('any password', 'not-a-hash'), false);
});

test('verifyPassword remains compatible with legacy bcrypt hashes', async () => {
  const bcrypt = await import('bcrypt');
  const legacyHash = await bcrypt.hash('legacy password', 10);

  assert.equal(await verifyPassword('legacy password', legacyHash), true);
  assert.equal(await verifyPassword('wrong password', legacyHash), false);
  assert.equal(needsPasswordRehash(legacyHash), true);
});
