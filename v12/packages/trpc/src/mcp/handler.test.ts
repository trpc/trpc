import { Context, Effect, Layer } from 'effect';
import { HttpServerResponse } from 'effect/http';
import {
  experimental_createMcpHandler,
  experimental_mcp,
  type McpHandler,
} from '@trpc12/trpc/mcp';
import { initTrpc, TrpcError, type OnErrorOpts } from '@trpc12/trpc/server';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';
import { blogRouter, type Ctx } from './fixtures/blog.ts';

const URL_ = 'http://localhost/mcp';

const post = (
  handler: { fetch: (request: Request) => Promise<Response> },
  body: unknown,
  headers?: Record<string, string>,
) =>
  handler.fetch(
    new Request(URL_, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const rpc = async (
  handler: McpHandler,
  method: string,
  params?: Record<string, unknown>,
) => {
  const res = await post(handler, { jsonrpc: '2.0', id: 1, method, params });
  return (await res.json()) as {
    result?: Record<string, unknown>;
    error?: { code: number; message: string };
  };
};

const toolCall = async (
  handler: McpHandler,
  name: string,
  args: Record<string, unknown> = {},
) => (await rpc(handler, 'tools/call', { name, arguments: args })).result!;

const t = initTrpc().concat(experimental_mcp());

test('the transport: stateless JSON over POST', async () => {
  await using handler = experimental_createMcpHandler({
    router: blogRouter,
    createContext: () => ({ user: null }),
  });

  const init = await post(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2099-01-01',
      capabilities: {},
      clientInfo: { name: 'raw', version: '0' },
    },
  });
  // An unknown version is answered with the newest one the server speaks.
  expect(await init.json()).toEqual({
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: '2025-11-25',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'trpc', version: '0.0.0' },
    },
  });
  expect(
    (await rpc(handler, 'initialize', { protocolVersion: '2025-06-18' }))
      .result,
  ).toMatchObject({ protocolVersion: '2025-06-18' });
  expect(await rpc(handler, 'ping')).toEqual({
    jsonrpc: '2.0',
    id: 1,
    result: {},
  });

  const notification = await post(handler, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });
  expect(notification.status).toBe(202);
  // A response from the client needs no answer either.
  const response = await post(handler, { jsonrpc: '2.0', id: 9, result: {} });
  expect(response.status).toBe(202);

  expect(await rpc(handler, 'x/y')).toMatchObject({
    error: { code: -32601, message: 'Method not found: x/y' },
  });
  expect(await rpc(handler, 'toString')).toMatchObject({
    error: { code: -32601 },
  });

  const garbage = await post(handler, '{not json');
  expect(garbage.status).toBe(400);
  expect(await garbage.json()).toMatchObject({ error: { code: -32700 } });

  // Batches went in protocol 2025-06-18.
  const batch = await post(handler, [
    { jsonrpc: '2.0', id: 1, method: 'ping' },
  ]);
  expect(batch.status).toBe(400);
  expect(await batch.json()).toMatchObject({ error: { code: -32600 } });

  const badVersion = await post(
    handler,
    { jsonrpc: '2.0', id: 3, method: 'ping' },
    { 'mcp-protocol-version': '1999-01-01' },
  );
  expect(badVersion.status).toBe(400);

  const foreign = await post(
    handler,
    { jsonrpc: '2.0', id: 4, method: 'ping' },
    { origin: 'https://evil.example' },
  );
  expect(foreign.status).toBe(403);
  const own = await post(
    handler,
    { jsonrpc: '2.0', id: 4, method: 'ping' },
    { origin: 'http://localhost' },
  );
  expect(own.status).toBe(200);

  const get = await handler.fetch(new Request(URL_, { method: 'GET' }));
  expect(get.status).toBe(405);
  expect(get.headers.get('allow')).toBe('POST');

  const nameless = await rpc(handler, 'tools/call', { arguments: {} });
  expect(nameless.error).toMatchObject({
    code: -32602,
    message: 'Unknown tool: undefined',
  });
});

test('allowedOrigins and maxBodySize', async () => {
  await using handler = experimental_createMcpHandler({
    router: t.router({}),
    allowedOrigins: ['https://app.example'],
    maxBodySize: 64,
  });
  const allowed = await post(
    handler,
    { jsonrpc: '2.0', id: 1, method: 'ping' },
    { origin: 'https://app.example' },
  );
  expect(allowed.status).toBe(200);

  const large = await post(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'ping',
    params: { padding: 'x'.repeat(100) },
  });
  expect(large.status).toBe(413);
  expect(await large.json()).toMatchObject({ error: { code: -32600 } });
});

