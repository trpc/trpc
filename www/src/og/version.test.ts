import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Live from './live.ts';

import {
  dailyVersion,
  notAPage,
  ogImagePath,
  requestedPage,
  untilTomorrow,
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

const drawing = vi.hoisted(() => ({ cloud: false }));

vi.mock('./render.ts', () => ({
  renderOgImage: () => {
    throw new Error('drew a card');
  },
  renderSponsorCloud: () => {
    if (!drawing.cloud) {
      throw new Error('drew the sponsor cloud');
    }
    return new Uint8Array(1);
  },
}));

vi.mock('./live.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Live>()),
  fetchCloudAvatars: async (images: ReadonlyArray<string>) =>
    new Map(images.map((image) => [image, 'data:,'])),
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
  it('is the hash and the UTC day', () => {
    const day = utcDay(new Date('2026-11-05T23:59:59Z'));
    expect(day).toBe('20261105');
    expect(dailyVersion('abc', day)).toBe('abc-20261105');
    expect(dailyVersion('', day)).toBe('');
  });

  it('stays current until the next UTC day', () => {
    expect(untilTomorrow(new Date('2026-11-05T23:59:00Z'))).toBe(60);
    expect(untilTomorrow(new Date('2026-11-05T00:00:00Z'))).toBe(86_400);
  });
});

describe('requestedPage', () => {
  const pages = new Set(['/', '/docs', '/docs/a', '/_/cloud']);
  const exists = (page: string) => pages.has(page);

  it('reads the page from /og and its path, with .png, without, or with a version', () => {
    for (const [path, page] of [
      ['/og/docs/a', '/docs/a'],
      ['/og/docs/a.png', '/docs/a'],
      ['/og/docs/a/abcdef0123-20261105.png', '/docs/a'],
      ['/og/docs/abcdef0123-20261104.png', '/docs'],
      ['/og/docs/abcdef0123.png', '/docs'],
      ['/og/index', '/'],
      ['/og/index.png', '/'],
      ['/og/index/abcdef0123-20261105.png', '/'],
      ['/og/_/cloud.png', '/_/cloud'],
      ['/og/_/cloud/abcdef0123-20261105.png', '/_/cloud'],
    ] as const) {
      expect(requestedPage(path, exists), path).toBe(page);
    }
  });

  it('names nothing where no page is', () => {
    for (const path of [
      '/og/docs/b/c.png',
      '/og/docs/a/abcdef0123-20261105',
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
    drawing.cloud = false;
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("redirects any card at no version, another version or another day, as yesterday's, or with a query, to today's until tomorrow, before drawing it", async () => {
    vi.useFakeTimers({
      now: new Date('2026-11-05T23:00:00Z'),
      toFake: ['Date'],
    });
    for (const path of [
      '/og/docs/server/procedures',
      '/og/docs/server/procedures.png',
      '/og/docs/server/procedures/0000000000-20261105.png',
      '/og/docs/server/procedures/abcdef0123.png',
      '/og/docs/server/procedures/abcdef0123-20261104.png',
      '/og/docs/server/procedures/abcdef0123-20261105.png?cache=bust',
    ]) {
      const response = await get(path);
      expect(response.status, path).toBe(307);
      expect(response.headers.get('location'), path).toBe(
        '/og/docs/server/procedures/abcdef0123-20261105.png',
      );
      expect(response.headers.get('cache-control'), path).toBe(
        versionRedirectCacheControl(3600),
      );
    }
    await expect(
      get('/og/docs/server/procedures/abcdef0123-20261105.png'),
    ).rejects.toThrow('drew a card');
  });

  it('dates the home card the same way, so its numbers refresh daily', async () => {
    vi.useFakeTimers({
      now: new Date('2026-11-05T23:00:00Z'),
      toFake: ['Date'],
    });
    for (const path of [
      '/og/index',
      '/og/index.png',
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

  it("tags the READMEs' sponsor cloud with its version that day, so a cache checking it gets that day's avatars", async () => {
    vi.useFakeTimers({
      now: new Date('2026-11-05T12:00:00Z'),
      toFake: ['Date'],
    });
    drawing.cloud = true;
    const response = await get('/og/_/sponsor-cloud.png');
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"c10dc10dc1-20261105"');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate, s-maxage=86400',
    );
    vi.setSystemTime(new Date('2026-11-06T00:00:00Z'));
    expect((await get('/og/_/sponsor-cloud.png')).headers.get('etag')).toBe(
      '"c10dc10dc1-20261106"',
    );
  });

  it("redirects the sponsor cloud at another version or day to today's, in _", async () => {
    vi.useFakeTimers({
      now: new Date('2026-11-05T12:00:00Z'),
      toFake: ['Date'],
    });
    for (const path of [
      '/og/_/sponsor-cloud',
      '/og/_/sponsor-cloud/0000000000-20261105.png',
      '/og/_/sponsor-cloud/c10dc10dc1-20261104.png',
    ]) {
      expect((await get(path)).headers.get('location'), path).toBe(
        '/og/_/sponsor-cloud/c10dc10dc1-20261105.png',
      );
    }
    await expect(
      get('/og/_/sponsor-cloud/c10dc10dc1-20261105.png'),
    ).rejects.toThrow('drew the sponsor cloud');
  });

  it('answers a path without an image with a 404, whatever its version or query', async () => {
    for (const path of [
      '/og/nothing.png?v=abc',
      '/og/nothing/abcdef0123-20261105.png',
      '/og/docs/server/x/abcdef0123-20261105.png',
      '/og/docs/server/procedures/made-up.png',
      '/og/_/nothing.png',
    ]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });
});
