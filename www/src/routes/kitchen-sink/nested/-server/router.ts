/**
 * The showcase's API: a small blog kept in memory. Each author takes a
 * different time to load, so you can watch the promises of
 * `experimental_load()` settle one by one.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

import { authors, posts, teams } from './data.ts';

const t = initTRPC.create();

/** How long each author takes to load, in ms */
const delayMs: Readonly<Record<string, number>> = {
  ada: 300,
  bob: 1200,
  cy: 700,
  dee: 1800,
  eli: 500,
  fay: 2200,
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const find = <T extends { readonly id: string }>(
  all: ReadonlyArray<T>,
  id: string,
) => {
  const found = all.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `No ${id}` });
  }
  return found;
};

export const appRouter = t.router({
  post: t.router({
    list: t.procedure.query(() => ({ items: posts })),
  }),
  author: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const author = find(authors, input.id);
        await wait(delayMs[author.id] ?? 0);
        return { id: author.id, name: author.name, teamId: author.teamId };
      }),
  }),
  team: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        await wait(150);
        return find(teams, input.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
