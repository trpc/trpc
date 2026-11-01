import * as devalue from 'devalue';
import { Effect, Stream } from 'effect';
import superjson from 'superjson';
import {
  createTrpcClient,
  getClientTransformer,
  httpLink,
  routerType,
  safe,
  wsLink,
  type Deserialized,
} from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import {
  createRouterClient,
  initTrpc,
  TrpcError,
  type inferProcedureOutput,
  type inferRouterInputs,
  type inferRouterOutputs,
} from '@trpc12/trpc/server';
import {
  experimental_createProgressiveJson,
  createSyncTransformer,
  jsonTransformer,
  type JsonOf,
} from '@trpc12/trpc/transformer';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../fixtures/server.ts';

const at = new Date('2026-10-15T00:00:00.000Z');
const progressiveJson = experimental_createProgressiveJson();
const t = initTrpc();

/** The router doesn't name a transformer: the handler and the links do. */
const router = t.router({
  rich: t.procedure.input(z.object({ q: z.string() })).query((opts) => ({
    q: opts.input.q,
    at,
    tags: new Set(['a']),
    missing: undefined as string | undefined,
  })),
  echo: t.procedure
    .input(z.object({ text: z.string() }))
    .mutation((opts) => opts.input.text.toUpperCase()),
  count: t.procedure.query(async function* () {
    yield { n: 1, at };
    yield { n: 2, at };
    return 'done';
  }),
  later: t.procedure.query(() => Promise.resolve({ at })),
  nothing: t.procedure.query((): void => {}),
  fails: t.procedure.query((): string => {
    throw new TrpcError({ code: 'NOT_FOUND', message: 'nope' });
  }),
  ticks: t.procedure.subscription(async function* () {
    yield { at };
    yield { at };
  }),
});

const collect = async <T>(iterable: AsyncIterable<T>) => {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
};

test('JsonOf is the JSON round trip of a type', () => {
  type T = JsonOf<{
    at: Date;
    map: Map<string, number>;
    opt?: string;
    maybe: string | undefined;
    fn: () => void;
    list: (number | undefined)[];
    nested: { url: URL; n: bigint | null };
  }>;
  expectTypeOf<T>().toEqualTypeOf<{
    at: string;
    map: Record<string, never>;
    opt?: string;
    maybe?: string;
    list: (number | null)[];
    nested: { url: string; n: null };
  }>();
  expectTypeOf<JsonOf<Date | Set<number>, Date>>().toEqualTypeOf<
    Date | Record<string, never>
  >();
});

test('jsonTransformer writes what JSON.stringify writes, and skips the copy when a value is JSON already', () => {
  const roundtrip = (value: unknown) =>
    JSON.parse(JSON.stringify(value) ?? 'null') as unknown;
  const pure: Record<string, unknown> = {
    id: '1',
    n: 2.5,
    ok: true,
    none: null,
    tags: ['a', { b: 1 }],
  };
  const sparse: unknown[] = [1];
  sparse[2] = 3;
  const values: unknown[] = [
    pure,
    'text',
    [1, 'two', [false]],
    { at, missing: undefined, nan: NaN, inf: -Infinity },
    { list: [undefined, () => 1, Symbol('s')] },
    sparse,
    { custom: { toJSON: (key: string) => `custom:${key}` } },
    { map: new Map([['a', 1]]), set: new Set([1]), date: new Date(Number.NaN) },
  ];
  for (const value of values) {
    expect(jsonTransformer.serialize(value).json).toEqual(roundtrip(value));
  }
  expect(jsonTransformer.serialize(pure).json).toBe(pure);
  const dated: { at: Date } = { at };
  expect(jsonTransformer.serialize(dated).json).not.toBe(dated);
  expect(jsonTransformer.serialize(undefined)).toEqual({});

  const loop: Record<string, unknown> = { a: 1 };
  loop['self'] = loop;
  expect(() => jsonTransformer.serialize(loop)).toThrow(/circular/);
  expect(() => jsonTransformer.serialize({ n: 1n })).toThrow(/BigInt/);
  expect(() =>
    jsonTransformer.serialize({ files: new Map([['f', new Blob(['x'])]]) }),
  ).toThrow(/streaming transformer/);
});

