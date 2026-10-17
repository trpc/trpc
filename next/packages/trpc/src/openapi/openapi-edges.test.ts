import { Effect, Stream } from 'effect';
import { HttpServerResponse } from 'effect/http';
import { createTrpcClient, routerType, safe } from '@trpc12/trpc/client';
import { toContract } from '@trpc12/trpc/contract';
import {
  createOpenApiHandler,
  openapi,
  openApiLink,
} from '@trpc12/trpc/openapi';
import { error, initTrpc, lazy, tracked } from '@trpc12/trpc/server';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc<{ ctx: { user: string } }>().concat(openapi());

const raw = (body: BodyInit | null, init?: ResponseInit) =>
  HttpServerResponse.fromWeb(new Response(body, init));

let slowAborts = 0;
const router = {
  echo: t.procedure
    .meta({ route: { method: 'POST', path: '/echo' } })
    .input(z.unknown())
    .mutation((opts) => opts.input ?? null),
  rename: t.procedure
    .meta({ route: { method: 'POST', path: '/things/{id}' } })
    .input(z.object({ id: z.string(), name: z.string().optional() }))
    .mutation((opts) => opts.input),
  detailed: t.procedure
    .meta({
      route: {
        method: 'POST',
        path: '/detailed/{id}',
        inputStructure: 'detailed',
        outputStructure: 'detailed',
      },
    })
    .input(
      z.object({
        params: z.object({ id: z.coerce.number() }),
        query: z.object({}).optional(),
        headers: z.object({}).loose(),
        body: z.object({ n: z.coerce.number() }).optional(),
      }),
    )
    .mutation((opts) => ({
      status: 202,
      body: { id: opts.input.params.id, n: opts.input.body?.n ?? null },
    })),
  bare: t.procedure
    .meta({
      route: {
        method: 'GET',
        path: '/bare',
        inputStructure: 'detailed',
        outputStructure: 'detailed',
      },
    })
    .query(() => ({ body: 'bare' })),
  file: t.procedure
    .meta({ route: { method: 'GET', path: '/file/{kind}' } })
    .input(z.object({ kind: z.enum(['named', 'blob']) }))
    .query((opts) =>
      opts.input.kind === 'named'
        ? new File(['report'], 'report q1.txt', { type: 'text/plain' })
        : new Blob([new Uint8Array([1, 2, 3])]),
    ),
  response: t.procedure
    .meta({ route: { method: 'GET', path: '/response' } })
    .query(({ response }) => {
      response.headers.append('set-cookie', 'a=1');
      response.headers.set('x-from-handle', 'yes');
      response.headers.set('content-type', 'application/x-ignored');
      return HttpServerResponse.text('made by hand', {
        headers: { 'set-cookie': 'b=2' },
      });
    }),
  raw: t.procedure
    .meta({ route: { method: 'GET', path: '/raw/{kind}' } })
    .input(
      z.object({
        kind: z.enum(['teapot', 'busy', 'none', 'zero', 'bytes']),
      }),
    )
    .query((opts) => {
      switch (opts.input.kind) {
        case 'teapot':
          return raw('short and stout', { status: 418 });
        case 'busy':
          return raw('try later', { status: 503 });
        case 'none':
          return raw(null, { status: 204 });
        case 'zero':
          return raw(null, {
            headers: { 'content-type': 'text/plain', 'content-length': '0' },
          });
        case 'bytes':
          return raw(new Uint8Array([7, 8]), {
            headers: { 'content-type': 'application/octet-stream' },
          });
      }
    }),
  feed: t.procedure
    .meta({ route: { method: 'GET', path: '/feed' } })
    .input(z.object({ fail: z.coerce.boolean().optional() }).optional())
    .subscription(async function* (opts) {
      yield 'plain';
      yield tracked('7', 'tracked');
      if (opts.input?.fail)
        throw error({ code: 'CONFLICT', message: 'feed broke' });
    }),
  forever: t.procedure
    .meta({ route: { method: 'GET', path: '/forever' } })
    .subscription(() => Stream.never),
  slow: t.procedure
    .meta({ route: { method: 'GET', path: '/slow' } })
    .query((opts) =>
      Effect.callback<string>((resume) => {
        opts.signal.addEventListener('abort', () => {
          slowAborts++;
          resume(Effect.succeed('gone'));
        });
      }),
    ),
  who: t.procedure
    .meta({ route: { method: 'GET', path: '/who' } })
    .query((opts) => opts.ctx.user),
};

