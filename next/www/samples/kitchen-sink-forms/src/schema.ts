import { z } from 'zod';

// #region schema
/**
 * The profile form's fields. The form checks them in the browser and the
 * procedure's `.input()` checks them again on the server: one schema, so
 * the two can't disagree.
 */
export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter your name')
    .max(40, 'At most 40 characters'),
  username: z
    .string()
    .regex(/^[a-z0-9_]{3,20}$/, '3 to 20 lowercase letters, digits or _'),
  email: z.email('Enter an email address'),
  bio: z.string().max(120, 'At most 120 characters'),
});

/** What the form holds: the schema's input, before `.trim()`. */
export type ProfileInput = z.input<typeof profileSchema>;
// #endregion schema
