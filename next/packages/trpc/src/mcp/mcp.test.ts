import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  experimental_createMcpHandler,
  type McpHandler,
} from '@trpc12/trpc/mcp';
import { expect, test } from 'vite-plus/test';
import { blogRouter, freshPosts, type Ctx } from './fixtures/blog.ts';

const URL_ = 'http://localhost/mcp';

const handlerFor = (user: Ctx['user'] = null) =>
  experimental_createMcpHandler({
    router: blogRouter,
    serverInfo: { name: 'blog', version: '1.0.0' },
    instructions: 'A blog. Read posts before changing them.',
    exposeUnexpectedErrors: false,
    createContext: () => ({ user }),
  });

/** The official MCP SDK client, connected to `handler` in-process. */
async function connect(handler: McpHandler) {
  const client = new Client({ name: 'test', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  // The SDK's own types disagree under `exactOptionalPropertyTypes` (`sessionId`).
  await client.connect(transport as Transport);
  return Object.assign(client, {
    [Symbol.asyncDispose]: async () => {
      await client.close();
      await handler.dispose();
    },
  });
}

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
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        at: { type: 'string', format: 'date-time' },
      },
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
    },
  });
  // A non-object input travels as `{ input }`.
  expect(tools['post_search']!.inputSchema).toMatchObject({
    type: 'object',
    properties: { input: { type: 'string', minLength: 1 } },
    required: ['input'],
  });
  expect(tools['post_create']!.annotations).toEqual({ readOnlyHint: false });
  // `DELETE` routes are idempotent; the meta adds `destructiveHint`.
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
  expect(search.structuredContent).toBeUndefined();
});

test("procedure errors are tool results the model can read, in the OpenAPI handler's shape", async () => {
  using _posts = freshPosts();
  await using client = await connect(handlerFor());

  const missing = await client.callTool({
    name: 'post_byId',
    arguments: { id: '9' },
  });
  expect(missing.isError).toBe(true);
  const notFound = {
    defined: true,
    code: 'NOT_FOUND',
    message: 'NOT_FOUND',
    data: { id: '9' },
  };
  expect(textOf(missing)).toEqual(notFound);
  expect(missing._meta).toEqual({ 'io.trpc/error': notFound });

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
  expect(textOf(signedOut)).toMatchObject({
    code: 'UNAUTHORIZED',
    message: 'Sign in first',
  });

  // Unexpected throws are masked.
  const crash = await client.callTool({ name: 'post_crash', arguments: {} });
  expect(textOf(crash)).toMatchObject({
    defined: false,
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
  // A mutation without output answers with no content.
  const deleted = await client.callTool({
    name: 'post_delete',
    arguments: { id: '2' },
  });
  expect(deleted).toMatchObject({ content: [] });
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
    experimental_createMcpHandler({
      router: blogRouter,
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
