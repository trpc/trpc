import { request as httpRequest } from 'node:http';
import { Effect, Fiber, Predicate, Stream } from 'effect';
import {
  HttpEffect,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { toHttpEffect } from '@trpc12/trpc/http';
import { jsonTransformer } from '@trpc12/trpc/transformer';
import { createFetchHandler, error, initTrpc, lazy } from '@trpc12/trpc/server';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../../fixtures/server.ts';

const t = initTrpc<{ ctx: { user: string } }>();

const router = t.router({
  greet: t.procedure
    .input(z.object({ name: z.string() }).optional())
    .query((opts) => `hello ${opts.input?.name ?? opts.ctx.user}`),
  write: t.procedure
    .input(z.unknown())
    .mutation((opts) => opts.input ?? 'written'),
  tagged: t.procedure.input(z.string()).query((opts) => {
    opts.response.headers.set('x-tag', opts.input);
    return opts.input;
  }),
  circular: t.procedure.query(() => {
    const loop: Record<string, unknown> = {};
    loop['self'] = loop;
    return loop;
  }),
  raw: t.procedure.query((opts) => {
    opts.response.headers.append('set-cookie', 'session=1');
    return HttpServerResponse.text('by hand');
  }),
  ticks: t.procedure.subscription(async function* () {
    yield 1;
  }),
  later: lazy(async () => ({
    default: { inner: t.procedure.query(() => 'loaded') },
  })),
});

const createContext = () => ({ user: 'ada' });

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const batchOf = (calls: unknown) => json(calls, { 'trpc-batch': '1' });

const lines = async (res: Response) =>
  (await res.text())
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { i: number; status: number; body: unknown })
    .sort((a, b) => a.i - b.i);

test('a raw request path with dot segments is resolved like a URL', async () => {
  await using server = await createTestServer({ router, createContext });
  const url = new URL(server.url);
  const body = await new Promise<string>((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port: url.port,
        path: '/trpc/nowhere/../greet?ignored=1',
      },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => (text += chunk.toString()));
        res.on('end', () => resolve(text));
      },
    );
    req.on('error', reject);
    req.end();
  });
  expect(JSON.parse(body)).toEqual({ json: 'hello ada' });
});

test('a path with a malformed escape is a 404, through fetch and toHttpEffect alike', async () => {
  const errors: string[] = [];
  const handler = createFetchHandler({
    router,
    createContext,
    onError: (opts) => errors.push(opts.error.message),
  });
  const viaApp = HttpEffect.toWebHandler(toHttpEffect(handler));
  for (const serve of [handler.fetch, viaApp]) {
    const response = await serve(new Request('http://localhost/trpc/%E0%A4'));
    expect(response.status).toBe(404);
  }
  expect(errors).toEqual([
    'Not found: /trpc/%E0%A4',
    'Not found: /trpc/%E0%A4',
  ]);
});

test('unreadable inputs are protocol errors', async () => {
  await using server = await createTestServer({ router, createContext });
  const untyped = await fetch(`${server.url}/write`, {
    method: 'POST',
    body: new Uint8Array([1]),
  });
  expect(untyped.status).toBe(415);

  const noField = new FormData();
  noField.set('other', 'x');
  const missing = await fetch(`${server.url}/write`, {
    method: 'POST',
    headers: { 'trpc-version': '12' },
    body: noField,
  });
  expect(missing.status).toBe(400);
  expect(await missing.json()).toMatchObject({
    json: { error: { message: 'A multipart body needs an "input" field' } },
  });

  const broken = await fetch(`${server.url}/write`, {
    method: 'POST',
    headers: {
      'trpc-version': '12',
      'content-type': 'multipart/form-data; boundary=x',
    },
    body: 'not multipart',
  });
  expect(await broken.json()).toMatchObject({
    json: { error: { code: 'PARSE_ERROR', message: 'Invalid multipart body' } },
  });

  const otherParams = await fetch(`${server.url}/greet?unrelated=1`);
  expect(await otherParams.json()).toEqual({ json: 'hello ada' });
});

