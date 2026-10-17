/**
 * Effect example: services from layers, Effect Schema inputs, a public
 * tagged error, a `Stream` subscription, and the Effect client, where typed
 * errors are in the error channel. Run with `node index.ts`.
 */
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Context, Effect, Layer, Schema, Stream } from 'effect';
import { HttpServer } from 'effect/http';
import { httpLink, routerType } from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
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

const appRouter = {
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
};
export type AppRouter = typeof appRouter;

const handler = createFetchHandler({
  router: appRouter,
  layer: Posts.memory,
  createContext: (opts) => ({
    user: opts.request.headers['authorization'] ?? null,
  }),
});

const ServerLive = serve(handler).pipe(
  Layer.provideMerge(
    NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
  ),
);

// --- client --------------------------------------------------------------------------

const program = Effect.gen(function* () {
  const url = yield* HttpServer.addressFormattedWith(Effect.succeed);
  const client = createEffectClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({ url: `${url}/trpc`, headers: { authorization: 'ada' } }),
    ],
  });

  const post = yield* client.post.byId.query({ id: '1' });
  yield* Effect.log('post.byId', post);

  const created = yield* client.post.create.mutate({ title: 'Layers' });
  yield* Effect.log('post.create', created);

  const missing = yield* client.post.byId.query({ id: '404' }).pipe(
    Effect.as('found'),
    // `defined` separates the typed error from an untyped one with the same code.
    Effect.catchTag('POST_NOT_FOUND', (err) =>
      err.defined
        ? Effect.succeed(`no post ${err.data.id} (${err.code})`)
        : Effect.fail(err),
    ),
  );
  yield* Effect.log('post.byId', missing);

  const titles = yield* client.post.all.subscribe().pipe(
    Stream.map((p) => p.title),
    Stream.runCollect,
  );
  yield* Effect.log('post.all', titles);
  if (titles.length !== 2) return yield* Effect.die('expected two posts');
});

await Effect.runPromise(
  program.pipe(
    Effect.provide(ServerLive),
    Effect.ensuring(Effect.promise(() => handler.dispose())),
  ),
);
