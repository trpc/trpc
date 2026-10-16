import { error, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import { openapi } from '@trpc12/trpc/openapi';

export interface Post {
  id: string;
  title: string;
  /** When it was created. */
  createdAt: Date;
}

const posts = new Map<string, Post>([
  ['1', { id: '1', title: 'Hello REST', createdAt: new Date(0) }],
]);

const t = initTrpc<{ ctx: { user: string | null } }>().with(openapi());

export const appRouter = t.router(
  { meta: { route: { tags: ['posts'] } } },
  {
    post: {
      list: t.procedure
        .meta({
          route: { method: 'GET', path: '/posts', summary: 'List posts' },
        })
        .input(z.object({ limit: z.number().int().min(1).default(10) }))
        .query(({ input }) => [...posts.values()].slice(0, input.limit)),
      byId: t.procedure
        .meta({ route: { method: 'GET', path: '/posts/{id}' } })
        .input(z.object({ id: z.string() }))
        // Not declared with `.errors()`: the TypeScript generator documents it.
        .query(
          ({ input }) =>
            posts.get(input.id) ??
            error({ code: 'NOT_FOUND', data: { id: input.id } }),
        ),
      create: t.procedure
        .meta({ route: { method: 'POST', path: '/posts', successStatus: 201 } })
        .input(z.object({ title: z.string().min(1) }))
        .mutation(({ input, ctx }) => {
          if (!ctx.user) return error({ code: 'UNAUTHORIZED' });
          const post = {
            id: String(posts.size + 1),
            title: input.title,
            createdAt: new Date(),
          };
          posts.set(post.id, post);
          return post;
        }),
    },
  },
);
export type AppRouter = typeof appRouter;