test('a transformer that throws a non-Error rejects the input as invalid', async () => {
  await using server = await createTestServer({
    router,
    createContext,
    transformer: {
      ...jsonTransformer,
      deserialize: () => {
        throw 'unreadable';
      },
    },
    batch: true,
  });
  const get = await fetch(
    `${server.url}/greet?input=${encodeURIComponent('{"name":"x"}')}`,
  );
  expect(await get.json()).toMatchObject({
    json: { error: { code: 'PARSE_ERROR', message: 'Invalid input' } },
  });
  const post = await fetch(`${server.url}/write`, json({ json: 1 }));
  expect(await post.json()).toMatchObject({
    json: { error: { code: 'PARSE_ERROR', message: 'Invalid input' } },
  });
  const batch = await lines(
    await fetch(server.url, batchOf([{ path: 'write', input: { json: 1 } }])),
  );
  expect(batch).toMatchObject([
    {
      i: 0,
      status: 400,
      body: { json: { error: { message: 'Invalid input' } } },
    },
  ]);
});

test('createContext errors keep their code; others are masked', async () => {
  await using defined = await createTestServer({
    router,
    createContext: () => {
      throw error({ code: 'UNAUTHORIZED', message: 'Who?' });
    },
  });
  const res = await fetch(`${defined.url}/greet`);
  expect(res.status).toBe(401);

  await using unexpected = await createTestServer({
    router,
    createContext: () => {
      throw new Error('db down');
    },
    exposeUnexpectedErrors: false,
  });
  const masked = await fetch(`${unexpected.url}/greet`);
  expect(masked.status).toBe(500);
  expect(await masked.json()).toMatchObject({
    json: { error: { message: 'Internal server error' } },
  });
});

test('an output the transformer cannot write is a 500', async () => {
  await using server = await createTestServer({
    router,
    createContext,
    exposeUnexpectedErrors: false,
  });
  const res = await fetch(`${server.url}/circular`);
  expect(res.status).toBe(500);
});

test('methods: PUT is refused, QUERY reads, lazy routers load on demand', async () => {
  const handler = createFetchHandler({ router, createContext });
  const put = await handler.fetch(
    new Request('http://localhost/trpc/greet', { method: 'PUT' }),
  );
  expect(put.status).toBe(405);
  expect(await put.json()).toMatchObject({
    json: { error: { message: 'PUT is not supported' } },
  });
  const query = await handler.fetch(
    new Request('http://localhost/trpc/greet', {
      method: 'QUERY',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ json: { name: 'query' } }),
    }),
  );
  expect(await query.json()).toEqual({ json: 'hello query' });

  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        fetch: (input, init) =>
          handler.fetch(new Request(input as string, init as RequestInit)),
      }),
    ],
  });
  expect(await client.later.inner.query()).toBe('loaded');

  const outside = await handler.fetch(
    new Request('http://localhost/elsewhere'),
  );
  expect(outside.status).toBe(404);
  await handler.dispose();
});

test('a returned response gets the handle’s cookies', async () => {
  await using server = await createTestServer({ router, createContext });
  const res = await fetch(`${server.url}/raw`);
  expect(await res.text()).toBe('by hand');
  expect(res.headers.get('trpc-response')).toBe('1');
  expect(res.headers.getSetCookie()).toEqual(['session=1']);
});

test('batches: POST only, an array, within maxItems, of known non-subscription calls', async () => {
  await using server = await createTestServer({
    router,
    createContext,
    batch: { maxItems: 3 },
  });
  const get = await fetch(server.url, { headers: { 'trpc-batch': '1' } });
  expect(get.status).toBe(405);
  expect(await get.json()).toMatchObject({
    json: { error: { message: 'Batches must use POST' } },
  });

  const object = await fetch(server.url, batchOf({ path: 'greet' }));
  expect(await object.json()).toMatchObject({
    json: { error: { message: 'A batch body must be an array' } },
  });

  const big = await fetch(
    server.url,
    batchOf([{ path: 'greet' }, { path: 'greet' }, { path: 'greet' }, {}]),
  );
  expect(big.status).toBe(413);
  expect(await big.json()).toMatchObject({
    json: { error: { message: 'A batch can have at most 3 calls' } },
  });

  const mixed = await fetch(
    server.url,
    batchOf([
      { path: 'tagged', input: { json: 'a' } },
      { path: 'ticks' },
      { path: 42 },
    ]),
  );
  expect(mixed.headers.get('x-tag')).toBe('a');
  expect(await lines(mixed)).toMatchObject([
    { i: 0, status: 200, body: { json: 'a' } },
    {
      i: 1,
      status: 400,
      body: { json: { error: { message: 'Subscriptions cannot be batched' } } },
    },
    {
      i: 2,
      status: 404,
      body: { json: { error: { message: 'No procedure at path ""' } } },
    },
  ]);
});

