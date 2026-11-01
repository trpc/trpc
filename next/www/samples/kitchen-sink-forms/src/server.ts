import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

import { type ProfileOutput, profileSchema } from './schema.ts';

interface Profile extends ProfileOutput {
  readonly updatedAt: string;
}

interface Change {
  readonly at: string;
  readonly field: keyof ProfileOutput;
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
    topics: ['math', 'engines'],
    bio: 'Wrote the first program.',
    updatedAt: new Date().toISOString(),
  } satisfies Profile as Profile,
  changes: [] as Array<Change>,
  /** Usernames other people have. */
  others: new Set(['admin', 'katt', 'trpc']),
};

const shown = (value: string | ReadonlyArray<string>) =>
  typeof value === 'string' ? value : value.join(', ');

const isTaken = (username: string) =>
  username !== db.profile.username && db.others.has(username);

const t = initTrpc();

// #region router
export const appRouter = t.router({
  profile: {
    get: t.procedure.query(() => db.profile),
    changes: t.procedure.query(() => db.changes.slice(0, 5)),
    /** For the form's own check, before it sends the profile. */
    isTaken: t.procedure
      .input(z.object({ username: z.string() }))
      .query((opts) => isTaken(opts.input.username)),
    update: t.procedure
      // The form's schema, with the database's lookup. A request that
      // skipped the browser's check gets a `BAD_REQUEST` with its issues.
      .input(profileSchema(isTaken))
      .mutation((opts) => {
        // The schema's output: trimmed, lowercased, topics as an array.
        const next = opts.input;
        const at = new Date().toISOString();
        for (const field of Object.keys(next) as Array<keyof ProfileOutput>) {
          const from = shown(db.profile[field]);
          const to = shown(next[field]);
          if (from !== to) {
            db.changes.unshift({ at, field, from, to });
          }
        }
        db.profile = { ...next, updatedAt: at };
        return db.profile;
      }),
  },
});

export type AppRouter = typeof appRouter;
// #endregion router

export const handler = createFetchHandler({ router: appRouter });