const make = (
  opts: Partial<Parameters<typeof createOpenApiHandler<typeof router>>[0]> = {},
) =>
  createOpenApiHandler({
    router,
    createContext: () => ({ user: 'ada' }),
    exposeUnexpectedErrors: true,
    ...opts,
  });

const api = (
  handler: { fetch: (r: Request) => Promise<Response> },
  path: string,
  init?: RequestInit,
) => handler.fetch(new Request(`http://localhost/api${path}`, init));

const post = (body: BodyInit, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body,
});

test('bodies over maxBodySize are 413, whether or not they declare a length', async () => {
  const handler = make({ maxBodySize: 16 });
  const big = JSON.stringify({ text: 'x'.repeat(32) });
  const declared = await api(
    handler,
    '/echo',
    post(big, { 'content-length': String(big.length) }),
  );
  expect(declared.status).toBe(413);
  expect(await declared.json()).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });

  const streamed = await api(handler, '/echo', post(big));
  expect(streamed.status).toBe(413);

  const form = await api(handler, '/echo', {
    method: 'POST',
    body: new URLSearchParams({ text: 'x'.repeat(32) }),
  });
  expect(form.status).toBe(413);

  const small = await api(handler, '/echo', post('[1]'));
  expect(await small.json()).toEqual([1]);
  await handler.dispose();
});

test('bodies that are not JSON, or are invalid JSON, are rejected', async () => {
  const handler = make();
  const invalid = await api(handler, '/echo', post('{nope'));
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({
    code: 'PARSE_ERROR',
    message: 'Invalid JSON',
  });

  const empty = await api(handler, '/echo', { method: 'POST' });
  expect(await empty.json()).toBeNull();
  await handler.dispose();
});

test('a route with path params merges them into an object body, and refuses others', async () => {
  const handler = make();
  const noBody = await api(handler, '/things/1', { method: 'POST' });
  expect(await noBody.json()).toEqual({ id: '1' });

  const merged = await api(handler, '/things/1', post('{"name":"a","id":"2"}'));
  expect(await merged.json()).toEqual({ id: '1', name: 'a' });

  const array = await api(handler, '/things/1', post('["a"]'));
  expect(array.status).toBe(400);
  expect(await array.json()).toMatchObject({
    code: 'BAD_REQUEST',
    message: 'A route with path params needs an object body',
  });
  await handler.dispose();
});

test('detailed structures coerce form bodies and default missing parts', async () => {
  const handler = make();
  const form = await api(handler, '/detailed/3', {
    method: 'POST',
    body: new URLSearchParams({ n: '4' }),
  });
  expect(form.status).toBe(202);
  expect(await form.json()).toEqual({ id: 3, n: 4 });

  const bare = await api(handler, '/bare');
  expect(bare.status).toBe(200);
  expect(await bare.json()).toBe('bare');
  await handler.dispose();
});

test('files download with their name, blobs as octet streams', async () => {
  const handler = make();
  const named = await api(handler, '/file/named');
  expect(named.headers.get('content-type')).toBe('text/plain');
  expect(named.headers.get('content-disposition')).toContain('report q1.txt');
  expect(await named.text()).toBe('report');

  const blob = await api(handler, '/file/blob');
  expect(blob.headers.get('content-type')).toBe('application/octet-stream');
  expect(blob.headers.get('content-disposition')).toBeNull();
  expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3]);
  await handler.dispose();
});

test("a returned HttpServerResponse keeps its headers and gains the handle's", async () => {
  const handler = make();
  const res = await api(handler, '/response');
  expect(await res.text()).toBe('made by hand');
  expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
  expect(res.headers.get('x-from-handle')).toBe('yes');
  expect(res.headers.getSetCookie().sort()).toEqual(['a=1', 'b=2']);
  await handler.dispose();
});

test('a subscription that fails mid-stream ends with an error event', async () => {
  const handler = make();
  const res = await api(handler, '/feed?fail=true');
  const text = await res.text();
  expect(text).toContain('event: message\ndata: "plain"');
  expect(text).toContain('id: 7\nevent: message\ndata: "tracked"');
  expect(text).toContain(
    'event: error\ndata: {"defined":false,"code":"CONFLICT","message":"feed broke"}',
  );
  expect(text).not.toContain('event: done');
  await handler.dispose();
});

