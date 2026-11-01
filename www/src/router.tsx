import { createRouter } from '@tanstack/react-router';

import { startAnalytics } from './analytics.ts';
import { NotFound } from './components/not-found.tsx';
import {
  dehydrateRenderedPath,
  hydrateRenderedPath,
  type RenderedPath,
  renderedPathRewrite,
} from './rendered-path.ts';
import { routeTree } from './routeTree.gen.ts';
import {
  type DehydratedRelease,
  dehydrateRelease,
  hydrateRelease,
  traceRouter,
} from './sentry-client.ts';

export function getRouter() {
  const router = createRouter({
    defaultNotFoundComponent: NotFound,
    // Hovering a link loads the page's content chunk, so the click renders
    // without waiting.
    defaultPreload: 'intent',
    // Content only changes with a deploy, so a loaded page never goes stale.
    defaultStaleTime: Number.POSITIVE_INFINITY,
    dehydrate: (): DehydratedRelease & RenderedPath => ({
      ...dehydrateRelease(),
      ...dehydrateRenderedPath(router),
    }),
    hydrate: (dehydrated) => {
      hydrateRelease(dehydrated);
      hydrateRenderedPath(dehydrated);
    },
    rewrite: renderedPathRewrite,
    routeTree,
    scrollRestoration: true,
    // `styles.css` makes scrolling smooth for in-page links; a page change or
    // going back still jumps.
    scrollRestorationBehavior: 'instant',
  });
  traceRouter(router);
  startAnalytics(router);
  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
