import { Schema } from 'effect';
import {
  createTrpcClient,
  httpLink,
  safe,
  routerType,
} from '@trpc12/trpc/client';
import {
  error,
  initTrpc,
  type InputValidationErrorData,
} from '@trpc12/trpc/server';
import { createTestServer } from './fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

interface User {
  id: string;
  name: string;
}
interface Context {
  user: User | null;
}

const t = initTrpc<{ ctx: Context }>();

const authed = t.procedure.use(({ ctx, next }) =>
  ctx.user
    ? next({ ctx: { user: ctx.user } })
    : error({ code: 'UNAUTHORIZED', message: 'Sign in first' }),
);

const posts = new Map<string, { id: string; title: string; author: string }>();

const router = {
  health: t.procedure.query(() => 'ok' as const),
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `hello ${input.name}`),
  add: t.procedure
    .input(Schema.Struct({ a: Schema.Number, b: Schema.Number }))
    .query(({ input }) => input.a + input.b),
  me: authed.query(({ ctx }) => ctx.user),
  post: {
    create: authed
      .input(z.object({ title: z.string().min(1) }))
      .mutation(({ ctx, input }) => {
        const post = {
          id: String(posts.size + 1),
          title: input.title,
          author: ctx.user.name,
        };
        posts.set(post.id, post);
        return post;
      }),
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => posts.get(input.id) ?? null),
  },
};
type AppRouter = typeof router;

async function setup(user: User | null = { id: 'u1', name: 'Ada' }) {
  const server = await createTestServer({
    router,
    createContext: () => ({ user }),
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  return { server, client, [Symbol.asyncDispose]: () => server.close() };
}

test('query without input', async () => {
  await using ctx = await setup();
  const result = await ctx.client.health.query();
  expect(result).toBe('ok');
  expectTypeOf(result).toEqualTypeOf<'ok'>();
});

test('query with a Standard Schema (zod) input, sent as a canonical ?input= GET param', async () => {
  await using ctx = await setup();
  expect(await ctx.client.greet.query({ name: 'world' })).toBe('hello world');
  const request = ctx.server.requests.at(-1)!;
  expect(request.method).toBe('GET');
  expect(new URL(request.url, 'http://x').searchParams.get('input')).toBe(
    '{"name":"world"}',
  );
});

test('query with an Effect Schema input', async () => {
  await using ctx = await setup();
  const sum = await ctx.client.add.query({ a: 1, b: 2 });
  expect(sum).toBe(3);
  expectTypeOf(sum).toEqualTypeOf<number>();
});

test('mutation goes through middleware that extends ctx', async () => {
  await using ctx = await setup();
  const post = await ctx.client.post.create.mutate({ title: 'Hello' });
  expect(post).toMatchObject({ title: 'Hello', author: 'Ada' });
  expect(ctx.server.requests.at(-1)!.method).toBe('POST');
  expect(await ctx.client.post.byId.query({ id: post.id })).toEqual(post);
});

test('input validation errors are typed BAD_REQUEST with issues', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.post.create.mutate({ title: '' }));
  expect(err).toMatchObject({
    code: 'BAD_REQUEST',
    defined: true,
  });
  if (err?.defined && err.code === 'BAD_REQUEST') {
    expectTypeOf(err.data).toEqualTypeOf<InputValidationErrorData>();
    expect(err.data.issues[0]!.path).toEqual(['title']);
  }
});

test('middleware short-circuits with a returned error', async () => {
  await using ctx = await setup(null);
  const [data, err] = await safe(ctx.client.me.query());
  expect(data).toBeUndefined();
  expect(err).toMatchObject({
    code: 'UNAUTHORIZED',
    message: 'Sign in first',
    defined: true,
  });
});

test('unknown paths are NOT_FOUND', async () => {
  await using ctx = await setup();
  const res = await fetch(`${ctx.server.url}/nope`);
  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({
    json: { error: { code: 'NOT_FOUND', defined: false } },
  });
});

test('a Standard Schema types input from ~standard.types, or from validate without them', async () => {
  const toNumber = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value: unknown) => ({ value: Number(value) }),
      types: { input: '' as string, output: 0 as number },
    },
  } as const;
  const untyped = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value: unknown) => ({ value: String(value) }),
    },
  } as const;
  const schemas = {
    typed: t.procedure.input(toNumber).query(({ input }) => {
      expectTypeOf(input).toEqualTypeOf<number>();
      return input + 1;
    }),
    untyped: t.procedure.input(untyped).query(({ input }) => {
      expectTypeOf(input).toEqualTypeOf<string>();
      return input.length;
    }),
  };
  await using server = await createTestServer({
    router: schemas,
    createContext: () => ({ user: null }),
  });
  const client = createTrpcClient({
    router: routerType<typeof schemas>(),
    links: [httpLink({ url: server.url })],
  });
  expectTypeOf<
    Parameters<typeof client.typed.query>[0]
  >().toEqualTypeOf<string>();
  expect(await client.typed.query('41')).toBe(42);
  expectTypeOf<
    Parameters<typeof client.untyped.query>[0]
  >().toEqualTypeOf<unknown>();
  expect(await client.untyped.query('abc')).toBe(3);
});

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
type Pair = [string, number] & { readonly __brand: 'pair' };

test('recursive and branded outputs keep their types', async () => {
  const typed = {
    json: t.procedure.query((): JsonValue => ({ a: [1, { b: null }] })),
    pair: t.procedure.query(() => ['a', 1] as unknown as Pair),
  };
  await using server = await createTestServer({
    router: typed,
    createContext: () => ({ user: null }),
  });
  const client = createTrpcClient({
    router: routerType<typeof typed>(),
    links: [httpLink({ url: server.url })],
  });
  const json = await client.json.query();
  expect(json).toEqual({ a: [1, { b: null }] });
  expectTypeOf(json).toEqualTypeOf<JsonValue>();
  expectTypeOf(await client.pair.query()).toEqualTypeOf<Pair>();
});