test('batch: {} uses the default of 20 calls', async () => {
  await using server = await createTestServer({
    router,
    createContext,
    batch: {},
  });
  const calls = Array.from({ length: 21 }, () => ({ path: 'greet' }));
  expect((await fetch(server.url, batchOf(calls))).status).toBe(413);
  expect(
    await lines(await fetch(server.url, batchOf(calls.slice(1)))),
  ).toHaveLength(20);
});

type Big = () => AsyncGenerator<string>;

test.each([
  [
    'a streamed query',
    (big: Big) => t.procedure.query(big),
    'application/jsonl',
  ],
  [
    'a deferred value',
    (big: Big) => t.procedure.query(() => ({ items: big() })),
    'application/jsonl',
  ],
  [
    'a subscription',
    (big: Big) => t.procedure.subscription(big),
    'text/event-stream',
  ],
] as const)(
  '%s waits for a slow client instead of buffering, and stops when it leaves',
  async (_name, procedure, accept) => {
    const limit = 100_000;
    let yielded = 0;
    let close = () => {};
    const closed = new Promise<void>((resolve) => (close = resolve));
    async function* big() {
      try {
        while (yielded < limit) {
          yielded++;
          yield 'x'.repeat(1024);
        }
      } finally {
        close();
      }
    }
    await using server = await createTestServer({
      router: t.router({ big: procedure(big) }),
      createContext,
    });
    const url = new URL(`${server.url}/big`);
    const req = httpRequest(url, { headers: { accept } }, (res) => res.pause());
    req.end();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const paused = yielded;
    req.destroy();
    await closed;
    // Socket buffers hold a few MB; without backpressure it reads all of it.
    expect(paused).toBeLessThan(limit / 4);
    expect(yielded).toBeLessThan(limit / 4);
  },
);

test.each(['rows', 'report'])(
  '%s: a deferred value awaiting its signal ends when the client leaves mid-write',
  async (path) => {
    const state = { waiting: 0, cleanups: 0 };
    async function* waiting(signal: AbortSignal) {
      state.waiting++;
      try {
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true }),
        );
        yield 'aborted';
      } finally {
        state.cleanups++;
      }
    }
    const handler = createFetchHandler({
      router: t.router({
        rows: t.procedure.query((opts) => waiting(opts.signal)),
        report: t.procedure.query((opts) => ({
          title: 'Report',
          rows: waiting(opts.signal),
        })),
      }),
      createContext,
    });
    const request = HttpServerRequest.fromWeb(
      new Request(`http://localhost/trpc/${path}`),
    );
    await Effect.gen(function* () {
      const app = yield* HttpRouter.toHttpEffect(handler.routes);
      const response = yield* Effect.provideService(
        app,
        HttpServerRequest.HttpServerRequest,
        request,
      );
      const body = response.body;
      if (!Predicate.isTagged(body, 'Stream')) {
        return yield* Effect.die(new Error('not a stream'));
      }
      // Stuck on its first chunk, like a server waiting for a socket to drain.
      const writer = yield* Effect.forkChild(
        Stream.runForEach(body.stream, () => Effect.never),
      );
      yield* Effect.promise(() =>
        vi.waitFor(() => expect(state.waiting).toBe(1)),
      );
      yield* Fiber.interrupt(writer);
    }).pipe(Effect.scoped, Effect.runPromise);
    await vi.waitFor(() => expect(state.cleanups).toBe(1));
  },
);
