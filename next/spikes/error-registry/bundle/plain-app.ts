/** The same `post.byId` as `merge-errors/app.ts`, with no registry: v12's own classes. */
import { initTrpc, TrpcError } from '@trpc12/trpc/server';
import { z } from 'zod';

class PostNotFound extends TrpcError.Tagged('PostNotFound', {
  status: 404,
  data: z.object({ id: z.string() }),
}) {}
class TitleTaken extends TrpcError.Tagged('TitleTaken', {
  status: 409,
  data: z.object({ title: z.string() }),
}) {}

const t = initTrpc<{ ctx: { user: string | null } }>();
const posts = new Map([['1', { id: '1', title: 'Hello' }]]);

export const appRouter = {
  post: {
    byId: t.procedure
      .errors({ PostNotFound, TitleTaken })
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          posts.get(opts.input.id) ?? new PostNotFound({ id: opts.input.id }),
      ),
  },
};

export type AppRouter = typeof appRouter;
