import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;
export const COMMON_PASSWORDS = [
  '123456',
  '123456789',
  '12345678',
  'password',
  'password1',
  'qwerty',
  'qwerty123',
  '111111',
  '123123',
  'abc123',
  'password123',
  'password123456789',
  'admin',
  'welcome',
  'welcome1',
  'letmein',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'iloveyou',
  'secret',
  'changeme',
  'passw0rd',
  '000000',
  '654321',
  '987654321',
] as const;

export function normalizeCommonPasswordCandidate(password: string): string {
  return password.normalize('NFKC').toLowerCase();
}

const COMMON_PASSWORDS_SET = new Set<string>(
  COMMON_PASSWORDS.map((password) => normalizeCommonPasswordCandidate(password)),
);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine(
    (value) => !COMMON_PASSWORDS_SET.has(normalizeCommonPasswordCandidate(value)),
    'Choose a less common password',
  );

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z
  .object({
    token: z.string().min(1, 'Invitation token is required'),
    first_name: z.string().trim().min(1, 'First name is required'),
    last_name: z.string().trim().min(1, 'Last name is required'),
    password: passwordSchema,
    password_confirm: z.string().min(1, 'Please confirm your password'),
    preferred_language: z.enum(['EN', 'IT']),
    phone_number: z.string().trim().optional(),
    mobile_number: z.string().trim().optional(),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: 'Passwords do not match',
    path: ['password_confirm'],
  });

export const vitIdCallbackSchema = z.object({
  access_token: z.string().min(1, 'Access token is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type VitIdCallbackInput = z.infer<typeof vitIdCallbackSchema>;
