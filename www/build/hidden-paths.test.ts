import { describe, expect, it } from '@effect/vitest';

import { decisions, hiddenPaths, unindexedPaths } from '../src/site.ts';
import type { VercelRoute } from './old-routes.ts';
import {
  hiddenPathProblems,
  hiddenRoute,
  hiddenRouteProblems,
  isNoindex,
  robotsTxt,
  unindexedPathProblems,
  unindexedRoute,
} from './hidden-paths.ts';
import { noindexRoute, routes } from './vercel-output.ts';

const hiddenPage = '<meta name="robots" content="noindex, nofollow"><h1>Q</h1>';

const site = (files: Record<string, string> = {}) =>
  new Map(
    Object.entries({
      'index.html': '<a href="/v12/docs/a">Docs</a>',
      'llms.txt': '- [A](https://v12.trpc.io/v12/docs/a.md)',
      'robots.txt': 'User-agent: *\nAllow: /\nDisallow: /v12/decisions\n',
      'sitemap.xml': '<loc>https://v12.trpc.io/v12/docs/a</loc>',
      'v12/decisions/index.html': hiddenPage,
      'v12/decisions/open/q/index.html': hiddenPage,
      ...files,
    }),
  );

describe('hiddenPathProblems', () => {
  it('passes a site that hides the path', () => {
    expect(hiddenPathProblems('/v12/decisions', site())).toEqual([]);
  });

  it('fails on a page that links there, by path or URL', () => {
    expect(
      hiddenPathProblems(
        '/v12/decisions',
        site({
          'v12/docs/a/index.html': '<a href="/v12/decisions/open/q">Q</a>',
          'blog/index.html':
            '<a href="https://v12.trpc.io/v12/decisions">Q</a>',
        }),
      ),
    ).toEqual([
      'v12/docs/a/index.html: links to /v12/decisions',
      'blog/index.html: links to /v12/decisions',
    ]);
  });

  it('allows the path in pages that only mention it, as the router does', () => {
    expect(
      hiddenPathProblems(
        '/v12/decisions',
        site({ 'index.html': '<script>["/v12/decisions/"]</script>' }),
      ),
    ).toEqual([]);
  });

  it('fails when the sitemap, llms.txt or markdown lists it', () => {
    expect(
      hiddenPathProblems(
        '/v12/decisions',
        site({
          'llms.txt': '- [Q](https://v12.trpc.io/v12/decisions/open/q)',
          'sitemap.xml': '<loc>https://v12.trpc.io/v12/decisions</loc>',
          'v12/docs/a.md': '[Q](/v12/decisions)',
        }),
      ),
    ).toEqual([
      'llms.txt: lists /v12/decisions',
      'sitemap.xml: lists /v12/decisions',
      'v12/docs/a.md: lists /v12/decisions',
    ]);
  });

  it("fails when robots.txt doesn't disallow it, or a page there is indexable", () => {
    expect(
      hiddenPathProblems(
        '/v12/decisions',
        site({
          'robots.txt': 'User-agent: *\nAllow: /\n',
          'v12/decisions/a/index.html': '<h1>A</h1>',
          'v12/decisions/a.md': '# A',
          'v12/decisions/b/index.html':
            '<meta name="robots" content="noindex"><h1>B</h1>',
        }),
      ),
    ).toEqual([
      "robots.txt: doesn't disallow /v12/decisions",
      'v12/decisions/a/index.html: has no noindex, nofollow robots meta tag',
      'v12/decisions/a.md: only pages are served under /v12/decisions',
      'v12/decisions/b/index.html: has no noindex, nofollow robots meta tag',
    ]);
  });

  it('reads every robots meta tag a page has', () => {
    const files = site({
      'v12/decisions/a/index.html':
        '<meta name="robots" content="noindex"><meta name="robots" content="nofollow">',
    });
    expect(hiddenPathProblems('/v12/decisions', files)).toEqual([]);
    expect(isNoindex('<meta name="robots" content="nofollow">')).toBe(false);
    expect(
      isNoindex('<meta content="x"><meta name="robots" content="noindex">'),
    ).toBe(true);
  });

  it("fails on a canonical link or a meta tag's URL there", () => {
    expect(
      hiddenPathProblems(
        '/v12/decisions',
        site({
          'blog/index.html':
            '<link rel="canonical" href="https://trpc.io/v12/decisions/a">',
          'index.html':
            '<meta property="og:url" content="https://trpc.io/v12/decisions">',
        }),
      ),
    ).toEqual([
      'index.html: links to /v12/decisions',
      'blog/index.html: links to /v12/decisions',
    ]);
  });

  it('fails when the build has no page there', () => {
    const files = site();
    files.delete('v12/decisions/index.html');
    files.delete('v12/decisions/open/q/index.html');
    expect(hiddenPathProblems('/v12/decisions', files)).toEqual([
      '/v12/decisions: the build has no page there',
    ]);
  });
});

