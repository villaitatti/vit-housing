import crypto from 'crypto';
import { INVITATION_EXPIRY_DAYS } from '@vithousing/shared';

export type InvitationLifecycleStatus = 'pending' | 'used' | 'expired' | 'revoked';

export interface InvitationStatusShape {
  used: boolean;
  expires_at: Date;
  revoked_at: Date | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function buildInvitationExpiryDate(now = new Date()): Date {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);
  return expiresAt;
}

export function getInvitationStatus(invitation: InvitationStatusShape, now = new Date()): InvitationLifecycleStatus {
  if (invitation.revoked_at) {
    return 'revoked';
  }

  if (invitation.used) {
    return 'used';
  }

  if (now > invitation.expires_at) {
    return 'expired';
  }

  return 'pending';
}
