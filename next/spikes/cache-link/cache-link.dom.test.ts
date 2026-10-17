// @vitest-environment happy-dom
import { createTrpcClient, localLink, routerType } from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';
import { createElement, Suspense, use } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';
import { cacheLink, createQueryCache, stablePromises } from './cache-link.ts';

const t = initTrpc();
let calls = 0;
const router = {
  post: {
    byId: t.procedure.input(z.object({ id: z.string() })).query(({ input }) => {
      calls++;
      return { id: input.id, title: `Post ${input.id}` };
    }),
  },
};

async function render(stable: boolean) {
  calls = 0;
  const cache = createQueryCache();
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [cacheLink({ cache }), localLink({ router })],
  });
  const trpc = stable ? stablePromises(client, cache) : client;
  function Post() {
    return createElement(
      'h1',
      null,
      use(trpc.post.byId.query({ id: '1' })).title,
    );
  }
  const warnings: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((message) => {
    warnings.push(String(message));
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(
    createElement(Suspense, { fallback: 'loading' }, createElement(Post)),
  );
  // React waits ~300 ms before replacing a shown fallback.
  for (let i = 0; i < 20 && !container.innerHTML.startsWith('<h1>'); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const html = container.innerHTML;
  root.unmount();
  spy.mockRestore();
  const uncached = warnings.filter((w) =>
    w.includes('uncached promise'),
  ).length;
  return { html, calls, uncached };
}

test('in the browser, use() needs the same promise across retries', async () => {
  const stable = await render(true);
  expect(stable).toEqual({ html: '<h1>Post 1</h1>', calls: 1, uncached: 0 });

  // The link cache makes the retry's new promise resolve to the same data,
  // so it renders, but React warns: it can't tell the promise is cached.
  const plain = await render(false);
  expect(plain).toMatchObject({ html: '<h1>Post 1</h1>', calls: 1 });
  expect(plain.uncached).toBeGreaterThan(0);
});
