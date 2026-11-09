/**
 * Effect example: services from layers, Effect Schema inputs, a public
 * tagged error, a `Stream` subscription, and the Effect client, where typed
 * errors are in the error channel. `client.ts` is the Effect client;
 * `pnpm start` runs both.
 */
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Context, Effect, Layer, ManagedRuntime, Schema, Stream } from 'effect';
import { HttpServer } from 'effect/http';
import { serve } from '@trpc12/trpc/http';
import { createFetchHandler, initTrpc, TrpcError } from '@trpc12/trpc/server';

// --- services ------------------------------------------------------------------------

const Post = Schema.Struct({ id: Schema.String, title: Schema.String });
type Post = typeof Post.Type;

class PostNotFound extends TrpcError.Tagged('POST_NOT_FOUND', {
  status: 404,
  data: Schema.Struct({ id: Schema.String }),
}) {}

class Posts extends Context.Service<
  Posts,
  {
    readonly find: (id: string) => Effect.Effect<Post, PostNotFound>;
    readonly create: (title: string) => Effect.Effect<Post>;
    readonly all: Stream.Stream<Post>;
  }
>()('Posts') {
  static readonly memory: Layer.Layer<Posts> = Layer.sync(Posts, () => {
    const posts = new Map<string, Post>([
      ['1', { id: '1', title: 'Hello Effect' }],
    ]);
    return {
      find: (id) =>
        Effect.suspend(() => {
          const post = posts.get(id);
          return post
            ? Effect.succeed(post)
            : Effect.fail(new PostNotFound({ id }));
        }),
      create: (title) =>
        Effect.sync(() => {
          const post: Post = { id: String(posts.size + 1), title };
          posts.set(post.id, post);
          return post;
        }),
      all: Stream.suspend(() => Stream.fromIterable([...posts.values()])),
    };
  });
}

class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly name: string }
>()('CurrentUser') {}

// --- router --------------------------------------------------------------------------

const t = initTrpc<{ ctx: { user: string | null } }>();

const authed = t.procedure.provide(CurrentUser, (opts) =>
  opts.ctx.user
    ? Effect.succeed({ name: opts.ctx.user })
    : Effect.fail(new TrpcError({ code: 'UNAUTHORIZED' })),
);

const appRouter = t.router({
  post: {
    byId: t.procedure
      .input(Schema.Struct({ id: Schema.String }))
      .query((opts) =>
        Effect.gen(function* () {
          const posts = yield* Posts;
          return yield* posts.find(opts.input.id);
        }),
      ),
    create: authed
      .input(Schema.Struct({ title: Schema.NonEmptyString }))
      .mutation((opts) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const posts = yield* Posts;
          return yield* posts.create(`${opts.input.title} (by ${user.name})`);
        }),
      ),
    all: t.procedure.subscription(() =>
      Stream.unwrap(
        Effect.gen(function* () {
          return (yield* Posts).all;
        }),
      ),
    ),
  },
});
export type AppRouter = typeof appRouter;

export async function listen(port = 0) {
  const handler = createFetchHandler({
    router: appRouter,
    layer: Posts.memory,
    createContext: (opts) => ({
      user: opts.request.headers['authorization'] ?? null,
    }),
  });
  const runtime = ManagedRuntime.make(
    serve(handler).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port, host: '127.0.0.1' }),
      ),
    ),
  );
  const origin = await runtime.runPromise(
    HttpServer.addressFormattedWith(Effect.succeed),
  );
  return {
    url: `${origin}/trpc`,
    [Symbol.asyncDispose]: async () => {
      await runtime.dispose();
      await handler.dispose();
    },
  };
}

if (import.meta.main) {
  const server = await listen(Number(process.env['PORT'] ?? 3000));
  console.log(server.url);
}
