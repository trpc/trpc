import { describe, expect, it } from 'vitest';

import {
  missingFromSitemap,
  pagePaths,
  sitemapPaths,
  withRealLastmods,
} from './sitemap.ts';

const host = 'https://trpc.io';

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://trpc.io/</loc>
    <lastmod>2026-11-01</lastmod>
    <priority>1</priority>
  </url>
  <url>
    <loc>https://trpc.io/docs/server/procedures</loc>
    <lastmod>2026-03-08</lastmod>
  </url>
</urlset>`;

describe('withRealLastmods', () => {
  it("drops the build's date from the pages that have none of their own", () => {
    const fixed = withRealLastmods(
      sitemap,
      {
        pages: [
          { path: '/', sitemap: {} },
          {
            path: '/docs/server/procedures',
            sitemap: { lastmod: '2026-03-08T09:14:02+00:00' },
          },
        ],
      },
      host,
    );
    expect(fixed).not.toContain('2026-11-01');
    expect(fixed).toContain('<lastmod>2026-03-08</lastmod>');
    expect(sitemapPaths(fixed, host)).toEqual(['/', '/docs/server/procedures']);
  });
});

describe('missingFromSitemap', () => {
  const files = [
    '404.html',
    'docs/server/procedures/index.html',
    'docs/server/procedures.md',
    'index.html',
    'sponsor/index.html',
  ];

  it('names a prerendered page the sitemap leaves out', () => {
    expect(pagePaths(files)).toEqual([
      '/docs/server/procedures',
      '/',
      '/sponsor',
    ]);
    expect(
      missingFromSitemap({ files, host, sitemap, unlisted: () => false }),
    ).toEqual(['/sponsor']);
  });

  it('allows the pages meant to stay out', () => {
    expect(
      missingFromSitemap({
        files,
        host,
        sitemap,
        unlisted: (page) => page === '/sponsor',
      }),
    ).toEqual([]);
  });
});
