import { Context, Effect, Layer, ManagedRuntime, Schema } from 'effect';
import {
  createRouterClient,
  initTrpc,
  TrpcError,
  type inferProcedureErrors,
  type inferProcedureOutput,
  type inferRouterServices,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { provideLayer } from './layer.ts';
import { useService, type MiddlewareImpl } from './middleware-service.ts';
import { strict } from './strict.ts';

const log: string[] = [];

class Db extends Context.Service<Db, { readonly url: string }>()('Db') {}
const DbLive = Layer.effect(
  Db,
  Effect.acquireRelease(
    Effect.sync(() => {
      log.push('db open');
      return { url: 'postgres://' };
    }),
    () => Effect.sync(() => log.push('db close')),
  ),
);

class PostRepo extends Context.Service<
  PostRepo,
  { readonly find: (id: string) => Effect.Effect<{ id: string; db: string }> }
>()('PostRepo') {}
const PostRepoLive = Layer.effect(
  PostRepo,
  Effect.gen(function* () {
    const db = yield* Db;
    log.push('repo build');
    return { find: (id) => Effect.succeed({ id, db: db.url }) };
  }),
);

class Tx extends Context.Service<Tx, { readonly id: number }>()('Tx') {}
let txs = 0;
const TxLive = Layer.effect(
  Tx,
  Effect.acquireRelease(
    Effect.gen(function* () {
      yield* Db;
      const id = ++txs;
      log.push(`tx ${id} begin`);
      return { id };
    }),
    ({ id }) => Effect.sync(() => log.push(`tx ${id} end`)),
  ),
);

class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly id: string }
>()('CurrentUser') {}
class Sessions extends Context.Service<
  Sessions,
  { readonly user: (token: string) => string | undefined }
>()('Sessions') {}
class Auth extends Context.Service<
  Auth,
  MiddlewareImpl<
    CurrentUser,
    TrpcError<'UNAUTHORIZED', undefined>,
    { token?: string }
  >
>()('Auth') {}
const AuthLive = Layer.effect(
  Auth,
  Effect.gen(function* () {
    const sessions = yield* Sessions;
    log.push('auth build');
    return (next, { ctx }) => {
      const user = ctx.token ? sessions.user(ctx.token) : undefined;
      return user
        ? next.pipe(Effect.provideService(CurrentUser, { id: user }))
        : Effect.fail(new TrpcError.Unauthorized());
    };
  }),
).pipe(
  Layer.provide(Layer.succeed(Sessions, { user: (token) => `user-${token}` })),
);

const t = initTrpc<{ ctx: { token?: string } }>();
/** A base procedure: everything built from it gets `PostRepo`, and needs `Db`. */
const withRepo = provideLayer(t.procedure, PostRepoLive);
const withTx = provideLayer(t.procedure, TxLive, { lifetime: 'call' });
const authed = useService(t.procedure, Auth);

const router = t.router({
  post: {
    byId: withRepo.query(() =>
      Effect.flatMap(PostRepo, (repo) => repo.find('1')),
    ),
    list: withRepo.query(() =>
      Effect.flatMap(PostRepo, (repo) => repo.find('all')),
    ),
  },
  write: withTx.mutation(() => Effect.map(Tx, (tx) => tx.id)),
  me: authed.query(() => Effect.map(CurrentUser, (u) => u.id)),
});

test('provided services drop out of the router type; what their layers need joins it', () => {
  expectTypeOf<inferRouterServices<typeof router>>().toEqualTypeOf<Db | Auth>();
  const ok = () =>
    createRouterClient(router, {
      ctx: {},
      runtime: ManagedRuntime.make(Layer.mergeAll(DbLive, AuthLive)),
    });
  const missing = () =>
    createRouterClient(router, {
      ctx: {},
      // @ts-expect-error the runtime misses Auth
      runtime: ManagedRuntime.make(DbLive),
    });
  expect([ok, missing]).toHaveLength(2);
});

test('a handler-lifetime layer is built once, shared by every procedure that provides it', async () => {
  log.length = 0;
  await using runtime = ManagedRuntime.make(Layer.mergeAll(DbLive, AuthLive));
  const client = createRouterClient(router, { ctx: {}, runtime });
  const results = await Promise.all([
    client.post.byId.query(),
    client.post.list.query(),
    client.post.byId.query(),
  ]);
  expect(results.map((r) => r.id)).toEqual(['1', 'all', '1']);
  expect(log.filter((l) => l === 'repo build')).toHaveLength(1);
  expect(log.filter((l) => l === 'db open')).toHaveLength(1);
});

