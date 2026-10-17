import { Context, Effect, Schema } from 'effect';
import {
  createTrpcClient,
  httpLink,
  safe,
  type TrpcClient,
  routerType,
} from '@trpc12/trpc/client';
import {
  type AnyContractRouter,
  contract,
  isContractProcedure,
  toContract,
  type inferContract,
} from '@trpc12/trpc/contract';
import { openapi } from '@trpc12/trpc/openapi';
import {
  error,
  initTrpc,
  tracked,
  type TrackedEnvelope,
} from '@trpc12/trpc/server';
import { createTestServer } from '../fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { appContract, type AppContract } from '../fixtures/contract.ts';

interface Ctx {
  user: string | null;
}
const t = initTrpc<{ ctx: Ctx; meta: { auth?: boolean } }>().concat(openapi());
interface Post {
  id: string;
  title: string;
}
const posts = new Map<string, Post>([['1', { id: '1', title: 'Hello' }]]);

const authed = t.middleware((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);

const impl = t.implement(appContract);

const appRouter = impl.router({
  health: impl.health.query(() => 'ok' as const),
  post: {
    byId: impl.post.byId.query((opts) => {
      const { input } = opts;
      expectTypeOf(input).toEqualTypeOf<{ id: string }>();
      return (
        posts.get(input.id) ?? opts.errors.NOT_FOUND({ data: { id: input.id } })
      );
    }),
    create: impl.post.create.use(authed).mutation((opts) => {
      expectTypeOf(opts.ctx.user).toEqualTypeOf<string>();
      expect(opts.meta.auth).toBe(true);
      const post: Post = {
        id: String(posts.size + 1),
        title: opts.input.title,
      };
      posts.set(post.id, post);
      return post;
    }),
    onAdd: impl.post.onAdd.subscription(async function* (opts) {
      const start = Number(opts.lastEventId ?? 0) + 1;
      for (let id = start; id <= 3; id++) {
        yield tracked(String(id), { id: String(id), title: `Post ${id}` });
      }
    }),
  },
});

async function setup() {
  const server = await createTestServer({
    router: appRouter,
    createContext: (opts) => ({
      user: opts.request.headers['x-user'] ?? null,
    }),
  });
  const client = createTrpcClient({
    router: appContract,
    links: [httpLink({ url: server.url, headers: { 'x-user': 'ada' } })],
  });
  return { server, client, [Symbol.asyncDispose]: () => server.close() };
}

test('a client typed from the contract calls the implementation (09)', async () => {
  await using ctx = await setup();
  expect(await ctx.client.health.query()).toBe('ok');
  const post = await ctx.client.post.byId.query({ id: '1' });
  expectTypeOf(post).toEqualTypeOf<{ id: string; title: string }>();
  expect(post).toEqual({ id: '1', title: 'Hello' });

  const [, err] = await safe(ctx.client.post.byId.query({ id: 'nope' }));
  expect(err).toMatchObject({ code: 'NOT_FOUND', data: { id: 'nope' } });
  if (err?.defined) {
    expectTypeOf(err.code).toEqualTypeOf<'NOT_FOUND' | 'BAD_REQUEST'>();
  }

  const created = await ctx.client.post.create.mutate({ title: 'New' });
  expect(created.title).toBe('New');

  const ids: string[] = [];
  for await (const event of ctx.client.post.onAdd.subscribe(undefined, {
    lastEventId: '1',
  })) {
    expectTypeOf(event).toEqualTypeOf<
      TrackedEnvelope<{ id: string; title: string }>
    >();
    ids.push(event.id);
  }
  expect(ids).toEqual(['2', '3']);
});

test('contract errors and input validation apply to the implementation', async () => {
  await using server = await createTestServer({
    router: appRouter,
    createContext: () => ({ user: null }),
  });
  const client = createTrpcClient({
    router: routerType<AppContract>(),
    links: [httpLink({ url: server.url })],
  });
  await expect(client.post.create.mutate({ title: 'x' })).rejects.toMatchObject(
    { code: 'UNAUTHORIZED', defined: true },
  );
  await expect(
    client.post.byId.query({ id: 1 as never }),
  ).rejects.toMatchObject({ code: 'BAD_REQUEST', defined: true });
});

test('implement() leaves only offer the contract terminal, inputs and errors', () => {
  // @ts-expect-error -- input comes from the contract
  void impl.post.byId.input;
  // @ts-expect-error -- byId is a query
  void impl.post.byId.mutation;
  // @ts-expect-error -- output comes from the contract
  void impl.post.byId.output;

  void (() => {
    // @ts-expect-error -- the contract's output has a title
    impl.post.byId.query(() => ({ id: '1' }));

    impl.post.byId.query(
      // @ts-expect-error -- Q9.3: CONFLICT is not declared by the contract
      () => error({ code: 'CONFLICT' }),
    );

    const rateLimited = t.middleware((opts) =>
      Math.random() > 2 ? error({ code: 'TOO_MANY_REQUESTS' }) : opts.next(),
    );
    // @ts-expect-error -- Q9.3: middleware errors must be declared too
    impl.post.create.use(rateLimited);

    impl.post.byId.query(() =>
      // @ts-expect-error -- Effect failures must be TRPCErrors (d.ii)
      Effect.fail(new Error('boom')),
    );

    impl.post.onAdd.subscription(
      // @ts-expect-error -- the contract's events are tracked()
      async function* () {
        yield { id: '1', title: 'x' };
      },
    );
  });
});

test('impl.router() checks completeness at the type level and at runtime', () => {
  const byId = impl.post.byId.query(() => posts.get('1')!);
  const create = impl.post.create.mutation(() => posts.get('1')!);
  const onAdd = impl.post.onAdd.subscription(async function* () {});
  const health = impl.health.query(() => 'ok' as const);

  expect(() =>
    impl.router({
      health,
      // @ts-expect-error -- onAdd is missing
      post: { byId, create },
    }),
  ).toThrow(/"post\.onAdd" is missing/);

  expect(() =>
    impl.router({
      health,
      post: {
        byId,
        create,
        onAdd,
        // @ts-expect-error -- not in the contract
        delete: create,
      },
    }),
  ).toThrow(/"post\.delete" is not in the contract/);

  expect(() =>
    impl.router({
      health,
      // @ts-expect-error -- byId must be a query
      post: { byId: create, create, onAdd },
    }),
  ).toThrow(/"post\.byId" must be a query, not a mutation/);

  const untyped = (routes: unknown) => impl.router(routes as never);
  expect(() => untyped({ health })).toThrow(/"post" is missing/);
  expect(() => untyped({ health, post: byId })).toThrow(
    /"post" must be a router/,
  );
  expect(() => untyped({ health, post: 'byId' })).toThrow(
    /"post" must be a router/,
  );
  expect(() =>
    untyped({ health, post: { byId: appContract.post.byId, create, onAdd } }),
  ).toThrow(/"post\.byId" has no resolver/);

  expect(() => t.implement({ router: appContract.health })).toThrow(
    /shadow impl\.router/,
  );
});

test('a contract cannot concat an extension with middleware, and isContractProcedure() tells contract leaves from procedures', () => {
  const withMiddleware = initTrpc().procedure.use((opts) => opts.next());
  expect(() => contract.create().concat(withMiddleware)).toThrow(
    /the extension has middleware or inputs/,
  );

  expect(isContractProcedure(appContract.health)).toBe(true);
  expect(isContractProcedure(impl.health.query(() => 'ok' as const))).toBe(
    false,
  );
  expect(isContractProcedure(appContract.post)).toBe(false);
  expect(isContractProcedure(null)).toBe(false);
});

test('impl.use() and impl.provide() run for every procedure of the contract', async () => {
  const c = contract.create<{ meta: { auth?: boolean } }>().errors({
    UNAUTHORIZED: {},
  });
  const adminContract = {
    stats: c.output(Schema.Number).query(),
    users: { ban: c.input(Schema.String).output(Schema.String).mutation() },
  } satisfies AnyContractRouter;
  class Audit extends Context.Service<Audit, { readonly by: string }>()(
    'Audit',
  ) {}

  const impl = t
    .implement(adminContract)
    .use(authed)
    .provide(Audit, (opts) => ({ by: opts.ctx.user }));
  const adminRouter = impl.router({
    stats: impl.stats.query((opts) => {
      expectTypeOf(opts.ctx.user).toEqualTypeOf<string>();
      return 1;
    }),
    users: {
      ban: impl.users.ban.mutation((opts) =>
        Effect.gen(function* () {
          const audit = yield* Audit;
          return `${audit.by} banned ${opts.input}`;
        }),
      ),
    },
  });

  await using server = await createTestServer({
    router: adminRouter,
    createContext: (opts) => ({
      user: opts.request.headers['x-user'] ?? null,
    }),
  });
  const anon = createTrpcClient({
    router: adminContract,
    links: [httpLink({ url: server.url })],
  });
  await expect(anon.stats.query()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
    defined: true,
  });
  const admin = createTrpcClient({
    router: adminContract,
    links: [httpLink({ url: server.url, headers: { 'x-user': 'ada' } })],
  });
  expect(await admin.users.ban.mutate('bob')).toBe('ada banned bob');

  void (() => {
    // @ts-expect-error -- Q9.3: health and post.* don't declare UNAUTHORIZED
    t.implement(appContract).use(authed);
  });
});

