import { Effect, Layer } from 'effect';
import { HttpMiddleware, HttpRouter, HttpServerResponse } from 'effect/http';
import {
  createTrpcClient,
  httpLink,
  localLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { cors } from '@trpc12/trpc/http';
import {
  call,
  createFetchHandler,
  createRouterClient,
  initTrpc,
  Response as TrpcResponse,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../fixtures/server.ts';

const t = initTrpc<{ ctx: { cookie: string | null; web: boolean } }>();
const router = {
  whoami: t.procedure.query((opts) => opts.ctx),
  cached: t.procedure.query(() =>
    Effect.gen(function* () {
      yield* TrpcResponse.setHeader('cache-control', 'max-age=60');
      yield* TrpcResponse.appendHeader('set-cookie', 'a=1');
      yield* TrpcResponse.appendHeader('set-cookie', 'b=2');
      yield* TrpcResponse.setStatus(203);
      return 'cached';
    }),
  ),
  other: t.procedure.query(() =>
    Effect.as(TrpcResponse.appendHeader('set-cookie', 'c=3'), 'other'),
  ),
  brief: t.procedure.query((opts) => {
    opts.response.headers.set(
      'cache-control',
      'public, max-age=10, s-maxage=30',
    );
    return 'brief';
  }),
  feed: t.procedure.query((opts) => {
    opts.response.headers.set('cache-control', 'max-age=5');
    opts.response.headers.set('vary', 'cookie');
    return (async function* () {
      yield 1;
    })();
  }),
  redirect: t.procedure.query(() =>
    HttpServerResponse.redirect('https://example.com/elsewhere', {
      status: 307,
    }),
  ),
  csv: t.procedure.query(
    () =>
      new Response('a,b\n1,2\n', {
        status: 201,
        headers: { 'content-type': 'text/csv' },
      }),
  ),
};
type Router = typeof router;

const createContext = (opts: {
  request: { headers: Record<string, string | undefined>; source: object };
}) => ({
  cookie: opts.request.headers['cookie'] ?? null,
  web: opts.request.source instanceof Request,
});

test('createContext gets the HttpServerRequest; on fetch runtimes its source is the Request (12 Q12.1)', async () => {
  const handler = createFetchHandler({ router, createContext });
  const res = await handler.fetch(
    new Request('http://localhost/trpc/whoami', { headers: { cookie: 's=1' } }),
  );
  expect(await res.json()).toEqual({ json: { cookie: 's=1', web: true } });

  await using server = await createTestServer({ router, createContext });
  const client = createTrpcClient({
    router: routerType<Router>(),
    links: [httpLink({ url: server.url, headers: { cookie: 's=2' } })],
  });
  expect(await client.whoami.query()).toEqual({ cookie: 's=2', web: false });
});

test('middleware wraps the handler: Effect HttpMiddleware and cors() (13 C)', async () => {
  const handler = createFetchHandler({
    router,
    createContext,
    middleware: [
      cors({ allowedOrigins: ['https://app.example.com'] }),
      (app) =>
        Effect.map(app, (res) =>
          HttpServerResponse.setHeader(res, 'x-served-by', 'trpc'),
        ),
      HttpMiddleware.tracer,
    ],
  });
  const preflight = await handler.fetch(
    new Request('http://localhost/trpc/whoami', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.example.com',
        'access-control-request-method': 'GET',
      },
    }),
  );
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get('access-control-allow-origin')).toBe(
    'https://app.example.com',
  );
  const res = await handler.fetch(
    new Request('http://localhost/trpc/whoami', {
      headers: { origin: 'https://app.example.com' },
    }),
  );
  expect(res.headers.get('x-served-by')).toBe('trpc');
  expect(res.headers.get('access-control-allow-origin')).toBe(
    'https://app.example.com',
  );
});

