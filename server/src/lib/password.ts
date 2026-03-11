import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import bcrypt from 'bcrypt';
import {
  COMMON_PASSWORDS,
  normalizeCommonPasswordCandidate,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@vithousing/shared';

const SCRYPT_PREFIX = 'scrypt';
const SCRYPT_KEY_LENGTH = 64;
const DRUPAL7_HASH_PREFIX = '$S$';
const DRUPAL_PORTABLE_HASH_PREFIXES = new Set(['$P$', '$H$']);
const DRUPAL7_ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DRUPAL7_MIN_HASH_COUNT = 7;
const DRUPAL7_MAX_HASH_COUNT = 30;
const SCRYPT_MIN_N = 2;
const SCRYPT_MIN_R = 1;
const SCRYPT_MIN_P = 1;
const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const;

const COMMON_PASSWORD_SET = new Set<string>(
  COMMON_PASSWORDS.map((password) => normalizeCommonPasswordCandidate(password)),
);

interface ScryptConfig {
  N: number;
  r: number;
  p: number;
  maxmem: number;
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

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

function createMd5Hex(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex');
}

function verifyPortableMd5(password: string, storedHash: string): boolean {
  if (!DRUPAL_PORTABLE_HASH_PREFIXES.has(storedHash.slice(0, 3)) || storedHash.length < 12) {
    return false;
  }

  const countLog2 = DRUPAL7_ITOA64.indexOf(storedHash[3]!);
  if (countLog2 < DRUPAL7_MIN_HASH_COUNT || countLog2 > DRUPAL7_MAX_HASH_COUNT) {
    return false;
  }

  const salt = storedHash.slice(4, 12);
  if (salt.length !== 8) {
    return false;
  }

  const iterations = 1 << countLog2;
  let hash = createHash('md5').update(salt + password, 'utf8').digest();

  for (let index = 0; index < iterations; index += 1) {
    hash = createHash('md5').update(hash).update(password, 'utf8').digest();
  }

  const expectedHash = `${storedHash.slice(0, 12)}${drupal7Base64Encode(hash, hash.length)}`.slice(0, 34);

  if (expectedHash.length !== storedHash.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expectedHash), Buffer.from(storedHash));
}

function verifyDrupal7Password(password: string, storedHash: string): boolean {
  let normalizedPassword = password;
  let normalizedHash = storedHash;

  if (normalizedHash.startsWith('U')) {
    normalizedPassword = createMd5Hex(normalizedPassword);
    normalizedHash = normalizedHash.slice(1);
  }

  if (DRUPAL_PORTABLE_HASH_PREFIXES.has(normalizedHash.slice(0, 3))) {
    return verifyPortableMd5(normalizedPassword, normalizedHash);
  }

  if (!normalizedHash.startsWith(DRUPAL7_HASH_PREFIX) || normalizedHash.length < 12) {
    return false;
  }

  const countLog2 = DRUPAL7_ITOA64.indexOf(normalizedHash[3]!);
  if (countLog2 < DRUPAL7_MIN_HASH_COUNT || countLog2 > DRUPAL7_MAX_HASH_COUNT) {
    return false;
  }

  const salt = normalizedHash.slice(4, 12);
  if (salt.length !== 8) {
    return false;
  }

  const iterations = 1 << countLog2;
  let hash = createHash('sha512').update(salt + normalizedPassword, 'utf8').digest();

  for (let index = 0; index < iterations; index += 1) {
    hash = createHash('sha512').update(hash).update(normalizedPassword, 'utf8').digest();
  }

  const expectedHash = `${normalizedHash.slice(0, 12)}${drupal7Base64Encode(hash, hash.length)}`.slice(0, 55);

  if (expectedHash.length !== normalizedHash.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expectedHash), Buffer.from(normalizedHash));
}

function parseStoredScryptParams(nRaw: string, rRaw: string, pRaw: string): ScryptConfig | null {
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return null;
  }

  if (!isPowerOfTwo(N) || N < SCRYPT_MIN_N || N > SCRYPT_PARAMS.N) {
    return null;
  }

  if (r < SCRYPT_MIN_R || r > SCRYPT_PARAMS.r) {
    return null;
  }

  if (p < SCRYPT_MIN_P || p > SCRYPT_PARAMS.p) {
    return null;
  }

  return {
    N,
    r,
    p,
    maxmem: SCRYPT_PARAMS.maxmem,
  };
}

async function deriveScryptKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptConfig = SCRYPT_PARAMS,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }

  if (COMMON_PASSWORD_SET.has(normalizeCommonPasswordCandidate(password))) {
    return 'Choose a less common password';
  }

  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveScryptKey(password, salt, SCRYPT_KEY_LENGTH);

  return [
    SCRYPT_PREFIX,
    String(SCRYPT_PARAMS.N),
    String(SCRYPT_PARAMS.r),
    String(SCRYPT_PARAMS.p),
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith(`${SCRYPT_PREFIX}$`)) {
    const [, nRaw, rRaw, pRaw, saltRaw, keyRaw] = storedHash.split('$');
    if (!nRaw || !rRaw || !pRaw || !saltRaw || !keyRaw) {
      return false;
    }

    const parsedParams = parseStoredScryptParams(nRaw, rRaw, pRaw);
    if (!parsedParams) {
      return false;
    }

    const salt = Buffer.from(saltRaw, 'base64url');
    const expectedKey = Buffer.from(keyRaw, 'base64url');
    const derivedKey = await deriveScryptKey(password, salt, expectedKey.length, parsedParams);

    return timingSafeEqual(expectedKey, derivedKey);
  }

  if (storedHash.startsWith('$2')) {
    return bcrypt.compare(password, storedHash);
  }

  if (
    storedHash.startsWith(DRUPAL7_HASH_PREFIX) ||
    DRUPAL_PORTABLE_HASH_PREFIXES.has(storedHash.slice(0, 3)) ||
    storedHash.startsWith('U')
  ) {
    return verifyDrupal7Password(password, storedHash);
  }

  return false;
}

export function needsPasswordRehash(storedHash: string): boolean {
  return !storedHash.startsWith(`${SCRYPT_PREFIX}$`);
}
