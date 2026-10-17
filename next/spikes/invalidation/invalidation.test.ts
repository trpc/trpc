import { QueryClient } from '@tanstack/query-core';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';
import { HEADER, invalidation, invalidationLink } from './invalidation.ts';
import { chain, responseHttpLink } from './response-meta.ts';

const t = initTrpc().concat(invalidation());
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

function setup() {
  const handler = createFetchHandler({ router, batch: true });
  const queryClient = new QueryClient();
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    return handler.fetch(request);
  };
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: chain(
      invalidationLink({ queryClient }),
      responseHttpLink({ url: 'http://localhost/trpc', fetch, batch: true }),
    ),
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
  return {
    client,
    handler,
    invalidated,
    requests,
    [Symbol.asyncDispose]: () => handler.dispose(),
  };
}

test('a mutation invalidates the queries its meta names, before it resolves', async () => {
  await using app = setup();
  const { client, invalidated, requests } = app;
  await client.post.rename.mutate({ id: '1', title: 'Hi' });
  expect(invalidated()).toEqual({ list: true, one: true, two: false });
  expect([...requests[0]!.headers.keys()]).not.toContain(
    'trpc-invalidation-ref',
  );
});

test('the server sends the targets as a header; failures send none', async () => {
  await using app = setup();
  const res = await app.handler.fetch(
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

  await expect(app.client.post.fail.mutate()).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
  });
  expect(app.invalidated()).toEqual({ list: false, one: false, two: false });
});

test('concurrent mutations each invalidate their own targets', async () => {
  await using app = setup();
  const { client, invalidated } = app;
  await Promise.all([
    client.post.rename.mutate({ id: '1', title: 'A' }),
    client.post.byId.query({ id: '2' }),
  ]);
  expect(invalidated()).toEqual({ list: true, one: true, two: false });
});

test('the chain is checked: the link needs a response provider after it', () => {
  const queryClient = new QueryClient();
  const url = 'http://localhost/trpc';
  chain(invalidationLink({ queryClient }), responseHttpLink({ url }));
  // @ts-expect-error -- chain: a link needs 'response' from a link after it
  chain(invalidationLink({ queryClient }), httpLink({ url }));
  // @ts-expect-error -- a provider before the link doesn't count
  chain(responseHttpLink({ url }), invalidationLink({ queryClient }));
});
