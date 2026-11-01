import { describe, expect, it } from '@effect/vitest';

import {
  land,
  landingProblem,
  type Redirect,
  redirectRoute,
  respond,
  routeProblems,
  servedPaths,
  type VercelRoute,
} from './old-routes.ts';
import { routes } from './vercel-output.ts';

const redirects: ReadonlyArray<Redirect> = [
  {
    destination: '/docs/server/routers',
    permanent: true,
    source: '/docs/router',
  },
  {
    destination: '/docs/client/react/useUtils#invalidation',
    permanent: true,
    source: '/docs/invalidateQueries',
  },
  {
    destination: '/docs/client/react/:path',
    permanent: true,
    source: '/docs/reactjs/:path',
  },
  { destination: '/docs/:path*', permanent: true, source: '/docs/v11/:path*' },
  {
    destination: '/docs/v10/:path*',
    permanent: true,
    source: '/v10/docs/:path*',
  },
  { destination: '/docs', permanent: true, source: '/docs/introduction' },
  {
    destination: 'https://discord.gg/abc',
    permanent: false,
    source: '/discord',
  },
  { destination: '/docs/faq', permanent: false, source: '/faq' },
];

const served = servedPaths([
  '404.html',
  'blog/announcing-trpc-v11/index.html',
  'blog/index.html',
  'blog/rss.xml',
  'docs/index.html',
  'docs/client/react/useQuery/index.html',
  'docs/client/react/useUtils/index.html',
  'docs/faq/index.html',
  'docs/server/routers/index.html',
  'docs/v10/index.html',
  'docs/v10/server/routers/index.html',
  'favicon.ico',
  'index.html',
  'logo.svg',
]);

const all = routes(redirects.map(redirectRoute));

describe('servedPaths', () => {
  it('serves a prerendered page at its directory, and other files as they are', () => {
    expect([...served]).toEqual(
      expect.arrayContaining(['/', '/blog', '/blog/rss.xml', '/docs/v10']),
    );
    expect(served.has('/404.html')).toBe(false);
    expect(served.has('/404')).toBe(false);
  });
});

describe('redirectRoute', () => {
  it('matches the path, with `:path` a segment, and is a 308 when permanent', () => {
    expect(redirectRoute(redirects[2] ?? ({} as never))).toEqual({
      headers: { Location: '/docs/client/react/$1' },
      src: '^/docs/reactjs/([^/]+)$',
      status: 308,
    });
    expect(redirectRoute(redirects[6] ?? ({} as never))).toEqual({
      headers: { Location: 'https://discord.gg/abc' },
      src: '^/discord$',
      status: 307,
    });
  });

  it('matches the rest of the path, if any, with `/:path*`', () => {
    const route = redirectRoute(redirects[3] ?? ({} as never));
    expect(route).toEqual({
      headers: { Location: '/docs$1' },
      src: '^/docs/v11(/.*)?$',
      status: 308,
    });
    expect(respond([route], served, '/docs/v11')).toEqual({
      kind: 'redirect',
      location: '/docs',
      status: 308,
    });
    expect(respond([route], served, '/docs/v11/server/routers')).toEqual({
      kind: 'redirect',
      location: '/docs/server/routers',
      status: 308,
    });
    expect(respond([route], served, '/docs/v110')).toEqual({ kind: 'missing' });
  });
});

describe('respond and land', () => {
  it("answers as Vercel's routes do", () => {
    expect(respond(all, served, '/docs/v10')).toEqual({
      kind: 'file',
      path: '/docs/v10',
    });
    expect(respond(all, served, '/nope')).toEqual({ kind: 'missing' });
    expect(respond(all, served, '/docs/introduction')).toEqual({
      kind: 'redirect',
      location: '/docs',
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
    expect(land(all, served, '/v10/docs/server/routers').landed).toEqual({
      kind: 'file',
      path: '/docs/v10/server/routers',
    });
    expect(land(all, served, '/docs/v11/reactjs/useQuery').hops).toEqual([
      '/docs/reactjs/useQuery',
      '/docs/client/react/useQuery',
    ]);
  });

  it('names a URL that lands on a 404, or redirects in a loop', () => {
    expect(landingProblem(all, served, '/docs/v11/gone')).toBe(
      '/docs/v11/gone: redirects to /docs/gone, a 404',
    );
    const loop = routes([
      redirectRoute({ destination: '/b', permanent: true, source: '/a' }),
      redirectRoute({ destination: '/a', permanent: true, source: '/b' }),
    ]);
    expect(landingProblem(loop, served, '/a')).toMatch(
      /^\/a: redirects more than 10 times/,
    );
  });
});

describe('routeProblems', () => {
  it('finds no problems with the routes the site writes', () => {
    expect(routeProblems({ redirects, routes: all, served })).toEqual([]);
  });

  it('finds a redirect that lands nowhere, and a hidden file', () => {
    const hiding: ReadonlyArray<VercelRoute> = [
      { headers: { Location: '/' }, src: '^/logo\\.svg$', status: 308 },
    ];
    const gone = { destination: '/docs/gone', permanent: true, source: '/old' };
    expect(
      routeProblems({
        redirects: [gone],
        routes: routes([...hiding, redirectRoute(gone)]),
        served,
      }),
    ).toEqual([
      '/old: redirects to /docs/gone, a 404',
      '/logo.svg: a route hides the file',
    ]);
  });
});
