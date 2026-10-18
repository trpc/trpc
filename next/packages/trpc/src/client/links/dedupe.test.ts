import {
  createTrpcClient,
  dedupeLink,
  httpLink,
  routerType,
} from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import { initTrpc } from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const state = { finished: 0 };

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
    body: new ReadableStream<string>({
      start(controller) {
        controller.enqueue('x');
        controller.enqueue('y');
        controller.close();
      },
    }),
  })),
  price: t.procedure
    .input(z.object({ price: z.instanceof(Money) }))
    .query(async (opts) => {
      await sleep(10);
      return opts.input.price.cents;
    }),
  size: t.procedure
    .input(z.object({ file: z.instanceof(File) }))
    .query(async (opts) => (await opts.input.file.text()).length),
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

test('a ReadableStream in a shared result is copied too', async () => {
  await using ctx = await setup();
  const [a, b] = await Promise.all([
    ctx.client.bytes.query(),
    ctx.client.bytes.query(),
  ]);
  expect(a.body).toBeInstanceOf(ReadableStream);
  const all = async (body: ReadableStream<string>) => {
    const items: string[] = [];
    for await (const item of body) items.push(item);
    return items;
  };
  await expect(Promise.all([all(a.body), all(b.body)])).resolves.toEqual([
    ['x', 'y'],
    ['x', 'y'],
  ]);
  expect(ctx.server.requests).toHaveLength(1);
});
