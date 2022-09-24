import { initTRPC } from '@trpc/server';
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

const t = initTRPC.create();

const postRouter = t.router({
  createPost: t.procedure
    .input(z.object({ title: z.string() }))
    .mutation(({ input }) => {
      const post = {
        id: ++id,
        ...input,
      };
      db.posts.push(post);
      return post;
    }),
  listPosts: t.procedure.query(() => db.posts),
});

export const appRouter = t.router({
  post: postRouter,
  hello: t.procedure.input(z.string().nullish()).query(({ input }) => {
    return `hello ${input ?? 'world'}`;
  }),
});

export type AppRouter = typeof appRouter;
