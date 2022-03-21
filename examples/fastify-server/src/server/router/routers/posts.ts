import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createRouter } from '../createRouter';

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

export const postsRouter = createRouter()
  .mutation('create', {
    input: z.object({
      title: z.string(),
    }),
    resolve: ({ input, ctx }) => {
      if (ctx.user.name !== 'nyan') {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      const id = db.posts.length + 1;
      const post = { id, ...input };
      db.posts.push(post);
      return post;
    },
  })
  .query('list', {
    resolve: () => db.posts,
  })
  .query('reset', {
    resolve: () => {
      db.posts = [];
    },
  });
