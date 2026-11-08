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

test("a route that throws keeps the site's shell and the page's title", async () => {
  // What a page rendered by an older deploy throws once a newer one has
  // replaced its route's chunk.
  const error = new TypeError(
    'Failed to fetch dynamically imported module: https://trpc.io/assets/routes-C86Wg_2-.js',
  );
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
    ...errorOptions,
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
  expect(container.textContent).not.toContain('Something went wrong!');
  expect(container.querySelector('header')?.textContent).toBe('tRPC');
  expect(document.title).toBe('tRPC - Move Fast and Break Nothing.');
  await act(async () => {
    root.unmount();
  });
});
