/**
 * The showcase's API: a small blog kept in memory. Each author takes a
 * different time to load, so you can watch the promises of
 * `experimental_load()` settle one by one.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

interface Team {
  readonly id: string;
  readonly name: string;
}

interface Author {
  readonly delayMs: number;
  readonly id: string;
  readonly name: string;
  readonly teamId: string;
}

interface Post {
  readonly authorId: string;
  readonly slug: string;
  readonly title: string;
}

const teams: ReadonlyArray<Team> = [
  { id: 't1', name: 'Core' },
  { id: 't2', name: 'Docs' },
  { id: 't3', name: 'Examples' },
];

const authors: ReadonlyArray<Author> = [
  { delayMs: 300, id: 'ada', name: 'Ada', teamId: 't1' },
  { delayMs: 1200, id: 'bob', name: 'Bob', teamId: 't2' },
  { delayMs: 700, id: 'cy', name: 'Cy', teamId: 't3' },
  { delayMs: 1800, id: 'dee', name: 'Dee', teamId: 't1' },
  { delayMs: 500, id: 'eli', name: 'Eli', teamId: 't2' },
  { delayMs: 2200, id: 'fay', name: 'Fay', teamId: 't3' },
];

const posts: ReadonlyArray<Post> = [
  {
    authorId: 'ada',
    slug: 'pipelining',
    title: 'One request for a whole page',
  },
  { authorId: 'bob', slug: 'streams', title: 'Each result as it is ready' },
  { authorId: 'cy', slug: 'edges', title: 'Edges that settle by themselves' },
  {
    authorId: 'dee',
    slug: 'limits',
    title: 'What the server lets a request do',
  },
  { authorId: 'eli', slug: 'types', title: 'Types all the way down' },
  { authorId: 'fay', slug: 'fallback', title: 'When a link can’t pipeline' },
  { authorId: 'cy', slug: 'maps', title: 'A query for every item' },
  { authorId: 'bob', slug: 'settle', title: 'Waiting for every edge' },
];

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
        await wait(author.delayMs);
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
