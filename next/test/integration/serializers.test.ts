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
} from 'trpcdev/client';
import {
  createFetchHandler,
  createRouterClient,
  initTrpc,
  TrpcError,
  type TrpcRoot,
} from 'trpcdev/server';
import {
  createSyncSerializer,
  defaultSerializer,
  jsonSerializer,
  type JsonOf,
  type OutputForm,
} from 'trpcdev/serializer';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from './fixtures/server.ts';

const at = new Date('2026-10-15T00:00:00.000Z');

function makeRouter<F extends OutputForm>(t: TrpcRoot<{}, {}, F>) {
  return {
    rich: t.procedure.input(z.object({ q: z.string() })).query(({ input }) => ({
      q: input.q,
      at,
      tags: new Set(['a']),
      missing: undefined as string | undefined,
    })),
    echo: t.procedure
      .input(z.object({ text: z.string() }))
      .mutation(({ input }) => input.text.toUpperCase()),
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
}

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
    data?: unknown;
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

  const rich = initTrpc();
  const richRouter = { items: rich.procedure.query(items) };
  await using richServer = await createTestServer({ router: richRouter });
  const richOut = await createTrpcClient<typeof richRouter>({
    links: [httpLink({ url: richServer.url })],
  }).items.query();
  expectTypeOf(richOut).toEqualTypeOf<ReadableStream<Item>>();
  expect(richOut).toBeInstanceOf(ReadableStream);
  expect(await read(richOut)).toEqual([
    { at, data: { n: 1 } },
    { at, data: null },
  ]);

  const plain = initTrpc<{ serializer: typeof jsonSerializer }>();
  const plainRouter = { items: plain.procedure.query(items) };
  await using plainServer = await createTestServer({
    router: plainRouter,
    serializer: jsonSerializer,
  });
  const plainOut = await createTrpcClient<typeof plainRouter>({
    links: [httpLink({ url: plainServer.url, serializer: jsonSerializer })],
  }).items.query();
  expectTypeOf(plainOut).toEqualTypeOf<
    ReadableStream<{ at: string; data?: unknown }>
  >();
  expect(plainOut).toBeInstanceOf(ReadableStream);
  expect(await read(plainOut)).toEqual([
    { at: at.toISOString(), data: { n: 1 } },
    { at: at.toISOString(), data: null },
  ]);
});

test('no serializer: plain JSON, JSON-form client types, ?input= GET params', async () => {
  const t = initTrpc<{ serializer: typeof jsonSerializer }>();
  const router = makeRouter(t);
  // @ts-expect-error the router declares jsonSerializer, so the handler must get it
  createFetchHandler({ router });
  // @ts-expect-error and only that serializer
  createFetchHandler({ router, serializer: defaultSerializer });

  await using server = await createTestServer({
    router,
    serializer: jsonSerializer,
    batch: true,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url, serializer: jsonSerializer })],
  });

  const rich = await client.rich.query({ q: 'hi there' });
  expectTypeOf(rich).toEqualTypeOf<{
    q: string;
    at: string;
    tags: Record<string, never>;
    missing?: string;
  }>();
  expect(rich).toEqual({ q: 'hi there', at: at.toJSON(), tags: {} });
  expect(server.requests.at(-1)!.url).toContain(
    `?input=${encodeURIComponent('{"q":"hi there"}')}`,
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
    links: [
      httpLink({ url: server.url, serializer: jsonSerializer, batch: true }),
    ],
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

  await using ws = wsLink({ url: server.wsUrl, serializer: jsonSerializer });
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
  const expired = <F extends OutputForm>(t: TrpcRoot<{}, {}, F>) => ({
    expired: t.procedure.query(
      () => new TrpcError({ code: 'EXPIRED', status: 410, data: { at } }),
    ),
  });
  const plain = expired(initTrpc<{ serializer: typeof jsonSerializer }>());
  await using server = await createTestServer({
    router: plain,
    serializer: jsonSerializer,
  });
  const client = createTrpcClient({
    router: routerType<typeof plain>(),
    links: [httpLink({ url: server.url, serializer: jsonSerializer })],
  });
  const [, err] = await safe(client.expired.query());
  if (err?.defined && err.code === 'EXPIRED') {
    expectTypeOf(err.data).toEqualTypeOf<{ at: string }>();
  }
  expect(err).toMatchObject({ code: 'EXPIRED', data: { at: at.toJSON() } });

  const native = expired(initTrpc());
  await using danson = await createTestServer({ router: native });
  const nativeClient = createTrpcClient({
    router: routerType<typeof native>(),
    links: [httpLink({ url: danson.url })],
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
  const t = initTrpc<{ serializer: typeof superjsonSerializer }>();
  const router = makeRouter(t);
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
  const t = initTrpc<{ serializer: typeof devalueSerializer }>();
  const router = makeRouter(t);
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

test('sync serializers reject what needs a streaming one', async () => {
  const t = initTrpc<{ serializer: typeof jsonSerializer }>();
  const router = {
    nested: t.procedure.query(() => ({ later: Promise.resolve(1) })),
    file: t.procedure.input(z.instanceof(Blob).optional()).mutation(() => 'ok'),
  };
  await using server = await createTestServer({
    router,
    serializer: jsonSerializer,
    batch: true,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url, serializer: jsonSerializer })],
  });
  expectTypeOf((await client.nested.query()).later).toEqualTypeOf<
    Record<string, never>
  >();
  await expect(client.file.mutate(new Blob(['x']))).rejects.toMatchObject({
    message: expect.stringContaining('streaming serializer'),
  });
});
