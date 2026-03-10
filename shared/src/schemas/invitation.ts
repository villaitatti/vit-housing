import { z } from 'zod';

export const INVITATION_EXPIRY_DAYS = 7;

const optionalNameSchema = z
  .string()
  .trim()
  .max(100, 'Name must be 100 characters or fewer')
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

export const createInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  first_name: optionalNameSchema,
  last_name: optionalNameSchema,
  role: z.enum(['HOUSE_USER', 'HOUSE_LANDLORD']),
  language: z.enum(['EN', 'IT']),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
