import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import type { CardFooter, OgCard } from './card.ts';
import { footerWith, png, serveAvatars, testAvatars } from './fake-avatars.ts';
import { cacheControl, fetchStats, live, noLive } from './live.ts';
import { immutableCacheControl } from './version.ts';

const home: OgCard = { kind: 'home', path: '/' };

const postBy = (image: string): OgCard => ({
  authors: [{ image, name: 'Alex / KATT' }, { name: 'Someone' }],
  date: '2025-03-21',
  description: '',
  kind: 'post',
  path: '/blog/a',
  readingMinutes: 4,
  title: 'A',
});

/** `fetch` answering each URL that starts with a key, until disposed. */
const stubFetch = (routes: Record<string, () => Response>) => {
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
  return makeResource({}, () => vi.unstubAllGlobals());
};

/** What `card` shows live, with the sponsors in `footer` along its foot: none unless given. */
const liveOf = (card: OgCard, footer: CardFooter = footerWith()) =>
  Effect.runPromise(live(card, footer).pipe(Effect.provide(testAvatars)));

describe('fetchStats', () => {
  it("reads the repo's stars and @trpc/server's weekly downloads", async () => {
    using _fetch = stubFetch({
      'https://api.github.com/repos/trpc/trpc': () =>
        Response.json({ stargazers_count: 40_759 }),
      'https://api.npmjs.org/downloads/point/last-week/@trpc/server': () =>
        Response.json({ downloads: 7_926_494 }),
    });
    expect(await fetchStats(undefined)).toEqual({
      downloads: 7_926_494,
      stars: 40_759,
    });
  });

  it('leaves out a number that fails', async () => {
    using _fetch = stubFetch({
      'https://api.github.com/': () => new Response('', { status: 403 }),
      'https://api.npmjs.org/': () => Response.json({ error: 'nope' }),
    });
    expect(await fetchStats(undefined)).toEqual({
      downloads: undefined,
      stars: undefined,
    });
  });
});

describe('live', () => {
  it("fetches all of a card's avatars at once", async () => {
    const paths = Array.from({ length: 24 }, (_, index) => `/${index}.png`);
    await using server = await serveAvatars(
      Object.fromEntries(paths.map((path) => [path, { ...png(), delay: 50 }])),
    );
    const fetched = await liveOf({
      backerSlots: 12,
      backers: paths.map((path) => ({ image: server.url(path), name: path })),
      description: '',
      kind: 'sponsor',
      partners: [],
      path: '/sponsor',
      sponsorCount: paths.length,
      title: 'Sponsor',
      url: 'https://github.com/sponsors/trpc',
    });
    expect(fetched.avatars.size).toBe(paths.length);
    expect(server.mostInFlight).toBeGreaterThan(8);
  });
});

describe('cacheControl', () => {
  it('keeps the home card a day, and one missing a number ten minutes', () => {
    expect(
      cacheControl(
        home,
        { avatars: new Map(), stats: { downloads: 1, stars: 1 } },
        footerWith(),
      ),
    ).toContain('s-maxage=86400');
    expect(
      cacheControl(
        home,
        { avatars: new Map(), stats: { stars: 1 } },
        footerWith(),
      ),
    ).toContain('s-maxage=600');
  });

  it("keeps a post for good, unless an author's avatar didn't load", async () => {
    await using server = await serveAvatars({ '/katt.png': png() });
    const post = postBy(server.url('/katt.png'));
    const fetched = await liveOf(post);
    expect(fetched.stats).toEqual({});
    expect([...fetched.avatars.keys()]).toEqual([server.url('/katt.png')]);
    expect(cacheControl(post, fetched, footerWith())).toBe(
      immutableCacheControl,
    );
    expect(cacheControl(post, noLive, footerWith())).toContain('s-maxage=600');
  });

  it("fetches the sponsors' avatars for any other card's foot, and keeps it briefly if one didn't load", async () => {
    await using server = await serveAvatars({
      '/a.png': png(),
      '/face.png': png(),
    });
    const partners = [
      { image: server.url('/a.png'), name: 'A' },
      { image: server.url('/b.png'), name: 'B' },
    ];
    const faces = [
      { image: server.url('/face.png'), name: 'Face' },
      { image: server.url('/gone.png'), name: 'Gone' },
    ];
    const doc: OgCard = {
      description: '',
      kind: 'doc',
      path: '/docs/quickstart',
      title: 'Quickstart',
      url: 'https://trpc.io/docs/quickstart',
    };
    const fetched = await liveOf(doc, footerWith(partners, faces));
    expect([...fetched.avatars.keys()].toSorted()).toEqual(
      [server.url('/a.png'), server.url('/face.png')].toSorted(),
    );
    expect(
      cacheControl(doc, fetched, footerWith(partners, faces.slice(0, 1))),
    ).toContain('s-maxage=600');
    expect(
      cacheControl(doc, fetched, footerWith(partners.slice(0, 1), faces)),
    ).toContain('s-maxage=600');
    expect(
      cacheControl(
        doc,
        fetched,
        footerWith(partners.slice(0, 1), faces.slice(0, 1)),
      ),
    ).toBe(immutableCacheControl);
  });

  it("fetches each sponsor's avatar, and keeps the card briefly if one didn't load", async () => {
    await using server = await serveAvatars({ '/a.png': png() });
    const sponsor: OgCard = {
      backerSlots: 12,
      backers: [{ image: server.url('/b.png'), name: 'B' }],
      description: '',
      kind: 'sponsor',
      partners: [{ image: server.url('/a.png'), name: 'A', tier: 'Silver' }],
      path: '/sponsor',
      sponsorCount: 2,
      title: 'Sponsor',
      url: 'https://github.com/sponsors/trpc',
    };
    const fetched = await liveOf(sponsor);
    expect([...fetched.avatars.keys()]).toEqual([server.url('/a.png')]);
    expect(cacheControl(sponsor, fetched)).toContain('s-maxage=600');
    expect(
      cacheControl(sponsor, {
        ...fetched,
        avatars: new Map([...fetched.avatars, [server.url('/b.png'), 'data:']]),
      }),
    ).toBe(immutableCacheControl);
  });
});
