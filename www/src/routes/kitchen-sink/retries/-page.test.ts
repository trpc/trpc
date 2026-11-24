// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';

import { appRouter } from './-server/router.ts';
import type * as Trpc from './-trpc.ts';
import { Route } from './index.tsx';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The page's loads go to the showcase's own router, as `api.$.ts` serves it
vi.mock('./-trpc.ts', async (importOriginal) => {
  const original = await importOriginal<typeof Trpc>();
  return {
    ...original,
    loadRetries: (opts: Parameters<typeof Trpc.loadRetries>[0]) =>
      original.loadRetries({
        ...opts,
        fetch: (url, init) =>
          fetchRequestHandler({
            allowMethodOverride: true,
            createContext: () => ({}),
            endpoint: original.endpoint,
            experimental_allowPipelining: true,
            req: new Request(
              new URL(
                url instanceof Request ? url.url : url,
                'http://localhost',
              ),
              init,
            ),
            router: appRouter,
          }),
      }),
  };
});

const rootRoute = createRootRoute();
const retriesRoute = Route.update({
  id: '/kitchen-sink/retries/',
  path: '/kitchen-sink/retries/',
  getParentRoute: () => rootRoute,
} as never);

async function renderPage() {
  vi.stubGlobal('__TRPC_SENTRY_RELEASE__', '');
  vi.stubGlobal('scrollTo', () => undefined);
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: ['/kitchen-sink/retries'],
    }),
    routeTree: rootRoute.addChildren([retriesRoute]),
  });
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(RouterProvider, { router }));
  });
  return makeAsyncResource({ container }, async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
}

test('the first load retries the author with its team, and bob with his avatar, but not the post', async () => {
  await using page = await renderPage();

  await vi.waitFor(
    () => {
      const text = page.container.textContent ?? '';
      expect(text).toContain('Core team');
      expect(text).toContain('🦊');
      expect(text).toContain('Request 2 carried only');
    },
    { timeout: 8000 },
  );
  const text = page.container.textContent ?? '';
  // The post never ran again, and no retry carried it
  expect(text).toMatch(/Retrying part of a load\s*run 1/);
  expect(text).toMatch(/Dee\s*run 2/);
  expect(text).toMatch(/Bob\s*run 2/);
  expect(text).not.toMatch(/carried only[^—]*post\.bySlug/);
  expect(text.match(/— not [^R]*post\.bySlug/g)?.length).toBeGreaterThan(0);
}, 15_000);
