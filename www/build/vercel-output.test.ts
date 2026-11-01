import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { fileURLToPath } from 'node:url';
import { Effect, FileSystem, Path } from 'effect';

import { hiddenPaths, site } from '../src/site.ts';
import { onDemandFunction } from './on-demand.ts';
import { siteTextFiles } from './site-files.ts';
import {
  land,
  redirectsFile,
  servedPaths,
  type TrpcRedirect,
} from './old-routes.ts';
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

/** A prerendered site in a temp dir, removed when the test ends. */
const setup = Effect.fn('setup')(function* (
  llms: string,
  redirects: ReadonlyArray<TrpcRedirect> = [
    {
      destination: '/docs/server/routers#nesting',
      permanent: true,
      source: '/docs/router',
    },
  ],
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
    'docs/introduction.md': '',
    'docs/introduction/index.html': '',
    'index.html': '',
    'index.md': '',
    'llms.txt': llms,
    'logo.svg': '',
    'docs/server/routers/index.html': '<h2 id="nesting">Nesting</h2>',
    'robots.txt': siteTextFiles().get('/robots.txt')?.source ?? '',
    'sponsor/index.html': '',
    'v10/docs/introduction/index.html': '',
    'v9/docs/introduction/index.html': '',
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
    path.join(root, redirectsFile),
    JSON.stringify(redirects),
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
        'docs/introduction.md': {
          contentType: 'text/markdown; charset=utf-8',
        },
        'docs/introduction/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'docs/introduction',
        },
        'index.md': { contentType: 'text/markdown; charset=utf-8' },
        'llms.txt': { contentType: 'text/plain; charset=utf-8' },
        'robots.txt': { contentType: 'text/plain; charset=utf-8' },
        'sponsor/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'sponsor',
        },
        'v10/docs/introduction/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'v10/docs/introduction',
        },
        'v9/docs/introduction/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'v9/docs/introduction',
        },
        'docs/server/routers/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'docs/server/routers',
        },
      });
      // v11, the stable release, has `/docs`.
      for (const [basePath, src] of [
        ['/docs', '^/docs$'],
        ['/v10/docs', '^/v10/docs$'],
        ['/v9/docs', '^/v9/docs$'],
      ]) {
        expect(config.routes).toContainEqual({
          headers: { Location: `${basePath}/introduction` },
          src,
          status: 308,
        });
      }
      const moved = config.routes.find(
        (route: { src: string; status?: number }) =>
          route.status === 308 && route.src.includes('v11'),
      );
      expect(moved.headers.Location).toBe('/docs$1');
      expect(
        '/v11/docs/client/links'.replace(new RegExp(moved.src), '/docs$1'),
      ).toBe('/docs/client/links');
      expect('/v11/docs'.replace(new RegExp(moved.src), '/docs$1')).toBe(
        '/docs',
      );

      const markdownRewrite = config.routes.find(
        (route: { dest?: string }) => route.dest === '/docs/$1.md',
      );
      const match = new RegExp(markdownRewrite.src).exec('/docs/client/links');
      expect(match?.[1]).toBe('client/links');
      expect(new RegExp(markdownRewrite.src).test('/docs/a.md')).toBe(false);
      // The older versions have no markdown.
      expect(new RegExp(markdownRewrite.src).test('/v9/docs/a')).toBe(false);

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
          "/docs/old: trpc.io sends it to /docs/gone, which this site doesn't serve",
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
});
