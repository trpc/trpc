import { describe, expect, it } from 'vitest';

import {
  missingFromSitemap,
  pagePaths,
  sitemapPaths,
  withoutLastmods,
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

describe('withoutLastmods', () => {
  it("drops every lastmod, which would be the build's date", () => {
    const fixed = withoutLastmods(sitemap);
    expect(fixed).not.toContain('lastmod');
    expect(fixed).toContain('<priority>1</priority>');
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
