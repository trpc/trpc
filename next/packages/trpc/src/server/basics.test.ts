import { Schema } from 'effect';
import {
  createTrpcClient,
  httpLink,
  safe,
  routerType,
  type ErrorData,
} from '@trpc12/trpc/client';
import {
  error,
  initTrpc,
  type inferInputIssue,
  type InputValidationErrorData,
} from '@trpc12/trpc/server';
import { createTestServer } from '../fixtures/server.ts';
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

const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED', message: 'Sign in first' }),
);

interface Post {
  id: string;
  title: string;
  author: string;
}
const posts = new Map<string, Post>();

const router = t.router({
  health: t.procedure.query(() => 'ok' as const),
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query((opts) => `hello ${opts.input.name}`),
  add: t.procedure
    .input(Schema.Struct({ a: Schema.Number, b: Schema.Number }))
    .query((opts) => opts.input.a + opts.input.b),
  me: authed.query((opts) => opts.ctx.user),
  post: {
    create: authed
      .input(z.object({ title: z.string().min(1) }))
      .mutation((opts) => {
        const post: Post = {
          id: String(posts.size + 1),
          title: opts.input.title,
          author: opts.ctx.user.name,
        };
        posts.set(post.id, post);
        return post;
      }),
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query((opts) => posts.get(opts.input.id) ?? null),
  },
});
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
    expectTypeOf(err.data).toEqualTypeOf<
      ErrorData<
        InputValidationErrorData<
          inferInputIssue<z.ZodObject<{ title: z.ZodString }>>
        >
      >
    >();
    expectTypeOf(err.data.issues[0]!.path).toEqualTypeOf<
      readonly [] | readonly ['title']
    >();
    expect(err.data.issues[0]!.path).toEqual(['title']);
  }
});

