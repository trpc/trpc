/** The example backend, with a registry per module, merged. */
import { Effect } from 'effect';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import { authErrors, billingErrors, postErrors } from './errors.ts';

export { authErrors, billingErrors, errors, postErrors } from './errors.ts';

export const t = initTrpc<{ ctx: { user: string | null } }>({
  warnThrownErrors: false,
});
const posts = new Map([['1', { id: '1', title: 'Hello' }]]);
const byId = z.object({ id: z.string() });

export const authed = t.procedure.use((opts) => {
  if (!opts.ctx.user) return authErrors.Unauthorized();
  return opts.next({ ctx: { user: opts.ctx.user } });
});

// posts/procedure.ts: every post procedure returns post errors only.
export const postProcedure = t.procedure.errors(postErrors);

// posts/router.ts
const postRouter = {
  byId: postProcedure
    .input(byId)
    .query(
      (opts) =>
        posts.get(opts.input.id) ??
        postErrors.PostNotFound({ id: opts.input.id }),
    ),
  byIdEffect: postProcedure.input(byId).query((opts) =>
    Effect.gen(function* () {
      const post = posts.get(opts.input.id);
      if (!post) return yield* postErrors.PostNotFound({ id: opts.input.id });
      return post;
    }),
  ),
  // Undeclared and thrown: `Internal`.
  crash: t.procedure.input(byId).query((opts) => {
    throw postErrors.PostNotFound({ id: opts.input.id });
  }),
  // Declared and thrown: v12 types a thrown error whose code is declared.
  thrown: postProcedure.input(byId).query((opts) => {
    throw postErrors.PostNotFound({ id: opts.input.id });
  }),
  create: authed
    .errors(postErrors)
    .input(z.object({ title: z.string() }))
    .mutation((opts) => {
      if ([...posts.values()].some((p) => p.title === opts.input.title)) {
        return postErrors.TitleTaken({ title: opts.input.title });
      }
      const post = { id: String(posts.size + 1), title: opts.input.title };
      posts.set(post.id, post);
      return post;
    }),
};

// billing/router.ts
const billingRouter = {
  charge: authed
    .errors(billingErrors)
    .input(z.object({ cents: z.number() }))
    .mutation((opts) =>
      opts.input.cents > 100
        ? billingErrors.CardDeclined({ reason: 'limit' })
        : { ok: true },
    ),
};

export const appRouter = t.router({ post: postRouter, billing: billingRouter });

export type AppRouter = typeof appRouter;
