// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';

import type { Mode } from './-meter.ts';
import type * as Trpc from './-trpc.ts';
import type { loadPosts, Posts } from './-trpc.ts';
import { Route } from './index.tsx';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Each load the page starts, with the mode and signal it got */
const loads = vi.hoisted(() =>
  Array<{ readonly mode: Mode; readonly signal: AbortSignal | undefined }>(),
);

vi.mock('./-trpc.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Trpc>()),
  loadPosts: (opts: Parameters<typeof loadPosts>[0]) => {
    loads.push({ mode: opts.mode, signal: opts.signal });
    // Still on its way: the page shows its skeleton.
    return new Promise<Posts>(() => undefined);
  },
}));

const rootRoute = createRootRoute();
const nestedRoute = Route.update({
  id: '/kitchen-sink/nested/',
  path: '/kitchen-sink/nested/',
  getParentRoute: () => rootRoute,
} as never);

/** The showcase's page at `url`, mounted in a router of its own */
async function renderPage(url: string) {
  loads.length = 0;
  // The build defines it; the page links its files at that commit.
  vi.stubGlobal('__TRPC_SENTRY_RELEASE__', '');
  // The router scrolls on each navigation, which jsdom doesn't do.
  vi.stubGlobal('scrollTo', () => undefined);
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [url] }),
    routeTree: rootRoute.addChildren([nestedRoute]),
  });
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(RouterProvider, { router }));
  });
  await vi.waitFor(() => expect(loads.length).toBeGreaterThan(0));
  return makeAsyncResource({ router }, async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
}

// Regression: only the radio started a load, so a change of `?mode=` alone,
// such as Back, kept the last mode's results and request count.
test('loads again when only the URL’s mode changes', async () => {
  await using page = await renderPage('/kitchen-sink/nested?mode=separate');
  expect(loads.map((load) => load.mode)).toEqual(['separate']);

  await act(() =>
    page.router.navigate({ to: '/kitchen-sink/nested', search: {} }),
  );
  await vi.waitFor(() =>
    expect(loads.map((load) => load.mode)).toEqual(['separate', 'pipelined']),
  );

  await act(async () => page.router.history.back());
  await vi.waitFor(() =>
    expect(loads.map((load) => load.mode)).toEqual([
      'separate',
      'pipelined',
      'separate',
    ]),
  );
});

// Regression: a load that a switch replaced kept going.
test('stops a load when the mode changes, and when the page goes', async () => {
  {
    await using page = await renderPage('/kitchen-sink/nested');
    await act(() =>
      page.router.navigate({
        to: '/kitchen-sink/nested',
        search: { mode: 'separate' },
      }),
    );
    await vi.waitFor(() => expect(loads).toHaveLength(2));
    expect(loads.map((load) => load.signal?.aborted)).toEqual([true, false]);
  }
  // Unmounted
  expect(loads.map((load) => load.signal?.aborted)).toEqual([true, true]);
});
