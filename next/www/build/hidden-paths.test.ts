import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { fileURLToPath } from 'node:url';
import { Effect, FileSystem } from 'effect';

import { decisions } from '../src/site.ts';
import { hiddenPathProblems, hiddenRoute } from './hidden-paths.ts';
import { routes } from './vercel-output.ts';

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
        }),
      ),
    ).toEqual([
      "robots.txt: doesn't disallow /v12/decisions",
      'v12/decisions/a/index.html: has no noindex robots meta tag',
      'v12/decisions/a.md: only pages are served under /v12/decisions',
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

describe('robots.txt', () => {
  it.effect('disallows the hidden path', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const robots = yield* fs.readFileString(
        fileURLToPath(new URL('../public/robots.txt', import.meta.url)),
      );
      expect(robots).toMatch(/^Disallow: \/v12\/decisions$/m);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
