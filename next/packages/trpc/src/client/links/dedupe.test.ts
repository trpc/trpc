import { Effect, Stream } from 'effect';
import {
  createTrpcClient,
  dedupeLink,
  httpLink,
  link,
  routerType,
} from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import { error, initTrpc, tracked } from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const state = { finished: 0, stopped: 0 };
const calls = new Map<string, number>();

class Money {
  readonly cents: number;
  constructor(cents: number) {
    this.cents = cents;
  }
}
const serializer = createSerializer({
  types: {
    Money: {
      is: (v): v is Money => v instanceof Money,
      serialize: (v: Money) => v.cents,
      deserialize: (v) => new Money(v as number),
    },
  },
});

async function* letters() {
  try {
    for (const letter of ['a', 'b', 'c']) {
      await sleep(5);
      yield letter;
    }
    return 'end';
  } finally {
    state.finished++;
  }
}

const router = {
  echo: t.procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .query(async (opts) => {
      await sleep(10);
      return opts.input;
    }),
  slow: t.procedure.query(async () => {
    await sleep(10);
    return 'ok';
  }),
  feed: t.procedure.query(() => ({ title: 'Feed', feed: letters() })),
  ticks: t.procedure.query(() => ({
    ticks: (async function* () {
      try {
        for (let n = 0; ; n++) {
          await sleep(5);
          yield n;
        }
      } finally {
        state.finished++;
      }
    })(),
  })),
  bytes: t.procedure.query(() => ({
    meta: { n: 1 },
    parts: [
      new ReadableStream<string>({
        start(controller) {
          controller.enqueue('x');
          controller.enqueue('y');
          controller.close();
        },
      }),
    ],
  })),
  broken: t.procedure.query(() => ({
    feed: (async function* () {
      yield 'a';
      await sleep(5);
      throw error({ code: 'CONFLICT', message: 'broke' });
    })(),
  })),
  again: t.procedure
    .input(z.object({ next: z.enum(['fail', 'plain']) }))
    .query((opts) => {
      const n = (calls.get(opts.input.next) ?? 0) + 1;
      calls.set(opts.input.next, n);
      if (n === 1) return { feed: letters() };
      if (opts.input.next === 'fail') {
        return error({ code: 'NOT_FOUND', message: 'gone' });
      }
      return null;
    }),
  loop: t.procedure.query(() => {
    const node: { n: number; self?: unknown } = { n: 1 };
    node.self = node;
    return { node, feed: letters() };
  }),
  price: t.procedure
    .input(z.object({ price: z.instanceof(Money) }))
    .query(async (opts) => {
      await sleep(10);
      return opts.input.price.cents;
    }),
  size: t.procedure
    .input(z.object({ file: z.instanceof(File) }))
    .query(async (opts) => (await opts.input.file.text()).length),
  events: t.procedure
    .input(z.object({ room: z.string() }))
    .subscription(async function* (opts) {
      const start = opts.lastEventId ? Number(opts.lastEventId) + 1 : 1;
      for (let id = start; id <= 3; id++) {
        await sleep(10);
        yield tracked(String(id), `${opts.input.room} ${id}`);
      }
    }),
  forever: t.procedure.subscription(async function* () {
    try {
      for (let n = 0; ; n++) {
        await sleep(5);
        yield n;
      }
    } finally {
      state.stopped++;
    }
  }),
  refused: t.procedure.subscription(async function* () {
    await sleep(10);
    yield* [];
    throw error({ code: 'CONFLICT', message: 'refused' });
  }),
  feeds: t.procedure.subscription(async function* () {
    await sleep(10);
    yield { feed: letters() };
  }),
};
type AppRouter = typeof router;

async function setup() {
  const server = await createTestServer({ router, serializer });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [dedupeLink(), httpLink({ url: server.url, serializer })],
  });
  return { server, client, [Symbol.asyncDispose]: () => server.close() };
}

async function read<T>(iterable: AsyncIterable<T, unknown>) {
  const items: unknown[] = [];
  const iterator = iterable[Symbol.asyncIterator]();
  while (true) {
    const next = await iterator.next();
    if (next.done) return { items, returned: next.value };
    items.push(next.value);
  }
}

test('inputs equal in any key order share a request', async () => {
  await using ctx = await setup();
  const [a, b] = await Promise.all([
    ctx.client.echo.query({ a: 1, b: 2 }),
    ctx.client.echo.query({ b: 2, a: 1 }),
  ]);
  expect(a).toBe(b);
  expect(ctx.server.requests).toHaveLength(1);
});

