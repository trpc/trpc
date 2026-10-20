import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
import type { z } from 'zod';

import { profileSchema } from './schema.ts';

interface Profile extends z.output<typeof profileSchema> {
  readonly updatedAt: string;
}

interface Change {
  readonly at: string;
  readonly field: keyof z.output<typeof profileSchema>;
  readonly from: string;
  readonly to: string;
}

// The demo's database lives in memory, in this page: each edit to the code
// starts it over.
const db = {
  profile: {
    name: 'Ada Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    bio: 'Wrote the first program.',
    updatedAt: new Date().toISOString(),
  } satisfies Profile as Profile,
  changes: [] as Array<Change>,
  /** Usernames other people have. Only the server knows them. */
  taken: new Set(['admin', 'katt', 'trpc']),
};

const t = initTrpc();

// #region router
export const appRouter = {
  profile: {
    get: t.procedure.query(() => db.profile),
    changes: t.procedure.query(() => db.changes.slice(0, 5)),
    update: t.procedure
      // The same schema as the form's: a request that skips the browser's
      // check gets a `BAD_REQUEST` with the schema's issues.
      .input(profileSchema)
      .mutation((opts) => {
        const next = opts.input;
        if (
          next.username !== db.profile.username &&
          db.taken.has(next.username)
        ) {
          // Returned, not thrown: the client's error type includes it.
          return error({
            code: 'CONFLICT',
            message: `@${next.username} is taken`,
            data: { field: 'username' as const },
          });
        }
        const at = new Date().toISOString();
        for (const field of ['name', 'username', 'email', 'bio'] as const) {
          if (next[field] !== db.profile[field]) {
            db.changes.unshift({
              at,
              field,
              from: db.profile[field],
              to: next[field],
            });
          }
        }
        db.profile = { ...next, updatedAt: at };
        return db.profile;
      }),
  },
};

export type AppRouter = typeof appRouter;
// #endregion router

export const handler = createFetchHandler({ router: appRouter });
