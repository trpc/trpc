import { afterEach, describe, expect, it, vi } from 'vitest';

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
});
