import { z } from 'zod';

export const updateUserSchema = z.object({
  first_name: z.string().min(1, 'First name is required').optional(),
  last_name: z.string().min(1, 'Last name is required').optional(),
  preferred_language: z.enum(['EN', 'IT']).optional(),
  phone_number: z.string().optional().nullable(),
  mobile_number: z.string().optional().nullable(),
});

export const adminUpdateUserSchema = updateUserSchema.extend({
  roles: z.array(z.enum(['HOUSE_USER', 'HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'])).min(1).optional(),
});

const ROLE_VALUES = ['HOUSE_USER', 'HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'] as const;

export const adminUserListSchema = z.object({
  search: z.string().optional(),
  roles: z.string().optional().transform((val, ctx) => {
    if (!val) return undefined;
    const items = val.split(',').filter(Boolean);
    const invalid = items.filter(r => !(ROLE_VALUES as readonly string[]).includes(r));
    if (invalid.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid role(s): ${invalid.join(', ')}`,
      });
      return z.NEVER;
    }
    return items as unknown as typeof ROLE_VALUES[number][];
  }),
  sortBy: z.enum(['first_name', 'email', 'created_at', 'last_login']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
