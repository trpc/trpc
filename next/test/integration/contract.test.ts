import { Effect, Schema } from 'effect';
import {
  createTrpcClient,
  httpLink,
  safe,
  type TrpcClient,
} from 'trpcdev/client';
import { toContract, type inferContract } from 'trpcdev/contract';
import { error, initTrpc, tracked, type TrackedEnvelope } from 'trpcdev/server';
import { createTestServer } from './fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { appContract, type AppContract } from './fixtures/contract.ts';

interface Context {
  user: string | null;
}
const t = initTrpc<{ ctx: Context; meta: { auth?: boolean } }>();
const posts = new Map([['1', { id: '1', title: 'Hello' }]]);

const authed = t.middleware(({ ctx, next }) =>
  ctx.user
    ? next({ ctx: { user: ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);

const impl = t.implement(appContract);

const appRouter = impl.router({
  health: impl.health.query(() => 'ok' as const),
  post: {
    byId: impl.post.byId.query(({ input, errors }) => {
      expectTypeOf(input).toEqualTypeOf<{ id: string }>();
      return (
        posts.get(input.id) ?? errors.NOT_FOUND({ data: { id: input.id } })
      );
    }),
    create: impl.post.create.use(authed).mutation(({ input, ctx, meta }) => {
      expectTypeOf(ctx.user).toEqualTypeOf<string>();
      expect(meta.auth).toBe(true);
      const post = { id: String(posts.size + 1), title: input.title };
      posts.set(post.id, post);
      return post;
    }),
    onAdd: impl.post.onAdd.subscription(async function* ({ lastEventId }) {
      const start = Number(lastEventId ?? 0) + 1;
      for (let id = start; id <= 3; id++) {
        yield tracked(String(id), { id: String(id), title: `Post ${id}` });
      }
    }),
  },
});

async function setup() {
  const server = await createTestServer({
    router: appRouter,
    createContext: ({ request }) => ({
      user: request.headers.get('x-user'),
    }),
  });
  const client = createTrpcClient({
    router: appContract,
    links: [httpLink({ url: server.url, headers: { 'x-user': 'alex' } })],
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
  const client = createTrpcClient<AppContract>({
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

    const rateLimited = t.middleware(({ next }) =>
      Math.random() > 2 ? error({ code: 'TOO_MANY_REQUESTS' }) : next(),
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

  expect(() => t.implement({ router: appContract.health })).toThrow(
    /shadow impl\.router/,
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
  expectTypeOf<TrpcClient<FromRouter>>().toEqualTypeOf<
    TrpcClient<AppContract>
  >();
  expectTypeOf<TrpcClient<FromRouter>>().toEqualTypeOf<
    TrpcClient<typeof appRouter>
  >();
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
  const router = {
    search: t.procedure
      .input(Schema.Struct({ q: Schema.String }))
      .input(Schema.Struct({ limit: Schema.optional(Schema.NumberFromString) }))
      .output(Schema.Array(Schema.String))
      .query(() => []),
  };
  const { search } = toContract(router).procedures;
  expect(search!.input).toMatchObject({
    allOf: [
      { type: 'object', required: ['q'] },
      { type: 'object', properties: { limit: {} } },
    ],
  });
  expect(search!.output).toMatchObject({
    type: 'array',
    items: { type: 'string' },
  });
});
