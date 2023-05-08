import { z } from 'zod';
import { publicProcedure, router } from '~/server/trpc';

const posts = [
  { id: 1, title: 'foo', createdAt: new Date() },
  { id: 2, title: 'bar', createdAt: new Date() },
  { id: 3, title: 'baz', createdAt: new Date() },
];

export const appRouter = router({
  greeting: publicProcedure.input(z.string()).query((opts) => {
    return `Hello ${
      opts.input
    }! The time is ${new Date().toLocaleTimeString()}`;
  }),

  postList: publicProcedure.query((id) => {
    return posts;
  }),

  postCreate: publicProcedure
    .input(
      z.object({
        title: z.string(),
      }),
    )
    .mutation(async (opts) => {
      const post = {
        id: posts.length + 1,
        title: opts.input.title,
        createdAt: new Date(),
      };
      posts.push(post);

      // simulate slow db
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return post;
    }),
});

export type AppRouter = typeof appRouter;
