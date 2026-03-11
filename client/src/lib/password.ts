import {
  COMMON_PASSWORDS,
  normalizeCommonPasswordCandidate,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@vithousing/shared';

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordChecklistItem {
  id: string;
  label: string;
  passed: boolean;
}

export function isCommonPassword(password: string): boolean {
  if (!password) {
    return false;
  }

  return COMMON_PASSWORDS.includes(
    normalizeCommonPasswordCandidate(password) as (typeof COMMON_PASSWORDS)[number],
  );
}

export function getPasswordChecklist(password: string, passwordConfirm: string): PasswordChecklistItem[] {
  const common = isCommonPassword(password);

  return [
    {
      id: 'length-min',
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      passed: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: 'length-max',
      label: `No more than ${PASSWORD_MAX_LENGTH} characters`,
      passed: password.length <= PASSWORD_MAX_LENGTH,
    },
    {
      id: 'common',
      label: 'Not a very common password',
      passed: password.length > 0 && !common,
    },
    {
      id: 'confirm',
      label: 'Passwords match',
      passed: password.length > 0 && password === passwordConfirm,
    },
  ];
}

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password || isCommonPassword(password) || password.length < PASSWORD_MIN_LENGTH) {
    return 'weak';
  }

  let score = 1;
  const uniqueChars = new Set(password).size;

  if (password.length >= 20) score += 1;
  if (password.length >= 28) score += 1;
  if (uniqueChars >= 10) score += 1;
  if (/\s/.test(password)) score += 1;
  if (/[\p{L}]/u.test(password) && /[\p{N}]/u.test(password)) score += 1;
  if (/[^ \p{L}\p{N}]/u.test(password)) score += 1;

  if (score >= 6) return 'strong';
  if (score >= 4) return 'good';
  return 'fair';
}
