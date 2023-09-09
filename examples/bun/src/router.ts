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

const publicProcedure = t.procedure;
const router = t.router;

const postRouter = router({
  createPost: publicProcedure
    .input(z.object({ title: z.string() }))
    .mutation(({ input }) => {
      const post = {
        id: ++id,
        ...input,
      };
      db.posts.push(post);
      return post;
    }),
  listPosts: publicProcedure.query(() => db.posts),
});

export const appRouter = router({
  post: postRouter,
  hello: publicProcedure.input(z.string().nullish()).query(({ input }) => {
    return `hello ${input ?? 'world'}`;
  }),
});

export type AppRouter = typeof appRouter;
