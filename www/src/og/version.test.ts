import { afterEach, describe, expect, it, vi } from 'vitest';

import { drawnSponsors } from '~/sponsors.ts';

import { sponsorCloudPath, sponsorCloudVersion } from './sponsor-cloud.ts';
import { versionRedirect, versionRedirectCacheControl } from './version.ts';

vi.mock('virtual:og-cards', () => ({
  cards: new Map([['/og/index.png', { kind: 'home', path: '/' }]]),
}));

vi.mock('./render.ts', () => ({
  renderOgImage: () => {
    throw new Error('drew a card');
  },
  renderSponsorCloud: () => {
    throw new Error('drew the sponsor cloud');
  },
}));

const { Route } = await import('../routes/og.$.ts');

const get = (path: string) => {
  const handlers = Route.options.server?.handlers;
  if (typeof handlers !== 'object' || typeof handlers.GET !== 'function') {
    throw new Error('No GET handler');
  }
  return handlers.GET({
    request: new Request(`https://trpc.io${path}`),
  } as Parameters<typeof handlers.GET>[0]) as Promise<Response>;
};

describe('versionRedirect', () => {
  const url = (search: string) => new URL(`https://trpc.io/og/a.png${search}`);

  it('leaves a URL at the version alone', () => {
    expect(versionRedirect(url('?v=abc'), 'abc')).toBeUndefined();
    expect(versionRedirect(url(''), '')).toBeUndefined();
  });

  it('redirects another version, none, or another parameter to the version alone', () => {
    for (const search of [
      '?v=old',
      '',
      '?v=abc&x=1',
      '?x=1&v=abc',
      '?v=abc&v=old',
    ]) {
      const redirect = versionRedirect(url(search), 'abc');
      expect(redirect?.status, search).toBe(307);
      expect(redirect?.headers.get('location'), search).toBe('/og/a.png?v=abc');
      expect(redirect?.headers.get('cache-control'), search).toBe(
        versionRedirectCacheControl,
      );
    }
    expect(versionRedirect(url('?x=1'), '')?.headers.get('location')).toBe(
      '/og/a.png',
    );
  });
});

describe('/og/*', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects a card's request at another version before drawing it", async () => {
    vi.stubEnv('OG_CARDS_VERSION', 'abc');
    for (const search of ['', '?v=made-up', '?v=abc&cache=bust']) {
      const response = await get(`/og/index.png${search}`);
      expect(response.status, search).toBe(307);
      expect(response.headers.get('location'), search).toBe(
        '/og/index.png?v=abc',
      );
    }
    await expect(get('/og/index.png?v=abc')).rejects.toThrow('drew a card');
  });

  it("redirects the sponsor cloud's request at another version before drawing it", async () => {
    const version = sponsorCloudVersion(drawnSponsors);
    const response = await get(`${sponsorCloudPath}?v=made-up`);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `${sponsorCloudPath}?v=${version}`,
    );
    await expect(get(`${sponsorCloudPath}?v=${version}`)).rejects.toThrow(
      'drew the sponsor cloud',
    );
  });

  it('answers a path without a card with a 404, whatever its query', async () => {
    vi.stubEnv('OG_CARDS_VERSION', 'abc');
    expect((await get('/og/nothing.png?v=made-up')).status).toBe(404);
  });
});
