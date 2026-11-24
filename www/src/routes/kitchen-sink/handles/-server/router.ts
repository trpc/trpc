/**
 * The showcase's API: a few posts and their comments, kept in memory. It
 * never changes, so every request and server instance sees the same data.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

import { comments, posts } from './data.ts';

const t = initTRPC.create();

const findPost = (id: string) => {
  const post = posts.find((candidate) => candidate.id === id);
  if (post === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `No post ${id}` });
  }
  return post;
};

export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => findPost(input.id)),
    comments: t.procedure
      .input(z.object({ postId: z.string() }))
      .query(({ input }) => comments[findPost(input.postId).id] ?? []),
  }),
});

export type AppRouter = typeof appRouter;