test('t.implement() checks the contract meta against the root meta', () => {
  const c = contract.create<{ meta: { auth?: boolean; scope: string } }>();
  const scoped = {
    ping: c.meta({ scope: 'x' }).query(),
  } satisfies AnyContractRouter;
  void (() => {
    // @ts-expect-error -- scope is not in t's meta
    t.implement(scoped);
    // @ts-expect-error -- auth is a boolean in t's meta
    initTrpc<{ ctx: Ctx; meta: { auth?: string } }>().implement(appContract);
  });
  initTrpc<{ meta: { auth?: boolean; scope: string } }>().implement(scoped);
  expect(() => t.implement({ use: appContract.health })).toThrow(
    /shadow impl\.use/,
  );
});

test('a contract procedure without an implementation answers NOT_IMPLEMENTED', async () => {
  await using server = await createTestServer({ router: appContract });
  const client = createTrpcClient({
    router: appContract,
    links: [httpLink({ url: server.url })],
  });
  await expect(client.health.query()).rejects.toMatchObject({
    code: 'NOT_IMPLEMENTED',
    defined: false,
  });
});

test('inferContract strips server types; clients from it match', () => {
  type FromRouter = inferContract<typeof appRouter>;
  // The clients differ only in the router type they record (`ClientTypes`).
  type Calls<T> = { [K in keyof T as K extends string ? K : never]: T[K] };
  expectTypeOf<Calls<TrpcClient<FromRouter>>>().toEqualTypeOf<
    Calls<TrpcClient<AppContract>>
  >();
  expectTypeOf<Calls<TrpcClient<FromRouter>>>().toEqualTypeOf<
    Calls<TrpcClient<typeof appRouter>>
  >();
  expectTypeOf<TrpcClient<FromRouter>>().toExtend<TrpcClient<AppContract>>();
  expectTypeOf<TrpcClient<AppContract>>().toExtend<TrpcClient<FromRouter>>();
});

