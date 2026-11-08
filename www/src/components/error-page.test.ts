// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  HeadContent,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';

import { errorOptions } from './error-page.tsx';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
  vi.restoreAllMocks();
});

/** What a page rendered by an older deploy throws once a newer one has replaced its route's chunk. */
const staleChunk = () =>
  new TypeError(
    'Failed to fetch dynamically imported module: https://trpc.io/assets/routes-C86Wg_2-.js',
  );

/** Makes this page load look like one by `type`: `navigate` or `reload`. */
function loadedBy(type: 'navigate' | 'reload') {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    { type } as PerformanceNavigationTiming,
  ]);
}

/** Renders a site whose home page throws `error`, until its error page shows. */
async function renderThrowing(error: unknown, reload: () => void) {
  const rootRoute = createRootRoute({
    component: () =>
      createElement(
        Fragment,
        null,
        createElement(HeadContent),
        createElement('header', null, 'tRPC'),
        createElement(Outlet),
      ),
  });
  const home = createRoute({
    component: () => {
      throw error;
    },
    getParentRoute: () => rootRoute,
    head: () => ({
      meta: [{ title: 'tRPC - Move Fast and Break Nothing.' }],
    }),
    path: '/',
  });
  const router = createRouter({
    ...errorOptions(reload),
    history: createMemoryHistory(),
    routeTree: rootRoute.addChildren([home]),
  });
  // React logs what a boundary catches.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(RouterProvider, { router }));
  });
  await vi.waitFor(() => {
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
  return {
    container,
    [Symbol.asyncDispose]: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

test("a route that throws keeps the site's shell and the page's title", async () => {
  await using page = await renderThrowing(new Error('A bug'), () => {});
  expect(page.container.textContent).not.toContain('Something went wrong!');
  expect(page.container.querySelector('header')?.textContent).toBe('tRPC');
  expect(document.title).toBe('tRPC - Move Fast and Break Nothing.');
});

// Regression: `WWW-D` in Sentry. A route whose chunk a deploy replaced
// stopped at the error page until the reader pressed Reload.
test('a chunk a deploy replaced reloads the page once, and not again after', async () => {
  sessionStorage.clear();
  loadedBy('navigate');
  const reload = vi.fn<() => void>();
  {
    await using _page = await renderThrowing(staleChunk(), reload);
    expect(reload).toHaveBeenCalledTimes(1);
  }
  // The reloaded page throws it too: it stays on the error page.
  loadedBy('reload');
  {
    await using _page = await renderThrowing(staleChunk(), reload);
    expect(reload).toHaveBeenCalledTimes(1);
  }
});

test("another error doesn't reload the page", async () => {
  sessionStorage.clear();
  loadedBy('navigate');
  const reload = vi.fn<() => void>();
  await using _page = await renderThrowing(new Error('A bug'), reload);
  expect(reload).not.toHaveBeenCalled();
});