describe('hidden docs', () => {
  const docs = (files: Record<string, string> = {}) =>
    new Map(
      Object.entries({
        'docs/a/index.html': '<a href="/docs/b">B</a>',
        'llms.txt': '- [A](https://trpc.io/docs/a)',
        'robots.txt':
          'User-agent: *\nAllow: /\nDisallow: /v12/decisions\nDisallow: /v12/docs\n',
        'v12/decisions/index.html': `${hiddenPage}<a href="/v12/docs/a">A</a>`,
        'v12/docs/a/index.html': `${hiddenPage}<a href="/v12/decisions">Q</a>`,
        'v12/docs/a.md': '# A\n\n[Q](/v12/decisions)',
        'v12/docs/llms.txt': '- [A](https://trpc.io/v12/docs/a.md)',
        ...files,
      }),
    );
  const problems = (files: ReadonlyMap<string, string>) => [
    ...hiddenPathProblems('/v12/docs', files, {
      agentFiles: true,
      others: ['/v12/decisions'],
    }),
    ...hiddenPathProblems('/v12/decisions', files, { others: ['/v12/docs'] }),
  ];

  it('serves markdown and llms.txt there, and lets the hidden paths link each other', () => {
    expect(problems(docs())).toEqual([]);
  });

  it('serves only pages there without agentFiles', () => {
    expect(
      hiddenPathProblems('/v12/docs', docs(), { others: ['/v12/decisions'] }),
    ).toEqual([
      'v12/docs/a.md: only pages are served under /v12/docs',
      'v12/docs/llms.txt: only pages are served under /v12/docs',
    ]);
  });

  it('fails on a link from outside, as the home page or the version switcher has', () => {
    expect(
      problems(
        docs({
          'docs/a/index.html': '<a href="/v12/docs/a?x=1">v12</a>',
          'index.html': '<a href="/v12/docs">v12</a>',
          'llms.txt': '- [v12](https://trpc.io/v12/docs/llms.txt)',
        }),
      ),
    ).toEqual([
      'docs/a/index.html: links to /v12/docs',
      'llms.txt: lists /v12/docs',
      'index.html: links to /v12/docs',
    ]);
  });
});

describe('hiddenRouteProblems', () => {
  it('passes the routes the site writes', () => {
    expect(hiddenRouteProblems(routes('getting-started'), hiddenPaths)).toEqual(
      [],
    );
    expect(
      hiddenRouteProblems(
        routes(
          'getting-started',
          [],
          [noindexRoute('https://trpc.io', 'production')],
          ['/v12/decisions', '/v12/docs'],
        ),
        ['/v12/decisions', '/v12/docs'],
      ),
    ).toEqual([]);
  });

  it('fails when a path has no route, or a later one says otherwise', () => {
    const later: VercelRoute = {
      continue: true,
      headers: { 'X-Robots-Tag': 'noindex' },
      src: '^/v12/docs/.*$',
    };
    expect(
      hiddenRouteProblems(
        [hiddenRoute('/v12/docs'), later, { handle: 'filesystem' }],
        ['/v12/docs', '/v12/decisions'],
      ),
    ).toEqual([
      "/v12/docs/a: isn't answered with X-Robots-Tag: noindex, nofollow",
      "/v12/docs/a.md: isn't answered with X-Robots-Tag: noindex, nofollow",
      "/v12/decisions: isn't answered with X-Robots-Tag: noindex, nofollow",
      "/v12/decisions/a: isn't answered with X-Robots-Tag: noindex, nofollow",
      "/v12/decisions/a.md: isn't answered with X-Robots-Tag: noindex, nofollow",
    ]);
  });

  it("ignores what's after the files, and routes only some hosts take", () => {
    expect(
      hiddenRouteProblems(
        [
          {
            ...hiddenRoute('/v12/docs'),
            has: [{ type: 'host', value: 'trpc.io' }],
          },
          { handle: 'filesystem' },
          hiddenRoute('/v12/docs'),
        ],
        ['/v12/docs'],
      ),
    ).toHaveLength(3);
  });
});

