import { describe, expect, it } from '@effect/vitest';

import {
  follow,
  land,
  oldRedirects,
  onTrpcIoRoutes,
  redirectRoutes,
  respond,
  routeProblems,
  servedPaths,
  siteLocation,
  type TrpcRedirect,
  trpcPages,
  type VercelRoute,
} from './old-routes.ts';
import { routes } from './vercel-output.ts';

const redirects: ReadonlyArray<TrpcRedirect> = [
  {
    destination: '/docs/server/routers',
    permanent: true,
    source: '/docs/router',
  },
  {
    destination: '/docs/reactjs/useUtils#invalidation',
    permanent: true,
    source: '/docs/invalidateQueries',
  },
  {
    destination: '/docs/client/react/:path',
    permanent: true,
    source: '/docs/reactjs/:path',
  },
  { destination: '/docs/:path*', permanent: true, source: '/docs/v11/:path*' },
  { destination: '/docs/', permanent: true, source: '/docs/v11' },
  {
    destination: 'https://discord.gg/abc',
    permanent: false,
    source: '/discord',
  },
  { destination: '/docs/faq', permanent: false, source: '/faq' },
  {
    destination: '/server/adapters',
    permanent: true,
    source: '/docs/server/api-handler',
  },
  { destination: '/docs/gone', permanent: true, source: '/docs/old' },
];

const served = servedPaths([
  '404.html',
  'blog/announcing-trpc-v11/index.html',
  'blog/index.html',
  'blog/rss.xml',
  'docs/client/react/useQuery/index.html',
  'docs/client/react/useUtils/index.html',
  'docs/faq/index.html',
  'docs/introduction/index.html',
  'docs/server/adapters/index.html',
  'docs/server/routers/index.html',
  'favicon.ico',
  'index.html',
  'logo.svg',
  'sponsor/index.html',
  'v10/docs/introduction/index.html',
  'v10/docs/server/routers/index.html',
  'v11/img/links-diagram.svg',
  'v12/docs/getting-started.md',
  'v12/docs/getting-started/index.html',
  'v12/docs/server/transformers.md',
  'v12/docs/server/transformers/index.html',
  'v12/decisions/progressive-json/index.html',
  'v12/decisions/replaceable-transformers/index.html',
]);

describe('servedPaths', () => {
  it('serves a prerendered page at its directory, and other files as they are', () => {
    expect([...served]).toEqual(
      expect.arrayContaining([
        '/',
        '/blog',
        '/blog/rss.xml',
        '/v12/docs/getting-started',
      ]),
    );
    expect(served.has('/404.html')).toBe(false);
    expect(served.has('/404')).toBe(false);
  });
});

describe('follow', () => {
  it("follows trpc.io's redirects in order, with their params, to a page or off the site", () => {
    expect(follow('/docs/router', redirects)).toEqual({
      hash: '',
      permanent: true,
      target: '/docs/server/routers',
    });
    expect(follow('/docs/v11/reactjs/useQuery/', redirects)).toEqual({
      hash: '',
      permanent: true,
      target: '/docs/client/react/useQuery',
    });
    expect(follow('/discord', redirects)).toEqual({
      hash: '',
      permanent: false,
      target: 'https://discord.gg/abc',
    });
    expect(follow('/docs/v11', redirects).target).toBe('/docs');
  });

  it('keeps the #hash a hop adds through the hops after it', () => {
    expect(follow('/docs/invalidateQueries', redirects)).toEqual({
      hash: '#invalidation',
      permanent: true,
      target: '/docs/client/react/useUtils',
    });
  });

  it('is temporary when any hop is', () => {
    expect(follow('/faq', redirects).permanent).toBe(false);
  });
});

describe('siteLocation', () => {
  it("is v11's page at trpc.io's path, and its first page for `/docs`", () => {
    expect(siteLocation('/docs/server/routers', served)).toBe(
      '/docs/server/routers',
    );
    expect(siteLocation('/docs', served)).toBe('/docs/introduction');
  });

  it('is the copy of an older version', () => {
    expect(siteLocation('/docs/v10/server/routers', served)).toBe(
      '/v10/docs/server/routers',
    );
    expect(siteLocation('/docs/v10', served)).toBe('/v10/docs/introduction');
  });

  it('is a post, an image or a URL off the site as they are', () => {
    expect(siteLocation('/blog/announcing-trpc-v11', served)).toBe(
      '/blog/announcing-trpc-v11',
    );
    expect(siteLocation('/img/links-diagram.svg', served)).toBe(
      '/v11/img/links-diagram.svg',
    );
    expect(siteLocation('https://discord.gg/abc', served)).toBe(
      'https://discord.gg/abc',
    );
  });

  it("is nothing for what the site doesn't serve", () => {
    expect(siteLocation('/docs/gone', served)).toBeUndefined();
    expect(siteLocation('/docs/v10/gone', served)).toBeUndefined();
    expect(siteLocation('/img/gone.svg', served)).toBeUndefined();
  });
});

