import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, needsPasswordRehash, validatePasswordPolicy, verifyPassword } from './password.js';

test('validatePasswordPolicy rejects short passwords', () => {
  assert.equal(validatePasswordPolicy('short password'), 'Password must be at least 15 characters');
});

test('validatePasswordPolicy rejects common passwords', () => {
  assert.equal(validatePasswordPolicy('password123456789'), 'Choose a less common password');
});

test('hashPassword produces verifiable scrypt hashes', async () => {
  const password = 'correct horse battery staple';
  const hash = await hashPassword(password);

  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(needsPasswordRehash(hash), false);
});
