import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dailyVersion,
  notAPage,
  ogImagePath,
  requestedPage,
  untilVersionChanges,
  utcDay,
  versionRedirect,
  versionRedirectCacheControl,
} from './version.ts';

vi.mock('virtual:og-cards', () => ({
  cards: new Map([
    ['/', { kind: 'home', path: '/' }],
    ['/docs', { kind: 'doc', path: '/docs' }],
    [
      '/docs/server/procedures',
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

const { serveOgImage } = await import('./serve.ts');

const get = (path: string) =>
  serveOgImage(new Request(`https://trpc.io${path}`));

describe('ogImagePath', () => {
  it("is /og and the page's path, then the version", () => {
    expect(ogImagePath('/docs/server/procedures', 'abc')).toBe(
      '/og/docs/server/procedures/abc.png',
    );
    expect(ogImagePath('/', 'abc')).toBe('/og/index/abc.png');
    expect(ogImagePath(notAPage('cloud'), 'abc')).toBe('/og/_/cloud/abc.png');
    expect(ogImagePath('/docs/quickstart', '')).toBe('/og/docs/quickstart.png');
    expect(ogImagePath('/', '')).toBe('/og/index.png');
  });
});

describe('dailyVersion', () => {
  it("is the cards' version and the UTC day", () => {
    const day = utcDay(new Date('2026-11-05T23:59:59Z'));
    expect(day).toBe('20261105');
    expect(dailyVersion('abc', day)).toBe('abc-20261105');
    expect(dailyVersion('', day)).toBe('');
  });

  it('stays current until the next UTC day, and any other version a day', () => {
    expect(untilVersionChanges(true, new Date('2026-11-05T23:59:00Z'))).toBe(
      60,
    );
    expect(untilVersionChanges(true, new Date('2026-11-05T00:00:00Z'))).toBe(
      86_400,
    );
    expect(untilVersionChanges(false, new Date('2026-11-05T23:59:00Z'))).toBe(
      86_400,
    );
  });
});

describe('requestedPage', () => {
  const pages = new Set(['/', '/docs', '/docs/a', '/_/cloud']);
  const exists = (page: string) => pages.has(page);

  it('reads the page from /og and its path, with .png, without, or with a version', () => {
    for (const [path, page] of [
      ['/og/docs/a', '/docs/a'],
      ['/og/docs/a.png', '/docs/a'],
      ['/og/docs/a/abcdef0123.png', '/docs/a'],
      ['/og/docs/abcdef0123-20261105.png', '/docs'],
      ['/og/index', '/'],
      ['/og/index.png', '/'],
      ['/og/index/abcdef0123.png', '/'],
      ['/og/_/cloud.png', '/_/cloud'],
      ['/og/_/cloud/abcdef0123.png', '/_/cloud'],
    ] as const) {
      expect(requestedPage(path, exists), path).toBe(page);
    }
  });

  it('names nothing where no page is', () => {
    for (const path of [
      '/og/docs/b/c.png',
      '/og/docs/a/abcdef0123',
      '/og/docs/a/made-up.png',
      '/og/nothing.png',
      '/og/_/other.png',
      '/ogx.png',
      '/docs/a',
    ]) {
      expect(requestedPage(path, exists), path).toBeUndefined();
    }
  });
});

describe('versionRedirect', () => {
  it('leaves the URL at the current version alone', () => {
    expect(
      versionRedirect(new URL('https://trpc.io/og/a/abc.png'), '/a', 'abc', 60),
    ).toBeUndefined();
  });

  it('redirects any other URL for the page, or any query, to the current version alone', () => {
    for (const url of [
      '/og/a',
      '/og/a.png',
      '/og/a/old.png',
      '/og/a/abc.png?x=1',
    ]) {
      const redirect = versionRedirect(
        new URL(`https://trpc.io${url}`),
        '/a',
        'abc',
        60,
      );
      expect(redirect?.status, url).toBe(307);
      expect(redirect?.headers.get('location'), url).toBe('/og/a/abc.png');
      expect(redirect?.headers.get('cache-control'), url).toBe(
        versionRedirectCacheControl(60),
      );
    }
  });
});

describe('serveOgImage', () => {
  beforeEach(() => {
    vi.stubEnv('OG_CARDS_VERSION', 'abcdef0123');
    vi.stubEnv('SPONSOR_CLOUD_VERSION', 'c10dc10dc1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('redirects a card at no version, another version, or with a query, before drawing it', async () => {
    for (const path of [
      '/og/docs/server/procedures',
      '/og/docs/server/procedures.png',
      '/og/docs/server/procedures/0000000000.png',
      '/og/docs/server/procedures/abcdef0123.png?cache=bust',
    ]) {
      const response = await get(path);
      expect(response.status, path).toBe(307);
      expect(response.headers.get('location'), path).toBe(
        '/og/docs/server/procedures/abcdef0123.png',
      );
    }
    await expect(
      get('/og/docs/server/procedures/abcdef0123.png'),
    ).rejects.toThrow('drew a card');
  });

  it("redirects the home card at another day, as yesterday's, to today's until tomorrow", async () => {
    vi.useFakeTimers({
      now: new Date('2026-11-05T23:00:00Z'),
      toFake: ['Date'],
    });
    for (const path of [
      '/og/index',
      '/og/index.png',
      '/og/index/abcdef0123.png',
      '/og/index/abcdef0123-20261104.png',
      '/og/index/abcdef0123-20261105.png?x=1',
    ]) {
      const response = await get(path);
      expect(response.status, path).toBe(307);
      expect(response.headers.get('location'), path).toBe(
        '/og/index/abcdef0123-20261105.png',
      );
      expect(response.headers.get('cache-control'), path).toBe(
        versionRedirectCacheControl(3600),
      );
    }
    await expect(get('/og/index/abcdef0123-20261105.png')).rejects.toThrow(
      'drew a card',
    );
    vi.setSystemTime(new Date('2026-11-06T00:00:01Z'));
    expect(
      (await get('/og/index/abcdef0123-20261105.png')).headers.get('location'),
    ).toBe('/og/index/abcdef0123-20261106.png');
  });

  it("draws the READMEs' sponsor cloud at its URL, and redirects a query to it", async () => {
    const response = await get('/og/_/sponsor-cloud.png?x=1');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/og/_/sponsor-cloud.png');
    await expect(get('/og/_/sponsor-cloud.png')).rejects.toThrow(
      'drew the sponsor cloud',
    );
  });

  it('redirects the sponsor cloud at another version to its current one, in _', async () => {
    for (const path of [
      '/og/_/sponsor-cloud',
      '/og/_/sponsor-cloud/0000000000.png',
    ]) {
      expect((await get(path)).headers.get('location'), path).toBe(
        '/og/_/sponsor-cloud/c10dc10dc1.png',
      );
    }
    await expect(get('/og/_/sponsor-cloud/c10dc10dc1.png')).rejects.toThrow(
      'drew the sponsor cloud',
    );
  });

  it('answers a path without an image with a 404, whatever its version or query', async () => {
    for (const path of [
      '/og/nothing.png?v=abc',
      '/og/nothing/abcdef0123.png',
      '/og/docs/server/x/abcdef0123.png',
      '/og/docs/server/procedures/made-up.png',
      '/og/_/nothing.png',
    ]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });
});
