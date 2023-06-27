import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

let post = {
  id: 1,
  title: 'hello',
  content: 'world',
  created: new Date(),
};

export const createPost = publicProcedure
  .input(
    z.object({
      title: z.string(),
      content: z.string(),
    }),
  )
  .mutation(async (opts) => {
    post = {
      id: post.id + 1,
      created: new Date(),
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
  getPost: publicProcedure.query(async (opts) => {
    return post;
  }),
});

export type AppRouter = typeof appRouter;
