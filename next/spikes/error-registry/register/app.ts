/** The example backend, where modules register their errors. */
import { Effect } from 'effect';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import { createErrors } from './register.ts';

// auth/errors.ts
export const authErrors = createErrors({
  Unauthorized: { status: 401, description: 'Sign in first.' },
  RateLimited: {
    status: 429,
    data: z.object({ retryAfter: z.number() }),
    retry: true,
  },
});
type AuthErrors = typeof authErrors;
declare module './register.ts' {
  interface Errors extends AuthErrors {}
}

// posts/errors.ts
export const postErrors = createErrors({
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
});
type PostErrors = typeof postErrors;
declare module './register.ts' {
  interface Errors extends PostErrors {}
}

const t = initTrpc<{ ctx: { user: string | null } }>({
  warnThrownErrors: false,
});
const posts = new Map([['1', { id: '1', title: 'Hello' }]]);
const byId = z.object({ id: z.string() });

const authed = t.procedure.use((opts) => {
  if (!opts.ctx.user) return authErrors.Unauthorized();
  return opts.next({ ctx: { user: opts.ctx.user } });
});

export const appRouter = t.router({
  post: {
    byId: t.procedure
      .input(byId)
      .query(
        (opts) =>
          posts.get(opts.input.id) ??
          postErrors.PostNotFound({ id: opts.input.id }),
      ),
    byIdEffect: t.procedure.input(byId).query((opts) =>
      Effect.gen(function* () {
        const post = posts.get(opts.input.id);
        if (!post) return yield* postErrors.PostNotFound({ id: opts.input.id });
        return post;
      }),
    ),
    crash: t.procedure.input(byId).query((opts) => {
      throw postErrors.PostNotFound({ id: opts.input.id });
    }),
    create: authed.input(z.object({ title: z.string() })).mutation((opts) => {
      if ([...posts.values()].some((p) => p.title === opts.input.title)) {
        return postErrors.TitleTaken({ title: opts.input.title });
      }
      const post = { id: String(posts.size + 1), title: opts.input.title };
      posts.set(post.id, post);
      return post;
    }),
  },
});

export type AppRouter = typeof appRouter;
