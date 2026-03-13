import crypto from 'crypto';
import { PASSWORD_RESET_EXPIRY_HOURS } from '@vithousing/shared';

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function buildPasswordResetExpiryDate(now = new Date()): Date {
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + PASSWORD_RESET_EXPIRY_HOURS);
  return expiresAt;
}
