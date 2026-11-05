import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  requestedImage,
  versionedPath,
  versionRedirect,
  versionRedirectCacheControl,
} from './version.ts';

vi.mock('virtual:og-cards', () => ({
  cards: new Map([
    ['/og/index.png', { kind: 'home', path: '/' }],
    [
      '/og/docs/server/procedures.png',
      { kind: 'doc', path: '/docs/server/procedures' },
    ],
  ]),
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

describe('versionedPath', () => {
  it('puts the version after /og/', () => {
    expect(versionedPath('/og/docs/a.png', 'abc')).toBe('/og/abc/docs/a.png');
    expect(versionedPath('/og/docs/a.png', '')).toBe('/og/docs/a.png');
  });
});

describe('requestedImage', () => {
  const exists = (path: string) => path === '/og/docs/a.png';

  it('reads an image and its version from the path', () => {
    expect(requestedImage('/og/docs/a.png', exists)).toEqual({
      path: '/og/docs/a.png',
      version: '',
    });
    expect(requestedImage('/og/abc/docs/a.png', exists)).toEqual({
      path: '/og/docs/a.png',
      version: 'abc',
    });
  });

  it('names nothing where no image is', () => {
    for (const path of ['/og/abc/docs/b.png', '/og/a/b/docs/a.png', '/og/']) {
      expect(requestedImage(path, exists), path).toBeUndefined();
    }
  });
});

describe('versionRedirect', () => {
  const image = { path: '/og/a.png', version: 'abc' };

  it('leaves the URL at the current version alone', () => {
    expect(
      versionRedirect(new URL('https://trpc.io/og/abc/a.png'), image, 'abc'),
    ).toBeUndefined();
  });

  it('redirects another version, or any query, to the current version alone', () => {
    for (const [url, requested] of [
      ['/og/a.png', { ...image, version: '' }],
      ['/og/old/a.png', { ...image, version: 'old' }],
      ['/og/abc/a.png?x=1', image],
    ] as const) {
      const redirect = versionRedirect(
        new URL(`https://trpc.io${url}`),
        requested,
        'abc',
      );
      expect(redirect?.status, url).toBe(307);
      expect(redirect?.headers.get('location'), url).toBe('/og/abc/a.png');
      expect(redirect?.headers.get('cache-control'), url).toBe(
        versionRedirectCacheControl,
      );
    }
  });
});

describe('/og/*', () => {
  beforeEach(() => {
    vi.stubEnv('OG_CARDS_VERSION', 'abc');
    vi.stubEnv('SPONSOR_CLOUD_VERSION', 'cloud1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('redirects a card at no version, another version, or with a query, before drawing it', async () => {
    for (const path of [
      '/og/docs/server/procedures.png',
      '/og/made-up/docs/server/procedures.png',
      '/og/docs/server/procedures.png?v=abc',
      '/og/abc/docs/server/procedures.png?cache=bust',
    ]) {
      const response = await get(path);
      expect(response.status, path).toBe(307);
      expect(response.headers.get('location'), path).toBe(
        '/og/abc/docs/server/procedures.png',
      );
    }
    await expect(get('/og/abc/docs/server/procedures.png')).rejects.toThrow(
      'drew a card',
    );
    await expect(get('/og/abc/index.png')).rejects.toThrow('drew a card');
  });

  it("redirects the sponsor cloud at another version, as the READMEs' old ?v= URL, before drawing it", async () => {
    for (const path of [
      '/og/sponsor-cloud.png?v=b6cfa2a2',
      '/og/abc/sponsor-cloud.png',
    ]) {
      const response = await get(path);
      expect(response.status, path).toBe(307);
      expect(response.headers.get('location'), path).toBe(
        '/og/cloud1/sponsor-cloud.png',
      );
    }
    await expect(get('/og/cloud1/sponsor-cloud.png')).rejects.toThrow(
      'drew the sponsor cloud',
    );
  });

  it('answers a path without an image with a 404, whatever its version or query', async () => {
    for (const path of [
      '/og/nothing.png?v=abc',
      '/og/abc/nothing.png',
      '/og/abc/abc/index.png',
    ]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });
});