test('calls with different headers are sent apart; the same headers in another form are shared', async () => {
  await using ctx = await setup();
  await Promise.all([
    ctx.client.slow.query(undefined, { headers: { 'x-locale': 'sv' } }),
    ctx.client.slow.query(undefined, { headers: { 'x-locale': 'en' } }),
  ]);
  expect(
    new Set(ctx.server.requests.map((r) => r.headers.get('x-locale'))),
  ).toEqual(new Set(['en', 'sv']));

  await Promise.all([
    ctx.client.slow.query(undefined, { headers: { 'X-Locale': 'sv' } }),
    ctx.client.slow.query(undefined, {
      headers: new Headers([['x-locale', 'sv']]),
    }),
  ]);
  expect(ctx.server.requests).toHaveLength(3);
});

test('every caller gets onResponse, and one that throws fails only its own call', async () => {
  await using ctx = await setup();
  const seen: string[] = [];
  const results = await Promise.allSettled([
    ctx.client.slow.query(undefined, {
      onResponse: (meta) => void seen.push(`a ${meta.status}`),
    }),
    ctx.client.slow.query(undefined, {
      onResponse: () => {
        throw new Error('nope');
      },
    }),
    ctx.client.slow.query(undefined, {
      onResponse: (meta) => void seen.push(`c ${meta.status}`),
    }),
  ]);
  expect(seen.sort()).toEqual(['a 200', 'c 200']);
  expect(results.map((r) => r.status)).toEqual([
    'fulfilled',
    'rejected',
    'fulfilled',
  ]);
  expect(ctx.server.requests).toHaveLength(1);
});

test('inputs the default serializer can not write, a File or a custom type, still work', async () => {
  await using ctx = await setup();
  const file = new File(['abc'], 'a.txt');
  await expect(
    Promise.all([
      ctx.client.size.query({ file }),
      ctx.client.size.query({ file }),
    ]),
  ).resolves.toEqual([3, 3]);
  expect(ctx.server.requests).toHaveLength(1);

  const price = new Money(5);
  await expect(
    Promise.all([
      ctx.client.price.query({ price }),
      ctx.client.price.query({ price }),
      ctx.client.price.query({ price: new Money(5) }),
    ]),
  ).resolves.toEqual([5, 5, 5]);
  expect(ctx.server.requests).toHaveLength(3);
});

test('a stream in a shared result is copied to each reader', async () => {
  await using ctx = await setup();
  const before = state.finished;
  const [a, b] = await Promise.all([
    ctx.client.feed.query(),
    ctx.client.feed.query(),
  ]);
  expect(a.title).toBe('Feed');
  expect(a.feed).not.toBe(b.feed);
  const [readA, readB] = await Promise.all([read(a.feed), read(b.feed)]);
  expect(readA).toEqual({ items: ['a', 'b', 'c'], returned: 'end' });
  expect(readB).toEqual({ items: ['a', 'b', 'c'], returned: 'end' });
  expect(ctx.server.requests).toHaveLength(1);
  await vi.waitFor(() => expect(state.finished).toBe(before + 1));
});

test('a reader that stops leaves the others reading', async () => {
  await using ctx = await setup();
  const [a, b] = await Promise.all([
    ctx.client.feed.query(),
    ctx.client.feed.query(),
  ]);
  const iteratorA = a.feed[Symbol.asyncIterator]();
  const iteratorB = b.feed[Symbol.asyncIterator]();
  expect(await iteratorA.next()).toEqual({ done: false, value: 'a' });
  await iteratorA.return?.();
  const rest: unknown[] = [];
  for (
    let next = await iteratorB.next();
    !next.done;
    next = await iteratorB.next()
  ) {
    rest.push(next.value);
  }
  expect(rest).toEqual(['a', 'b', 'c']);
  expect(ctx.server.requests).toHaveLength(1);
});

test('a reader that starts after items were read sends the query again for its own stream', async () => {
  await using ctx = await setup();
  const [a, b] = await Promise.all([
    ctx.client.feed.query(),
    ctx.client.feed.query(),
  ]);
  expect((await read(a.feed)).items).toEqual(['a', 'b', 'c']);
  expect(ctx.server.requests).toHaveLength(1);
  expect(await read(b.feed)).toEqual({
    items: ['a', 'b', 'c'],
    returned: 'end',
  });
  expect(ctx.server.requests).toHaveLength(2);
});

