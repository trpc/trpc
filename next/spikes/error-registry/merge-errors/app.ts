/** The example backend, with a registry per module, merged. */
import { Effect } from 'effect';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import {
  createErrors,
  mergeErrors,
  scope,
  withErrors,
} from './merge-errors.ts';

// auth/errors.ts
export const authErrors = createErrors({
  Unauthorized: { status: 401, description: 'Sign in first.' },
  RateLimited: {
    status: 429,
    data: z.object({ retryAfter: z.number() }),
    retry: true,
  },
});

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

// billing/errors.ts
export const billingErrors = createErrors({
  CardDeclined: { status: 402, data: z.object({ reason: z.string() }) },
});

// errors.ts: the whole backend's, for OpenAPI and the client's decoding.
export const errors = mergeErrors(authErrors, postErrors, billingErrors);

const t = initTrpc<{ ctx: { user: string | null } }>({
  warnThrownErrors: false,
});
const posts = new Map([['1', { id: '1', title: 'Hello' }]]);

const authed = t.procedure.use((opts) => {
  if (!opts.ctx.user) throw new authErrors.Unauthorized();
  return opts.next({ ctx: { user: opts.ctx.user } });
});

// posts/router.ts
const postRouter = scope(postErrors, {
  byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
    const post = posts.get(opts.input.id);
    if (!post) throw new postErrors.PostNotFound({ id: opts.input.id });
    return post;
  }),
  byIdEffect: t.procedure.input(z.object({ id: z.string() })).query((opts) =>
    Effect.gen(function* () {
      const post = posts.get(opts.input.id);
      if (!post)
        return yield* new postErrors.PostNotFound({ id: opts.input.id });
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
});

// billing/router.ts
const billingRouter = scope(billingErrors, {
  charge: authed.input(z.object({ cents: z.number() })).mutation((opts) => {
    if (opts.input.cents > 100) {
      throw new billingErrors.CardDeclined({ reason: 'limit' });
    }
    return { ok: true };
  }),
});

// Every call can fail with auth's errors; each subtree adds its module's.
export const appRouter = withErrors(authErrors, {
  post: postRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
