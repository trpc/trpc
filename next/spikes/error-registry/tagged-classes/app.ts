/** The example backend, with `Schema.TaggedError` classes as the registry. */
import { Effect, Schema } from 'effect';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import { taggedErrors } from './tagged-classes.ts';

// errors.ts: plain Effect classes, shareable with HttpApi and Effect RPC.
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  {},
  { httpApiStatus: 401, description: 'Sign in first.' },
) {}
export class PostNotFound extends Schema.TaggedError<PostNotFound>()(
  'PostNotFound',
  { id: Schema.String },
  { httpApiStatus: 404, description: 'No post with this id.' },
) {}
export class TitleTaken extends Schema.TaggedError<TitleTaken>()(
  'TitleTaken',
  { title: Schema.String },
  { httpApiStatus: 409 },
) {}
export class RateLimited extends Schema.TaggedError<RateLimited>()(
  'RateLimited',
  { retryAfter: Schema.Number },
  { httpApiStatus: 429, retry: true },
) {}

export const errors = taggedErrors(
  Unauthorized,
  PostNotFound,
  TitleTaken,
  RateLimited,
);

const t = initTrpc<{ ctx: { user: string | null } }>({
  warnThrownErrors: false,
});
const posts = new Map([['1', { id: '1', title: 'Hello' }]]);
const byId = z.object({ id: z.string() });

const authed = t.procedure.use((opts) => {
  if (!opts.ctx.user) return errors.send(new Unauthorized());
  return opts.next({ ctx: { user: opts.ctx.user } });
});

export const appRouter = t.router({
  post: {
    byId: t.procedure
      .input(byId)
      .query(
        (opts) =>
          posts.get(opts.input.id) ??
          errors.send(new PostNotFound({ id: opts.input.id })),
      ),
    byIdEffect: t.procedure.input(byId).query((opts) =>
      errors.expose(
        Effect.gen(function* () {
          const post = posts.get(opts.input.id);
          if (!post) return yield* new PostNotFound({ id: opts.input.id });
          return post;
        }),
      ),
    ),
    crash: t.procedure.input(byId).query((opts) => {
      throw errors.send(new PostNotFound({ id: opts.input.id }));
    }),
    create: authed.input(z.object({ title: z.string() })).mutation((opts) => {
      if ([...posts.values()].some((p) => p.title === opts.input.title)) {
        return errors.send(new TitleTaken({ title: opts.input.title }));
      }
      const post = { id: String(posts.size + 1), title: opts.input.title };
      posts.set(post.id, post);
      return post;
    }),
  },
});

export type AppRouter = typeof appRouter;
