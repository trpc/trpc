/** The example backend, written with option E: modules register their errors. */
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

const authed = t.procedure.use((opts) => {
  if (!opts.ctx.user) throw new authErrors.Unauthorized();
  return opts.next({ ctx: { user: opts.ctx.user } });
});

// The router carries nothing: the errors are the program's.
export const appRouter = {
  post: {
    byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
      const post = posts.get(opts.input.id);
      if (!post) throw new postErrors.PostNotFound({ id: opts.input.id });
      return post;
    }),
    byIdEffect: t.procedure.input(z.object({ id: z.string() })).query((opts) =>
      Effect.gen(function* () {
        const post = posts.get(opts.input.id);
        if (!post) return yield* new postErrors.PostNotFound({ id: opts.input.id });
        return post;
      }),
    ),
    create: authed.input(z.object({ title: z.string() })).mutation((opts) => {
      if ([...posts.values()].some((p) => p.title === opts.input.title)) {
        throw new postErrors.TitleTaken({ title: opts.input.title });
      }
      const post = { id: String(posts.size + 1), title: opts.input.title };
      posts.set(post.id, post);
      return post;
    }),
  },
};

export type AppRouter = typeof appRouter;
