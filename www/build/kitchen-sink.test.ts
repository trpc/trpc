/**
 * The kitchen sink (`src/routes/kitchen-sink`) is rendered on every request
 * and indexed nowhere: no search engine indexes it, the sitemap doesn't
 * list it, the build doesn't prerender it, and the host sends every request
 * there, its endpoints too, to the function, which nothing caches.
 */
import { readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from '@effect/vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { vi } from 'vitest';

import { showcases } from '../src/routes/kitchen-sink/-showcases.ts';
import { showcaseFolderUrl } from '../src/routes/kitchen-sink/-source.ts';
import { KitchenSinkLayout } from '../src/routes/kitchen-sink/route.tsx';

import { kitchenSinkPath, site, unindexedPaths } from '../src/site.ts';
import { unindexedPathProblems } from './hidden-paths.ts';
import {
  isRequestOnly,
  onDemandFunction,
  pathParam,
  prerenderFilter,
  requestOnlyCacheControl,
  requestOnlyPaths,
} from './on-demand.ts';
import type { VercelRoute } from './old-routes.ts';
import { pageCards } from './page-cards.ts';
import { noindexRoute, routes } from './vercel-output.ts';

const paths = [
  '/kitchen-sink',
  '/kitchen-sink/handles',
  '/kitchen-sink/handles?post=2',
  // A tRPC batch: the path has dots and commas.
  '/kitchen-sink/handles/api/post.byId,post.comments',
];

/** The site's routes on trpc.io in production, where pages are indexed. */
const production = routes([], [noindexRoute('https://trpc.io', 'production')]);

const before = (all: ReadonlyArray<VercelRoute>) =>
  all.slice(
    0,
    all.findIndex((route) => route.handle === 'filesystem'),
  );

/** The last value a `continue` route sets for `header`, before the files. */
const headerAt = (pathname: string, header: string) =>
  before(production)
    .filter(
      (route) =>
        route.continue === true &&
        route.has === undefined &&
        route.missing === undefined &&
        route.headers?.[header] !== undefined &&
        new RegExp(route.src ?? '$^').test(pathname),
    )
    .at(-1)?.headers?.[header];

/** Where the first route that doesn't `continue` sends `pathname`. */
const rewriteOf = (pathname: string) => {
  for (const route of before(production)) {
    const match =
      route.continue !== true && route.has === undefined
        ? new RegExp(route.src ?? '$^').exec(pathname)
        : null;
    if (match) {
      return route.dest?.replaceAll(
        /\$(\d+)/g,
        (_ref, index: string) => match[Number(index)] ?? '',
      );
    }
  }
  return undefined;
};

describe('the kitchen sink', () => {
  it('is unindexed, on every host', () => {
    expect(unindexedPaths).toContain(kitchenSinkPath);
    expect(
      unindexedPathProblems(
        kitchenSinkPath,
        new Map([['sitemap.xml', '<urlset></urlset>']]),
        production,
      ),
    ).toEqual([]);
    for (const path of paths) {
      expect(headerAt(path.split('?')[0] ?? '', 'X-Robots-Tag')).toBe(
        'noindex',
      );
    }
  });

  it('is neither prerendered nor in the sitemap', () => {
    for (const path of paths) {
      const page = { path };
      expect(prerenderFilter(page)).toBe(false);
      expect(page).toEqual({ path, sitemap: { exclude: true } });
    }
    // The rest of the site still is.
    const docs = { path: '/docs/client/links' };
    expect(prerenderFilter(docs)).toBe(true);
    expect(docs).toEqual({ path: '/docs/client/links' });
    expect(isRequestOnly('/kitchen-sinks')).toBe(false);
  });

  it('is sent to the function, with its path, and never cached', () => {
    expect(requestOnlyPaths).toContain(kitchenSinkPath);
    for (const path of paths) {
      const pathname = path.split('?')[0] ?? '';
      expect(rewriteOf(pathname)).toBe(
        `/${onDemandFunction}?${pathParam}=${pathname}`,
      );
      expect(headerAt(pathname, 'Cache-Control')).toBe(requestOnlyCacheControl);
    }
    // The prerendered pages are cached as before.
    expect(rewriteOf('/docs/client/links')).toBeUndefined();
    expect(headerAt('/docs/client/links', 'Cache-Control')).toContain(
      's-maxage=',
    );
  });
});

describe('the kitchen sink’s social cards', () => {
  it('lists every showcase folder, and registers a card for each page', () => {
    const folders = readdirSync(
      new URL('../src/routes/kitchen-sink', import.meta.url),
      { withFileTypes: true },
    )
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('-'))
      .map((entry) => `${kitchenSinkPath}/${entry.name}`);
    expect(showcases.map((showcase) => showcase.path).toSorted()).toEqual(
      folders.toSorted(),
    );
    const carded = pageCards.map((page) => page.path);
    for (const path of [kitchenSinkPath, ...folders]) {
      expect(carded).toContain(path);
    }
  });
});

/** Builds read the commit from `__TRPC_SENTRY_RELEASE__`; it's empty locally. */
const releaseResource = (release: string) => {
  vi.stubGlobal('__TRPC_SENTRY_RELEASE__', release);
  return makeResource({}, () => vi.unstubAllGlobals());
};

/** The kitchen sink's layout at `pathname`, rendered on the server. */
const renderLayout = async (pathname: string) => {
  const root = createRootRoute();
  const layout = createRoute({
    component: KitchenSinkLayout,
    getParentRoute: () => root,
    path: kitchenSinkPath,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [pathname] }),
    isServer: true,
    routeTree: root.addChildren([
      layout.addChildren(
        ['/', ...showcases.map((showcase) => showcase.path)].map((path) =>
          createRoute({
            getParentRoute: () => layout,
            path: path.replace(kitchenSinkPath, '') || '/',
          }),
        ),
      ),
    ]),
  });
  await router.load();
  return renderToString(createElement(RouterProvider, { router }));
};

describe('the kitchen sink’s GitHub links', () => {
  it('links each showcase’s folder, at the commit the build is from', () => {
    using _release = releaseResource('0123abc');
    for (const showcase of showcases) {
      const url = showcaseFolderUrl(showcase);
      const prefix = `${site.github}/tree/0123abc/`;
      expect(url.startsWith(prefix)).toBe(true);
      const folder = new URL(
        `../../${url.slice(prefix.length)}`,
        import.meta.url,
      );
      expect(statSync(folder).isDirectory()).toBe(true);
    }
  });

  it('links main without a commit', () => {
    using _release = releaseResource('');
    expect(showcaseFolderUrl(showcases[0])).toBe(
      `${site.github}/tree/main/www/src/routes/kitchen-sink/handles`,
    );
  });

  it('shows the button on every showcase, and not on the index', async () => {
    using _release = releaseResource('');
    for (const showcase of showcases) {
      const html = await renderLayout(`${showcase.path}?post=2`);
      expect(html).toContain('View example on GitHub');
      expect(html).toContain(`href="${showcaseFolderUrl(showcase)}"`);
    }
    expect(await renderLayout(kitchenSinkPath)).not.toContain(
      'View example on GitHub',
    );
  });
});