test('a reader whose signal aborts ends; once every caller has aborted, so does the request', async () => {
  await using ctx = await setup();
  const before = state.finished;
  const first = new AbortController();
  const second = new AbortController();
  const [a, b] = await Promise.all([
    ctx.client.ticks.query(undefined, { signal: first.signal }),
    ctx.client.ticks.query(undefined, { signal: second.signal }),
  ]);
  const iteratorA = a.ticks[Symbol.asyncIterator]();
  const iteratorB = b.ticks[Symbol.asyncIterator]();
  expect(await iteratorA.next()).toEqual({ done: false, value: 0 });
  first.abort();
  expect(await iteratorA.next()).toMatchObject({ done: true });
  expect(await iteratorB.next()).toEqual({ done: false, value: 0 });
  expect(state.finished).toBe(before);
  second.abort();
  await vi.waitFor(() => expect(state.finished).toBe(before + 1));
});

test('a stream no caller reads is cancelled once every caller has aborted', async () => {
  await using ctx = await setup();
  const before = state.finished;
  const first = new AbortController();
  const second = new AbortController();
  await Promise.all([
    ctx.client.ticks.query(undefined, { signal: first.signal }),
    ctx.client.ticks.query(undefined, { signal: second.signal }),
  ]);
  first.abort();
  await sleep(20);
  expect(state.finished).toBe(before);
  second.abort();
  await vi.waitFor(() => expect(state.finished).toBe(before + 1));
});

test('a ReadableStream in a shared result is copied too, and each caller can cancel its own', async () => {
  await using ctx = await setup();
  const [a, b, c] = await Promise.all([
    ctx.client.bytes.query(),
    ctx.client.bytes.query(),
    ctx.client.bytes.query(),
  ]);
  expect(a.meta).toBe(b.meta);
  const [bodyA, bodyB, bodyC] = [a.parts[0]!, b.parts[0]!, c.parts[0]!];
  expect(bodyA).toBeInstanceOf(ReadableStream);
  expect(bodyA).not.toBe(bodyB);
  await bodyC.cancel();
  const readerB = bodyB.getReader();
  const all = async (body: ReadableStream<string>) => {
    const items: string[] = [];
    for await (const item of body) items.push(item);
    return items;
  };
  const [itemsA, firstB] = await Promise.all([all(bodyA), readerB.read()]);
  expect(itemsA).toEqual(['x', 'y']);
  expect(firstB).toEqual({ done: false, value: 'x' });
  await readerB.cancel();
  expect(ctx.server.requests).toHaveLength(1);
});

test('init, batch and other call options must match too', async () => {
  await using ctx = await setup();
  await Promise.all([
    ctx.client.slow.query(undefined, { init: { headers: { 'x-a': '1' } } }),
    ctx.client.slow.query(undefined, {
      init: { headers: new Headers({ 'X-A': '1' }) },
    }),
  ]);
  expect(ctx.server.requests).toHaveLength(1);
  await Promise.all([
    ctx.client.slow.query(undefined, { init: { redirect: 'error' } }),
    ctx.client.slow.query(),
    ctx.client.slow.query(undefined, { batch: false }),
  ]);
  expect(ctx.server.requests).toHaveLength(4);
});

test('key(op) groups calls by its string instead of their inputs', async () => {
  await using server = await createTestServer({ router, serializer });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      dedupeLink({ key: (op) => op.path }),
      httpLink({ url: server.url, serializer }),
    ],
  });
  const [a, b] = await Promise.all([
    client.echo.query({ a: 1, b: 2 }),
    client.echo.query({ a: 3, b: 4 }),
  ]);
  expect(b).toBe(a);
  expect(server.requests).toHaveLength(1);
});

test('a caller that joins after the response arrived still gets onResponse', async () => {
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      dedupeLink(),
      link((args) =>
        Stream.fromEffect(
          Effect.gen(function* () {
            args.op.context.onResponse?.({
              status: 203,
              headers: new Headers(),
            });
            yield* Effect.sleep(20);
            return 'late';
          }),
        ),
      ),
    ],
  });
  const statuses: number[] = [];
  const first = client.slow.query();
  await sleep(5);
  const second = client.slow.query(undefined, {
    onResponse: (meta) => void statuses.push(meta.status),
  });
  await expect(Promise.all([first, second])).resolves.toEqual(['late', 'late']);
  expect(statuses).toEqual([203]);
});

