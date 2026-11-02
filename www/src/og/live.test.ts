import { afterEach, describe, expect, it, vi } from 'vitest';

import { v12 } from '~/site.ts';

import type { OgCard } from './card.ts';
import {
  avatarUrl,
  cacheControl,
  downloadPackages,
  downloadPackagesFor,
  fetchAvatar,
  fetchLive,
  fetchStats,
  noLive,
} from './live.ts';

const home: OgCard = { kind: 'home', path: '/' };
const post: OgCard = {
  authors: [
    { image: 'https://github.com/KATT.png', name: 'Alex / KATT' },
    { name: 'Someone' },
  ],
  date: '2025-03-21',
  description: '',
  kind: 'post',
  path: '/blog/a',
  readingMinutes: 4,
  title: 'A',
};

const respond = (routes: Record<string, () => Response>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const route = Object.entries(routes).find(([prefix]) =>
        input.startsWith(prefix),
      );
      if (route === undefined) {
        throw new Error(`offline: ${input}`);
      }
      return route[1]();
    }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

const lastWeek = 'https://api.npmjs.org/downloads/point/last-week';

describe('downloadPackages', () => {
  it("counts @trpc/server where v12 is hidden, and adds v12's core where it's offered", () => {
    expect(downloadPackagesFor(true)).toEqual(['@trpc/server']);
    expect(downloadPackagesFor(false)).toEqual([
      '@trpc/server',
      '@trpc12/trpc',
    ]);
    expect(downloadPackages).toEqual(downloadPackagesFor(v12.hidden));
  });
});

describe('fetchStats', () => {
  it("reads the repo's stars and @trpc/server's weekly downloads", async () => {
    respond({
      'https://api.github.com/repos/trpc/trpc': () =>
        Response.json({ stargazers_count: 40_759 }),
      [`${lastWeek}/@trpc/server`]: () =>
        Response.json({ downloads: 7_926_494 }),
    });
    expect(await fetchStats(undefined, ['@trpc/server'])).toEqual({
      downloads: 7_926_494,
      stars: 40_759,
    });
  });

  it("adds up the packages' downloads", async () => {
    respond({
      'https://api.github.com/': () => Response.json({ stargazers_count: 1 }),
      [`${lastWeek}/@trpc/server`]: () =>
        Response.json({ downloads: 7_926_494 }),
      [`${lastWeek}/@trpc12/trpc`]: () => Response.json({ downloads: 1_234 }),
    });
    expect(
      (await fetchStats(undefined, ['@trpc/server', '@trpc12/trpc'])).downloads,
    ).toBe(7_927_728);
  });

  it("counts a package npm doesn't have yet as 0", async () => {
    respond({
      'https://api.github.com/': () => Response.json({ stargazers_count: 1 }),
      [`${lastWeek}/@trpc/server`]: () =>
        Response.json({ downloads: 7_926_494 }),
      [`${lastWeek}/@trpc12/trpc`]: () =>
        Response.json(
          { error: 'package @trpc12/trpc not found' },
          { status: 404 },
        ),
    });
    expect(
      (await fetchStats(undefined, ['@trpc/server', '@trpc12/trpc'])).downloads,
    ).toBe(7_926_494);
  });

  it('leaves the downloads out when one package fails', async () => {
    respond({
      'https://api.github.com/': () => Response.json({ stargazers_count: 1 }),
      [`${lastWeek}/@trpc/server`]: () =>
        Response.json({ downloads: 7_926_494 }),
      [`${lastWeek}/@trpc12/trpc`]: () => new Response('', { status: 503 }),
    });
    expect(
      (await fetchStats(undefined, ['@trpc/server', '@trpc12/trpc'])).downloads,
    ).toBeUndefined();
  });

  it('leaves out a number that fails', async () => {
    respond({
      'https://api.github.com/': () => new Response('', { status: 403 }),
      'https://api.npmjs.org/': () => Response.json({ error: 'nope' }),
    });
    expect(await fetchStats(undefined)).toEqual({
      downloads: undefined,
      stars: undefined,
    });
  });
});

describe('fetchAvatar', () => {
  it('asks GitHub for 128 pixels, and gives the image as a data URI', async () => {
    expect(avatarUrl('https://github.com/KATT.png')).toBe(
      'https://github.com/KATT.png?size=128',
    );
    expect(
      avatarUrl('https://avatars.githubusercontent.com/u/459267?v=4'),
    ).toBe('https://avatars.githubusercontent.com/u/459267?v=4&size=128');
    expect(avatarUrl('https://evilgithubusercontent.com/a.png')).toBe(
      'https://evilgithubusercontent.com/a.png',
    );
    respond({
      'https://github.com/KATT.png?size=128': () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'image/jpeg' },
        }),
    });
    expect(await fetchAvatar('https://github.com/KATT.png')).toBe(
      'data:image/jpeg;base64,AQID',
    );
  });

  it("is undefined when there's no image to be had", async () => {
    respond({
      'https://github.com/nobody.png': () => new Response('', { status: 404 }),
    });
    expect(await fetchAvatar('https://github.com/nobody.png')).toBeUndefined();
    expect(await fetchAvatar('https://example.com/a.png')).toBeUndefined();
  });
});

describe('cacheControl', () => {
  it('keeps the home card a day, and one missing a number ten minutes', () => {
    expect(
      cacheControl(home, {
        avatars: new Map(),
        stats: { downloads: 1, stars: 1 },
      }),
    ).toContain('s-maxage=86400');
    expect(
      cacheControl(home, { avatars: new Map(), stats: { stars: 1 } }),
    ).toContain('s-maxage=600');
  });

  it("keeps a post as a page, unless an author's avatar didn't load", async () => {
    respond({
      'https://github.com/KATT.png': () =>
        new Response(new Uint8Array([1]), {
          headers: { 'content-type': 'image/png' },
        }),
    });
    const live = await fetchLive(post);
    expect(live.stats).toEqual({});
    expect([...live.avatars.keys()]).toEqual(['https://github.com/KATT.png']);
    expect(cacheControl(post, live)).toBeUndefined();
    expect(cacheControl(post, noLive)).toContain('s-maxage=600');
  });
});
