/** The example backend, where errors are returned, not listed. */
import { Effect } from 'effect';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import { defineError } from './inferred.ts';

// errors.ts: each error declared once, with no registry around them.
export const Unauthorized = defineError('Unauthorized', {
  status: 401,
  description: 'Sign in first.',
});
export const PostNotFound = defineError('PostNotFound', {
  status: 404,
  data: z.object({ id: z.string() }),
  description: 'No post with this id.',
});
export const TitleTaken = defineError('TitleTaken', {
  status: 409,
  data: z.object({ title: z.string() }),
  message: 'That title is taken',
});

const t = initTrpc<{ ctx: { user: string | null } }>({
  warnThrownErrors: false,
});
const posts = new Map([['1', { id: '1', title: 'Hello' }]]);
const byId = z.object({ id: z.string() });

const authed = t.procedure.use((opts) =>
  opts.ctx.user ? opts.next({ ctx: { user: opts.ctx.user } }) : Unauthorized(),
);

export const appRouter = t.router({
  post: {
    byId: t.procedure
      .input(byId)
      .query(
        (opts) =>
          posts.get(opts.input.id) ?? PostNotFound({ id: opts.input.id }),
      ),
    byIdEffect: t.procedure.input(byId).query((opts) =>
      Effect.gen(function* () {
        const post = posts.get(opts.input.id);
        if (!post) return yield* PostNotFound({ id: opts.input.id });
        return post;
      }),
    ),
    crash: t.procedure.input(byId).query((opts) => {
      throw PostNotFound({ id: opts.input.id });
    }),
    create: authed.input(z.object({ title: z.string() })).mutation((opts) => {
      if ([...posts.values()].some((p) => p.title === opts.input.title)) {
        return TitleTaken({ title: opts.input.title });
      }
      const post = { id: String(posts.size + 1), title: opts.input.title };
      posts.set(post.id, post);
      return post;
    }),
    // Declared without a registry: `.errors()` lists the entries.
    declared: t.procedure
      .errors({ PostNotFound })
      .input(byId)
      .query(
        (opts) =>
          posts.get(opts.input.id) ?? PostNotFound({ id: opts.input.id }),
      ),
  },
});

export type AppRouter = typeof appRouter;
