/** The example backend, with one `createErrors()` registry. */
import { Effect } from 'effect';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import { createErrors } from './create-errors.ts';

// errors.ts: every error the backend can fail with, declared once.
export const errors = createErrors({
  Unauthorized: { status: 401, description: 'Sign in first.' },
  PostNotFound: {
    status: 404,
    data: z.object({ id: z.string() }),
    description: 'No post with this id.',
  },
  TitleTaken: {
    status: 409,
    data: z.object({ title: z.string() }),
    message: 'That title is taken',
  },
  RateLimited: {
    status: 429,
    data: z.object({ retryAfter: z.number() }),
    retry: true,
  },
});

const t = initTrpc<{ ctx: { user: string | null } }>({
  warnThrownErrors: false,
});
const posts = new Map([['1', { id: '1', title: 'Hello' }]]);
const byId = z.object({ id: z.string() });

// Middleware returns from the registry like a resolver does.
const authed = t.procedure.use((opts) => {
  if (!opts.ctx.user) return errors.Unauthorized();
  return opts.next({ ctx: { user: opts.ctx.user } });
});

export const appRouter = t.router({
  post: {
    byId: t.procedure
      .input(byId)
      .query(
        (opts) =>
          posts.get(opts.input.id) ??
          errors.PostNotFound({ id: opts.input.id }),
      ),
    byIdEffect: t.procedure.input(byId).query((opts) =>
      Effect.gen(function* () {
        const post = posts.get(opts.input.id);
        if (!post) return yield* errors.PostNotFound({ id: opts.input.id });
        return post;
      }),
    ),
    // A throw has no type: the client gets `Internal`, as for a crash.
    crash: t.procedure.input(byId).query((opts) => {
      throw errors.PostNotFound({ id: opts.input.id });
    }),
    create: authed.input(z.object({ title: z.string() })).mutation((opts) => {
      if ([...posts.values()].some((p) => p.title === opts.input.title)) {
        return errors.TitleTaken({ title: opts.input.title });
      }
      const post = { id: String(posts.size + 1), title: opts.input.title };
      posts.set(post.id, post);
      return post;
    }),
    // Declared: the procedure's contract (for OpenAPI) is the registry.
    declared: t.procedure
      .errors(errors)
      .input(byId)
      .query(
        (opts) =>
          posts.get(opts.input.id) ??
          errors.PostNotFound({ id: opts.input.id }),
      ),
  },
});

export type AppRouter = typeof appRouter;
