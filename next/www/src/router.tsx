import { createRouter } from '@tanstack/react-router';

import { NotFound } from './components/not-found.tsx';
import { routeTree } from './routeTree.gen.ts';

export function getRouter() {
  return createRouter({
    defaultNotFoundComponent: NotFound,
    // Hovering a link loads the page's content chunk, so the click renders
    // without waiting.
    defaultPreload: 'intent',
    // Content only changes with a deploy, so a loaded page never goes stale.
    defaultStaleTime: Number.POSITIVE_INFINITY,
    routeTree,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