test('a failing stream fails every reader', async () => {
  await using ctx = await setup();
  const [a, b] = await Promise.all([
    ctx.client.broken.query(),
    ctx.client.broken.query(),
  ]);
  const results = await Promise.allSettled([read(a.feed), read(b.feed)]);
  expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
  expect(results[0]).toMatchObject({ reason: { code: 'CONFLICT' } });
  expect(results[1]).toMatchObject({ reason: { code: 'CONFLICT' } });
});

test('a late reader can stop early, and fails when its own query fails or has no stream', async () => {
  await using ctx = await setup();
  const [a, b, c] = await Promise.all([
    ctx.client.feed.query(),
    ctx.client.feed.query(),
    ctx.client.feed.query(),
  ]);
  await read(a.feed);
  for await (const letter of b.feed) {
    expect(letter).toBe('a');
    break;
  }
  expect(await c.feed[Symbol.asyncIterator]().return?.()).toEqual({
    done: true,
    value: undefined,
  });
  expect(ctx.server.requests).toHaveLength(2);

  const failing = await Promise.all([
    ctx.client.again.query({ next: 'fail' }),
    ctx.client.again.query({ next: 'fail' }),
  ]);
  await read(failing[0]!.feed);
  await expect(read(failing[1]!.feed)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });

  const plain = await Promise.all([
    ctx.client.again.query({ next: 'plain' }),
    ctx.client.again.query({ next: 'plain' }),
  ]);
  await read(plain[0]!.feed);
  await expect(read(plain[1]!.feed)).rejects.toMatchObject({
    code: 'CLIENT_ERROR',
  });
});

test('a caller whose signal aborted before it reads gets nothing; the others still read', async () => {
  await using ctx = await setup();
  const controller = new AbortController();
  const [a, b] = await Promise.all([
    ctx.client.feed.query(undefined, { signal: controller.signal }),
    ctx.client.feed.query(),
  ]);
  controller.abort();
  expect((await read(a.feed)).items).toEqual([]);
  expect((await read(b.feed)).items).toEqual(['a', 'b', 'c']);
});

test('a cyclic result with a stream is copied without looping', async () => {
  await using ctx = await setup();
  const [a, b] = await Promise.all([
    ctx.client.loop.query(),
    ctx.client.loop.query(),
  ]);
  expect(a.node.self).toBe(a.node);
  expect(b.node).toBe(a.node);
  expect((await read(a.feed)).items).toEqual(['a', 'b', 'c']);
  expect((await read(b.feed)).items).toEqual(['a', 'b', 'c']);
});

const sent = (requests: ReadonlyArray<{ url: string }>, path: string) =>
  requests.filter((r) => new URL(r.url).pathname.endsWith(`/${path}`)).length;

