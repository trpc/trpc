/**
 * The showcase's API: a post, its author and the author's team, and a
 * commenter with an avatar for each comment. Every query fails on purpose as
 * many times as its input says, so you can watch `retryLink` retry a part of
 * a load. The server counts each query's runs by the load's `session`, and
 * returns the run that answered.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

/** The runs of each query, by the load's session and the query's key */
const runs = new Map<string, number>();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The run of a query, which fails while it is within `failTimes`. Old
 * sessions go, so the map stays small.
 */
async function run(opts: {
  readonly failTimes: number;
  readonly key: string;
  readonly session: string;
}) {
  await wait(120);
  const key = `${opts.session}:${opts.key}`;
  const count = (runs.get(key) ?? 0) + 1;
  runs.set(key, count);
  if (runs.size > 5000) {
    runs.clear();
  }
  if (count <= opts.failTimes) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `${opts.key} failed on purpose, run ${count}`,
    });
  }
  return count;
}

/** What every query takes: the load's session, and how often to fail */
const flaky = z.object({
  failTimes: z.number().int().min(0).max(5),
  session: z.string().min(1).max(64),
});

const comments = [
  { by: 'ada', id: 'c1', text: 'One request, nice.' },
  { by: 'bob', id: 'c2', text: 'And retries only redo what failed?' },
  { by: 'cy', id: 'c3', text: 'With the queries that read it.' },
];

const users: Readonly<
  Record<string, { readonly avatarId: string; readonly name: string }>
> = {
  ada: { avatarId: 'owl', name: 'Ada' },
  bob: { avatarId: 'fox', name: 'Bob' },
  cy: { avatarId: 'cat', name: 'Cy' },
  dee: { avatarId: 'bee', name: 'Dee' },
};

const avatars: Readonly<Record<string, string>> = {
  bee: '🐝',
  cat: '🐱',
  fox: '🦊',
  owl: '🦉',
};

const teams: Readonly<Record<string, string>> = { core: 'Core team' };

const known = <T>(record: Readonly<Record<string, T>>, id: string) => {
  const found = record[id];
  if (found === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `No ${id}` });
  }
  return found;
};

export const appRouter = t.router({
  post: t.router({
    bySlug: t.procedure
      .input(flaky.extend({ slug: z.string() }))
      .query(async ({ input }) => ({
        authorId: 'dee',
        comments,
        run: await run({ ...input, key: `post:${input.slug}` }),
        slug: input.slug,
        title: 'Retrying part of a load',
      })),
  }),
  author: t.router({
    byId: t.procedure
      .input(flaky.extend({ id: z.string() }))
      .query(async ({ input }) => ({
        id: input.id,
        name: known(users, input.id).name,
        run: await run({ ...input, key: `author:${input.id}` }),
        teamId: 'core',
      })),
  }),
  team: t.router({
    byId: t.procedure
      .input(flaky.extend({ id: z.string() }))
      .query(async ({ input }) => ({
        id: input.id,
        name: known(teams, input.id),
        run: await run({ ...input, key: `team:${input.id}` }),
      })),
  }),
  user: t.router({
    /**
     * A commenter. `failFor` fails one of them only: every comment's query
     * has the same input but for the id the server fills in
     */
    byId: t.procedure
      .input(
        z.object({
          failFor: z.string().nullable(),
          failTimes: z.number().int().min(0).max(5),
          id: z.string(),
          session: z.string().min(1).max(64),
        }),
      )
      .query(async ({ input }) => {
        const user = known(users, input.id);
        return {
          avatarId: user.avatarId,
          id: input.id,
          name: user.name,
          run: await run({
            failTimes: input.failFor === input.id ? input.failTimes : 0,
            key: `user:${input.id}`,
            session: input.session,
          }),
        };
      }),
  }),
  avatar: t.router({
    byId: t.procedure
      .input(flaky.extend({ id: z.string() }))
      .query(async ({ input }) => ({
        emoji: known(avatars, input.id),
        id: input.id,
        run: await run({ ...input, key: `avatar:${input.id}` }),
      })),
  }),
});

export type AppRouter = typeof appRouter;
