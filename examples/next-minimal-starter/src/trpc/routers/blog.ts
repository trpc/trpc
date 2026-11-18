import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { baseProcedure, createTRPCRouter } from '../init';

/**
 * A small in-memory blog for the `/nested` page. Each author takes a different
 * time to load, so that you can watch the edges of `experimental_nested()`
 * arrive one by one.
 */
const teams = [
  { id: 't1', name: 'Core' },
  { id: 't2', name: 'Docs' },
  { id: 't3', name: 'Examples' },
];

const authors = [
  { id: 'ada', name: 'Ada', teamId: 't1', delayMs: 300 },
  { id: 'bob', name: 'Bob', teamId: 't2', delayMs: 1200 },
  { id: 'cy', name: 'Cy', teamId: 't3', delayMs: 700 },
  { id: 'dee', name: 'Dee', teamId: 't1', delayMs: 1800 },
  { id: 'eli', name: 'Eli', teamId: 't2', delayMs: 500 },
  { id: 'fay', name: 'Fay', teamId: 't3', delayMs: 2200 },
];

const posts = [
  {
    slug: 'pipelining',
    title: 'One request for a whole page',
    authorId: 'ada',
  },
  { slug: 'streams', title: 'Each result as it is ready', authorId: 'bob' },
  { slug: 'edges', title: 'Edges that settle by themselves', authorId: 'cy' },
  {
    slug: 'limits',
    title: 'What the server lets a request do',
    authorId: 'dee',
  },
  { slug: 'types', title: 'Types all the way down', authorId: 'eli' },
  { slug: 'fallback', title: 'When a link can’t pipeline', authorId: 'fay' },
  { slug: 'maps', title: 'A query for every item', authorId: 'cy' },
  { slug: 'settle', title: 'Waiting for every edge', authorId: 'bob' },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const blogRouter = createTRPCRouter({
  posts: baseProcedure.query(() => ({ items: posts })),
  author: baseProcedure
    .input(z.object({ id: z.string() }))
    .query(async (opts) => {
      const author = authors.find((it) => it.id === opts.input.id);
      if (!author) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      await wait(author.delayMs);
      return { id: author.id, name: author.name, teamId: author.teamId };
    }),
  team: baseProcedure
    .input(z.object({ id: z.string() }))
    .query(async (opts) => {
      await wait(150);
      const team = teams.find((it) => it.id === opts.input.id);
      if (!team) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return team;
    }),
});
