import { QueryClient } from '@tanstack/query-core';
import { createTrpcClient, httpLink, routerType } from 'trpcdev/client';
import { createFetchHandler, initTrpc } from 'trpcdev/server';
import { afterAll, expect, test } from 'vite-plus/test';
import { z } from 'zod';
import {
  HEADER,
  invalidation,
  invalidationLink,
  REF_HEADER,
} from './invalidation.ts';

const t = initTrpc().with(invalidation());
const titles = new Map([
  ['1', 'Hello'],
  ['2', 'World'],
]);
const router = {
  post: {
    list: t.procedure.query(() => [...titles.values()]),
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => titles.get(input.id) ?? null),
    rename: t.procedure
      .meta({ invalidates: ['post.list'] })
      .meta({
        invalidates: [
          (post: { id: string }) => [
            { path: 'post.byId', input: { id: post.id } },
          ],
        ],
      })
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation(({ input }) => {
        titles.set(input.id, input.title);
        return { id: input.id };
      }),
    fail: t.procedure.meta({ invalidates: ['post.list'] }).mutation(() => {
      throw new Error('nope');
    }),
  },
};

const handler = createFetchHandler({ router });
afterAll(() => handler.dispose());

function setup() {
  const queryClient = new QueryClient();
  const requests: Request[] = [];
  const invalidating = invalidationLink({
    queryClient,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      return handler.fetch(request);
    },
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      invalidating,
      httpLink({ url: 'http://localhost/trpc', fetch: invalidating.fetch }),
    ],
  });
  const keys = {
    list: [['post', 'list'], { type: 'query' }],
    one: [['post', 'byId'], { input: { id: '1' }, type: 'query' }],
    two: [['post', 'byId'], { input: { id: '2' }, type: 'query' }],
  } as const;
  for (const key of Object.values(keys))
    queryClient.setQueryData(key, 'cached');
  const invalidated = () =>
    Object.fromEntries(
      Object.entries(keys).map(([name, key]) => [
        name,
        queryClient.getQueryState(key)?.isInvalidated,
      ]),
    );
  return { client, invalidated, requests };
}

test('a mutation invalidates the queries its meta names, before it resolves', async () => {
  const { client, invalidated, requests } = setup();
  await client.post.rename.mutate({ id: '1', title: 'Hi' });
  expect(invalidated()).toEqual({ list: true, one: true, two: false });
  expect(requests[0]!.headers.get(REF_HEADER)).toBe('0');
});

test('the server sends the targets as a header; failures send none', async () => {
  const res = await handler.fetch(
    new Request('http://localhost/trpc/post.rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ json: { id: '2', title: 'Hey' } }),
    }),
  );
  expect(JSON.parse(res.headers.get(HEADER)!)).toEqual([
    'post.list',
    { path: 'post.byId', input: { id: '2' } },
  ]);

  const { client, invalidated } = setup();
  await expect(client.post.fail.mutate()).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
  });
  expect(invalidated()).toEqual({ list: false, one: false, two: false });
});

test('concurrent mutations each invalidate their own targets', async () => {
  const { client, invalidated } = setup();
  await Promise.all([
    client.post.rename.mutate({ id: '1', title: 'A' }),
    client.post.byId.query({ id: '2' }),
  ]);
  expect(invalidated()).toEqual({ list: true, one: true, two: false });
});
