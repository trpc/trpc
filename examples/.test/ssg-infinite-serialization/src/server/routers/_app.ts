/**
 * This file contains the root router of your tRPC-backend
 */
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';


const posts = [
  { id: 1, title: 'First Post' },
  { id: 2, title: 'Second Post' },
  { id: 3, title: 'Third Post'},
  { id: 4, title: 'Fourth Post'},
  { id: 5, title: 'Fifth Post'},
  { id: 6, title: 'Sixth Post'},
  { id: 7, title: 'Seventh Post'},
  { id: 8, title: 'Eighth Post'},
  { id: 9, title: 'Ninth Post'},
  { id: 10, title: 'Tenth Post'},
  { id: 11, title: 'Eleventh Post'},
  { id: 12, title: 'Twelfth Post'},
  { id: 13, title: 'Thirteenth Post'},
  { id: 14, title: 'Fourteenth Post'},
  { id: 15, title: 'Fifteenth Post'},
]

export const appRouter = router({
  getPosts: publicProcedure
    .input(
      z.object({
        limit: z.number().default(3),
        cursor: z.number().nullish(),
      }).default({}),
    )
    .query(({ input }) => {
      const start = input.cursor ?? 0;
      const items = posts.slice(start, start + input.limit);
      const nextCursor = (start + input.limit) < posts.length ? start + input.limit : null;
      return {
        items,
        nextCursor,
      }
    }),
});

export type AppRouter = typeof appRouter;
