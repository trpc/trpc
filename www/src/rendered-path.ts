/**
 * A page served at a path it wasn't rendered for: the host answers every
 * path it has no page for with `404.html`, the `/404` route prerendered
 * (`build/vercel-output.ts`). Hydrated as the path in the address bar, it
 * would render that path's not-found, which isn't its HTML: a hydration
 * mismatch (React #418). So the router reads that path as the one the page
 * was rendered for, until the reader leaves it, and the address bar keeps
 * it. `not-found-check.ts` checks it in Chrome.
 */
import type { AnyRouter, LocationRewrite } from '@tanstack/react-router';

export interface RenderedPath {
  readonly renderedPath: string;
}

let served: { readonly at: string; readonly for: string } | undefined;

const withPathname = (url: URL, pathname: string) => {
  const next = new URL(url);
  next.pathname = pathname;
  return next;
};

/** `getRouter()`'s `rewrite`, which does nothing on a page at its own path. */
export const renderedPathRewrite: LocationRewrite = {
  input: (location) =>
    served && location.url.pathname === served.at
      ? withPathname(location.url, served.for)
      : undefined,
  output: (location) =>
    served && location.url.pathname === served.for
      ? withPathname(location.url, served.at)
      : undefined,
};

/** For `dehydrate`, on the server: the path it rendered. */
export const dehydrateRenderedPath = (router: AnyRouter): RenderedPath => ({
  renderedPath: router.latestLocation.pathname,
});

/**
 * For `hydrate`, in the browser, which runs before the router reads the
 * address bar again and matches its routes.
 */
export function hydrateRenderedPath(
  dehydrated: RenderedPath,
  at: string = window.location.pathname,
) {
  served =
    dehydrated.renderedPath === at
      ? undefined
      : { at, for: dehydrated.renderedPath };
}
