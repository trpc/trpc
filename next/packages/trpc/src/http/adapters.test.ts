import { once } from 'node:events';
import { createServer, request, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NodeHttpServer } from '@effect/platform-node';
import { Context, Effect, Exit, Layer, Scope } from 'effect';
import { HttpMiddleware, HttpServer } from 'effect/http';
import {
  createTrpcClient,
  httpLink,
  routerType,
  wsLink,
} from '@trpc12/trpc/client';
import {
  cors,
  serve,
  toHttpEffect,
  type FetchLike,
  type WebSocketHandlerLike,
} from '@trpc12/trpc/http';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();
const router = {
  hello: t.procedure
    .input(z.object({ name: z.string() }))
    .query((opts) => `hello ${opts.input.name}`),
  save: t.procedure
    .input(z.object({ n: z.number() }))
    .mutation((opts) => opts.input.n * 2),
};
const handler = createFetchHandler({ router });

/** A fetch handler that isn't `createFetchHandler()`'s, as another library's would be. */
const plain: FetchLike & WebSocketHandlerLike = {
  fetch: (request: Request) => handler.fetch(request),
  websocket: (...args: Parameters<typeof handler.websocket>) =>
    handler.websocket(...args),
};

/**
 * Reads the body the way `express.json()`, `express.text()` or
 * `express.raw()` do, picked by an `x-parser` header, whatever the
 * content type; without one, JSON only. Other types are read and dropped,
 * as a parser that doesn't set `req.body` leaves them.
 */
async function parse(req: IncomingMessage & { body?: unknown }) {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  await once(req, 'end');
  const raw = Buffer.concat(chunks);
  const parser = req.headers['x-parser'];
  if (!parser && !req.headers['content-type']?.startsWith('application/json'))
    return;
  req.body =
    parser === 'text'
      ? String(raw)
      : parser === 'raw'
        ? new Uint8Array(raw)
        : JSON.parse(String(raw));
}

/** Serves `app` behind a Node server whose requests `before` reads first, as Express middleware would. */
async function listenParsed(
  app: ReturnType<typeof toHttpEffect>,
  before: (req: IncomingMessage) => Promise<void>,
) {
  const scope = Scope.makeUnsafe();
  const nodeHandler = await Effect.runPromise(
    NodeHttpServer.makeHandler(app, { scope }),
  );
  const server = createServer(async (req, res) => {
    if (req.method !== 'GET') await before(req);
    nodeHandler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/trpc`,
    [Symbol.asyncDispose]: async () => {
      server.closeAllConnections();
      server.close();
      await Effect.runPromise(Scope.close(scope, Exit.void));
    },
  };
}

/** Runs `layer` on a Node `HttpServer` on a free port. */
async function listen(layer: Layer.Layer<never, never, HttpServer.HttpServer>) {
  const scope = Scope.makeUnsafe();
  const context = await Effect.runPromise(
    Layer.buildWithScope(
      Layer.merge(layer, Layer.empty).pipe(
        Layer.provideMerge(
          NodeHttpServer.layer(() => createServer(), {
            port: 0,
            host: '127.0.0.1',
          }),
        ),
      ),
      scope,
    ),
  );
  const entry = Context.get(context, HttpServer.HttpServer);
  return {
    url: `http://127.0.0.1:${(entry.address as { port: number }).port}/trpc`,
    [Symbol.asyncDispose]: () =>
      Effect.runPromise(Scope.close(scope, Exit.void)),
  };
}

test("another library's fetch handler gets bodies a parser already read, as JSON, text or bytes", async () => {
  await using server = await listenParsed(toHttpEffect(plain), parse);
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url })],
  });
  expect(await client.save.mutate({ n: 2 })).toBe(4);
  expect(await client.hello.query({ name: 'get' })).toBe('hello get');

  const post = (headers: Record<string, string>, body: string) =>
    fetch(`${server.url}/save`, { method: 'POST', headers, body });
  const json: Record<string, string> = { 'content-type': 'application/json' };
  const text = await post({ ...json, 'x-parser': 'text' }, '{"json":{"n":3}}');
  expect(await text.json()).toEqual({ json: 6 });
  const bytes = await post({ ...json, 'x-parser': 'raw' }, '{"json":{"n":4}}');
  expect(await bytes.json()).toEqual({ json: 8 });
  const unread = await post({ 'content-type': 'text/plain' }, 'n=1');
  expect(unread.status).toBe(500);
  expect(await unread.json()).toMatchObject({
    json: { error: { message: expect.stringMatching(/already read/) } },
  });
});

test('upgrades reach the endpoint only, through createFetchHandler() and other handlers alike', async () => {
  for (const app of [toHttpEffect(handler), toHttpEffect(plain)]) {
    await using server = await listen(HttpServer.serve(app));
    const ws = server.url.replace('http', 'ws');
    await using link = wsLink({ url: ws, keepAlive: false });
    const client = createTrpcClient({
      router: routerType<typeof router>(),
      links: [link],
    });
    expect(await client.hello.query({ name: 'ws' })).toBe('hello ws');

    const elsewhere = new WebSocket(ws.replace('/trpc', '/other'));
    const [event] = (await Promise.race([
      once(elsewhere, 'error'),
      once(elsewhere, 'close'),
    ])) as [Event];
    expect(event.type).toMatch(/error|close/);
    expect(elsewhere.readyState).toBe(WebSocket.CLOSED);
  }
});