test('cancelling a stream, or aborting a request, interrupts the procedure', async () => {
  const handler = make({ sse: { pingMs: false } });
  const res = await api(handler, '/forever');
  const reader = res.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(
    ': open\n\n',
  );
  await reader.cancel();

  const before = slowAborts;
  const controller = new AbortController();
  const pending = api(handler, '/slow', { signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await pending.catch(() => undefined);
  await vi.waitFor(() => expect(slowAborts).toBe(before + 1));
  await handler.dispose();
});

test('a contract route the router lacks is 404', async () => {
  const contract = toContract({
    ...router,
    extra: t.procedure.query(() => 'never served'),
  });
  const handler = createOpenApiHandler({
    router,
    contract,
    createContext: () => ({ user: 'ada' }),
  });
  const res = await api(handler, '/extra');
  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({
    message: `The contract's "extra" is not in the router`,
  });
  expect(await (await api(handler, '/who')).json()).toBe('ada');
  await handler.dispose();
});

test('createContext and lazy routers that throw are masked 500s', async () => {
  const throwing = createOpenApiHandler({
    router,
    exposeUnexpectedErrors: false,
    createContext: () => {
      throw new Error('no context');
    },
  });
  const res = await api(throwing, '/who');
  expect(res.status).toBe(500);
  expect(await res.json()).toMatchObject({ message: 'Internal server error' });

  const served = await throwing.serve(new Request('http://localhost/x'), {
    path: 'who',
    procedure: router.who,
    params: {},
  });
  expect(served.status).toBe(500);
  await throwing.dispose();

  const broken = createOpenApiHandler({
    router: {
      later: lazy(() => Promise.reject(new Error('cannot load'))),
    },
    createContext: () => ({ user: 'ada' }),
  });
  const lazyRes = await api(broken, '/later/x');
  expect(lazyRes.status).toBe(500);
  await broken.dispose();
});

test('serve() reports input errors with their own status', async () => {
  const handler = make();
  const res = await handler.serve(
    new Request('http://localhost/x', post('{nope')),
    { path: 'echo', procedure: router.echo, params: {} },
  );
  expect(res.status).toBe(400);
  await handler.dispose();
});

test('fetch(request, platform) hands the platform to createContext', async () => {
  const handler = createOpenApiHandler<typeof router, { user: string }>({
    router,
    createContext: (opts) => ({ user: opts.platform.user }),
  });
  const res = await handler.fetch(new Request('http://localhost/api/who'), {
    user: 'grace',
  });
  expect(await res.json()).toBe('grace');
  await handler.dispose();
});

function linked(fetch?: typeof globalThis.fetch) {
  const handler = make();
  const contract = toContract(router);
  const requests: Request[] = [];
  const client = createTrpcClient({
    router: routerType<typeof router & { missing: typeof router.who }>(),
    links: [
      openApiLink({
        url: 'http://localhost/',
        contract,
        headers: (opts) => ({ 'x-op': opts.op.path }),
        fetch:
          fetch ??
          ((input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return handler.fetch(request);
          }),
      }),
    ],
  });
  return { client, handler, requests };
}

test('openApiLink reads every kind of response body', async () => {
  const app = linked();
  const { client } = app;
  expect(await client.raw.query({ kind: 'none' })).toBeUndefined();
  expect(await client.raw.query({ kind: 'zero' })).toBeUndefined();
  const bytes = (await client.raw.query({ kind: 'bytes' })) as unknown as Blob;
  expect(bytes).toBeInstanceOf(Blob);
  expect([...new Uint8Array(await bytes.arrayBuffer())]).toEqual([7, 8]);
  expect(await client.bare.query()).toEqual({
    status: 200,
    headers: expect.objectContaining({ 'content-type': 'application/json' }),
    body: 'bare',
  });
  expect(app.requests.map((r) => r.headers.get('x-op'))).toEqual([
    'raw',
    'raw',
    'raw',
    'bare',
  ]);

  const [, teapot] = await safe(client.raw.query({ kind: 'teapot' }));
  expect(teapot).toMatchObject({
    code: 'PARSE_ERROR',
    message: 'Unexpected 418 response',
  });
  const [, busy] = await safe(client.raw.query({ kind: 'busy' }));
  expect(busy).toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    message: 'Unexpected 503 response',
  });
  await app.handler.dispose();
});

test('openApiLink sends per-call headers, files in arrays, and signals', async () => {
  const app = linked();
  const { client } = app;
  await client.who.query(undefined, { headers: { 'x-call': 'yes' } });
  expect(app.requests[0]!.headers.get('x-call')).toBe('yes');

  const echoed = await client.echo.mutate([new File(['a'], 'a.txt')]);
  expect(app.requests[1]!.headers.get('content-type')).toMatch(
    /^multipart\/form-data/,
  );
  expect(echoed).toBeDefined();

  const controller = new AbortController();
  const slow = safe(
    client.slow.query(undefined, { signal: controller.signal }),
  );
  setTimeout(() => controller.abort(), 10);
  const [, aborted] = await slow;
  expect(aborted).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });

  const [, missing] = await safe(client.missing.query());
  expect(missing).toMatchObject({
    code: 'NOT_FOUND',
    message: '"missing" is not in the contract',
  });
  await app.handler.dispose();
});

