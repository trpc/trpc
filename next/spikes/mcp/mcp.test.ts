import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { initTrpc, TrpcError } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';
import { appRouter, freshPosts, type Ctx } from './app.ts';
import {
  createMcpHandler,
  describeTools,
  mcp,
  type McpHandler,
} from './mcp.ts';

const URL_ = 'http://localhost/mcp';

const handlerFor = (user: Ctx['user'] = null) =>
  createMcpHandler({
    router: appRouter,
    serverInfo: { name: 'blog', version: '1.0.0' },
    instructions: 'A blog. Read posts before changing them.',
    createContext: () => ({ user }),
  });

/** An MCP SDK client connected to `handler` in-process. */
async function connect(handler: McpHandler) {
  const client = new Client({ name: 'spike', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  // The SDK's own types disagree under `exactOptionalPropertyTypes` (`sessionId`).
  await client.connect(transport as Transport);
  return Object.assign(client, {
    [Symbol.asyncDispose]: () => client.close(),
  });
}

const post = (
  handler: McpHandler,
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

const textOf = (result: object) =>
  JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text);

test('the SDK client initializes and lists the published procedures', async () => {
  await using client = await connect(handlerFor());
  expect(client.getServerVersion()).toEqual({ name: 'blog', version: '1.0.0' });
  expect(client.getInstructions()).toBe(
    'A blog. Read posts before changing them.',
  );

  const listed = await client.listTools();
  const tools = Object.fromEntries(listed.tools.map((t) => [t.name, t]));
  // No `mcp` meta, `mcp: false` and subscriptions stay out.
  expect(Object.keys(tools)).toEqual([
    'post_byId',
    'post_count',
    'post_search',
    'post_create',
    'post_delete',
    'post_crash',
  ]);

  expect(tools['post_byId']).toMatchObject({
    description: 'Read one blog post by its id.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The post id, e.g. "1"' },
      },
      required: ['id'],
    },
    outputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, title: { type: 'string' } },
    },
    _meta: {
      'io.trpc/path': 'post.byId',
      'io.trpc/type': 'query',
      'io.trpc/errors': ['NOT_FOUND'],
    },
  });
  // OpenAPI's `route` summary and description are reused.
  expect(tools['post_count']).toMatchObject({
    title: 'Count posts',
    description: 'How many posts exist.',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: { result: { type: 'number' } },
      required: ['result'],
    },
  });
  // A non-object input travels as `{ input }`.
  expect(tools['post_search']!.inputSchema).toMatchObject({
    type: 'object',
    properties: { input: { type: 'string', minLength: 1 } },
    required: ['input'],
  });
  expect(tools['post_create']!.annotations).toEqual({ readOnlyHint: false });
  expect(tools['post_delete']).toMatchObject({
    title: 'Delete a post',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    },
  });
});

test('a call runs the procedure and returns structured, validated output', async () => {
  using _posts = freshPosts();
  await using client = await connect(handlerFor());

  // The SDK checks `structuredContent` against `outputSchema`.
  const byId = await client.callTool({
    name: 'post_byId',
    arguments: { id: '1' },
  });
  expect(byId.isError).toBeUndefined();
  const expected = { id: '1', title: 'Hello', at: '1970-01-01T00:00:00.000Z' };
  expect(byId.structuredContent).toEqual(expected);
  expect(textOf(byId)).toEqual(expected);

  const count = await client.callTool({ name: 'post_count', arguments: {} });
  expect(count.structuredContent).toEqual({ result: 1 });

  const search = await client.callTool({
    name: 'post_search',
    arguments: { input: 'Hell' },
  });
  expect(textOf(search)).toEqual(['Hello']);
});

test('procedure errors are tool results the model can read', async () => {
  using _posts = freshPosts();
  await using client = await connect(handlerFor());

  const missing = await client.callTool({
    name: 'post_byId',
    arguments: { id: '9' },
  });
  expect(missing.isError).toBe(true);
  expect(textOf(missing)).toEqual({
    code: 'NOT_FOUND',
    message: 'NOT_FOUND',
    data: { id: '9' },
  });

  // Invalid arguments come back with the issues, so the model can retry.
  const invalid = await client.callTool({
    name: 'post_search',
    arguments: { input: '' },
  });
  expect(invalid.isError).toBe(true);
  expect(textOf(invalid)).toMatchObject({
    code: 'BAD_REQUEST',
    data: { issues: [expect.objectContaining({ path: [] })] },
  });

  const signedOut = await client.callTool({
    name: 'post_create',
    arguments: { title: 'New post' },
  });
  expect(textOf(signedOut)).toEqual({
    code: 'UNAUTHORIZED',
    message: 'Sign in first',
  });

  // Unexpected throws are masked.
  const crash = await client.callTool({ name: 'post_crash', arguments: {} });
  expect(textOf(crash)).toEqual({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
  });
});

