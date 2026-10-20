import { z } from 'zod';

// #region schema
/**
 * Whether someone else has `username`: the server asks its database, and
 * the browser asks the server.
 */
export type IsTaken = (username: string) => boolean | Promise<boolean>;

/**
 * The profile form's schema. The form checks it in the browser and the
 * procedure's `.input()` checks it again on the server: one schema, so the
 * two can't disagree. Only `isTaken` differs between them.
 */
export function profileSchema(isTaken: IsTaken) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter your name')
      .max(40, 'At most 40 characters'),
    username: z
      .string()
      .trim()
      .toLowerCase()
      // `abort`: a malformed username isn't looked up.
      .regex(/^[a-z0-9_]{3,20}$/, {
        abort: true,
        message: '3 to 20 letters, digits or _',
      })
      .refine(
        async (username) => !(await isTaken(username)),
        'Someone has this username',
      ),
    email: z.email('Enter an email address'),
    // Typed as "trpc, effect", stored as ['trpc', 'effect'].
    topics: z
      .string()
      .transform((text) =>
        text
          .split(',')
          .map((topic) => topic.trim().toLowerCase())
          .filter(Boolean),
      )
      // Checked as a whole, so each issue is the field's, not one topic's.
      .pipe(
        z
          .array(z.string())
          .max(5, 'At most 5 topics')
          .refine(
            (topics) => topics.every((topic) => topic.length <= 20),
            'A topic is at most 20 characters',
          ),
      ),
    bio: z.string().max(120, 'At most 120 characters'),
  });
}

/** What the form holds and `mutate()` takes: the schema's input. */
export type ProfileInput = z.input<ReturnType<typeof profileSchema>>;

/** What the procedure gets, once the schema transformed it: its output. */
export type ProfileOutput = z.output<ReturnType<typeof profileSchema>>;
// #endregion schema