test('input issue paths are typed from each schema, and match what the schema reports', async () => {
  interface Category {
    name: string;
    children: Category[];
  }
  const Category: z.ZodType<Category> = z.object({
    name: z.string(),
    get children() {
      return z.array(Category);
    },
  });
  const issues = t.router({
    nested: t.procedure
      .input(
        z.object({
          title: z.string(),
          tags: z.array(z.string()).optional(),
          author: z.object({ name: z.string(), at: z.date() }),
          kind: z.discriminatedUnion('type', [
            z.object({ type: z.literal('a'), a: z.number() }),
            z.object({ type: z.literal('b') }),
          ]),
        }),
      )
      .mutation(() => 'ok'),
    effect: t.procedure
      .input(Schema.Struct({ ids: Schema.Array(Schema.NumberFromString) }))
      .query(() => 'ok'),
    chained: t.procedure
      .input(z.object({ id: z.string() }))
      .input(z.object({ limit: z.number() }))
      .query(() => 'ok'),
    tree: t.procedure.input(Category).query(() => 'ok'),
    whole: t.procedure.input(z.string()).query(() => 'ok'),
  });
  await using server = await createTestServer({
    router: issues,
    createContext: () => ({ user: null }),
  });
  const client = createTrpcClient({
    router: routerType<typeof issues>(),
    links: [httpLink({ url: server.url })],
  });

  const [, nested] = await safe(
    client.nested.mutate({
      title: 'x',
      tags: ['a', 1 as never],
      author: { name: 'Ada', at: new Date() },
      kind: { type: 'a', a: 'one' as never },
    }),
  );
  if (nested?.defined && nested.code === 'BAD_REQUEST') {
    const path = nested.data.issues[0]!.path;
    expectTypeOf(path).toEqualTypeOf<
      | readonly []
      | readonly ['title']
      | readonly ['tags']
      | readonly ['tags', number]
      | readonly ['author']
      | readonly ['author', 'name']
      | readonly ['author', 'at']
      | readonly ['kind']
      | readonly ['kind', 'type']
      | readonly ['kind', 'a']
    >();
    // @ts-expect-error -- not a key of the input
    expect(path[0] === 'titel').toBe(false);
  }
  expect(nested).toMatchObject({
    code: 'BAD_REQUEST',
    data: {
      issues: [
        { path: ['tags', 1] },
        { path: ['author', 'at'] },
        { path: ['kind', 'a'] },
      ],
    },
  });

  const [, effect] = await safe(
    client.effect.query({ ids: ['1', 2 as never] }),
  );
  if (effect?.defined && effect.code === 'BAD_REQUEST') {
    expectTypeOf(effect.data.issues[0]!.path).toEqualTypeOf<
      readonly [] | readonly ['ids'] | readonly ['ids', number]
    >();
  }
  expect(effect).toMatchObject({
    data: { issues: [{ path: ['ids', 1] }] },
  });

  const [, chained] = await safe(
    client.chained.query({ id: 1 as never, limit: 10 }),
  );
  if (chained?.defined && chained.code === 'BAD_REQUEST') {
    const firsts = chained.data.issues.map((issue) => issue.path[0]);
    expectTypeOf(firsts).toEqualTypeOf<Array<'id' | 'limit' | undefined>>();
    expect(firsts).toEqual(['id']);
  }

  const [, tree] = await safe(
    client.tree.query({
      name: 'a',
      children: [{ name: 'b', children: [{ name: 1 as never, children: [] }] }],
    }),
  );
  if (tree?.defined && tree.code === 'BAD_REQUEST') {
    const path = tree.data.issues[0]!.path;
    expectTypeOf<readonly ['children', number, 'name']>().toExtend<
      typeof path
    >();
    expect(path).toEqual(['children', 0, 'children', 0, 'name']);
  }

  const [, whole] = await safe(client.whole.query(1 as never));
  if (whole?.defined && whole.code === 'BAD_REQUEST') {
    expectTypeOf(whole.data.issues[0]!.path).toEqualTypeOf<readonly []>();
  }
  expect(whole).toMatchObject({ data: { issues: [{ path: [] }] } });
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
  const schemas = t.router({
    typed: t.procedure.input(toNumber).query((opts) => {
      expectTypeOf(opts.input).toEqualTypeOf<number>();
      return opts.input + 1;
    }),
    untyped: t.procedure.input(untyped).query((opts) => {
      expectTypeOf(opts.input).toEqualTypeOf<string>();
      return opts.input.length;
    }),
  });
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

test('Standard Schema issues keep their paths, async validators are awaited, and a throwing one fails as unexpected', async () => {
  const standard = (validate: (value: unknown) => unknown) =>
    ({
      '~standard': { version: 1, vendor: 'test', validate },
    }) as unknown as z.ZodString;
  const schemas = t.router({
    paths: t.procedure
      .input(
        standard(() => ({
          issues: [
            { message: 'nested', path: [{ key: 'a' }, 0, Symbol('s')] },
            { message: 'whole' },
          ],
        })),
      )
      .query(() => 'never'),
    later: t.procedure
      .input(z.string().refine(async (v) => v !== 'no', 'not no'))
      .output(z.string().refine(async (v) => v !== 'NOPE', 'not NOPE'))
      .query((opts) => opts.input.toUpperCase()),
    ticks: t.procedure
      .output(z.number().refine(async (n) => n > 0))
      .subscription(async function* () {
        yield 1;
        yield 2;
      }),
    throws: t.procedure
      .input(
        standard(() => {
          throw new Error('validator broke');
        }),
      )
      .query(() => 'never'),
  });
  await using server = await createTestServer({
    router: schemas,
    createContext: () => ({ user: null }),
    exposeUnexpectedErrors: false,
  });
  const client = createTrpcClient({
    router: routerType<typeof schemas>(),
    links: [httpLink({ url: server.url })],
  });
  const [, issues] = await safe(client.paths.query('x'));
  expect(issues).toMatchObject({
    code: 'BAD_REQUEST',
    data: {
      issues: [
        { message: 'nested', path: ['a', 0, 'Symbol(s)'] },
        { message: 'whole' },
      ],
    },
  });
  expect(await client.later.query('yes')).toBe('YES');
  const [, rejected] = await safe(client.later.query('no'));
  expect(rejected).toMatchObject({
    code: 'BAD_REQUEST',
    data: { issues: [{ message: 'not no' }] },
  });
  const [, invalidOutput] = await safe(client.later.query('nope'));
  expect(invalidOutput).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  const ticks: number[] = [];
  for await (const tick of client.ticks.subscribe()) ticks.push(tick);
  expect(ticks).toEqual([1, 2]);
  const [, broke] = await safe(client.throws.query('x'));
  expect(broke).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
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
  const typed = t.router({
    json: t.procedure.query((): JsonValue => ({ a: [1, { b: null }] })),
    pair: t.procedure.query(() => ['a', 1] as unknown as Pair),
  });
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
