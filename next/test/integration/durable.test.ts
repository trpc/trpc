import { Effect, Layer, Schema } from 'effect';
import { Persistence } from 'effect/persistence';
import {
  createTrpcClient,
  experimental_durableLink,
  httpLink,
  safe,
} from '@trpc12/trpc/client';
import { experimental_durable } from '@trpc12/trpc/middleware';
import { createOpenApiHandler } from '@trpc12/trpc/openapi';
import {
  call,
  createFetchHandler,
  initTrpc,
  TrpcError,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { createTestServer } from './fixtures/server.ts';

const t = initTrpc();
class OutOfStock extends TrpcError.Tagged('OUT_OF_STOCK', {
  status: 409,
  data: Schema.Struct({ sku: Schema.String }),
}) {}

const makeRouter = () => {
  const runs = { order: 0, fail: 0, slow: 0 };
  const router = {
    order: t.procedure
      .input(Schema.Struct({ sku: Schema.String }))
      .use(experimental_durable())
      .mutation(({ input }) => {
        runs.order++;
        if (input.sku === 'gone') return new OutOfStock({ sku: input.sku });
        return { id: runs.order, sku: input.sku, at: new Date(0) };
      }),
    fail: t.procedure.use(experimental_durable()).mutation(() => {
      runs.fail++;
      throw new Error('boom');
    }),
    slow: t.procedure.use(experimental_durable()).mutation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return ++runs.slow;
    }),
  };
  return { router, runs };
};