test('toContract() emits a JSON contract that types clients (Q9.4)', async () => {
  const json = toContract(appRouter);
  expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  expect(json.procedures['post.byId']).toEqual({
    type: 'query',
    route: { method: 'GET', path: '/posts/{id}', tags: ['posts'] },
    input: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    output: {
      type: 'object',
      properties: { id: { type: 'string' }, title: { type: 'string' } },
      required: ['id', 'title'],
      additionalProperties: false,
    },
    errors: {
      NOT_FOUND: {
        data: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false,
        },
      },
    },
  });
  expect(json.procedures['post.onAdd']).toMatchObject({ type: 'subscription' });
  expect(Object.keys(json.procedures)).toEqual([
    'health',
    'post.byId',
    'post.create',
    'post.onAdd',
  ]);

  await using server = await createTestServer({
    router: appRouter,
    createContext: () => ({ user: null }),
  });
  const client = createTrpcClient({
    router: json,
    links: [httpLink({ url: server.url })],
  });
  const post = await client.post.byId.query({ id: '1' });
  expectTypeOf(post).toEqualTypeOf<{ id: string; title: string }>();
  expect(post.id).toBe('1');
});

test('toContract() describes Effect Schemas and chained inputs', () => {
  const procedures = toContract({
    search: t.procedure
      .input(Schema.Struct({ q: Schema.String }))
      .input(Schema.Struct({ limit: Schema.optional(Schema.NumberFromString) }))
      .output(Schema.Array(Schema.String))
      .query(() => []),
  }).procedures;
  expect(procedures['search']!.input).toMatchObject({
    allOf: [
      { type: 'object', required: ['q'] },
      { type: 'object', properties: { limit: {} } },
    ],
  });
  expect(procedures['search']!.output).toMatchObject({
    type: 'array',
    items: { type: 'string' },
  });
});
