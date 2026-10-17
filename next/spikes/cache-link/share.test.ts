import { createElement, Suspense, use } from 'react';
import { renderToString } from 'react-dom/server';
import { createTrpcClient, localLink, routerType } from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';
import {
  cacheLink,
  createQueryCache,
  keyOf,
  stablePromises,
} from './cache-link.ts';
import { replaceEqualDeep, track } from './share.ts';

const t = initTrpc();
const posts = new Map([
  ['1', 'Hello'],
  ['2', 'World'],
]);
let calls = 0;
const router = {
  post: {
    list: t.procedure
      .input(z.object({ limit: z.number(), order: z.enum(['asc', 'desc']) }))
      .query(({ input }) => {
        calls++;
        return [...posts]
          .slice(0, input.limit)
          .map(([id, title]) => ({ id, title, tags: ['news'] }));
      }),
    rename: t.procedure
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation(({ input }) => {
        posts.set(input.id, input.title);
        return true;
      }),
  },
};

function setup() {
  calls = 0;
  posts.set('1', 'Hello').set('2', 'World');
  const cache = createQueryCache();
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [cacheLink({ cache }), localLink({ router })],
  });
  return { cache, trpc: stablePromises(client, cache) };
}

test('input keys are sorted before hashing, at any depth', () => {
  expect(keyOf('a', { x: 1, y: { p: 1, q: 2 } })).toBe(
    keyOf('a', { y: { q: 2, p: 1 }, x: 1 }),
  );
  expect(keyOf('a', [1, 2])).not.toBe(keyOf('a', [2, 1]));
  expect(keyOf('a', { at: new Date(0) })).not.toBe(
    keyOf('a', { at: new Date(1) }),
  );
  expect(keyOf('a', { at: new Date(0) })).not.toBe(
    keyOf('a', { at: '1970-01-01T00:00:00.000Z' }),
  );
});

test('the same input in another key order shares the promise', async () => {
  const { trpc } = setup();
  const first = trpc.post.list.query({ order: 'asc', limit: 2 });
  expect(trpc.post.list.query({ limit: 2, order: 'asc' })).toBe(first);
  await first;
  expect(calls).toBe(1);
});

test('a settled promise carries status and value, as React reads them', async () => {
  const ok = track(Promise.resolve(1));
  expect(ok.status).toBe('pending');
  await ok;
  expect(ok).toMatchObject({ status: 'fulfilled', value: 1 });
  const failed = track(Promise.reject(new Error('no')));
  await failed.catch(() => {});
  expect(failed).toMatchObject({ status: 'rejected', reason: new Error('no') });
});

test('use() renders a settled cached promise without suspending', async () => {
  const { trpc } = setup();
  const titles = () =>
    renderToString(
      createElement(
        Suspense,
        { fallback: 'loading' },
        createElement(function Posts() {
          const list = use(trpc.post.list.query({ limit: 2, order: 'asc' }));
          return createElement('p', null, list.map((p) => p.title).join(', '));
        }),
      ),
    );
  expect(titles()).toContain('loading');
  await trpc.post.list.query({ limit: 2, order: 'asc' });
  expect(titles()).toContain('<p>Hello, World</p>');
  expect(titles()).not.toContain('loading');
  // A plain resolved promise has no status, so React suspends on it.
  const plain = () =>
    renderToString(
      createElement(
        Suspense,
        { fallback: 'loading' },
        createElement(function Plain() {
          return use(Promise.resolve('done'));
        }),
      ),
    );
  expect(plain()).toContain('loading');
});

test('a refetch that changed one item keeps the other items and their arrays', async () => {
  const { cache, trpc } = setup();
  const input = { limit: 2, order: 'asc' } as const;
  const before = await trpc.post.list.query(input);
  await trpc.post.rename.mutate({ id: '2', title: 'Renamed' });
  const changed = new Promise<void>((resolve) => {
    const off = cache.subscribe(() => (off(), resolve()));
  });
  void trpc.post.list.query(input);
  await changed;
  const after = await trpc.post.list.query(input);
  expect(after).not.toBe(before);
  expect(after[0]).toBe(before[0]);
  expect(after[1]).not.toBe(before[1]);
  expect(after[1]!.tags).toBe(before[1]!.tags);
  expect(after[1]!.title).toBe('Renamed');
});

test('a refetch with an equal value keeps the promise and tells nobody', async () => {
  const { cache, trpc } = setup();
  const input = { limit: 1, order: 'desc' } as const;
  const first = trpc.post.list.query(input);
  await first;
  cache.invalidate();
  const listener = vi.fn<() => void>();
  cache.subscribe(listener);
  expect(trpc.post.list.query(input)).toBe(first);
  await vi.waitFor(() => expect(calls).toBe(2));
  await new Promise((r) => setTimeout(r, 0));
  expect(trpc.post.list.query(input)).toBe(first);
  expect(listener).not.toHaveBeenCalled();
});

test('replaceEqualDeep shares by structure, like TanStack Query', () => {
  const prev = { a: { b: [1, 2] }, c: new Date(0), d: new Map() };
  const same = replaceEqualDeep(prev, {
    a: { b: [1, 2] },
    c: new Date(0),
    d: prev.d,
  });
  expect(same).toBe(prev);
  const next = replaceEqualDeep(prev, {
    a: { b: [1, 2] },
    c: new Date(1),
    d: new Map(),
  });
  expect(next).not.toBe(prev);
  expect(next.a).toBe(prev.a);
  expect(next.c).not.toBe(prev.c);
  // Maps aren't plain objects: compared by identity, as in TanStack.
  expect(next.d).not.toBe(prev.d);
});
