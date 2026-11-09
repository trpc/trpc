import { experimental_describeTools, experimental_mcp } from '@trpc12/trpc/mcp';
import { experimental_openapi } from '@trpc12/trpc/openapi';
import {
  initTrpc,
  loadRouter,
  stream,
  type AnyRouter,
} from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';
import { blogRouter } from './fixtures/blog.ts';

const t = initTrpc().concat(experimental_openapi()).concat(experimental_mcp());

const names = (...args: Parameters<typeof experimental_describeTools>) =>
  experimental_describeTools(...args).map((tool) => tool.name);

test("include: 'all' publishes every query and mutation without meta", () => {
  const all = names(blogRouter, { include: 'all' });
  expect(all).toContain('internal_reindex');
  expect(all).not.toContain('internal_hidden');
  expect(all).not.toContain('post_watch');
});

test('include as a predicate picks procedures by path, type and meta', () => {
  const picked = names(blogRouter, {
    include: (info) => info.type === 'mutation' && info.path !== 'post.delete',
  });
  expect(picked).toEqual(['post_create', 'internal_reindex']);
});

test('separator joins the path, and mcp.name renames one tool', () => {
  expect(names(blogRouter, { separator: '.' })).toContain('post.byId');
  const router = {
    post: {
      byId: t.procedure.meta({ mcp: { name: 'get_post' } }).query(() => 1),
    },
  } satisfies AnyRouter;
  expect(names(router)).toEqual(['get_post']);
});

test('two procedures with one tool name throw', () => {
  const router = {
    a_b: t.procedure.meta({ mcp: true }).query(() => 1),
    a: { b: t.procedure.meta({ mcp: true }).query(() => 2) },
  } satisfies AnyRouter;
  expect(() => experimental_describeTools(router)).toThrow(
    'MCP: "a.b" and "a_b" are both tool "a_b"',
  );
});

test('chained inputs become one object schema', () => {
  const router = {
    chained: t.procedure
      .meta({ mcp: true })
      .input(z.object({ org: z.string() }))
      .input(z.object({ id: z.string() }))
      .query((opts) => `${opts.input.org}/${opts.input.id}`),
  } satisfies AnyRouter;
  const tool = experimental_describeTools(router)[0]!;
  expect(tool.inputSchema).toMatchObject({
    type: 'object',
    allOf: [
      { properties: { org: { type: 'string' } } },
      { properties: { id: { type: 'string' } } },
    ],
  });
});

test('meta merges across .meta() calls, annotations hint by hint', () => {
  const base = t.procedure.meta({
    mcp: { annotations: { openWorldHint: false } },
  });
  const router = {
    a: base
      .meta({
        mcp: {
          annotations: { destructiveHint: true },
          icons: [{ src: 'https://example.com/a.png', mimeType: 'image/png' }],
        },
        route: { method: 'PUT', summary: 'Replace a' },
      })
      .mutation(() => {}),
  } satisfies AnyRouter;
  expect(experimental_describeTools(router)[0]).toEqual({
    name: 'a',
    title: 'Replace a',
    // `route.summary` stands in for a missing description.
    description: 'Replace a',
    inputSchema: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: false,
      destructiveHint: true,
    },
    icons: [{ src: 'https://example.com/a.png', mimeType: 'image/png' }],
    _meta: { 'io.trpc/path': 'a', 'io.trpc/type': 'mutation' },
  });
  // A later boolean replaces the object.
  expect(names({ b: base.meta({ mcp: false }).query(() => 1) })).toEqual([]);
});

test('streamed outputs are never tools', () => {
  const router = {
    feed: t.procedure
      .meta({ mcp: true })
      .output(stream(z.number()))
      .query(async function* () {
        yield 1;
      }),
  } satisfies AnyRouter;
  expect(names(router, { include: 'all' })).toEqual([]);
});

test('a lazy subtree must be loaded first', async () => {
  const router = {
    posts: t.lazy(async () => ({
      list: t.procedure.meta({ mcp: true }).query(() => []),
    })),
  } satisfies AnyRouter;
  expect(() => experimental_describeTools(router)).toThrow(
    '"posts" is lazy and hasn\'t loaded',
  );
  expect(names(await loadRouter(router))).toEqual(['posts_list']);
});