test('the Response service sets headers and status; a batch merges cookies (04 Q4.2)', async () => {
  await using server = await createTestServer({
    router,
    createContext,
    batch: true,
  });
  const res = await fetch(`${server.url}/cached`);
  expect(res.status).toBe(203);
  expect(res.headers.get('cache-control')).toBe('max-age=60');
  expect(res.headers.getSetCookie()).toEqual(['a=1', 'b=2']);

  const batch = await fetch(server.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'trpc-batch': '1' },
    body: JSON.stringify([{ path: 'cached' }, { path: 'other' }]),
  });
  expect(batch.headers.getSetCookie()).toEqual(['a=1', 'b=2', 'c=3']);
  expect(batch.headers.get('cache-control')).toBe('no-cache');
  const lines = (await batch.text())
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { i: number; status: number });
  expect(
    lines.map((l) => [l.i, l.status]).sort((a, b) => a[0]! - b[0]!),
  ).toEqual([
    [0, 203],
    [1, 200],
  ]);
});

test('a batch keeps the strictest cache-control every call allows; a streamed call keeps its own', async () => {
  await using server = await createTestServer({
    router,
    createContext,
    batch: true,
  });
  const batch = (...paths: string[]) =>
    fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'trpc-batch': '1' },
      body: JSON.stringify(paths.map((path) => ({ path }))),
    });
  const cached = await batch('cached', 'brief');
  expect(cached.headers.get('cache-control')).toBe('max-age=10, s-maxage=30');
  expect(cached.headers.get('vary')).toBe('accept');
  await cached.body?.cancel();
  const failing = await batch('brief', 'missing');
  expect(failing.headers.get('cache-control')).toBe('no-cache');
  await failing.body?.cancel();

  const feed = await fetch(`${server.url}/feed`);
  expect(feed.headers.get('content-type')).toContain('application/jsonl');
  expect(feed.headers.get('cache-control')).toBe('max-age=5');
  expect(feed.headers.get('vary')).toBe('cookie, accept');
  await feed.body?.cancel();
});

test('a procedure can return its own response on unbatched HTTP calls (04 Q4.3)', async () => {
  await using server = await createTestServer({
    router,
    createContext,
    batch: true,
  });
  const client = createTrpcClient({
    router: routerType<Router>(),
    links: [httpLink({ url: server.url })],
  });
  const csv = await client.csv.query();
  expectTypeOf(csv).toEqualTypeOf<Response>();
  expect(csv.status).toBe(201);
  expect(csv.headers.get('content-type')).toBe('text/csv');
  expect(await csv.text()).toBe('a,b\n1,2\n');

  const redirect = await fetch(`${server.url}/redirect`, {
    redirect: 'manual',
  });
  expect(redirect.status).toBe(307);
  expect(redirect.headers.get('location')).toBe(
    'https://example.com/elsewhere',
  );

  const batched = createTrpcClient({
    router: routerType<Router>(),
    links: [httpLink({ url: server.url, batch: true })],
  });
  const [ok, raw] = await Promise.allSettled([
    batched.whoami.query(),
    // @ts-expect-error -- on a batching link, a Response needs { batch: false }
    batched.csv.query(),
  ]);
  expect(ok.status).toBe('fulfilled');
  expect(raw).toMatchObject({
    status: 'rejected',
    reason: {
      code: 'BAD_REQUEST',
      message: expect.stringContaining('only an unbatched HTTP call'),
    },
  });
  const before = server.requests.length;
  const [, alone] = await Promise.all([
    batched.whoami.query(),
    batched.csv.query(undefined, { batch: false }),
  ]);
  expectTypeOf(alone).toEqualTypeOf<Response>();
  expect(await alone.text()).toBe('a,b\n1,2\n');
  expect(server.requests.length - before).toBe(2);

  const batching = (on: boolean) =>
    createTrpcClient({
      router: routerType<Router>(),
      links: [httpLink({ url: server.url, batch: on })],
    });
  // @ts-expect-error -- a `batch` that may be on counts as on
  await expect(batching(true).csv.query()).rejects.toMatchObject({
    code: 'BAD_REQUEST',
  });

  const caller = createRouterClient(router, {
    ctx: { cookie: null, web: false },
  });
  expect(await (await caller.csv.query()).text()).toBe('a,b\n1,2\n');
});