test('createContext throwing UNAUTHORIZED answers 401 for OAuth discovery', async () => {
  const onError = vi.fn<(opts: OnErrorOpts) => void>();
  await using handler = experimental_createMcpHandler({
    router: blogRouter,
    resourceMetadataUrl:
      'https://api.example.com/.well-known/oauth-protected-resource',
    onError,
    createContext: (opts): Ctx => {
      if (!opts.request.headers['authorization']) {
        throw new TrpcError({ code: 'UNAUTHORIZED', message: 'Missing token' });
      }
      return { user: { name: 'token', admin: false } };
    },
  });
  const res = await post(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
  });
  expect(res.status).toBe(401);
  expect(res.headers.get('www-authenticate')).toBe(
    'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"',
  );
  expect(await res.json()).toMatchObject({
    code: 'UNAUTHORIZED',
    message: 'Missing token',
  });
  expect(onError).toHaveBeenCalledOnce();

  const call = await post(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'post_count', arguments: {} },
  });
  expect(call.status).toBe(401);

  const authed = await post(
    handler,
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { authorization: 'Bearer abc' },
  );
  expect(authed.status).toBe(200);
});

test('a 401 without resourceMetadataUrl, and other createContext failures', async () => {
  await using handler = experimental_createMcpHandler({
    router: blogRouter,
    exposeUnexpectedErrors: false,
    createContext: (opts): Ctx => {
      if (opts.request.headers['x-crash']) throw new Error('db down');
      throw new TrpcError({ code: 'UNAUTHORIZED' });
    },
  });
  const res = await post(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
  });
  expect(res.headers.get('www-authenticate')).toBe('Bearer');

  const crash = await post(
    handler,
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { 'x-crash': '1' },
  );
  expect(crash.status).toBe(200);
  expect(await crash.json()).toMatchObject({
    error: { code: -32603, message: 'Internal server error' },
  });
});

test('createContext learns the tool being called', async () => {
  const calls: unknown[] = [];
  await using handler = experimental_createMcpHandler({
    router: blogRouter,
    createContext: (opts) => {
      calls.push(opts.info.calls);
      return { user: null };
    },
  });
  await rpc(handler, 'tools/list');
  await toolCall(handler, 'post_count');
  expect(calls).toEqual([[], [{ path: 'post.count', type: 'query' }]]);
});

test('tools run with the layer, and text content is a string output as it is', async () => {
  class Greeter extends Context.Service<Greeter, { readonly hi: string }>()(
    'Greeter',
  ) {}
  const router = t.router({
    greet: t.procedure
      .meta({ mcp: true })
      .input(z.object({ name: z.string() }))
      .query((opts) =>
        Effect.gen(function* () {
          return `${(yield* Greeter).hi}, ${opts.input.name}`;
        }),
      ),
  });
  await using handler = experimental_createMcpHandler({
    router,
    layer: Layer.succeed(Greeter, { hi: 'Hello' }),
  });
  expect(await toolCall(handler, 'greet', { name: 'agent' })).toEqual({
    content: [{ type: 'text', text: 'Hello, agent' }],
  });
});

test('arguments are ignored without an input, and a non-object input is unwrapped', async () => {
  const router = t.router({
    none: t.procedure.meta({ mcp: true }).query(() => ({ ok: true })),
    tagged: t.procedure
      .meta({ mcp: true })
      .input(z.array(z.string()))
      .output(z.array(z.string()))
      .query((opts) => opts.input.map((s) => s.toUpperCase())),
    nothing: t.procedure
      .meta({ mcp: true })
      .output(z.undefined())
      .mutation(() => undefined),
  });
  await using handler = experimental_createMcpHandler({ router });
  expect(await toolCall(handler, 'none', { stray: 1 })).toEqual({
    content: [{ type: 'text', text: '{"ok":true}' }],
    structuredContent: { ok: true },
  });
  expect(await toolCall(handler, 'tagged', { input: ['a'] })).toEqual({
    content: [{ type: 'text', text: '["A"]' }],
    structuredContent: { result: ['A'] },
  });
  // A wrapped output that is `undefined` is `{}`.
  expect(await toolCall(handler, 'nothing')).toEqual({
    content: [],
    structuredContent: {},
  });
  // `arguments` that aren't an object count as none.
  const bad = await rpc(handler, 'tools/call', {
    name: 'tagged',
    arguments: 'x',
  });
  expect(bad.result).toMatchObject({ isError: true });
});

