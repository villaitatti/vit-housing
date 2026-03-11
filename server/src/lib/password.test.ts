import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { PASSWORD_MAX_LENGTH } from '@vithousing/shared';
import { hashPassword, needsPasswordRehash, validatePasswordPolicy, verifyPassword } from './password.js';

const DRUPAL7_ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const AUTHENTIC_DRUPAL7_HASH = '$S$DYx387nLkjxnMiupTv8ubxxnixbF3d0QchC2zhw7Y5XvlO6KqZ0T';

function drupal7Base64Encode(input: Buffer, count: number): string {
  let output = '';
  let index = 0;

  while (index < count) {
    let value = input[index]!;
    index += 1;
    output += DRUPAL7_ITOA64[value & 0x3f];

    if (index < count) {
      value |= input[index]! << 8;
    }
    output += DRUPAL7_ITOA64[(value >> 6) & 0x3f];

    if (index >= count) {
      break;
    }
    index += 1;

    if (index < count) {
      value |= input[index]! << 16;
    }
    output += DRUPAL7_ITOA64[(value >> 12) & 0x3f];

    if (index >= count) {
      break;
    }
    index += 1;

    output += DRUPAL7_ITOA64[(value >> 18) & 0x3f];
  }

  return output;
}

function createDrupal7HashForTest(password: string, setting = '$S$CTo9G7Lx2'): string {
  const countLog2 = DRUPAL7_ITOA64.indexOf(setting[3]!);
  const salt = setting.slice(4, 12);
  const iterations = 1 << countLog2;

  let hash = createHash('sha512').update(salt + password, 'utf8').digest();
  for (let index = 0; index < iterations; index += 1) {
    hash = createHash('sha512').update(hash).update(password, 'utf8').digest();
  }

  return `${setting}${drupal7Base64Encode(hash, hash.length)}`.slice(0, 55);
}

function createPortableMd5HashForTest(password: string, setting = '$P$B12345678'): string {
  const countLog2 = DRUPAL7_ITOA64.indexOf(setting[3]!);
  const salt = setting.slice(4, 12);
  const iterations = 1 << countLog2;

  let hash = createHash('md5').update(salt + password, 'utf8').digest();
  for (let index = 0; index < iterations; index += 1) {
    hash = createHash('md5').update(hash).update(password, 'utf8').digest();
  }

  return `${setting}${drupal7Base64Encode(hash, hash.length)}`.slice(0, 34);
}

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

test('verifyPassword remains compatible with Drupal 7 password hashes', async () => {
  const legacyHash = createDrupal7HashForTest('correct horse battery staple');

  assert.equal(await verifyPassword('correct horse battery staple', legacyHash), true);
  assert.equal(await verifyPassword('wrong password', legacyHash), false);
  assert.equal(needsPasswordRehash(legacyHash), true);
});

test('verifyPassword accepts an authentic Drupal 7 SHA-512 hash fixture', async () => {
  assert.equal(await verifyPassword('my_new_password', AUTHENTIC_DRUPAL7_HASH), true);
  assert.equal(await verifyPassword('wrong password', AUTHENTIC_DRUPAL7_HASH), false);
});

test('verifyPassword remains compatible with portable Drupal MD5 hashes', async () => {
  const portableHash = createPortableMd5HashForTest('portable password');
  const phpassHash = createPortableMd5HashForTest('portable password', '$H$B12345678');

  assert.equal(await verifyPassword('portable password', portableHash), true);
  assert.equal(await verifyPassword('portable password', phpassHash), true);
  assert.equal(await verifyPassword('wrong password', portableHash), false);
  assert.equal(await verifyPassword('wrong password', phpassHash), false);
});

test('verifyPassword remains compatible with upgraded Drupal U$ hashes', async () => {
  const upgradedHash = `U${createPortableMd5HashForTest(createHash('md5').update('legacy password', 'utf8').digest('hex'))}`;

  assert.equal(await verifyPassword('legacy password', upgradedHash), true);
  assert.equal(await verifyPassword('wrong password', upgradedHash), false);
});
