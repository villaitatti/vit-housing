import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import bcrypt from 'bcrypt';
import {
  COMMON_PASSWORDS,
  normalizeCommonPasswordCandidate,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@vithousing/shared';

const SCRYPT_PREFIX = 'scrypt';
const SCRYPT_KEY_LENGTH = 64;
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

    const salt = Buffer.from(saltRaw, 'base64url');
    const expectedKey = Buffer.from(keyRaw, 'base64url');
    const derivedKey = await deriveScryptKey(password, salt, expectedKey.length, {
      N: Number(nRaw),
      r: Number(rRaw),
      p: Number(pRaw),
      maxmem: SCRYPT_PARAMS.maxmem,
    });

    return timingSafeEqual(expectedKey, derivedKey);
  }

  if (storedHash.startsWith('$2')) {
    return bcrypt.compare(password, storedHash);
  }

  return false;
}

export function needsPasswordRehash(storedHash: string): boolean {
  return !storedHash.startsWith(`${SCRYPT_PREFIX}$`);
}
