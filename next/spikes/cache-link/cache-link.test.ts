import { createElement, Suspense, use } from 'react';
import { prerender } from 'react-dom/static';
import { createTrpcClient, localLink, routerType } from '@trpc12/trpc/client';
import { error, initTrpc } from '@trpc12/trpc/server';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';
import { cacheLink, createQueryCache, stablePromises } from './cache-link.ts';

const t = initTrpc();
const titles = new Map([['1', 'Hello']]);
let calls = 0;
const router = {
  post: {
    byId: t.procedure.input(z.object({ id: z.string() })).query(({ input }) => {
      calls++;
      const title = titles.get(input.id);
      return title === undefined
        ? error({ code: 'NOT_FOUND' })
        : { id: input.id, title, at: new Date(0) };
    }),
    rename: t.procedure
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation(({ input }) => {
        titles.set(input.id, input.title);
        return true;
      }),
  },
};

function setup(opts: { now?: () => number } = {}) {
  calls = 0;
  titles.set('1', 'Hello');
  const cache = createQueryCache({ ttlMs: 1000, ...opts });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [cacheLink({ cache }), localLink({ router })],
  });
  return { cache, client, trpc: stablePromises(client, cache) };
}

test('a plain client returns a new promise per call, which use() cannot take', () => {
  const { client } = setup();
  expect(client.post.byId.query({ id: '1' })).not.toBe(
    client.post.byId.query({ id: '1' }),
  );
});

test('with the hook, the same call returns the same promise while its value is the same', async () => {
  let now = 0;
  const { trpc } = setup({ now: () => now });
  const first = trpc.post.byId.query({ id: '1' });
  expect(trpc.post.byId.query({ id: '1' })).toBe(first);
  expect(trpc.post.byId.query({ id: '2' })).not.toBe(first);
  await first;
  now = 1001;
  // Expired: still the same promise, refetched in the background. The new
  // value equals the old one (a new `Date` with the same time), so it stays.
  expect(trpc.post.byId.query({ id: '1' })).toBe(first);
  await vi.waitFor(() => expect(calls).toBe(3));
  expect(trpc.post.byId.query({ id: '1' })).toBe(first);
});

test('plain calls share the cache through the link; ignoreCache skips it', async () => {
  const { client } = setup();
  const a = await client.post.byId.query({ id: '1' });
  const b = await client.post.byId.query({ id: '1' });
  expect(b).toBe(a);
  expect(calls).toBe(1);
  await client.post.byId.query({ id: '1' }, { ignoreCache: true });
  expect(calls).toBe(2);
});

test('failures are not cached', async () => {
  const { trpc } = setup();
  const failed = trpc.post.byId.query({ id: 'missing' });
  await expect(failed).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const retried = trpc.post.byId.query({ id: 'missing' });
  expect(retried).not.toBe(failed);
  await expect(retried).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('a mutation marks queries stale; the refetch with a new value makes a new promise', async () => {
  const { cache, trpc } = setup();
  const before = trpc.post.byId.query({ id: '1' });
  await before;
  let notified = 0;
  cache.subscribe(() => notified++);
  await trpc.post.rename.mutate({ id: '1', title: 'Renamed' });
  expect(notified).toBe(1);
  expect(trpc.post.byId.query({ id: '1' })).toBe(before);
  await vi.waitFor(() => expect(notified).toBe(2));
  const after = trpc.post.byId.query({ id: '1' });
  expect(after).not.toBe(before);
  expect(await after).toMatchObject({ title: 'Renamed' });
  expect((await after).at).toBe((await before).at);
});

test('use() renders a cached query; components with the same call share one request', async () => {
  const { trpc } = setup();
  function Post({ id }: { id: string }) {
    const post = use(trpc.post.byId.query({ id }));
    return createElement('h1', null, `${post.title} ${post.at}`);
  }
  const { prelude } = await prerender(
    createElement(
      Suspense,
      { fallback: 'loading' },
      createElement(Post, { id: '1' }),
      createElement(Post, { id: '1' }),
    ),
  );
  const html = await new Response(prelude).text();
  expect(html).toContain('Hello 1970-01-01T00:00:00.000Z');
  expect(calls).toBe(1);
});
