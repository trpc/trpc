import { authed, t } from '@acme/trpc';
import { error } from '@trpc12/trpc/server';
import { z } from 'zod';

export interface Post {
  id: string;
  title: string;
  authorId: string;
}

const posts = new Map<string, Post>([
  ['1', { id: '1', title: 'Hello v12', authorId: 'ada' }],
]);

export const postsRouter = t.router({
  byId: t.procedure
    .input(z.object({ id: z.string() }))
    .query(
      (opts) =>
        posts.get(opts.input.id) ??
        error({ code: 'NOT_FOUND', data: { id: opts.input.id } }),
    ),
  list: t.procedure
    .input(z.object({ authorId: z.string().optional() }))
    .query((opts) =>
      [...posts.values()].filter(
        (post) =>
          opts.input.authorId === undefined ||
          post.authorId === opts.input.authorId,
      ),
    ),
  create: authed
    .input(z.object({ title: z.string().min(1) }))
    .mutation((opts) => {
      const post: Post = {
        id: String(posts.size + 1),
        title: opts.input.title,
        authorId: opts.ctx.user,
      };
      posts.set(post.id, post);
      return post;
    }),
});

export type PostsRouter = typeof postsRouter;