test('ReadableStream outputs arrive as ReadableStreams; unknown stays unknown', async () => {
  type Item = { at: Date; data: unknown };
  expectTypeOf<Deserialized<ReadableStream<Item>>>().toEqualTypeOf<
    ReadableStream<Item>
  >();
  expectTypeOf<Deserialized<{ data: unknown }>>().toEqualTypeOf<{
    data: unknown;
  }>();
  expectTypeOf<JsonOf<{ data: unknown }>>().toEqualTypeOf<{
    data: unknown;
  }>();

  const items = (): ReadableStream<Item> =>
    new ReadableStream({
      start(controller) {
        controller.enqueue({ at, data: { n: 1 } });
        controller.enqueue({ at, data: null });
        controller.close();
      },
    });
  const read = async <T>(stream: ReadableStream<T>) => {
    const out: T[] = [];
    for await (const item of stream as ReadableStream<T> & AsyncIterable<T>)
      out.push(item);
    return out;
  };

  const itemsRouter = t.router({ items: t.procedure.query(items) });
  await using richServer = await createTestServer({
    router: itemsRouter,
    transformer: progressiveJson,
  });
  const richOut = await createTrpcClient({
    router: routerType<typeof itemsRouter>(),
    links: [httpLink({ url: richServer.url, transformer: progressiveJson })],
  }).items.query();
  expectTypeOf(richOut).toEqualTypeOf<ReadableStream<Item>>();
  expect(richOut).toBeInstanceOf(ReadableStream);
  expect(await read(richOut)).toEqual([
    { at, data: { n: 1 } },
    { at, data: null },
  ]);

  await using plainServer = await createTestServer({ router: itemsRouter });
  const plainOut = await createTrpcClient({
    router: routerType<typeof itemsRouter>(),
    links: [httpLink({ url: plainServer.url })],
  }).items.query();
  expectTypeOf(plainOut).toEqualTypeOf<
    ReadableStream<{ at: string; data: unknown }>
  >();
  expect(plainOut).toBeInstanceOf(ReadableStream);
  expect(await read(plainOut)).toEqual([
    { at: at.toISOString(), data: { n: 1 } },
    { at: at.toISOString(), data: null },
  ]);
});

