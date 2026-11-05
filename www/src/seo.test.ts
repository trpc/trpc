import { afterEach, describe, expect, it, vi } from 'vitest';

import { hydrateCardDay } from './card-day.ts';

import { deploymentOrigin, ogImageUrl, pageHead } from './seo.ts';
import { site } from './site.ts';

describe('deploymentOrigin', () => {
  it("is a preview's branch URL, or its own without a branch", () => {
    expect(
      deploymentOrigin({
        VERCEL_BRANCH_URL: 'www-git-a-trpc.vercel.app',
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'www-abc123-trpc.vercel.app',
      }),
    ).toBe('https://www-git-a-trpc.vercel.app');
    expect(
      deploymentOrigin({
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'www-abc123-trpc.vercel.app',
      }),
    ).toBe('https://www-abc123-trpc.vercel.app');
  });

  it('is site.url in production and off Vercel', () => {
    expect(
      deploymentOrigin({
        VERCEL_BRANCH_URL: 'www-git-main-trpc.vercel.app',
        VERCEL_ENV: 'production',
        VERCEL_URL: 'www-abc123-trpc.vercel.app',
      }),
    ).toBe(site.url);
    expect(deploymentOrigin({})).toBe(site.url);
    expect(deploymentOrigin({ VERCEL_ENV: 'preview' })).toBe(site.url);
  });
});

describe('ogImageUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("is the card's path on the build's host, and the page's URL stays site.url", () => {
    vi.stubEnv('DEPLOYMENT_ORIGIN', 'https://www-git-a-trpc.vercel.app');
    expect(ogImageUrl('/docs/v10/client/react')).toBe(
      'https://www-git-a-trpc.vercel.app/og/docs/v10/client/react.png',
    );
    const head = pageHead({
      description: '',
      path: '/sponsor',
      title: 'Sponsor',
    });
    expect(head.meta).toContainEqual({
      content: 'https://www-git-a-trpc.vercel.app/og/sponsor.png',
      property: 'og:image',
    });
    expect(head.meta).toContainEqual({
      content: 'https://www-git-a-trpc.vercel.app/og/sponsor.png',
      name: 'twitter:image',
    });
    expect(head.meta).toContainEqual({
      content: `${site.url}/sponsor`,
      property: 'og:url',
    });
  });

  it('is on site.url without a build host', () => {
    expect(ogImageUrl('/')).toBe(`${site.url}/og/index.png`);
  });

  it("carries the cards' version and the UTC day the page is rendered on, so social sites fetch a changed card again, and its sponsors daily", () => {
    vi.stubEnv('OG_CARDS_VERSION', '0123abcdef');
    vi.useFakeTimers({
      now: new Date('2026-11-05T23:59:59Z'),
      toFake: ['Date'],
    });
    expect(ogImageUrl('/docs/server/procedures')).toBe(
      `${site.url}/og/docs/server/procedures/0123abcdef-20261105.png`,
    );
    const head = pageHead({ description: '', path: '/' });
    expect(head.meta).toContainEqual({
      content: `${site.url}/og/index/0123abcdef-20261105.png`,
      property: 'og:image',
    });
    expect(head.meta).toContainEqual({
      content: `${site.url}/og/index/0123abcdef-20261105.png`,
      name: 'twitter:image',
    });
    vi.setSystemTime(new Date('2026-11-06T00:00:00Z'));
    expect(ogImageUrl('/')).toBe(
      `${site.url}/og/index/0123abcdef-20261106.png`,
    );
  });

  it("names the server's day in the browser, so the head hydrates unchanged", () => {
    vi.stubEnv('OG_CARDS_VERSION', '0123abcdef');
    vi.useFakeTimers({
      now: new Date('2026-11-07T00:00:00Z'),
      toFake: ['Date'],
    });
    hydrateCardDay({ cardDay: '20261105' });
    expect(ogImageUrl('/')).toBe(
      `${site.url}/og/index/0123abcdef-20261105.png`,
    );
  });
});
