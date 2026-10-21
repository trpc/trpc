/** The example backend, with `Schema.TaggedError` classes as the registry. */
import { Effect, Schema } from 'effect';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import { taggedErrors, withErrors } from './tagged-classes.ts';

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
const procedure = t.procedure.use(errors.bridge);
const posts = new Map([['1', { id: '1', title: 'Hello' }]]);

const authed = procedure.use((opts) => {
  if (!opts.ctx.user) throw new Unauthorized();
  return opts.next({ ctx: { user: opts.ctx.user } });
});

export const appRouter = withErrors(errors, {
  post: {
    byId: procedure.input(z.object({ id: z.string() })).query((opts) => {
      const post = posts.get(opts.input.id);
      if (!post) throw new PostNotFound({ id: opts.input.id });
      return post;
    }),
    byIdEffect: procedure.input(z.object({ id: z.string() })).query((opts) =>
      errors.expose(
        Effect.gen(function* () {
          const post = posts.get(opts.input.id);
          if (!post) return yield* new PostNotFound({ id: opts.input.id });
          return post;
        }),
      ),
    ),
    create: authed.input(z.object({ title: z.string() })).mutation((opts) => {
      if ([...posts.values()].some((p) => p.title === opts.input.title)) {
        throw new TitleTaken({ title: opts.input.title });
      }
      const post = { id: String(posts.size + 1), title: opts.input.title };
      posts.set(post.id, post);
      return post;
    }),
  },
});

export type AppRouter = typeof appRouter;
