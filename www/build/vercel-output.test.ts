import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { fileURLToPath } from 'node:url';
import { Effect, FileSystem, Path } from 'effect';

import { hiddenPaths, site } from '../src/site.ts';
import { onDemandFunction } from './on-demand.ts';
import { siteTextFiles } from './site-files.ts';
import { land, type Redirect, servedPaths } from './old-routes.ts';
import {
  isNoindex,
  noindexPageRoutes,
  noindexRoute,
  writeVercelOutput,
} from './vercel-output.ts';

const llmsTxt = [
  '# tRPC',
  '',
  '## Getting started',
  '',
  '- [Introduction](https://trpc.io/docs/introduction.md): tRPC.',
  '- [Links](https://trpc.io/docs/client/links.md): Links.',
  '',
].join('\n');

const sitemapPages = [
  '/',
  '/blog',
  '/docs',
  '/docs/client/links',
  '/docs/server/routers',
  '/docs/v10',
  '/docs/v9',
  '/sponsor',
];

/** The sitemap TanStack Start writes, which dates every page with the build. */
const sitemapOf = (pages: ReadonlyArray<string>) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map(
      (page) =>
        `<url><loc>${site.url}${page}</loc><lastmod>2026-11-01</lastmod></url>`,
    ),
    '</urlset>',
  ].join('\n');

const defaultRedirects: ReadonlyArray<Redirect> = [
  {
    destination: '/docs/server/routers#nesting',
    permanent: true,
    source: '/docs/router',
  },
  { destination: '/docs/:path*', permanent: true, source: '/docs/v11/:path*' },
  { destination: '/docs', permanent: true, source: '/docs/introduction' },
];

/** A prerendered site in a temp dir, removed when the test ends. */
const setup = Effect.fn('setup')(function* (
  llms: string,
  redirects: ReadonlyArray<Redirect> = defaultRedirects,
  listed: ReadonlyArray<string> = sitemapPages,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'vercel-output-' });
  const files = {
    '404.html': '',
    'apple-touch-icon.png': '',
    'assets/app.js': '',
    'blog/index.html': '',
    'favicon.ico': '',
    'docs/client/links.md': '',
    'docs/client/links/index.html': '',
    'docs/index.html': '',
    'docs/introduction.md': '',
    'docs/v10/index.html': '',
    'docs/v9/index.html': '',
    'index.html': '',
    'index.md': '',
    'llms.txt': llms,
    'logo.svg': '',
    'docs/server/routers/index.html': '<h2 id="nesting">Nesting</h2>',
    'sitemap.xml': sitemapOf(listed),
    'robots.txt': siteTextFiles().get('/robots.txt')?.source ?? '',
    'sponsor/index.html': '',
  };
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(root, 'dist/client', file);
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, contents);
  }
  yield* fs.makeDirectory(path.join(root, 'dist/server'), { recursive: true });
  yield* fs.writeFileString(
    path.join(root, 'dist/server/server.js'),
    'export default { fetch: () => new Response("") };\n',
  );
  yield* fs.writeFileString(
    path.join(root, 'vercel.json'),
    JSON.stringify({ framework: 'tanstack-start', redirects }),
  );
  return root;
});

describe('noindexRoute', () => {
  const noindex = {
    continue: true,
    headers: { 'X-Robots-Tag': 'noindex' },
    src: '^/.*$',
  };

  it('says noindex everywhere until the site is trpc.io', () => {
    expect(noindexRoute('https://www-trpc.vercel.app', 'production')).toEqual(
      noindex,
    );
  });

  it("says noindex on trpc.io's previews", () => {
    expect(noindexRoute('https://trpc.io', 'preview')).toEqual(noindex);
    expect(noindexRoute('https://trpc.io', '')).toEqual(noindex);
  });

  it('lets trpc.io be indexed in production, and no other host', () => {
    expect(noindexRoute('https://trpc.io', 'production')).toEqual({
      ...noindex,
      missing: [{ type: 'host', value: '^trpc\\.io$' }],
    });
    const host = new RegExp('^trpc\\.io$');
    expect(host.test('trpc.io')).toBe(true);
    expect(host.test('v12.trpc.io')).toBe(false);
    expect(host.test('trpc-v12.vercel.app')).toBe(false);
  });
});