test('openApiLink fills a Date path param as ISO, and fails a call missing one', async () => {
  const app = linked();
  const at = new Date(0);
  expect(
    await app.client.rename.mutate({ id: at as unknown as string, name: 'x' }),
  ).toEqual({ id: at.toISOString(), name: 'x' });
  expect(new URL(app.requests[0]!.url).pathname).toBe(
    `/api/things/${encodeURIComponent(at.toISOString())}`,
  );

  const [, missing] = await safe(
    app.client.rename.mutate({ name: 'x' } as unknown as { id: string }),
  );
  expect(missing?.message).toContain(
    'Missing path param "id" for /api/things/{id}',
  );
  await app.handler.dispose();
});

test('openApiLink reads an untyped body as text', async () => {
  const untyped = (body: string) =>
    linked(
      async () => new Response(new TextEncoder().encode(body)),
    ).client.who.query();
  expect(await untyped('plain words')).toBe('plain words');
  expect(await untyped('')).toBeUndefined();
});

test('openApiLink reads error bodies that are not OpenAPI errors by their status', async () => {
  const failing = (body: string, status: number) =>
    safe(
      linked(async () => new Response(body, { status })).client.who.query(),
    ).then(([, err]) => err);
  expect(await failing('"oops"', 502)).toMatchObject({
    code: 'BAD_GATEWAY',
    message: 'BAD_GATEWAY',
    defined: false,
  });
  expect(await failing('{"message":7}', 418)).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'INTERNAL_SERVER_ERROR',
  });
  expect(
    await failing('{"code":"GONE","message":"left","defined":true}', 410),
  ).toMatchObject({ code: 'GONE', message: 'left', defined: true });
});

test('openApiLink turns fetch failures into client errors', async () => {
  const failing = (cause: unknown) =>
    linked(() => Promise.reject(cause)).client.who.query();

  const [, typeError] = await safe(failing(new TypeError('fetch failed')));
  expect(typeError).toMatchObject({
    code: 'NETWORK_ERROR',
    message: 'fetch failed',
  });
  const [, thrown] = await safe(failing('down'));
  expect(thrown).toMatchObject({
    code: 'NETWORK_ERROR',
    message: 'Network error',
  });
  const [, aborted] = await safe(
    failing(new DOMException('aborted', 'AbortError')),
  );
  expect(aborted).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
});

test('openApiLink subscriptions yield plain and tracked events, then errors', async () => {
  const app = linked();
  const events: unknown[] = [];
  let failure: unknown;
  try {
    for await (const event of app.client.feed.subscribe(
      { fail: true },
      {
        reconnect: false,
      },
    )) {
      events.push(event);
    }
  } catch (err) {
    failure = err;
  }
  expect(events).toEqual(['plain', { id: '7', data: 'tracked' }]);
  expect(failure).toMatchObject({ code: 'CONFLICT', message: 'feed broke' });

  const refused = linked(async () => new Response('nope', { status: 503 }));
  const [, err] = await safe(
    (async () => {
      for await (const _ of refused.client.feed.subscribe(undefined));
    })(),
  );
  expect(err).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  await Promise.all([app.handler.dispose(), refused.handler.dispose()]);
});

test('form bodies: none at all, malformed, and malformed past maxBodySize', async () => {
  const handler = make({ maxBodySize: 64 });
  const none = await api(handler, '/echo', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  expect(await none.json()).toEqual({});

  const multipart: HeadersInit = {
    'content-type': 'multipart/form-data; boundary=x',
  };
  const malformed = await api(handler, '/echo', {
    method: 'POST',
    headers: multipart,
    body: 'not multipart',
  });
  expect(malformed.status).toBe(400);
  expect(await malformed.json()).toMatchObject({
    code: 'PARSE_ERROR',
    message: 'Invalid form body',
  });

  const huge = await api(handler, '/echo', {
    method: 'POST',
    headers: multipart,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('y'.repeat(200)));
        controller.close();
      },
    }),
    duplex: 'half',
  } as RequestInit);
  expect(huge.status).toBe(413);
  await handler.dispose();
});
