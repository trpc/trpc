import * as trpc from '@trpc/server';
import { z } from 'zod';

let id = 0;

const db = {
  posts: [
    {
      id: ++id,
      title: 'hello',
    },
  ],
};

const posts = trpc
  .router()
  .mutation('create', {
    input: z.object({
      title: z.string(),
    }),
    resolve: ({ input }) => {
      const post = {
        id: ++id,
        ...input,
      };
      db.posts.push(post);
      return post;
    },
  })
  .query('list', {
    resolve: () => db.posts,
  });

export const appRouter = trpc
  .router()
  .query('hello', {
    input: z.string().nullish(),
    resolve: ({ input, ctx }) => {
      return `hello ${input ?? 'world'}`;
    },
  })
  .merge('post.', posts);

export type AppRouter = typeof appRouter;
