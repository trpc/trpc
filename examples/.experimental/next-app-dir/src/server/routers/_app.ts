import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const createPost = publicProcedure
  .input(
    z.object({
      title: z.string(),
      content: z.string(),
    }),
  )
  .mutation(async (opts) => {
    return {
      id: '1',
      ...opts.input,
    };
  });

export const appRouter = router({
  greeting: publicProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .query(async (opts) => {
      console.log('request from', opts.ctx.headers?.['x-trpc-source']);
      return `hello ${opts.input.text}`;
    }),

  createPost,
});

export type AppRouter = typeof appRouter;