describe('hiddenRoute', () => {
  it('says noindex, nofollow under the path, on every host, after the site-wide noindex', () => {
    const all = routes('getting-started');
    const index = all.findIndex(
      (route) => route.src === hiddenRoute(decisions.basePath).src,
    );
    expect(all[index]).toEqual({
      continue: true,
      headers: { 'X-Robots-Tag': 'noindex, nofollow' },
      src: '^/v12/decisions(?:/.*)?$',
    });
    expect(index).toBeGreaterThan(
      all.findIndex((route) => route.src === '^/.*$'),
    );
    expect(index).toBeLessThan(
      all.findIndex((route) => route.handle === 'filesystem'),
    );
    const src = new RegExp(all[index]?.src ?? '');
    expect(src.test('/v12/decisions')).toBe(true);
    expect(src.test('/v12/decisions/open/q')).toBe(true);
    expect(src.test('/v12/decisionsx')).toBe(false);
    expect(src.test('/v12/docs/a')).toBe(false);
  });
});

describe('unindexedPathProblems', () => {
  const trpcIoProduction = [noindexRoute('https://trpc.io', 'production')];
  const pages = new Map([
    ['v12/docs/a/index.html', '<meta content="noindex" name="robots"/>'],
    [
      'v12/decisions/index.html',
      '<meta name="robots" content="noindex, nofollow">',
    ],
    ['docs/a/index.html', ''],
    [
      'sitemap.xml',
      '<urlset><url><loc>https://trpc.io/docs/a</loc></url></urlset>',
    ],
  ]);

  it('passes the routes the site writes, on trpc.io and v12.trpc.io, hidden or not', () => {
    for (const noindex of [undefined, trpcIoProduction]) {
      for (const hidden of [
        [],
        ['/v12/decisions'],
        ['/v12/decisions', '/v12/docs'],
      ]) {
        expect(
          unindexedPathProblems(
            '/v12',
            pages,
            routes('getting-started', [], noindex, hidden, ['/v12']),
          ),
        ).toEqual([]);
      }
    }
  });

  it('is every path under /v12 until v12Indexable flips', () => {
    expect(unindexedPaths).toEqual(['/v12']);
  });

  it('fails on trpc.io, unhidden, without the route', () => {
    expect(
      unindexedPathProblems(
        '/v12',
        pages,
        routes('getting-started', [], trpcIoProduction, [], []),
      ),
    ).toEqual([
      "/v12: isn't answered with X-Robots-Tag: noindex",
      "/v12/a: isn't answered with X-Robots-Tag: noindex",
      "/v12/a.md: isn't answered with X-Robots-Tag: noindex",
      "/v12/docs/a: isn't answered with X-Robots-Tag: noindex",
    ]);
  });

  it('fails on a page there without noindex, and on the sitemap listing one', () => {
    const indexed = new Map([
      ['v12/docs/a/index.html', '<meta content="index" name="robots"/>'],
      ['v12/docs/b.md', ''],
      [
        'sitemap.xml',
        '<urlset><url><loc>https://trpc.io/v12/docs/a</loc></url></urlset>',
      ],
    ]);
    expect(
      unindexedPathProblems('/v12', indexed, [unindexedRoute('/v12')]),
    ).toEqual([
      'v12/docs/a/index.html: has no noindex robots meta tag',
      'sitemap.xml: lists /v12',
    ]);
  });
});

describe('robotsTxt', () => {
  it('disallows each hidden path, and points at the sitemap', () => {
    expect(
      robotsTxt({
        hidden: ['/v12/decisions', '/v12/docs'],
        sitemap: 'https://trpc.io/sitemap.xml',
      }),
    ).toBe(
      'User-agent: *\nAllow: /\nDisallow: /v12/decisions\nDisallow: /v12/docs\n\nSitemap: https://trpc.io/sitemap.xml\n',
    );
    expect(hiddenPaths).toContain(decisions.basePath);
  });
});