test('middleware sees the ctx from createContext', async () => {
  using _posts = freshPosts();
  await using client = await connect(
    handlerFor({ name: 'alex', admin: false }),
  );
  const created = await client.callTool({
    name: 'post_create',
    arguments: { title: 'From an agent' },
  });
  expect(created.structuredContent).toMatchObject({
    id: '2',
    title: 'From an agent',
  });
});

test('an unknown tool is a protocol error', async () => {
  await using client = await connect(handlerFor());
  const call = client.callTool({ name: 'internal_reindex', arguments: {} });
  await expect(call).rejects.toBeInstanceOf(McpError);
  await expect(call).rejects.toMatchObject({ code: -32602 });
});

test('filter hides tools per caller, in lists and calls', async () => {
  using _posts = freshPosts();
  const handler = (user: Ctx['user']) =>
    createMcpHandler({
      router: appRouter,
      createContext: () => ({ user }),
      filter: (opts) =>
        opts.tool.name !== 'post_delete' || opts.ctx.user?.admin === true,
    });
  await using member = await connect(handler({ name: 'm', admin: false }));
  await using admin = await connect(handler({ name: 'a', admin: true }));

  const names = async (client: Client) =>
    (await client.listTools()).tools.map((t) => t.name);
  expect(await names(member)).not.toContain('post_delete');
  expect(await names(admin)).toContain('post_delete');
  await expect(
    member.callTool({ name: 'post_delete', arguments: { id: '1' } }),
  ).rejects.toMatchObject({ code: -32602 });
  const deleted = await admin.callTool({
    name: 'post_delete',
    arguments: { id: '1' },
  });
  expect(deleted.isError).toBeUndefined();
});

test("include: 'all' publishes every query and mutation without meta", () => {
  const names = describeTools(appRouter, { include: 'all' }).map((t) => t.name);
  expect(names).toContain('internal_reindex');
  expect(names).not.toContain('internal_hidden');
  expect(names).not.toContain('post_watch');

  const dotted = describeTools(appRouter, { separator: '.' }).map(
    (t) => t.name,
  );
  expect(dotted).toContain('post.byId');
});

test('two procedures with one tool name throw at creation', () => {
  const t = initTrpc().concat(mcp());
  const router = {
    a_b: t.procedure.meta({ mcp: true }).query(() => 1),
    a: { b: t.procedure.meta({ mcp: true }).query(() => 2) },
  };
  expect(() => describeTools(router)).toThrow(
    'MCP: "a.b" and "a_b" are both tool "a_b"',
  );
});

test('chained inputs become one object schema', () => {
  const t = initTrpc().concat(mcp());
  const router = {
    chained: t.procedure
      .meta({ mcp: true })
      .input(z.object({ org: z.string() }))
      .input(z.object({ id: z.string() }))
      .query(({ input }) => `${input.org}/${input.id}`),
  };
  const tool = describeTools(router)[0]!;
  expect(tool.inputSchema).toMatchObject({
    type: 'object',
    allOf: [
      { properties: { org: { type: 'string' } } },
      { properties: { id: { type: 'string' } } },
    ],
  });
});

test('createContext throwing UNAUTHORIZED answers 401 for OAuth discovery', async () => {
  const handler = createMcpHandler({
    router: appRouter,
    resourceMetadataUrl:
      'https://api.example.com/.well-known/oauth-protected-resource',
    createContext: (opts): Ctx => {
      if (!opts.request.headers.get('authorization')) {
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

  const authed = await post(
    handler,
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { authorization: 'Bearer abc' },
  );
  expect(authed.status).toBe(200);
});

test('the transport: stateless JSON over POST', async () => {
  const handler = handlerFor();

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
  expect(await init.json()).toMatchObject({
    id: 1,
    result: {
      protocolVersion: '2025-11-25',
      capabilities: { tools: { listChanged: false } },
    },
  });

  const notification = await post(handler, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });
  expect(notification.status).toBe(202);

  const unknown = await post(handler, { jsonrpc: '2.0', id: 2, method: 'x/y' });
  expect(await unknown.json()).toMatchObject({
    id: 2,
    error: { code: -32601 },
  });

  const garbage = await post(handler, '{not json');
  expect(garbage.status).toBe(400);
  expect(await garbage.json()).toMatchObject({ error: { code: -32700 } });

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

  const sse = await handler.fetch(new Request(URL_, { method: 'GET' }));
  expect(sse.status).toBe(405);
});