async function collectAll<T>(iterable: AsyncIterable<T>) {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

test('identical subscriptions share one until its first event, and each gets every event', async () => {
  await using ctx = await setup();
  const [a, b, other, resumed] = await Promise.all([
    collectAll(ctx.client.events.subscribe({ room: 'x' })),
    collectAll(ctx.client.events.subscribe({ room: 'x' })),
    collectAll(ctx.client.events.subscribe({ room: 'y' })),
    collectAll(
      ctx.client.events.subscribe({ room: 'x' }, { lastEventId: '1' }),
    ),
  ]);
  expect(a.map((e) => e.data)).toEqual(['x 1', 'x 2', 'x 3']);
  expect(b).toEqual(a);
  expect(other.map((e) => e.data)).toEqual(['y 1', 'y 2', 'y 3']);
  expect(resumed.map((e) => e.data)).toEqual(['x 2', 'x 3']);
  expect(sent(ctx.server.requests, 'events')).toBe(3);
});

test('a subscription made after the first event subscribes on its own', async () => {
  await using ctx = await setup();
  const first = ctx.client.events
    .subscribe({ room: 'x' })
    [Symbol.asyncIterator]();
  expect((await first.next()).value).toMatchObject({ data: 'x 1' });
  const later = collectAll(ctx.client.events.subscribe({ room: 'x' }));
  const rest = collectAll({ [Symbol.asyncIterator]: () => first });
  expect((await later).map((e) => e.data)).toEqual(['x 1', 'x 2', 'x 3']);
  expect((await rest).map((e) => e.data)).toEqual(['x 2', 'x 3']);
  expect(sent(ctx.server.requests, 'events')).toBe(2);
});

test('a subscriber that stops leaves the others; once every one has, the subscription stops', async () => {
  await using ctx = await setup();
  const before = state.stopped;
  const controller = new AbortController();
  const a = ctx.client.forever.subscribe(undefined, {
    signal: controller.signal,
  });
  const b = ctx.client.forever.subscribe()[Symbol.asyncIterator]();
  const c = ctx.client.forever.subscribe()[Symbol.asyncIterator]();
  const seenA: number[] = [];
  const readA = (async () => {
    for await (const n of a) seenA.push(n);
  })();
  expect(await Promise.all([b.next(), c.next()])).toEqual([
    { done: false, value: 0 },
    { done: false, value: 0 },
  ]);
  await c.return?.();
  controller.abort();
  await readA;
  expect(await b.next()).toEqual({ done: false, value: 1 });
  expect(state.stopped).toBe(before);
  await b.return?.();
  await vi.waitFor(() => expect(state.stopped).toBe(before + 1));
  expect(sent(ctx.server.requests, 'forever')).toBe(1);
});

test('a failing subscription fails every subscriber', async () => {
  await using ctx = await setup();
  const results = await Promise.allSettled([
    collectAll(ctx.client.refused.subscribe()),
    collectAll(ctx.client.refused.subscribe()),
  ]);
  expect(results).toMatchObject([
    { status: 'rejected', reason: { code: 'CONFLICT' } },
    { status: 'rejected', reason: { code: 'CONFLICT' } },
  ]);
  expect(sent(ctx.server.requests, 'refused')).toBe(1);
});

test('a stream in a shared event is copied to each subscriber', async () => {
  await using ctx = await setup();
  const controller = new AbortController();
  const [[a], [b]] = await Promise.all([
    collectAll(ctx.client.feeds.subscribe()),
    collectAll(ctx.client.feeds.subscribe()),
    collectAll(
      ctx.client.feeds.subscribe(undefined, { signal: controller.signal }),
    ),
  ]);
  controller.abort();
  expect((await read(a!.feed)).items).toEqual(['a', 'b', 'c']);
  expect((await read(b!.feed)).items).toEqual(['a', 'b', 'c']);
  expect(sent(ctx.server.requests, 'feeds')).toBe(1);
});

test('subscribers get onResponse, including one that joins after the response; one that throws fails alone', async () => {
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      dedupeLink(),
      link((args) =>
        Stream.unwrap(
          Effect.sync(() => {
            args.op.context.onResponse?.({
              status: 203,
              headers: new Headers(),
            });
            return Stream.fromEffect(Effect.as(Effect.sleep(20), 7));
          }),
        ),
      ),
    ],
  });
  const statuses: string[] = [];
  const first = collectAll(
    client.forever.subscribe(undefined, {
      onResponse: (meta) => void statuses.push(`a ${meta.status}`),
    }),
  );
  await sleep(5);
  const results = await Promise.allSettled([
    first,
    collectAll(
      client.forever.subscribe(undefined, {
        onResponse: (meta) => void statuses.push(`b ${meta.status}`),
      }),
    ),
    collectAll(
      client.forever.subscribe(undefined, {
        onResponse: () => {
          throw new Error('nope');
        },
      }),
    ),
  ]);
  expect(statuses).toEqual(['a 203', 'b 203']);
  expect(results).toMatchObject([
    { status: 'fulfilled', value: [7] },
    { status: 'fulfilled', value: [7] },
    { status: 'rejected', reason: { code: 'CLIENT_ERROR', message: 'nope' } },
  ]);

  await expect(
    collectAll(
      client.forever.subscribe(undefined, {
        onResponse: () => {
          throw new Error('alone');
        },
      }),
    ),
  ).rejects.toMatchObject({ message: 'alone' });
});

test('dedupe: false and key(op) apply to subscriptions too', async () => {
  await using server = await createTestServer({ router, serializer });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      dedupeLink({ key: (op) => op.path }),
      httpLink({ url: server.url, serializer }),
    ],
  });
  const [a, b, c] = await Promise.all([
    collectAll(client.events.subscribe({ room: 'x' })),
    collectAll(client.events.subscribe({ room: 'y' })),
    collectAll(client.events.subscribe({ room: 'y' }, { dedupe: false })),
  ]);
  expect(b).toEqual(a);
  expect(c.map((e) => e.data)).toEqual(['y 1', 'y 2', 'y 3']);
  expect(sent(server.requests, 'events')).toBe(2);
});