test("a streamed output or a Response isn't a tool result", async () => {
  const onError = vi.fn<(opts: OnErrorOpts) => void>();
  const router = t.router({
    feed: t.procedure.query(async function* () {
      yield 1;
    }),
    raw: t.procedure.query(() => HttpServerResponse.text('hi')),
  });
  await using handler = experimental_createMcpHandler({
    router,
    include: 'all',
    onError,
  });
  const feed = await toolCall(handler, 'feed');
  expect(feed).toMatchObject({
    isError: true,
    _meta: {
      'io.trpc/error': {
        code: 'BAD_REQUEST',
        message: 'A streamed output is not a tool result',
      },
    },
  });
  expect(await toolCall(handler, 'raw')).toMatchObject({ isError: true });
  expect(onError.mock.calls.map((c) => c[0].path)).toEqual(['feed', 'raw']);
});

test('lazy subtrees load on the first request', async () => {
  let loads = 0;
  const router = t.router({
    posts: t.lazy(async () => {
      loads += 1;
      return {
        list: t.procedure.meta({ mcp: true }).query(() => ['a']),
        more: t.lazy(async () => ({
          count: t.procedure.meta({ mcp: true }).query(() => 1),
        })),
      };
    }),
  });
  await using handler = experimental_createMcpHandler({ router });
  expect(loads).toBe(0);
  const listed = await rpc(handler, 'tools/list');
  expect(
    (listed.result!['tools'] as Array<{ name: string }>).map((x) => x.name),
  ).toEqual(['posts_list', 'posts_more_count']);
  expect(await toolCall(handler, 'posts_more_count')).toEqual({
    content: [{ type: 'text', text: '1' }],
  });
  expect(loads).toBe(1);
});

test('a name clash in a lazy subtree fails the first request', async () => {
  const router = t.router({
    a_b: t.procedure.meta({ mcp: true }).query(() => 1),
    a: t.lazy(async () => ({
      b: t.procedure.meta({ mcp: true }).query(() => 2),
    })),
  });
  await using handler = experimental_createMcpHandler({
    router,
    exposeUnexpectedErrors: true,
  });
  const res = await post(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
  });
  expect(res.status).toBe(500);
  expect(await res.json()).toMatchObject({
    error: {
      code: -32603,
      message: 'MCP: "a.b" and "a_b" are both tool "a_b"',
    },
  });
});

test('a name clash throws at creation', () => {
  const router = t.router({
    a_b: t.procedure.meta({ mcp: true }).query(() => 1),
    a: { b: t.procedure.meta({ mcp: true }).query(() => 2) },
  });
  expect(() => experimental_createMcpHandler({ router })).toThrow(
    'both tool "a_b"',
  );
});

test('middleware wraps the handler, and platform reaches createContext', async () => {
  const router = t.router({
    env: t.procedure
      .meta({ mcp: true })
      .query((opts) => (opts.ctx as { env: string }).env),
  });
  const handler = experimental_createMcpHandler<typeof router, { env: string }>(
    {
      router,
      createContext: (opts) => ({ env: opts.platform.env }),
      middleware: [
        (app) =>
          Effect.map(app, (res) =>
            HttpServerResponse.setHeader(res, 'x-mcp', 'yes'),
          ),
      ],
    },
  );
  const res = await handler.fetch(
    new Request(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'env', arguments: {} },
      }),
    }),
    { env: 'prod' },
  );
  expect(res.headers.get('x-mcp')).toBe('yes');
  expect(await res.json()).toMatchObject({
    result: { content: [{ type: 'text', text: 'prod' }] },
  });
  await handler[Symbol.asyncDispose]();
});

test('an aborted request interrupts the tool call', async () => {
  let interrupted = false;
  const router = t.router({
    stuck: t.procedure.meta({ mcp: true }).query(() =>
      Effect.never.pipe(
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            interrupted = true;
          }),
        ),
      ),
    ),
  });
  await using handler = experimental_createMcpHandler({ router });
  const controller = new AbortController();
  const pending = handler.fetch(
    new Request(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'stuck', arguments: {} },
      }),
      signal: controller.signal,
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  controller.abort();
  await pending.catch(() => undefined);
  expect(interrupted).toBe(true);
});
