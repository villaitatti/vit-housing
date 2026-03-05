import { z } from 'zod';

export const updateUserSchema = z.object({
  first_name: z.string().min(1, 'First name is required').optional(),
  last_name: z.string().min(1, 'Last name is required').optional(),
  preferred_language: z.enum(['EN', 'IT']).optional(),
  phone_number: z.string().optional().nullable(),
  mobile_number: z.string().optional().nullable(),
});

export const adminUpdateUserSchema = updateUserSchema.extend({
  role: z.enum(['HOUSE_USER', 'HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN']).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
