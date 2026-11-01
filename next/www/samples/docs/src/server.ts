/**
 * The app most pages' code blocks build on: a blog's router, its handler
 * and its context. Blocks import it as `./server.ts` behind a cut.
 */
import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

import { db, type User } from './db.ts';

export { db, type Post, type User } from './db.ts';

export interface Context {
  user: User | null;
}

export const t = initTrpc<{ ctx: Context }>();

export const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);

export const PostSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string().nullable(),
  createdAt: z.date(),
});

export const appRouter = t.router({
  post: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          error({ code: 'NOT_FOUND', data: { id: opts.input.id } }),
      ),
    list: t.procedure.query(() => db.post.list()),
    create: authed
      .input(z.object({ title: z.string().min(1) }))
      .mutation((opts) =>
        db.post.create({ ...opts.input, author: opts.ctx.user.name }),
      ),
  },
});

export type AppRouter = typeof appRouter;

export const handler = createFetchHandler({
  router: appRouter,
  createContext: () => ({ user: null }),
});
