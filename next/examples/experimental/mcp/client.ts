/**
 * Calls the server as an agent would, with the official MCP SDK client, then
 * over RPC to see the same posts.
 */
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';

const textOf = (result: object) =>
  JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text);

export async function main(url: string) {
  const mcpUrl = new URL('/mcp', url);

  // --- MCP -------------------------------------------------------------------------

  const agent = new Client({ name: 'example', version: '1.0.0' });
  await agent.connect(
    new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers: { 'x-user': 'ada' } },
    }),
  );
  try {
    const listed = await agent.listTools();
    console.log(
      'tools/list',
      listed.tools.map((tool) => `${tool.name}: ${tool.description}`),
    );
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      ['post_byId', 'post_create'],
    );

    const found = await agent.callTool({
      name: 'post_byId',
      arguments: { id: '1' },
    });
    console.log('post_byId', found.structuredContent);
    assert.deepEqual(found.structuredContent, {
      id: '1',
      title: 'Hello MCP',
      at: '1970-01-01T00:00:00.000Z',
    });

    const missing = await agent.callTool({
      name: 'post_byId',
      arguments: { id: '404' },
    });
    console.log('post_byId 404', missing.isError, textOf(missing));
    assert.equal(missing.isError, true);
    assert.equal(textOf(missing).code, 'NOT_FOUND');

    const created = await agent.callTool({
      name: 'post_create',
      arguments: { title: 'From an agent' },
    });
    console.log('post_create', created.structuredContent);
    assert.equal(
      (created.structuredContent as { title: string }).title,
      'From an agent, by ada',
    );
  } finally {
    await agent.close();
  }

  // --- RPC -------------------------------------------------------------------------

  const rpc = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url })],
  });
  const posts = await rpc.post.list.query();
  console.log(
    'httpLink post.list',
    posts.map((post) => post.title),
  );
  assert.equal(posts.length, 2);
}

if (import.meta.main) {
  await main(process.argv[2] ?? 'http://localhost:3000/trpc');
}
