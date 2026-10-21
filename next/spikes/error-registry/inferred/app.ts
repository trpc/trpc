/** The example backend, where errors are returned, not listed. */
import { Effect } from 'effect';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import { defineError } from './inferred.ts';

// errors.ts: classes, each declared once, with no registry around them.
export class Unauthorized extends defineError('Unauthorized', {
  status: 401,
  description: 'Sign in first.',
}) {}
export class PostNotFound extends defineError('PostNotFound', {
  status: 404,
  data: z.object({ id: z.string() }),
  description: 'No post with this id.',
}) {}
export class TitleTaken extends defineError('TitleTaken', {
  status: 409,
  data: z.object({ title: z.string() }),
  message: 'That title is taken',
}) {}
export class RateLimited extends defineError('RateLimited', {
  status: 429,
  data: z.object({ retryAfter: z.number() }),
  retry: true,
}) {}

const t = initTrpc<{ ctx: { user: string | null } }>({
  warnThrownErrors: false,
});
const posts = new Map([['1', { id: '1', title: 'Hello' }]]);

// Returned, so the procedures behind it fail with it.
const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : new Unauthorized(),
);

export const appRouter = {
  post: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          posts.get(opts.input.id) ?? new PostNotFound({ id: opts.input.id }),
      ),
    byIdEffect: t.procedure.input(z.object({ id: z.string() })).query((opts) =>
      Effect.gen(function* () {
        const post = posts.get(opts.input.id);
        if (!post) return yield* new PostNotFound({ id: opts.input.id });
        return post;
      }),
    ),
    create: authed.input(z.object({ title: z.string() })).mutation((opts) => {
      if ([...posts.values()].some((p) => p.title === opts.input.title)) {
        return new TitleTaken({ title: opts.input.title });
      }
      const post = { id: String(posts.size + 1), title: opts.input.title };
      posts.set(post.id, post);
      return post;
    }),
    // Thrown, so it reaches the client but no type lists it.
    hot: t.procedure.query(() => {
      throw new RateLimited({ retryAfter: 1 });
    }),
  },
};

export type AppRouter = typeof appRouter;