describe('trpcPages', () => {
  it("lists trpc.io's URL for each copied page, post and image", () => {
    expect(trpcPages(served)).toEqual(
      expect.arrayContaining([
        '/blog',
        '/blog/announcing-trpc-v11',
        '/docs/client/react/useQuery',
        '/docs/v10/server/routers',
        '/docs/v10',
        '/img/links-diagram.svg',
      ]),
    );
    // `/docs` is v11's, served at trpc.io's path; v9 has no pages here.
    expect(trpcPages(served)).not.toContain('/docs');
    expect(trpcPages(served)).not.toContain('/docs/v9');
  });
});

describe('oldRedirects', () => {
  const result = oldRedirects({ redirects, served });
  const bySource = new Map(
    result.redirects.map((redirect) => [redirect.source, redirect]),
  );

  it('redirects each old URL once, to where trpc.io sends it', () => {
    expect(bySource.get('/docs/router')).toEqual({
      location: '/docs/server/routers',
      source: '/docs/router',
      status: 308,
    });
    expect(bySource.get('/docs/invalidateQueries')).toEqual({
      location: '/docs/client/react/useUtils#invalidation',
      source: '/docs/invalidateQueries',
      status: 308,
    });
    expect(bySource.get('/docs/v10/server/routers')?.location).toBe(
      '/v10/docs/server/routers',
    );
    expect(bySource.get('/discord')).toEqual({
      location: 'https://discord.gg/abc',
      source: '/discord',
      status: 307,
    });
    expect(bySource.get('/faq')).toEqual({
      location: '/docs/faq',
      source: '/faq',
      status: 307,
    });
  });

  it("answers a redirect's params for every page they reach", () => {
    expect(bySource.get('/docs/reactjs/useQuery')?.location).toBe(
      '/docs/client/react/useQuery',
    );
    expect(bySource.get('/docs/v11/faq')?.location).toBe('/docs/faq');
    expect(bySource.get('/docs/v11/server/routers')?.location).toBe(
      '/docs/server/routers',
    );
    expect(bySource.get('/docs/v11')?.location).toBe('/docs/introduction');
    expect(
      [...bySource.keys()].filter((source) =>
        source.startsWith('/docs/v11/v10'),
      ),
    ).toEqual([]);
  });

  it("leaves the site's own pages alone, v11's among them", () => {
    expect(bySource.has('/docs/server/routers')).toBe(false);
    expect(bySource.has('/docs/faq')).toBe(false);
    expect(bySource.has('/blog')).toBe(false);
  });

  it("fixes trpc.io's redirects to nowhere, and sends retired pages elsewhere", () => {
    expect(bySource.get('/docs/server/api-handler')?.location).toBe(
      '/docs/server/adapters',
    );
    expect(bySource.get('/blog/archive')?.location).toBe('/blog');
    expect(bySource.get('/pricing')).toEqual({
      location: '/sponsor',
      source: '/pricing',
      status: 308,
    });
  });

  it("sends a moved v12 page's URL and its markdown's to where it is now", () => {
    expect(bySource.get('/v12/docs/server/serializers')).toEqual({
      location: '/v12/docs/server/transformers',
      source: '/v12/docs/server/serializers',
      status: 308,
    });
    expect(bySource.get('/v12/docs/server/serializers.md')?.location).toBe(
      '/v12/docs/server/transformers.md',
    );
  });

  it("sends a moved decision's URL where it is now, and not its markdown's, which no decision has", () => {
    expect(bySource.get('/v12/decisions/serializer')).toEqual({
      location: '/v12/decisions/progressive-json',
      source: '/v12/decisions/serializer',
      status: 308,
    });
    expect(
      bySource.get('/v12/decisions/replaceable-serializers')?.location,
    ).toBe('/v12/decisions/replaceable-transformers');
    expect(bySource.has('/v12/decisions/serializer.md')).toBe(false);
  });

  it('names each URL that lands nowhere', () => {
    expect(result.problems).toEqual([
      "/docs/old: trpc.io sends it to /docs/gone, which this site doesn't serve",
    ]);
  });
});

describe('redirectRoutes', () => {
  it('shares a route between redirects that keep the end of the path', () => {
    expect(
      redirectRoutes([
        { location: '/v10/docs/a', source: '/docs/v10/a', status: 308 },
        { location: '/v10/docs/b/c', source: '/docs/v10/b/c', status: 308 },
        { location: '/v11/docs/x.y', source: '/docs/x.y', status: 307 },
        { location: '/blog', source: '/blog/archive', status: 308 },
      ]),
    ).toEqual([
      {
        headers: { Location: '/v10/docs$1' },
        src: '^/docs/v10(/a|/b/c)$',
        status: 308,
      },
      {
        headers: { Location: '/v11$1' },
        src: '^(/docs/x\\.y)$',
        status: 307,
      },
      {
        headers: { Location: '/blog' },
        src: '^/blog/archive$',
        status: 308,
      },
    ]);
  });
});

