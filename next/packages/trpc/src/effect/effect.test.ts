import {
  Context,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  Stream,
  Tracer,
} from 'effect';
import {
  createTrpcClient,
  hasCode,
  httpLink,
  localLink,
  routerType,
  wsLink,
  type ClientError,
  type LinkErrorCode,
  type LocalLinkOptions,
} from '@trpc12/trpc/client';
import type { ProgressiveJsonForm } from '@trpc12/trpc/transformer';
import { createEffectClient } from '@trpc12/trpc/effect';
import {
  createFetchHandler,
  createRouterClient,
  error,
  type inferInputIssue,
  type inferRouterServices,
  initTrpc,
  type InputValidationErrorData,
  type RouterClientOptions,
  type TrpcError,
} from '@trpc12/trpc/server';
import { createTestServer } from '../fixtures/server.ts';
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

const withUser = t.procedure.provide(CurrentUser, (opts) =>
  opts.ctx.user
    ? Effect.succeed({ name: opts.ctx.user })
    : Effect.fail(error({ code: 'UNAUTHORIZED', message: 'Sign in first' })),
);

const aborted = { count: 0 };

const router = t.router({
  post: {
    byId: t.procedure.input(z.object({ id: z.string() })).query((opts) =>
      Effect.gen(function* () {
        const repo = yield* PostRepo;
        const post = yield* repo.find(opts.input.id);
        if (!post) {
          return yield* error({
            code: 'NOT_FOUND',
            data: { id: opts.input.id },
          });
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
});
type AppRouter = typeof router;

async function setup(user: string | null = 'ada') {
  const server = await createTestServer({
    router,
    createContext: () => ({ user }),
    layer: PostRepoLive,
    exposeUnexpectedErrors: false,
  });
  const client = createEffectClient({
    router: routerType<AppRouter>(),
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

test('localLink and createRouterClient need a runtime, and a layer names the fix', async () => {
  // @ts-expect-error -- the router needs PostRepo, so `runtime` is required
  localLink({ router, createContext: () => ({ user: null }) });
  // @ts-expect-error -- the router needs PostRepo, so `runtime` is required
  createRouterClient(router, { ctx: { user: null } });
  localLink({
    router,
    createContext: () => ({ user: null }),
    // @ts-expect-error -- `layer` is gone: pass `runtime: ManagedRuntime.make(layer)`
    layer: PostRepoLive,
  });
  // @ts-expect-error -- `layer` is gone: pass `runtime: ManagedRuntime.make(layer)`
  createRouterClient(router, { ctx: { user: null }, layer: PostRepoLive });
  type Fix =
    'pass `runtime: ManagedRuntime.make(layer)` instead of `layer`, and dispose the runtime when done';
  expectTypeOf<
    NonNullable<RouterClientOptions<AppRouter>['layer']>['~typeError']
  >().toEqualTypeOf<Fix>();
  expectTypeOf<
    NonNullable<LocalLinkOptions<AppRouter>['layer']>['~typeError']
  >().toEqualTypeOf<Fix>();

  await using runtime = ManagedRuntime.make(PostRepoLive);
  const client = createEffectClient({
    router: routerType<AppRouter>(),
    links: [
      localLink({ router, createContext: () => ({ user: null }), runtime }),
    ],
  });
  expect(await Effect.runPromise(client.post.byId.query({ id: '2' }))).toEqual(
    seed[1],
  );
});

test('in-process clients share the caller runtime, and disposing it runs the layer finalizers', async () => {
  const before = { ...lifecycle };
  const runtime = ManagedRuntime.make(PostRepoLive);
  const caller = createRouterClient(router, { ctx: { user: null }, runtime });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      localLink({ router, createContext: () => ({ user: null }), runtime }),
    ],
  });
  expect(await caller.post.byId.query({ id: '1' })).toEqual(seed[0]);
  expect(await caller.post.byId.query({ id: '2' })).toEqual(seed[1]);
  expect(await client.post.byId.query({ id: '1' })).toEqual(seed[0]);
  expect(lifecycle).toEqual({ ...before, acquired: before.acquired + 1 });

  await runtime.dispose();
  expect(lifecycle).toEqual({
    acquired: before.acquired + 1,
    released: before.released + 1,
  });
  await expect(caller.post.byId.query({ id: '1' })).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    cause: 'ManagedRuntime disposed',
  });
  expect(lifecycle.acquired).toBe(before.acquired + 1);
});

test('a layer that fails to build is an unexpected INTERNAL_SERVER_ERROR caused by its error', async () => {
  const boom = new Error('pool unavailable');
  await using runtime = ManagedRuntime.make(
    Layer.effect(PostRepo, Effect.fail(boom)),
  );
  const caller = createRouterClient(router, { ctx: { user: null }, runtime });
  await expect(caller.post.byId.query({ id: '1' })).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'pool unavailable',
    cause: boom,
  });
});

test('typed errors land in the Effect error channel', async () => {
  await using ctx = await setup();
  const program = ctx.client.post.byId
    .query({ id: 'nope' })
    .pipe(
      Effect.catchTag('NotFound', (err) =>
        Effect.succeed(err.defined ? `missing ${err.data.id}` : err.message),
      ),
    );
  expect(await Effect.runPromise(program)).toBe('missing nope');
  expectTypeOf<
    Extract<Effect.Error<typeof program>, { code: 'NOT_FOUND' }>['_tag']
  >().toEqualTypeOf<'ProcedureNotFound'>();
  const anyNotFound = ctx.client.post.byId
    .query({ id: 'nope' })
    .pipe(
      Effect.catchIf(hasCode('NOT_FOUND'), (err) => Effect.succeed(err._tag)),
    );
  expect(await Effect.runPromise(anyNotFound)).toBe('NotFound');
  expectTypeOf<
    Extract<Effect.Error<typeof anyNotFound>, { code: 'NOT_FOUND' }>
  >().toBeNever();

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
            InputValidationErrorData<
              inferInputIssue<z.ZodObject<{ id: z.ZodString }>>
            >,
            'InvalidInput'
          >,
        ProgressiveJsonForm,
        Exclude<LinkErrorCode, 'STREAM_INTERRUPTED'>
      >
    >
  >();
  expect(Exit.isFailure(exit)).toBe(true);
});

test("a call fails with the Promise client's errors, data in the wire form", () => {
  const t = initTrpc();
  const router = {
    byId: t.procedure.query(() =>
      error({ code: 'NOT_FOUND', data: { at: new Date(0) } }),
    ),
  };
  const links = [httpLink({ url: 'http://localhost' })] as const;
  const promise = createTrpcClient({
    router: routerType<typeof router>(),
    links,
  }).byId;
  const effect = createEffectClient({
    router: routerType<typeof router>(),
    links,
  }).byId;
  type PromiseError = NonNullable<ReturnType<typeof promise.query>['~error']>;
  expectTypeOf<
    Effect.Error<ReturnType<typeof effect.query>>
  >().toEqualTypeOf<PromiseError>();
  expectTypeOf<
    Extract<PromiseError, { defined: true }>['data']
  >().toEqualTypeOf<{ at: string }>();
});

test('one Effect run twice at once makes two calls', async () => {
  await using ctx = await setup();
  await using ws = wsLink({ url: ctx.server.wsUrl });
  const client = createEffectClient({
    router: routerType<AppRouter>(),
    links: [ws],
  });
  const post = client.post.byId.query({ id: '1' });
  const posts = await Effect.runPromise(
    Effect.all([post, post], { concurrency: 'unbounded' }),
  );
  expect(posts).toEqual([seed[0], seed[0]]);
});

test('.provide() supplies a service from ctx, and its failure is typed', async () => {
  await using ctx = await setup();
  expect(await Effect.runPromise(ctx.client.whoami.query())).toBe(
    'you are ada',
  );

  await using anon = await setup(null);
  const err = await Effect.runPromise(Effect.flip(anon.client.whoami.query()));
  expect(err).toMatchObject({
    code: 'UNAUTHORIZED',
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

test('calling a path instead of .query(), .mutate() or .subscribe() throws', async () => {
  await using ctx = await setup();
  const untyped = ctx.client as unknown as Record<string, any> &
    (() => unknown);
  expect(() => untyped['post'].byId()).toThrow(
    'Call .query(), .mutate() or .subscribe() on a procedure, not post.byId()',
  );
  expect(() => untyped()).toThrow(TypeError);
});

test('Effect code in a query or mutation gets a Scope that closes with it', async () => {
  const t = initTrpc();
  const log: string[] = [];
  const resource = (name: string) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        log.push(`open ${name}`);
        return name;
      }),
      () => Effect.sync(() => log.push(`close ${name}`)),
    );
  class Tx extends Context.Service<Tx, string>()('Tx') {}
  const router = t.router({
    read: t.procedure.query(() =>
      Effect.gen(function* () {
        const name = yield* resource('file');
        log.push(`read ${name}`);
        return name;
      }),
    ),
    write: t.procedure
      .provide(Tx, () => resource('tx'))
      .mutation(() =>
        Effect.gen(function* () {
          log.push(`write in ${yield* Tx}`);
          return 'ok';
        }),
      ),
  });
  expectTypeOf<inferRouterServices<typeof router>>().toBeNever();
  const handler = createFetchHandler({ router });
  const res = await handler.fetch(new Request('http://localhost/trpc/read'));
  expect(await res.json()).toEqual({ json: 'file' });
  expect(log.splice(0)).toEqual(['open file', 'read file', 'close file']);

  const client = createRouterClient(router);
  expect(await client.write.mutate()).toBe('ok');
  expect(log.splice(0)).toEqual(['open tx', 'write in tx', 'close tx']);
  await handler.dispose();
});

test('a layer that provides no services, like a tracer, is accepted', async () => {
  const t = initTrpc();
  const router = t.router({ ping: t.procedure.query(() => 'pong') });
  const tracing = Layer.succeed(
    Tracer.Tracer,
    Tracer.make({ span: (o) => new Tracer.NativeSpan(o) }),
  );
  const handler = createFetchHandler({ router, layer: tracing });
  await using runtime = ManagedRuntime.make(tracing);
  const client = createRouterClient(router, { ctx: {}, runtime });
  expect(await client.ping.query()).toBe('pong');
  await handler.dispose();
});

test('every call runs in a span named after its path', async () => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  await using runtime = ManagedRuntime.make(
    Layer.succeed(Tracer.Tracer, tracer),
  );
  const t = initTrpc();
  const client = createRouterClient(
    t.router({
      post: {
        byId: t.procedure
          .input(z.object({ id: z.string() }))
          .errors({ NOT_FOUND: {} })
          .query((opts) =>
            opts.input.id === '1'
              ? Effect.succeed('Hello').pipe(Effect.withSpan('db.find'))
              : opts.errors.NOT_FOUND(),
          ),
      },
    }),
    { ctx: {}, runtime },
  );
  expect(await client.post.byId.query({ id: '1' })).toBe('Hello');
  await expect(client.post.byId.query({ id: '2' })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });

  const calls = spans.filter((s) => s.name === 'trpc.post.byId');
  expect(calls).toHaveLength(2);
  expect(Object.fromEntries(calls[0]!.attributes)).toEqual({
    'rpc.system': 'trpc',
    'rpc.method': 'post.byId',
    'trpc.type': 'query',
  });
  expect(calls[0]!.kind).toBe('server');
  expect(calls[1]!.attributes.get('trpc.error.code')).toBe('NOT_FOUND');
  const db = spans.find((s) => s.name === 'db.find')!;
  expect(Option.getOrUndefined(db.parent)).toBe(calls[0]);
});

test('work forked with Effect.forkDetach outlives the response (www/docs/server/effect.md)', async () => {
  const t0 = initTrpc();
  let sent = false;
  const handler = createFetchHandler({
    router: t0.router({
      signup: t0.procedure.mutation(() =>
        Effect.gen(function* () {
          yield* Effect.forkDetach(
            Effect.sleep('20 millis').pipe(
              Effect.andThen(
                Effect.sync(() => {
                  sent = true;
                }),
              ),
            ),
          );
          return 'ok';
        }),
      ),
    }),
  });
  const res = await handler.fetch(
    new Request('http://localhost/trpc/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }),
  );
  expect(await res.json()).toEqual({ json: 'ok' });
  expect(sent).toBe(false);
  await vi.waitFor(() => expect(sent).toBe(true));
  await handler.dispose();
});