test("serve() serves a createFetchHandler()'s routes, with its middleware; cors() takes a predicate", async () => {
  const seen: string[] = [];
  const tagged = createFetchHandler({
    router,
    middleware: [
      HttpMiddleware.make((app) =>
        Effect.tap(app, () => Effect.sync(() => seen.push('middleware'))),
      ),
      cors({ allowedOrigins: (origin) => origin.endsWith('.example.com') }),
    ],
  });
  await using server = await listen(serve(tagged));
  const { url } = server;
  try {
    const input = encodeURIComponent('{"name":"served"}');
    const res = await fetch(`${url}/hello?input=${input}`, {
      headers: { origin: 'https://app.example.com' },
    });
    expect(await res.json()).toEqual({ json: 'hello served' });
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.com',
    );
    expect((await fetch(`${url.replace('/trpc', '/other')}`)).status).toBe(404);
    expect(seen).toContain('middleware');

    const refused = new WebSocket(url.replace('http', 'ws'), {
      headers: { origin: 'https://evil.test' },
    } as never);
    await Promise.race([once(refused, 'error'), once(refused, 'close')]);
    expect(refused.readyState).toBe(WebSocket.CLOSED);
  } finally {
    seen.length = 0;
  }
});

test('cors() without options allows every origin', async () => {
  const open = createFetchHandler({ router, middleware: [cors()] });
  await using server = await listen(HttpServer.serve(toHttpEffect(open)));
  const input = encodeURIComponent('{"name":"a"}');
  const res = await fetch(`${server.url}/hello?input=${input}`, {
    headers: { origin: 'https://anywhere.test' },
  });
  expect(await res.json()).toEqual({ json: 'hello a' });
  expect(res.headers.get('access-control-allow-origin')).toBe('*');
});

test('createFetchHandler() reads bodies a parser already read, and bodies that arrive in pieces', async () => {
  const errors: string[] = [];
  const own = createFetchHandler({
    router,
    onError: (opts) => errors.push(opts.error.message),
  });

  {
    await using server = await listenParsed(toHttpEffect(own), parse);
    const post = (headers: Record<string, string>, body: BodyInit) =>
      fetch(`${server.url}/save`, { method: 'POST', headers, body });
    const json: Record<string, string> = { 'content-type': 'application/json' };
    expect(await (await post(json, '{"json":{"n":1}}')).json()).toEqual({
      json: 2,
    });
    const text = await post(
      { ...json, 'x-parser': 'text' },
      '{"json":{"n":3}}',
    );
    expect(await text.json()).toEqual({ json: 6 });
    const bytes = await post(
      { ...json, 'x-parser': 'raw' },
      '{"json":{"n":4}}',
    );
    expect(await bytes.json()).toEqual({ json: 8 });
    const untyped = await post(
      { 'x-parser': 'json' },
      new TextEncoder().encode('{"json":{"n":5}}'),
    );
    expect(untyped.status).toBe(500);
    expect(await untyped.json()).toMatchObject({
      json: { error: { message: expect.stringMatching(/already read/) } },
    });
    const form = new FormData();
    form.set('input', '{"json":{"n":1}}');
    const multipart = await post({ 'trpc-version': '12' }, form);
    expect(multipart.status).toBe(500);
    expect(errors.at(-1)).toMatch(/already read/);
  }

  await using server = await listen(HttpServer.serve(toHttpEffect(own)));
  const pieces = ['{"json":', '{"n":21}}'];
  const streamed = await fetch(`${server.url}/save`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: new ReadableStream({
      async pull(controller) {
        const piece = pieces.shift();
        if (piece === undefined) return controller.close();
        await new Promise((r) => setTimeout(r, 5));
        controller.enqueue(new TextEncoder().encode(piece));
      },
    }),
    duplex: 'half',
  } as RequestInit);
  expect(await streamed.json()).toEqual({ json: 42 });

  const broken = await own.fetch(
    new Request(`${server.url}/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new ReadableStream({
        pull: (controller) => controller.error(new Error('connection reset')),
      }),
      duplex: 'half',
    } as RequestInit),
  );
  expect(broken.status).toBe(400);

  // An upload the client abandons is dropped without an error report.
  const reported = errors.length;
  const abandoned = request({
    host: '127.0.0.1',
    port: new URL(server.url).port,
    path: '/trpc/save',
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '100' },
  });
  abandoned.on('error', () => {});
  abandoned.write('{"json":');
  await new Promise((r) => setTimeout(r, 20));
  abandoned.destroy();
  await new Promise((r) => setTimeout(r, 50));
  expect(errors).toHaveLength(reported);
  expect(await broken.json()).toMatchObject({
    json: { error: { message: 'Could not read the request body' } },
  });
});

test("serve() of a handler at the root serves every path, and upgrades only the root's", async () => {
  const root = createFetchHandler({ router, endpoint: '/' });
  await using server = await listen(serve(root));
  const base = server.url.replace('/trpc', '');
  const input = encodeURIComponent('{"name":"root"}');
  expect(await (await fetch(`${base}/hello?input=${input}`)).json()).toEqual({
    json: 'hello root',
  });
  await using link = wsLink({
    url: base.replace('http', 'ws'),
    keepAlive: false,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  expect(await client.hello.query({ name: 'ws' })).toBe('hello ws');

  const elsewhere = new WebSocket(`${base.replace('http', 'ws')}/other`);
  await Promise.race([once(elsewhere, 'error'), once(elsewhere, 'close')]);
  expect(elsewhere.readyState).toBe(WebSocket.CLOSED);
});