describe('onTrpcIoRoutes', () => {
  it("sends what only trpc.io's own site has there, wherever it is", () => {
    const toTrpcIo = onTrpcIoRoutes('https://trpc.io');
    expect(land(toTrpcIo, served, '/docs/typedoc/server').hops).toEqual([
      'https://trpc.io/docs/typedoc/server',
    ]);
    expect(land(toTrpcIo, served, '/docs/typedoc').hops).toEqual([
      'https://trpc.io/docs/typedoc',
    ]);
    expect(land(toTrpcIo, served, '/media').hops).toEqual([]);
    expect(land(toTrpcIo, served, '/pricing').hops).toEqual([]);
    expect(land(toTrpcIo, served, '/docs/typedocs').hops).toEqual([]);
    expect(
      land(
        onTrpcIoRoutes('https://www-trpc.vercel.app/'),
        served,
        '/docs/typedoc/server',
      ).hops,
    ).toEqual(['https://www-trpc.vercel.app/docs/typedoc/server']);
    expect(onTrpcIoRoutes(undefined)).toEqual([]);
  });
});

describe('respond and land', () => {
  const all = routes('getting-started', [
    ...redirectRoutes(oldRedirects({ redirects, served }).redirects),
    ...onTrpcIoRoutes('https://trpc.io'),
  ]);

  it("answers as Vercel's routes do", () => {
    expect(respond(all, served, '/v12/docs/getting-started')).toEqual({
      kind: 'file',
      path: '/v12/docs/getting-started',
    });
    expect(respond(all, served, '/nope')).toEqual({ kind: 'missing' });
    expect(respond(all, served, '/v12/docs')).toEqual({
      kind: 'redirect',
      location: '/v12/docs/getting-started',
      status: 307,
    });
    expect(respond(all, served, '/docs')).toEqual({
      kind: 'redirect',
      location: '/docs/introduction',
      status: 308,
    });
  });

  it('follows the redirects to the page, with the hash they carry', () => {
    expect(land(all, served, '/docs/router/')).toEqual({
      hash: '',
      hops: ['/docs/router', '/docs/server/routers'],
      landed: { kind: 'file', path: '/docs/server/routers' },
    });
    expect(land(all, served, '/docs/invalidateQueries')).toEqual({
      hash: '#invalidation',
      hops: ['/docs/client/react/useUtils#invalidation'],
      landed: { kind: 'file', path: '/docs/client/react/useUtils' },
    });
  });

  it('finds no problems with the routes the site writes', () => {
    const result = oldRedirects({ redirects: redirects.slice(0, -1), served });
    expect(
      routeProblems({
        oldSiteUrl: 'https://trpc.io',
        redirects: result.redirects,
        routes: routes('getting-started', [
          ...redirectRoutes(result.redirects),
          ...onTrpcIoRoutes('https://trpc.io'),
        ]),
        served,
        siteUrl: 'https://v12.trpc.io',
      }),
    ).toEqual([]);
  });

  it("needs trpc.io's own site somewhere else once the site is trpc.io", () => {
    const result = oldRedirects({ redirects: redirects.slice(0, -1), served });
    const at = (oldSiteUrl: string | undefined) =>
      routeProblems({
        oldSiteUrl,
        redirects: result.redirects,
        routes: routes('getting-started', [
          ...redirectRoutes(result.redirects),
          ...onTrpcIoRoutes(oldSiteUrl),
        ]),
        served,
        siteUrl: 'https://trpc.io',
      });
    expect(at('https://www-trpc.vercel.app')).toEqual([]);
    for (const oldSiteUrl of [undefined, 'https://trpc.io']) {
      expect(at(oldSiteUrl)).toEqual([
        "/docs/typedoc: trpc.io's own site has to be somewhere else than https://trpc.io, to send them there: set `oldSite.url` in www/src/site.ts",
      ]);
    }
  });

  it('finds a redirect that goes elsewhere, a hidden file and a missing trip to trpc.io', () => {
    const hiding: ReadonlyArray<VercelRoute> = [
      { headers: { Location: '/' }, src: '^/logo\\.svg$', status: 308 },
    ];
    expect(
      routeProblems({
        oldSiteUrl: 'https://trpc.io',
        redirects: [
          { location: '/blog', source: '/blog/archive', status: 308 },
        ],
        routes: routes('getting-started', hiding),
        served,
        siteUrl: 'https://v12.trpc.io',
      }),
    ).toEqual(
      expect.arrayContaining([
        '/blog/archive: redirects to nowhere, a 404, not once to /blog',
        '/logo.svg: a route hides the file',
        "/docs/typedoc/x: doesn't redirect to https://trpc.io",
      ]),
    );
  });
});