const post = (
  handler: { fetch: (r: Request) => Promise<Response> },
  path: string,
  input: unknown,
  callId?: string,
  signal?: AbortSignal,
) =>
  handler.fetch(
    new Request(`http://localhost/trpc/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(callId ? { 'trpc-call-id': callId } : {}),
      },
      body: JSON.stringify({ json: input }),
      signal,
    }),
  );

test('a call id runs the mutation once; calling again returns the kept result', async () => {
  const { router, runs } = makeRouter();
  const handler = createFetchHandler({
    router,
    layer: Persistence.layerBackingMemory,
  });
  const first = await (await post(handler, 'order', { sku: 'a' }, 'c1')).json();
  const again = await (await post(handler, 'order', { sku: 'a' }, 'c1')).json();
  expect(again).toEqual(first);
  expect(runs.order).toBe(1);

  await post(handler, 'order', { sku: 'a' }, 'c2');
  await post(handler, 'order', { sku: 'a' });
  await post(handler, 'order', { sku: 'a' });
  expect(runs.order).toBe(4);
  await handler.dispose();
});

test('the same id with another input is a CONFLICT; a bad id is a BAD_REQUEST', async () => {
  const { router } = makeRouter();
  const handler = createFetchHandler({
    router,
    layer: Persistence.layerBackingMemory,
  });
  await post(handler, 'order', { sku: 'a' }, 'c1');
  const conflict = await post(handler, 'order', { sku: 'b' }, 'c1');
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({
    json: { error: { code: 'CONFLICT' } },
  });
  expect((await post(handler, 'order', { sku: 'a' }, 'bad id\n')).status).toBe(
    400,
  );
  await handler.dispose();
});

test('typed errors are kept, unexpected ones run again', async () => {
  const { router, runs } = makeRouter();
  const handler = createFetchHandler({
    router,
    layer: Persistence.layerBackingMemory,
  });
  for (let i = 0; i < 2; i++) {
    const res = await post(handler, 'order', { sku: 'gone' }, 'c1');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      json: {
        error: { code: 'OUT_OF_STOCK', data: { sku: 'gone' }, defined: true },
      },
    });
  }
  expect(runs.order).toBe(1);

  expect((await post(handler, 'fail', undefined, 'f1')).status).toBe(500);
  expect((await post(handler, 'fail', undefined, 'f1')).status).toBe(500);
  expect(runs.fail).toBe(2);
  await handler.dispose();
});

test('a dropped request keeps running; the retry joins it', async () => {
  const { router, runs } = makeRouter();
  const handler = createFetchHandler({
    router,
    layer: Persistence.layerBackingMemory,
  });
  const controller = new AbortController();
  const dropped = post(handler, 'slow', undefined, 's1', controller.signal);
  await new Promise((r) => setTimeout(r, 10));
  controller.abort();
  await dropped.catch(() => {});

  const retried = await post(handler, 'slow', undefined, 's1');
  expect(await retried.json()).toEqual({ json: 1 });
  expect(runs.slow).toBe(1);
  await handler.dispose();
});

test('instances sharing a store wait for the one running the call', async () => {
  const { router, runs } = makeRouter();
  const shared = await Effect.runPromise(
    Effect.service(Persistence.BackingPersistence).pipe(
      Effect.provide(Persistence.layerBackingMemory),
    ),
  );
  const instance = () =>
    createFetchHandler({
      router,
      layer: Layer.succeed(Persistence.BackingPersistence, {
        make: (id) => shared.make(id),
      }),
    });
  const [a, b] = [instance(), instance()];
  const first = post(a, 'slow', undefined, 'x1');
  await new Promise((r) => setTimeout(r, 10));
  const second = post(b, 'slow', undefined, 'x1');
  expect(await (await second).json()).toEqual({ json: 1 });
  expect(await (await first).json()).toEqual({ json: 1 });
  expect(runs.slow).toBe(1);
  await a.dispose();
  await b.dispose();
});

test('experimental_durableLink retries a lost response with the same id', async () => {
  const { router, runs } = makeRouter();
  await using http = await createTestServer({
    router,
    layer: Persistence.layerBackingMemory,
  });
  const sent: Array<{ callId: string | null; batch: string | null }> = [];
  let drop = true;
  const client = createTrpcClient({
    router,
    links: [
      experimental_durableLink({ delayMs: () => 0 }),
      httpLink({
        url: http.url,
        batch: true,
        fetch: async (url, init) => {
          const headers = new Headers(init?.headers);
          sent.push({
            callId: headers.get('trpc-call-id'),
            batch: headers.get('trpc-batch'),
          });
          const res = await fetch(url, init);
          if (drop) {
            drop = false;
            throw new TypeError('fetch failed');
          }
          return res;
        },
      }),
    ],
  });
  const order = await client.order.mutate({ sku: 'a' });
  expect(order).toEqual({ id: 1, sku: 'a', at: new Date(0).toJSON() });
  expect(runs.order).toBe(1);
  expect(sent).toHaveLength(2);
  expect(sent[0]!.callId).toMatch(/^[\w-]{36}$/);
  expect(sent[1]!.callId).toBe(sent[0]!.callId);
  expect(sent[0]!.batch).toBeNull();

  await client.order.mutate({ sku: 'b' }, { callId: 'kept' });
  await client.order.mutate({ sku: 'b' }, { callId: 'kept' });
  expect(runs.order).toBe(2);

  const [, err] = await safe(client.order.mutate({ sku: 'gone' }));
  expect(err).toMatchObject({ code: 'OUT_OF_STOCK' });
});

test('a call id is kept over REST too', async () => {
  const { router, runs } = makeRouter();
  const handler = createOpenApiHandler({
    router,
    layer: Persistence.layerBackingMemory,
  });
  const call = () =>
    handler.fetch(
      new Request('http://localhost/api/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'trpc-call-id': 'r1' },
        body: JSON.stringify({ sku: 'a' }),
      }),
    );
  const first = await (await call()).json();
  expect(await (await call()).json()).toEqual(first);
  expect(runs.order).toBe(1);
  await handler.dispose();
});

test('experimental_durable() requires BackingPersistence', () => {
  const { router } = makeRouter();
  expectTypeOf<
    Parameters<typeof createFetchHandler<typeof router>>[0]['layer']
  >().toEqualTypeOf<Layer.Layer<Persistence.BackingPersistence, any, never>>();
  // @ts-expect-error -- BackingPersistence is required
  createFetchHandler({ router });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A feed whose items stream slowly, each with a deferred author. */
const makeFeed = () => {
  const runs = { feed: 0 };
  const router = {
    feed: t.procedure.use(experimental_durable()).mutation(() => {
      runs.feed++;
      return {
        title: 'Feed',
        items: (async function* () {
          for (let id = 1; id <= 4; id++) {
            await sleep(10);
            yield {
              id,
              author: sleep(5).then(() => (id % 2 ? 'ada' : 'grace')),
            };
          }
        })(),
        total: sleep(60).then(() => 4),
      };
    }),
  };
  return { router, runs };
};

async function settle(feed: {
  title: string;
  items: AsyncIterable<{ id: number; author: Promise<string> }>;
  total: Promise<number>;
}) {
  const items: Array<{ id: number; author: string }> = [];
  for await (const item of feed.items) {
    items.push({ id: item.id, author: await item.author });
  }
  return { title: feed.title, items, total: await feed.total };
}

const expectedFeed = {
  title: 'Feed',
  items: [1, 2, 3, 4].map((id) => ({ id, author: id % 2 ? 'ada' : 'grace' })),
  total: 4,
};

/** `res` with its JSONL body cut, like a dropped connection, after `lines` lines. */
const cutAfter = (res: Response, lines: number): Response => {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const newline = buffered.indexOf('\n');
        if (newline !== -1) {
          if (sent === lines) {
            await reader.cancel();
            return controller.error(new TypeError('network connection lost'));
          }
          sent++;
          controller.enqueue(
            new TextEncoder().encode(buffered.slice(0, newline + 1)),
          );
          buffered = buffered.slice(newline + 1);
          return;
        }
        const { done, value } = await reader.read();
        if (done) return controller.close();
        buffered += decoder.decode(value, { stream: true });
      }
    },
  });
  return new Response(body, { status: res.status, headers: res.headers });
};

const lines = async (res: Response) =>
  (await res.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);

test('a streamed output is kept as frames; a retry gets them from where it says', async () => {
  const { router, runs } = makeFeed();
  const handler = createFetchHandler({
    router,
    layer: Persistence.layerBackingMemory,
  });
  const all = await lines(await post(handler, 'feed', undefined, 'f1'));
  expect(all.length).toBeGreaterThan(4);

  const resume = (from: string) =>
    handler.fetch(
      new Request('http://localhost/trpc/feed', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'trpc-call-id': 'f1',
          'trpc-resume-from': from,
        },
        body: '',
      }),
    );
  expect(await lines(await resume('0'))).toEqual(all);
  expect(await lines(await resume('2'))).toEqual(all.slice(2));
  expect((await resume('two')).status).toBe(400);
  expect(runs.feed).toBe(1);
  await handler.dispose();
});

test('experimental_durableLink resumes a streamed output mid-stream, on another instance', async () => {
  const { router, runs } = makeFeed();
  const shared = await Effect.runPromise(
    Effect.service(Persistence.BackingPersistence).pipe(
      Effect.provide(Persistence.layerBackingMemory),
    ),
  );
  const instance = () =>
    createFetchHandler({
      router,
      layer: Layer.succeed(Persistence.BackingPersistence, {
        make: (id) => shared.make(id),
      }),
    });
  const [a, b] = [instance(), instance()];
  const sent: Array<string | null> = [];
  const client = createTrpcClient({
    router,
    links: [
      experimental_durableLink({ delayMs: () => 0 }),
      httpLink({
        url: 'http://localhost/trpc',
        fetch: async (url, init) => {
          const request = new Request(url, init);
          sent.push(request.headers.get('trpc-resume-from'));
          return sent.length === 1
            ? cutAfter(await a.fetch(request), 3)
            : b.fetch(request);
        },
      }),
    ],
  });
  const feed = await client.feed.mutate();
  expect(await settle(feed)).toEqual(expectedFeed);
  expect(sent).toEqual([null, '3']);
  expect(runs.feed).toBe(1);
  await a.dispose();
  await b.dispose();
});

test('a resume that fails, then answers without frames, fails what was still open', async () => {
  const { router } = makeFeed();
  const handler = createFetchHandler({
    router,
    layer: Persistence.layerBackingMemory,
  });
  const sent: Array<string | null> = [];
  const client = createTrpcClient({
    router,
    links: [
      experimental_durableLink({ delayMs: () => 0 }),
      httpLink({
        url: 'http://localhost/trpc',
        fetch: async (url, init) => {
          const request = new Request(url, init);
          sent.push(request.headers.get('trpc-resume-from'));
          if (sent.length === 1)
            return cutAfter(await handler.fetch(request), 3);
          if (sent.length === 2) return new Response('down', { status: 503 });
          return new Response(null);
        },
      }),
    ],
  });
  const feed = await client.feed.mutate();
  const [, error] = await safe(settle(feed));
  expect(error).toMatchObject({
    code: 'PARSE_ERROR',
    message: 'A resumed call answered without frames',
  });
  expect(sent).toEqual([null, '3', '3']);
  await handler.dispose();
});

test('a streamed output keeps going into the store after the client leaves', async () => {
  const { router, runs } = makeFeed();
  const handler = createFetchHandler({
    router,
    layer: Persistence.layerBackingMemory,
  });
  const controller = new AbortController();
  const first = await post(handler, 'feed', undefined, 'g1', controller.signal);
  await first.body!.getReader().read();
  controller.abort();
  await sleep(100);

  const client = createTrpcClient({
    router,
    links: [
      experimental_durableLink(),
      httpLink({
        url: 'http://localhost/trpc',
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      }),
    ],
  });
  const feed = await client.feed.mutate(undefined, { callId: 'g1' });
  expect(await settle(feed)).toEqual(expectedFeed);
  expect(runs.feed).toBe(1);
  await handler.dispose();
});

const sharedMemory = async () => {
  const shared = await Effect.runPromise(
    Effect.service(Persistence.BackingPersistence).pipe(
      Effect.provide(Persistence.layerBackingMemory),
    ),
  );
  const layer = Layer.succeed(Persistence.BackingPersistence, {
    make: (id) => shared.make(id),
  });
  return { shared, layer };
};

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

test('a streamed call joined without a frame log is a BAD_REQUEST, while it runs and once kept', async () => {
  const { layer } = await sharedMemory();
  let runs = 0;
  const ticks = t.procedure
    .input(Schema.String)
    .use(
      experimental_durable({
        key: ({ input }) => String(input),
        pollInterval: '5 millis',
      }),
    )
    .mutation(async () => {
      runs++;
      await sleep(30);
      return (async function* () {
        yield 1;
        await sleep(20);
        yield 2;
      })();
    });
  const handler = createFetchHandler({ router: { ticks }, layer });

  // Without HTTP there's no frame log, so the stream isn't kept.
  expect(await collect(await call(ticks, 'k1', { ctx: {}, layer }))).toEqual([
    1, 2,
  ]);

  const first = post(handler, 'ticks', 'k2');
  await sleep(10);
  const [, joined] = await safe(call(ticks, 'k2', { ctx: {}, layer }));
  expect(joined).toMatchObject({ code: 'BAD_REQUEST' });
  const frames = await lines(await first);
  expect(frames.length).toBeGreaterThan(1);
  const [, kept] = await safe(call(ticks, 'k2', { ctx: {}, layer }));
  expect(kept).toMatchObject({ code: 'BAD_REQUEST' });

  // A second unbatched request joins it and reads the frames from the log.
  const a = post(handler, 'ticks', 'k3');
  await sleep(10);
  const b = post(handler, 'ticks', 'k3');
  expect(await lines(await b)).toEqual(await lines(await a));
  expect(runs).toBe(3);
  await handler.dispose();
});