test('no transformer: plain JSON, JSON-form client types, ?input= GET params', async () => {
  await using server = await createTestServer({ router, batch: true });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url })],
  });

  const rich = await client.rich.query({ q: 'hi there' });
  expectTypeOf(rich).toEqualTypeOf<{
    q: string;
    at: string;
    tags: Record<string, never>;
    missing?: string;
  }>();
  expect(rich).toEqual({ q: 'hi there', at: at.toJSON(), tags: {} });
  expect(new URL(server.requests.at(-1)!.url).searchParams.get('input')).toBe(
    '{"q":"hi there"}',
  );

  expect(await client.echo.mutate({ text: 'ok' })).toBe('OK');
  const raw = await fetch(`${server.url}/echo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ json: { text: 'plain' } }),
  });
  expect(await raw.json()).toEqual({ json: 'PLAIN' });

  const count = await client.count.query();
  expectTypeOf(count).toExtend<
    AsyncIterable<{ n: number; at: string }, string>
  >();
  const iterator = count[Symbol.asyncIterator]();
  expect(await iterator.next()).toEqual({
    done: false,
    value: { n: 1, at: at.toJSON() },
  });
  expect(await iterator.next()).toEqual({
    done: false,
    value: { n: 2, at: at.toJSON() },
  });
  expect(await iterator.next()).toEqual({ done: true, value: 'done' });

  const later = await client.later.query();
  expectTypeOf(later).toEqualTypeOf<{ at: string }>();
  expect(later).toEqual({ at: at.toJSON() });

  expectTypeOf(await client.nothing.query()).toEqualTypeOf<undefined>();
  await expect(client.fails.query()).rejects.toMatchObject({
    code: 'NOT_FOUND',
    message: 'nope',
  });

  const ticks = await collect(client.ticks.subscribe());
  expectTypeOf(ticks).toEqualTypeOf<{ at: string }[]>();
  expect(ticks).toEqual([{ at: at.toJSON() }, { at: at.toJSON() }]);

  const batched = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url, batch: true })],
  });
  const [a, b] = await Promise.all([
    batched.rich.query({ q: 'x' }),
    batched.count.query().then(collect),
  ]);
  expect(a.at).toBe(at.toJSON());
  expect(b).toEqual([
    { n: 1, at: at.toJSON() },
    { n: 2, at: at.toJSON() },
  ]);

  await using ws = wsLink({ url: server.wsUrl });
  const overWs = createTrpcClient({
    router: routerType<typeof router>(),
    links: [ws],
  });
  expect(await overWs.rich.query({ q: 'ws' })).toEqual({
    q: 'ws',
    at: at.toJSON(),
    tags: {},
  });
  expect(await collect(overWs.ticks.subscribe())).toEqual([
    { at: at.toJSON() },
    { at: at.toJSON() },
  ]);
  expect(await collect(await overWs.count.query())).toEqual([
    { n: 1, at: at.toJSON() },
    { n: 2, at: at.toJSON() },
  ]);
});

test('error data follows the transformer like outputs', async () => {
  const expiring = t.router({
    expired: t.procedure.query(
      () => new TrpcError({ code: 'EXPIRED', data: { at } }),
    ),
  });
  await using server = await createTestServer({ router: expiring });
  const client = createTrpcClient({
    router: routerType<typeof expiring>(),
    links: [httpLink({ url: server.url })],
  });
  const [, err] = await safe(client.expired.query());
  if (err?.defined && err.code === 'EXPIRED') {
    expectTypeOf(err.data).toEqualTypeOf<{ at: string }>();
  }
  expect(err).toMatchObject({ code: 'EXPIRED', data: { at: at.toJSON() } });

  await using nativeServer = await createTestServer({
    router: expiring,
    transformer: progressiveJson,
  });
  const nativeClient = createTrpcClient({
    router: routerType<typeof expiring>(),
    links: [httpLink({ url: nativeServer.url, transformer: progressiveJson })],
  });
  const [, nativeErr] = await safe(nativeClient.expired.query());
  if (nativeErr?.defined && nativeErr.code === 'EXPIRED') {
    expectTypeOf(nativeErr.data).toEqualTypeOf<{ at: Date }>();
    expect(nativeErr.data.at).toBeInstanceOf(Date);
  }
  expect(nativeErr?.defined).toBe(true);

  const effectClient = createEffectClient({
    router: routerType<typeof expiring>(),
    links: [httpLink({ url: server.url })],
  });
  const effectErr = await Effect.runPromise(
    Effect.flip(effectClient.expired.query()),
  );
  if (effectErr.defined && effectErr.code === 'EXPIRED') {
    expectTypeOf(effectErr.data).toEqualTypeOf<{ at: string }>();
  }
  expect(effectErr).toMatchObject({ data: { at: at.toJSON() } });
  const nativeEffect = createEffectClient({
    router: routerType<typeof expiring>(),
    links: [httpLink({ url: nativeServer.url, transformer: progressiveJson })],
  });
  const nativeEffectErr = await Effect.runPromise(
    Effect.flip(nativeEffect.expired.query()),
  );
  if (nativeEffectErr.defined && nativeEffectErr.code === 'EXPIRED') {
    expectTypeOf(nativeEffectErr.data).toEqualTypeOf<{ at: Date }>();
  }
  expect(nativeEffectErr).toMatchObject({ data: { at } });
});

const superjsonTransformer = createSyncTransformer<
  Date | Map<any, any> | Set<any> | bigint | undefined
>(superjson);

test('a sync transformer (superjson): its types survive, the transport frames root streams', async () => {
  await using server = await createTestServer({
    router,
    transformer: superjsonTransformer,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url, transformer: superjsonTransformer })],
  });
  expect(getClientTransformer(client)).toBe(superjsonTransformer);

  const rich = await client.rich.query({ q: 'x' });
  expectTypeOf(rich).toEqualTypeOf<{
    q: string;
    at: Date;
    tags: Set<string>;
    missing?: string | undefined;
  }>();
  expect(rich.at).toBeInstanceOf(Date);
  expect(rich.tags).toEqual(new Set(['a']));

  const count = await collect(await client.count.query());
  expect(count[0]!.at).toBeInstanceOf(Date);
  expect((await client.later.query()).at).toBeInstanceOf(Date);
  const ticks = await collect(client.ticks.subscribe());
  expect(ticks[1]!.at).toBeInstanceOf(Date);

  // In-process calls pass values by reference, whatever the transformer.
  const caller = createRouterClient(router);
  expectTypeOf((await caller.later.query()).at).toEqualTypeOf<Date>();
});

test('inferRouterOutputs is what a client receives: plain JSON for a router type, its links for a client', async () => {
  const shapes = t.router({
    post: {
      byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => ({
        id: opts.input.id,
        at,
        views: new Map([['ada', 1]]),
        note: undefined as string | undefined,
      })),
    },
  });
  type ServerPost = inferProcedureOutput<typeof shapes.post.byId>;
  expectTypeOf<ServerPost['at']>().toEqualTypeOf<Date>();

  type JsonPost = inferRouterOutputs<typeof shapes>['post']['byId'];
  expectTypeOf<JsonPost>().toEqualTypeOf<{
    id: string;
    at: string;
    views: Record<string, never>;
    note?: string;
  }>();
  expectTypeOf<
    JsonOf<{ n: bigint; list: (number | undefined)[] }>
  >().toEqualTypeOf<{ n: never; list: (number | null)[] }>();

  await using server = await createTestServer({ router: shapes });
  const json = createTrpcClient({
    router: routerType<typeof shapes>(),
    links: [httpLink({ url: server.url })],
  });
  const plain = await json.post.byId.query({ id: '1' });
  expectTypeOf(plain).toEqualTypeOf<JsonPost>();
  expectTypeOf<
    inferRouterOutputs<typeof json>['post']['byId']
  >().toEqualTypeOf<JsonPost>();
  expect(plain).toEqual({ id: '1', at: at.toJSON(), views: {} });

  await using richServer = await createTestServer({
    router: shapes,
    transformer: progressiveJson,
  });
  const makeClient = () =>
    createTrpcClient({
      router: routerType<typeof shapes>(),
      links: [httpLink({ url: richServer.url, transformer: progressiveJson })],
    });
  const rich = await makeClient().post.byId.query({ id: '1' });
  type RichPost = inferRouterOutputs<typeof makeClient>['post']['byId'];
  expectTypeOf(rich).toEqualTypeOf<RichPost>();
  expectTypeOf<RichPost>().toEqualTypeOf<ServerPost>();
  expect(rich.views).toEqual(new Map([['ada', 1]]));

  const sync = createTrpcClient({
    router: routerType<typeof shapes>(),
    links: [httpLink({ url: server.url, transformer: superjsonTransformer })],
  });
  expectTypeOf<
    inferRouterOutputs<typeof sync>['post']['byId']
  >().toEqualTypeOf<{
    id: string;
    at: Date;
    views: Map<string, number>;
    note?: string | undefined;
  }>();

  const caller = createRouterClient(shapes);
  expectTypeOf<
    inferRouterOutputs<typeof caller>['post']['byId']
  >().toEqualTypeOf<ServerPost>();

  expectTypeOf<
    inferRouterInputs<typeof shapes>['post']['byId']
  >().toEqualTypeOf<{ id: string }>();
  expectTypeOf<inferRouterInputs<typeof makeClient>>().toEqualTypeOf<
    inferRouterInputs<typeof shapes>
  >();
});

test('devalue as a sync transformer', async () => {
  const devalueTransformer = createSyncTransformer<
    Date | Map<any, any> | Set<any>
  >({
    serialize: devalue.stringify,
    deserialize: devalue.parse,
  });
  await using server = await createTestServer({
    router,
    transformer: devalueTransformer,
    batch: true,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: server.url,
        transformer: devalueTransformer,
        batch: true,
      }),
    ],
  });
  const [rich, count] = await Promise.all([
    client.rich.query({ q: 'x' }),
    client.count.query().then(collect),
  ]);
  expect(rich.at).toEqual(at);
  expect(count.map((c) => c.at)).toEqual([at, at]);
});

test('nested deferred values stream with every transformer; files in inputs need progressive JSON', async () => {
  const deferred = t.router({
    nested: t.procedure.query(() => ({
      later: Promise.resolve({ at }),
      list: [1, Promise.resolve(2)] as const,
      items: (async function* () {
        yield { at };
      })(),
    })),
    file: t.procedure.input(z.instanceof(Blob).optional()).mutation(() => 'ok'),
  });
  for (const transformer of [undefined, superjsonTransformer]) {
    await using server = await createTestServer({
      router: deferred,
      transformer,
      batch: true,
    });
    for (const batch of [false, true]) {
      const client = createTrpcClient({
        router: routerType<typeof deferred>(),
        links: [httpLink({ url: server.url, transformer, batch })],
      });
      const nested = await client.nested.query();
      expect(await nested.list[1]).toBe(2);
      expect(nested.list[0]).toBe(1);
      const later = await nested.later;
      const items = await collect(nested.items);
      if (transformer) {
        expect(later.at).toEqual(at);
        expect(items).toEqual([{ at }]);
      } else {
        expect(later).toEqual({ at: at.toJSON() });
        expect(items).toEqual([{ at: at.toJSON() }]);
      }
    }
  }

  await using server = await createTestServer({ router: deferred });
  const client = createTrpcClient({
    router: routerType<typeof deferred>(),
    links: [httpLink({ url: server.url })],
  });
  const nested = await client.nested.query();
  expectTypeOf(nested.later).toEqualTypeOf<Promise<{ at: string }>>();
  expectTypeOf(nested.items).toEqualTypeOf<AsyncIterable<{ at: string }>>();
  await expect(client.file.mutate(new Blob(['x']))).rejects.toMatchObject({
    message: expect.stringContaining('streaming transformer'),
  });
});

test("returning a deferred AsyncIterable ends a read that's still waiting for its chunk", async () => {
  const silent: AsyncIterable<never> = {
    [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
  };
  for (const transformer of [
    experimental_createProgressiveJson(),
    jsonTransformer,
  ]) {
    const serialized = transformer.serializeDeferred({ items: silent });
    const value = await Effect.runPromise(
      transformer.deserializeStream<{ items: AsyncIterable<unknown> }, never>(
        Stream.concat(Stream.make(serialized.head), Stream.never),
      ),
    );
    const iterator = value.items[Symbol.asyncIterator]();
    const read = iterator.next();
    await expect(iterator.return?.()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    await expect(read).resolves.toEqual({ done: true, value: undefined });
  }
});

test('a File nested in an input or output fails with the other transformers, before it is sent', async () => {
  const file = new File(['x'], 'a.txt');
  const files = t.router({
    upload: t.procedure.input(z.unknown()).mutation(() => 'ok'),
    report: t.procedure.query(() => ({ name: 'a.txt', file })),
  });
  for (const transformer of [undefined, superjsonTransformer]) {
    await using server = await createTestServer({ router: files, transformer });
    let requests = 0;
    const client = createTrpcClient({
      router: routerType<typeof files>(),
      links: [
        httpLink({
          url: server.url,
          transformer,
          fetch: (input, init) => {
            requests++;
            return fetch(input, init);
          },
        }),
      ],
    });
    for (const input of [
      { photos: [file] },
      new Map([['cover', new Blob(['x'])]]),
      new Set([file]),
    ]) {
      await expect(client.upload.mutate(input)).rejects.toMatchObject({
        message: expect.stringContaining('streaming transformer'),
      });
    }
    expect(requests).toBe(0);
    await expect(client.report.query()).rejects.toBeInstanceOf(TrpcError);
  }

  // Shared and circular references are walked once.
  const shared: { at: Date } = { at };
  const loop: Record<string, unknown> = { a: shared, b: shared };
  loop['self'] = loop;
  expect(superjsonTransformer.serialize(loop).json).toBeDefined();
});
