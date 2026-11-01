import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

interface Post {
  id: string;
  title: string;
}

const posts = new Map<string, Post>();

// #region procedure
const t = initTrpc<{ ctx: { userId: string | null } }>();

export const appRouter = t.router({
  post: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          posts.get(opts.input.id) ??
          error({ code: 'NOT_FOUND', data: { id: opts.input.id } }),
      ),
    create: t.procedure
      .input(z.object({ title: z.string().min(1) }))
      .mutation((opts) => {
        const post: Post = { id: crypto.randomUUID(), title: opts.input.title };
        posts.set(post.id, post);
        return post;
      }),
  },
});

export type AppRouter = typeof appRouter;
// #endregion procedure

// #region serve
export const handler = createFetchHandler({
  router: appRouter,
  createContext: (opts) => ({
    userId: opts.request.headers['x-user-id'] ?? null,
  }),
});

// Workers, Bun, Deno, Next.js route handlers: any fetch runtime.
export default { fetch: handler.fetch };
// #endregion serve