test("a layer the handler's layer also has is built once, by reference", async () => {
  log.length = 0;
  await using runtime = ManagedRuntime.make(
    Layer.mergeAll(Layer.provideMerge(PostRepoLive, DbLive), AuthLive),
  );
  const client = createRouterClient(router, { ctx: {}, runtime });
  await client.post.byId.query();
  await client.post.list.query();
  expect(log.filter((l) => l === 'repo build')).toHaveLength(1);
});

test('a call-lifetime layer may only fail with a TrpcError; a handler-lifetime one dies', () => {
  class Boom extends Context.Service<Boom, {}>()('Boom') {}
  const failing = Layer.effect(Boom, Effect.fail(new Error('no')));
  // @ts-expect-error map layer failures to a TrpcError first (Q2.3)
  provideLayer(t.procedure, failing, { lifetime: 'call' });
  const dies = provideLayer(t.procedure, failing);
  expect(dies).toBeDefined();
});

test("a call-lifetime layer is built per call, reusing the handler's services, and released after it", async () => {
  log.length = 0;
  await using runtime = ManagedRuntime.make(Layer.mergeAll(DbLive, AuthLive));
  const client = createRouterClient(router, { ctx: {}, runtime });
  expect(await client.write.mutate()).toBe(1);
  expect(await client.write.mutate()).toBe(2);
  expect(log.filter((l) => l.startsWith('tx'))).toEqual([
    'tx 1 begin',
    'tx 1 end',
    'tx 2 begin',
    'tx 2 end',
  ]);
  expect(log.filter((l) => l === 'db open')).toHaveLength(1);
});

test('a middleware service is implemented by a layer built once, and provides per call', async () => {
  log.length = 0;
  await using runtime = ManagedRuntime.make(Layer.mergeAll(DbLive, AuthLive));
  const anon = createRouterClient(router, { ctx: {}, runtime });
  await expect(anon.me.query()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  const ada = createRouterClient(router, { ctx: { token: 'ada' }, runtime });
  expect(await ada.me.query()).toBe('user-ada');
  expect(await ada.me.query()).toBe('user-ada');
  // One build per runtime, shared by both clients.
  expect(log.filter((l) => l === 'auth build')).toHaveLength(1);
});

test("the middleware's error joins the procedure's error union", () => {
  expectTypeOf<inferProcedureErrors<typeof router.me>>().toEqualTypeOf<
    TrpcError<'UNAUTHORIZED', undefined>
  >();
  expectTypeOf<inferProcedureErrors<typeof router.post.byId>>().toBeNever();
});

test('a strict procedure is checked against its declared output and errors', async () => {
  const Post = Schema.Struct({ id: Schema.String });
  const declared = authed
    .output(Post)
    .errors({ NOT_FOUND: { data: Schema.Struct({ id: Schema.String }) } });
  const byId = strict(declared).query(({ errors }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      if (user.id === 'user-nobody') {
        return yield* errors.NOT_FOUND({ data: { id: '1' } });
      }
      return { id: user.id };
    }),
  );
  expectTypeOf<inferProcedureErrors<typeof byId>>().toEqualTypeOf<
    | TrpcError<'UNAUTHORIZED', undefined>
    | TrpcError<'NOT_FOUND', { readonly id: string }>
  >();
  expectTypeOf<inferProcedureOutput<typeof byId>>().toEqualTypeOf<{
    readonly id: string;
  }>();

  // @ts-expect-error strict: declare the output with .output()
  strict(authed);
  strict(declared).query(() =>
    // @ts-expect-error the procedure does not declare FORBIDDEN
    Effect.fail(new TrpcError.Forbidden()),
  );
  // @ts-expect-error the output is { id: string }
  strict(declared).query(() => Effect.succeed({ id: 1 }));

  await using runtime = ManagedRuntime.make(AuthLive);
  const client = createRouterClient(t.router({ byId }), {
    ctx: { token: 'nobody' },
    runtime,
  });
  await expect(client.byId.query()).rejects.toMatchObject({
    code: 'NOT_FOUND',
    data: { id: '1' },
  });
});
