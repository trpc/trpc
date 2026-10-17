import * as devalue from 'devalue';
import superjson from 'superjson';
import {
  createTrpcClient,
  getClientSerializer,
  httpLink,
  routerType,
  safe,
  wsLink,
  type Deserialized,
} from '@trpc12/trpc/client';
import { createRouterClient, initTrpc, TrpcError } from '@trpc12/trpc/server';
import {
  createSerializer,
  createSyncSerializer,
  type JsonOf,
} from '@trpc12/trpc/serializer';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../fixtures/server.ts';

const at = new Date('2026-10-15T00:00:00.000Z');
const danson = createSerializer();
const t = initTrpc();

/** The router doesn't name a serializer: the handler and the links do. */
const router = {
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
};

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

  const itemsRouter = { items: t.procedure.query(items) };
  await using richServer = await createTestServer({
    router: itemsRouter,
    serializer: danson,
  });
  const richOut = await createTrpcClient({
    router: routerType<typeof itemsRouter>(),
    links: [httpLink({ url: richServer.url, serializer: danson })],
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

test('no serializer: plain JSON, JSON-form client types, ?input= GET params', async () => {
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
  expectTypeOf(count).toEqualTypeOf<
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

test('error data follows the serializer like outputs', async () => {
  const expiring = {
    expired: t.procedure.query(
      () => new TrpcError({ code: 'EXPIRED', data: { at } }),
    ),
  };
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
    serializer: danson,
  });
  const nativeClient = createTrpcClient({
    router: routerType<typeof expiring>(),
    links: [httpLink({ url: nativeServer.url, serializer: danson })],
  });
  const [, nativeErr] = await safe(nativeClient.expired.query());
  if (nativeErr?.defined && nativeErr.code === 'EXPIRED') {
    expectTypeOf(nativeErr.data).toEqualTypeOf<{ at: Date }>();
    expect(nativeErr.data.at).toBeInstanceOf(Date);
  }
  expect(nativeErr?.defined).toBe(true);
});

const superjsonSerializer = createSyncSerializer<
  Date | Map<any, any> | Set<any> | bigint | undefined
>(superjson);

test('a sync serializer (superjson): its types survive, the transport frames root streams', async () => {
  await using server = await createTestServer({
    router,
    serializer: superjsonSerializer,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url, serializer: superjsonSerializer })],
  });
  expect(getClientSerializer(client)).toBe(superjsonSerializer);

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

  // In-process calls pass values by reference, whatever the serializer.
  const caller = createRouterClient(router);
  expectTypeOf((await caller.later.query()).at).toEqualTypeOf<Date>();
});

test('devalue as a sync transformer', async () => {
  const devalueSerializer = createSyncSerializer<
    Date | Map<any, any> | Set<any>
  >({
    serialize: devalue.stringify,
    deserialize: devalue.parse,
  });
  await using server = await createTestServer({
    router,
    serializer: devalueSerializer,
    batch: true,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({ url: server.url, serializer: devalueSerializer, batch: true }),
    ],
  });
  const [rich, count] = await Promise.all([
    client.rich.query({ q: 'x' }),
    client.count.query().then(collect),
  ]);
  expect(rich.at).toEqual(at);
  expect(count.map((c) => c.at)).toEqual([at, at]);
});

test('nested deferred values stream with every serializer; files in inputs need danSON', async () => {
  const deferred = {
    nested: t.procedure.query(() => ({
      later: Promise.resolve({ at }),
      list: [1, Promise.resolve(2)] as const,
      items: (async function* () {
        yield { at };
      })(),
    })),
    file: t.procedure.input(z.instanceof(Blob).optional()).mutation(() => 'ok'),
  };
  for (const serializer of [undefined, superjsonSerializer]) {
    await using server = await createTestServer({
      router: deferred,
      serializer,
      batch: true,
    });
    for (const batch of [false, true]) {
      const client = createTrpcClient({
        router: routerType<typeof deferred>(),
        links: [httpLink({ url: server.url, serializer, batch })],
      });
      const nested = await client.nested.query();
      expect(await nested.list[1]).toBe(2);
      expect(nested.list[0]).toBe(1);
      const later = await nested.later;
      const items = await collect(nested.items);
      if (serializer) {
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
    message: expect.stringContaining('streaming serializer'),
  });
});
