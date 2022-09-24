import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { t } from '../trpc';

interface Post {
  id: number;
  title: string;
}

interface Db {
  posts: Post[];
}

const db: Db = {
  posts: [],
};

export const postsRouter = t.router({
  create: t.procedure
    .input(z.object({ title: z.string() }))
    .mutation(({ input, ctx }) => {
      if (ctx.user.name !== 'nyan') {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      const id = db.posts.length + 1;
      const post = { id, ...input };
      db.posts.push(post);
      return post;
    }),
  list: t.procedure.query(() => db.posts),
  reset: t.procedure.mutation(() => {
    db.posts = [];
  }),
});
