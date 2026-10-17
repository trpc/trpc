import { Effect, Layer } from 'effect';
import { HttpMiddleware, HttpRouter, HttpServerResponse } from 'effect/http';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { cors } from '@trpc12/trpc/http';
import {
  createFetchHandler,
  createRouterClient,
  initTrpc,
  Response as TrpcResponse,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
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
      HttpMiddleware.xForwardedHeaders,
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

  const caller = createRouterClient(router, {
    ctx: { cookie: null, web: false },
  });
  await expect(caller.csv.query()).rejects.toMatchObject({
    code: 'BAD_REQUEST',
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
