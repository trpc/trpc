import { Context, Effect, Exit, Layer, Stream } from 'effect';
import { httpLink, type ClientError } from 'trpcdev/client';
import { createEffectClient } from 'trpcdev/effect';
import { error, initTrpc, type TrpcError } from 'trpcdev/server';
import { createTestServer } from './fixtures/server.ts';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import { z } from 'zod';

interface Post {
  id: string;
  title: string;
}

class PostRepo extends Context.Service<
  PostRepo,
  {
    find: (id: string) => Effect.Effect<Post | undefined>;
    all: Stream.Stream<Post>;
  }
>()('PostRepo') {}

class CurrentUser extends Context.Service<CurrentUser, { name: string }>()(
  'CurrentUser',
) {}

const lifecycle = { acquired: 0, released: 0 };
const seed: Post[] = [
  { id: '1', title: 'Hello' },
  { id: '2', title: 'World' },
];

const PostRepoLive = Layer.effect(
  PostRepo,
  Effect.acquireRelease(
    Effect.sync(() => {
      lifecycle.acquired++;
      return {
        find: (id: string) => Effect.succeed(seed.find((p) => p.id === id)),
        all: Stream.fromIterable(seed),
      };
    }),
    () => Effect.sync(() => lifecycle.released++),
  ),
);

interface Ctx {
  user: string | null;
}
const t = initTrpc<{ ctx: Ctx }>();

const withUser = t.procedure.provide(CurrentUser, ({ ctx }) =>
  ctx.user
    ? Effect.succeed({ name: ctx.user })
    : Effect.fail(error({ code: 'UNAUTHORIZED', message: 'Sign in first' })),
);

const aborted = { count: 0 };

const router = {
  post: {
    byId: t.procedure.input(z.object({ id: z.string() })).query(({ input }) =>
      Effect.gen(function* () {
        const repo = yield* PostRepo;
        const post = yield* repo.find(input.id);
        if (!post) {
          return yield* error({ code: 'NOT_FOUND', data: { id: input.id } });
        }
        return post;
      }),
    ),
    live: t.procedure.subscription(() =>
      Stream.unwrap(
        Effect.gen(function* () {
          return (yield* PostRepo).all;
        }),
      ),
    ),
  },
  whoami: withUser.query(() =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return `you are ${user.name}`;
    }),
  ),
  slow: t.procedure.query(() =>
    Effect.sleep('5 seconds').pipe(
      Effect.as('done'),
      Effect.onInterrupt(() => Effect.sync(() => aborted.count++)),
    ),
  ),
  crash: t.procedure.query(() => Effect.die(new Error('db exploded'))),
};
type AppRouter = typeof router;

async function setup(user: string | null = 'alex') {
  const server = await createTestServer({
    router,
    createContext: () => ({ user }),
    layer: PostRepoLive,
    exposeUnexpectedErrors: false,
  });
  const client = createEffectClient<AppRouter>({
    links: [httpLink({ url: server.url })],
  });
  return { server, client, [Symbol.asyncDispose]: () => server.close() };
}

test('Effect resolvers get services from the handler layer', async () => {
  await using ctx = await setup();
  const post = await Effect.runPromise(ctx.client.post.byId.query({ id: '1' }));
  expect(post).toEqual({ id: '1', title: 'Hello' });
  expectTypeOf(post).toEqualTypeOf<Post>();
});

test('the layer is built once per handler and released on dispose', async () => {
  const before = { ...lifecycle };
  {
    await using ctx = await setup();
    await Effect.runPromise(ctx.client.post.byId.query({ id: '1' }));
    await Effect.runPromise(ctx.client.post.byId.query({ id: '2' }));
    expect(lifecycle.acquired).toBe(before.acquired + 1);
    expect(lifecycle.released).toBe(before.released);
  }
  expect(lifecycle.released).toBe(before.released + 1);
});

test('a missing layer is a type error', () => {
  const create = () =>
    // @ts-expect-error -- the router needs PostRepo, so `layer` is required
    createTestServer({ router, createContext: () => ({ user: null }) });
  expectTypeOf(create).toBeFunction();
});

test('typed errors land in the Effect error channel', async () => {
  await using ctx = await setup();
  const program = ctx.client.post.byId.query({ id: 'nope' }).pipe(
    Effect.catchIf(
      (err) => err.defined && err.code === 'NOT_FOUND',
      (err) => Effect.succeed(`missing ${err.data.id}`),
    ),
  );
  expect(await Effect.runPromise(program)).toBe('missing nope');

  const exit = await Effect.runPromiseExit(
    ctx.client.post.byId.query({ id: 'nope' }),
  );
  expectTypeOf(exit).toEqualTypeOf<
    Exit.Exit<
      Post,
      ClientError<
        | TrpcError<'NOT_FOUND', { id: string }>
        | TrpcError<
            'BAD_REQUEST',
            import('trpcdev/server').InputValidationErrorData
          >
      >
    >
  >();
  expect(Exit.isFailure(exit)).toBe(true);
});

test('.provide() supplies a service from ctx, and its failure is typed', async () => {
  await using ctx = await setup();
  expect(await Effect.runPromise(ctx.client.whoami.query())).toBe(
    'you are alex',
  );

  await using anon = await setup(null);
  const err = await Effect.runPromise(Effect.flip(anon.client.whoami.query()));
  expect(err).toMatchObject({
    code: 'UNAUTHORIZED',
    status: 401,
    defined: true,
  });
  if (err.defined) expectTypeOf(err.code).toEqualTypeOf<'UNAUTHORIZED'>();
});

test('subscriptions are Streams on both ends', async () => {
  await using ctx = await setup();
  const posts = await Effect.runPromise(
    Stream.runCollect(ctx.client.post.live.subscribe()),
  );
  expect(posts).toEqual(seed);
});

test('interrupting the client fiber aborts the server fiber', async () => {
  await using ctx = await setup();
  const before = aborted.count;
  const exit = await Effect.runPromiseExit(
    ctx.client.slow.query().pipe(Effect.timeout('50 millis')),
  );
  expect(Exit.isFailure(exit)).toBe(true);
  await vi.waitFor(() => expect(aborted.count).toBe(before + 1));
});

test('defects are masked unexpected errors', async () => {
  await using ctx = await setup();
  const err = await Effect.runPromise(Effect.flip(ctx.client.crash.query()));
  expect(err).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
    defined: false,
  });
});