test("in-process calls get a procedure's own response as a web Response, its errors still typed", async () => {
  const s = initTrpc();
  const encoder = new TextEncoder();
  let finish = () => {};
  const download = s.procedure
    .errors({ GONE: { data: z.object({ name: z.string() }) } })
    .input(z.object({ name: z.string() }))
    .query((opts) => {
      opts.response.headers.set('cache-control', 'no-store');
      opts.response.headers.set('content-type', 'text/plain');
      opts.response.headers.append('set-cookie', 'seen=1');
      if (opts.input.name === 'gone') {
        return opts.errors.GONE({ data: { name: opts.input.name } });
      }
      const body = new ReadableStream<Uint8Array>({
        start: (controller) => {
          controller.enqueue(encoder.encode('a,'));
          finish = () => {
            controller.enqueue(encoder.encode('b'));
            controller.close();
          };
        },
      });
      return new Response(body, {
        status: 201,
        headers: { 'content-type': 'text/csv' },
      });
    });
  const moved = s.procedure.query(() =>
    HttpServerResponse.redirect('https://example.com/elsewhere', {
      status: 307,
    }),
  );
  const files = { download, moved };
  const decoder = new TextDecoder();
  const check = async (res: Response) => {
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toBe('text/csv');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.getSetCookie()).toEqual(['seen=1']);
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(decoder.decode(first.value)).toBe('a,');
    finish();
    let rest = '';
    for (let next = await reader.read(); !next.done; next = await reader.read())
      rest += decoder.decode(next.value);
    expect(rest).toBe('b');
  };

  const caller = createRouterClient(files);
  const fromCaller = await caller.download.query({ name: 'report' });
  expectTypeOf(fromCaller).toEqualTypeOf<Response>();
  await check(fromCaller);
  const redirect = await caller.moved.query();
  expectTypeOf(redirect).toEqualTypeOf<Response>();
  expect(redirect.status).toBe(307);
  expect(redirect.headers.get('location')).toBe(
    'https://example.com/elsewhere',
  );

  const client = createTrpcClient({
    router: routerType<typeof files>(),
    links: [localLink({ router: files })],
  });
  const fromLink = await client.download.query({ name: 'report' });
  expectTypeOf(fromLink).toEqualTypeOf<Response>();
  await check(fromLink);

  const fromCall = await call(download, { name: 'report' });
  expectTypeOf(fromCall).toEqualTypeOf<Response>();
  await check(fromCall);
  const movedByCall = await call(moved, undefined);
  expectTypeOf(movedByCall).toEqualTypeOf<Response>();
  expect(movedByCall.status).toBe(307);

  const [, gone] = await safe(caller.download.query({ name: 'gone' }));
  expectTypeOf<Extract<typeof gone, { defined: true }>['code']>().toEqualTypeOf<
    'GONE' | 'BAD_REQUEST'
  >();
  expect(gone).toMatchObject({
    code: 'GONE',
    data: { name: 'gone' },
    defined: true,
  });
  const [, goneByLink] = await safe(client.download.query({ name: 'gone' }));
  expect(goneByLink).toMatchObject({ code: 'GONE', defined: true });
  await expect(call(download, { name: 'gone' })).rejects.toMatchObject({
    code: 'GONE',
    defined: true,
  });
});

test('handler.routes are effect/http routes that merge with your own (12 Q12.1)', async () => {
  const handler = createFetchHandler({ router, createContext });
  const app = Layer.mergeAll(
    handler.routes,
    HttpRouter.add('GET', '/health', HttpServerResponse.text('ok')),
  );
  const web = HttpRouter.toWebHandler(app, { disableLogger: true });
  try {
    const health = await web.handler(new Request('http://localhost/health'));
    expect(await health.text()).toBe('ok');
    const res = await web.handler(
      new Request('http://localhost/trpc/whoami', {
        headers: { cookie: 's=3' },
      }),
    );
    expect(await res.json()).toEqual({ json: { cookie: 's=3', web: true } });
    const missing = await web.handler(new Request('http://localhost/nope'));
    expect(missing.status).toBe(404);
  } finally {
    await web.dispose();
    await handler.dispose();
  }
});