describe('isNoindex', () => {
  it('reads the robots meta tag', () => {
    expect(isNoindex('<meta content="noindex" name="robots"/>')).toBe(true);
    expect(isNoindex('<meta name="robots" content="noindex, nofollow">')).toBe(
      true,
    );
    expect(isNoindex('<meta content="index" name="robots"/>')).toBe(false);
    expect(isNoindex('<p>noindex</p>')).toBe(false);
  });
});

describe('noindexPageRoutes', () => {
  it('says noindex on the pages and their markdown, and nowhere else', () => {
    expect(noindexPageRoutes([])).toEqual([]);
    const [route] = noindexPageRoutes(['/docs/openapi']);
    expect(route?.headers).toEqual({ 'X-Robots-Tag': 'noindex' });
    const pages = new RegExp(route?.src ?? '');
    expect(pages.test('/docs/openapi')).toBe(true);
    expect(pages.test('/docs/openapi.md')).toBe(true);
    expect(pages.test('/docs/client/links')).toBe(false);
    expect(pages.test('/docs/openapi/more')).toBe(false);
  });
});

describe('robots.txt', () => {
  it('points at the sitemap of site.url, which the cutover changes, and disallows the hidden paths', () => {
    const robots = siteTextFiles().get('/robots.txt')?.source ?? '';
    expect(robots).toContain(`Sitemap: ${site.url}/sitemap.xml`);
    for (const basePath of hiddenPaths) {
      expect(robots).toContain(`Disallow: ${basePath}\n`);
    }
  });

  it.effect('is out of public/, which would overwrite it', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      expect(
        yield* fs.exists(
          fileURLToPath(new URL('../public/robots.txt', import.meta.url)),
        ),
      ).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe('opensearch.xml', () => {
  it('searches the site at /search', () => {
    const xml = siteTextFiles().get('/opensearch.xml')?.source ?? '';
    expect(xml).toContain(`template="${site.url}/search?q={searchTerms}"`);
    expect(xml).toContain(`template="${site.url}/opensearch.xml"`);
  });
});

describe('writeVercelOutput', () => {
  it.effect('copies the site and writes its routes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* setup(llmsTxt);
      yield* writeVercelOutput(root);
      yield* writeVercelOutput(root);

      const output = path.join(root, '.vercel/output');
      expect(
        yield* fs.exists(path.join(output, 'static/docs/client/links.md')),
      ).toBe(true);
      const config = JSON.parse(
        yield* fs.readFileString(path.join(output, 'config.json')),
      );
      expect(config.version).toBe(3);
      expect(config.overrides).toEqual({
        'blog/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'blog',
        },
        'docs/client/links.md': {
          contentType: 'text/markdown; charset=utf-8',
        },
        'docs/client/links/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'docs/client/links',
        },
        'docs/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'docs',
        },
        'docs/introduction.md': {
          contentType: 'text/markdown; charset=utf-8',
        },
        'index.md': { contentType: 'text/markdown; charset=utf-8' },
        'llms.txt': { contentType: 'text/plain; charset=utf-8' },
        'robots.txt': { contentType: 'text/plain; charset=utf-8' },
        'sitemap.xml': { contentType: 'application/xml; charset=utf-8' },
        'sponsor/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'sponsor',
        },
        'docs/v10/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'docs/v10',
        },
        'docs/v9/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'docs/v9',
        },
        'docs/server/routers/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'docs/server/routers',
        },
      });
      const moved = config.routes.find(
        (route: { src: string; status?: number }) =>
          route.status === 308 && route.src.includes('v11'),
      );
      expect(moved.headers.Location).toBe('/docs$1');
      expect(
        '/docs/v11/client/links'.replace(new RegExp(moved.src), '/docs$1'),
      ).toBe('/docs/client/links');
      expect('/docs/v11'.replace(new RegExp(moved.src), '/docs$1')).toBe(
        '/docs',
      );

      const markdownRewrite = config.routes.find(
        (route: { dest?: string }) => route.dest === '/docs/$1.md',
      );
      const match = new RegExp(markdownRewrite.src).exec('/docs/client/links');
      expect(match?.[1]).toBe('client/links');
      expect(new RegExp(markdownRewrite.src).test('/docs/a.md')).toBe(false);
      // The older versions have no markdown.
      expect(new RegExp(markdownRewrite.src).test('/docs/v9/a')).toBe(false);
      expect(new RegExp(markdownRewrite.src).test('/docs/v10')).toBe(false);
      // v11's first page is at `/docs`, and so is its markdown's canonical URL.
      expect(config.routes).toContainEqual({
        dest: '/docs/introduction.md',
        has: [
          { key: 'accept', type: 'header', value: '(.*)text/markdown(.*)' },
        ],
        src: '^/docs$',
      });
      expect(config.routes).toContainEqual({
        continue: true,
        headers: { Link: `<${site.url}/docs>; rel="canonical"` },
        src: '^/docs/introduction\\.md$',
      });

      // Until the site is trpc.io, every response, before any redirect.
      expect(config.routes[0]).toEqual({
        continue: true,
        headers: { 'X-Robots-Tag': 'noindex' },
        src: '^/.*$',
      });

      // Searches go to the function, after the markdown and before the
      // files.
      const onDemand = config.routes.findIndex(
        (route: { dest?: string }) =>
          route.dest?.startsWith(`/${onDemandFunction}?`) === true,
      );
      expect(onDemand).toBeGreaterThan(config.routes.indexOf(markdownRewrite));
      expect(onDemand).toBeLessThan(
        config.routes.findIndex(
          (route: { handle?: string }) => route.handle === 'filesystem',
        ),
      );
      expect(
        yield* fs.exists(
          path.join(
            output,
            `functions/${onDemandFunction}.func/server/server.js`,
          ),
        ),
      ).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "redirects trpc.io's URLs, and fails on one that lands nowhere",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* setup(llmsTxt);
        yield* writeVercelOutput(root);
        const output = path.join(root, '.vercel/output');
        const config = JSON.parse(
          yield* fs.readFileString(path.join(output, 'config.json')),
        );
        const served = servedPaths(
          (yield* fs.readDirectory(path.join(output, 'static'), {
            recursive: true,
          })).map((file) => file.split(path.sep).join('/')),
        );
        expect(land(config.routes, served, '/docs/router').hops).toEqual([
          '/docs/server/routers#nesting',
        ]);
        expect(land(config.routes, served, '/docs/introduction').hops).toEqual([
          '/docs',
        ]);
        expect(land(config.routes, served, '/docs/v11').landed).toEqual({
          kind: 'file',
          path: '/docs',
        });
        expect(land(config.routes, served, '/docs/server/routers')).toEqual({
          hash: '',
          hops: [],
          landed: { kind: 'file', path: '/docs/server/routers' },
        });
        for (const [from, to] of [
          ['/index.html', '/'],
          ['/docs/server/routers/index.html', '/docs/server/routers'],
          ['/docs/server/routers.html', '/docs/server/routers'],
        ] as const) {
          expect(land(config.routes, served, from).hops).toEqual([to]);
        }

        const broken = yield* setup(llmsTxt, [
          { destination: '/docs/gone', permanent: true, source: '/docs/old' },
        ]);
        const error = yield* Effect.flip(writeVercelOutput(broken));
        expect(error.message).toContain(
          "vercel.json's redirects don't all land on a page:\n/docs/old: redirects to /docs/gone, a 404",
        );

        const noHeading = yield* setup(llmsTxt, [
          {
            destination: '/docs/server/routers#gone',
            permanent: true,
            source: '/docs/router',
          },
        ]);
        const headingError = yield* Effect.flip(writeVercelOutput(noHeading));
        expect(headingError.message).toContain(
          "/docs/router: redirects to /docs/server/routers#gone, a heading the page doesn't have",
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    'drops the lastmods, and fails on a page the sitemap leaves out',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* setup(llmsTxt);
        yield* writeVercelOutput(root);
        const sitemap = yield* fs.readFileString(
          path.join(root, '.vercel/output/static/sitemap.xml'),
        );
        expect(sitemap).toContain(`<url><loc>${site.url}/sponsor</loc></url>`);
        expect(sitemap).not.toContain('lastmod');

        const unlisted = yield* setup(
          llmsTxt,
          undefined,
          sitemapPages.filter((page) => page !== '/sponsor'),
        );
        const error = yield* Effect.flip(writeVercelOutput(unlisted));
        expect(error.message).toContain(
          "sitemap.xml doesn't list every page; add them to `pages` in vite.config.ts:\n/sponsor",
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
