import { describe, expect, it } from '@effect/vitest';

import { legacyUrlProblem } from './legacy-urls-check.ts';

const page = (path: string) => ({ kind: 'file', path }) as const;

describe('legacyUrlProblem', () => {
  it('passes a URL that lands on a page, or off the site', () => {
    expect(
      legacyUrlProblem(
        '/docs/router',
        {
          hops: ['/docs/server/routers'],
          landed: page('/docs/server/routers'),
        },
        true,
      ),
    ).toBeUndefined();
    expect(
      legacyUrlProblem(
        '/discord',
        {
          hops: ['https://discord.gg/abc'],
          landed: {
            kind: 'redirect',
            location: 'https://discord.gg/abc',
            status: 307,
          },
        },
        true,
      ),
    ).toBeUndefined();
  });

  it('fails a 404 and a loop', () => {
    expect(
      legacyUrlProblem(
        '/docs/old',
        {
          hops: ['/docs/gone'],
          landed: { kind: 'missing' },
        },
        true,
      ),
    ).toBe('/docs/old: redirects to /docs/gone, a 404');
    expect(
      legacyUrlProblem(
        '/a',
        {
          hops: ['/b', '/a'],
          landed: { kind: 'redirect', location: '/b', status: 308 },
        },
        true,
      ),
    ).toBe('/a: redirects more than 2 times: /b, /a');
  });

  it("fails an older version's page that isn't at its own URL, but for the trailing slash", () => {
    expect(
      legacyUrlProblem(
        '/docs/v10/',
        {
          hops: ['/docs/v10'],
          landed: page('/docs/v10'),
        },
        true,
      ),
    ).toBeUndefined();
    expect(
      legacyUrlProblem(
        '/docs/v9/nextjs',
        {
          hops: ['/v9/docs/nextjs'],
          landed: page('/v9/docs/nextjs'),
        },
        true,
      ),
    ).toBe('/docs/v9/nextjs: redirects to /v9/docs/nextjs, not its own URL');
  });

  it('lets a redirect source the sitemap never listed redirect', () => {
    expect(
      legacyUrlProblem(
        '/docs/v10/introduction',
        {
          hops: ['/docs/v10'],
          landed: page('/docs/v10'),
        },
        false,
      ),
    ).toBeUndefined();
  });
});
