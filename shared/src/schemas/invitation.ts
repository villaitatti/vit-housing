import { z } from 'zod';

export const createInvitationSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['HOUSE_USER', 'HOUSE_LANDLORD']),
  language: z.enum(['EN', 'IT']),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
