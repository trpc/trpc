import { composeRewrites, createRouter } from '@tanstack/react-router';

import { startAnalytics } from './analytics.ts';
import {
  type DehydratedCardDay,
  dehydrateCardDay,
  hydrateCardDay,
} from './card-day.ts';
import { errorOptions } from './components/error-page.tsx';
import {
  type DehydratedPages,
  dehydratePages,
  hydratePages,
} from './content/page-html.ts';
import { NotFound } from './components/not-found.tsx';
import { firstDocRewrite } from './first-doc.ts';
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
    ...errorOptions,
    defaultNotFoundComponent: NotFound,
    // Hovering a link loads the page's content chunk, so the click renders
    // without waiting.
    defaultPreload: 'intent',
    // A link to a heading on another page jumps there, like opening it.
    defaultHashScrollIntoView: { behavior: 'instant', block: 'start' },
    // Content only changes with a deploy, so a loaded page never goes stale.
    defaultStaleTime: Number.POSITIVE_INFINITY,
    dehydrate: (): DehydratedCardDay &
      DehydratedPages &
      DehydratedRelease &
      RenderedPath => ({
      ...dehydrateCardDay(),
      ...dehydratePages(router),
      ...dehydrateRelease(),
      ...dehydrateRenderedPath(router),
    }),
    hydrate: async (dehydrated) => {
      hydrateCardDay(dehydrated);
      hydrateRelease(dehydrated);
      hydrateRenderedPath(dehydrated);
      await hydratePages(dehydrated, () => window.location.reload());
    },
    rewrite: composeRewrites([renderedPathRewrite, firstDocRewrite]),
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
