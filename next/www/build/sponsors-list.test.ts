import { describe, expect, it } from '@effect/vitest';

import type { Sponsorship } from './sponsors-github.ts';
import {
  type DirectSponsor,
  directDollars,
  type SponsorsConfig,
  sponsorsList,
  trackingLink,
} from './sponsors-list.ts';

const day = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-10-18');

const noConfig: SponsorsConfig = { direct: [], extra: [], shownPrivately: [] };

function sponsorship(
  login: string,
  overrides: Partial<Sponsorship> = {},
): Sponsorship {
  return {
    avatarUrl: `https://avatars.githubusercontent.com/${login}?v=4`,
    createdAt: Date.parse('2025-01-01'),
    isPublic: true,
    login,
    monthlyDollars: 10,
    name: login.toUpperCase(),
    websiteUrl: null,
    ...overrides,
  };
}

const serpApi: DirectSponsor = {
  avatarUrl: 'https://github.com/serpapi.png',
  dollars: 6000,
  every: 'year',
  login: 'SerpApi',
  name: 'SerpApi',
  since: '2026-02-11',
  websiteUrl: 'https://serpapi.com/',
};

describe('trackingLink', () => {
  it("adds trpc's ref and UTM parameters", () => {
    expect(trackingLink('https://greptile.com/')).toBe(
      'https://greptile.com/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc',
    );
  });

  it("keeps a sponsor's own ref, and replaces their UTM parameters", () => {
    expect(
      trackingLink('https://www.coderabbit.ai/?ref=cr&utm_source=x&page=1'),
    ).toBe(
      'https://www.coderabbit.ai/?ref=cr&utm_source=github&page=1&utm_medium=referral&utm_campaign=trpc',
    );
  });

  it('takes a website without a scheme as https', () => {
    expect(trackingLink('maxgreenwald.me')).toBe(
      'https://maxgreenwald.me/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc',
    );
  });

  it("is undefined for a website that isn't a URL", () => {
    expect(trackingLink('https://not a url')).toBeUndefined();
  });
});

describe('directDollars', () => {
  it('counts every period started, the current one included', () => {
    expect(directDollars(serpApi, Date.parse('2026-02-11'))).toBe(6000);
    expect(directDollars(serpApi, Date.parse('2027-02-10'))).toBe(6000);
    expect(directDollars(serpApi, Date.parse('2027-02-12'))).toBe(12_000);
    const monthly: DirectSponsor = { ...serpApi, dollars: 500, every: 'month' };
    expect(directDollars(monthly, Date.parse('2026-02-11') + 45 * day)).toBe(
      1000,
    );
  });

  it('counts the first period for a sponsor who starts later', () => {
    expect(directDollars(serpApi, Date.parse('2026-01-01'))).toBe(6000);
  });
});

describe('sponsorsList', () => {
  it('weighs sponsors by what they paid in all, the most at 100', () => {
    const sponsors = sponsorsList({
      config: noConfig,
      lifetimeValues: [
        { cents: 200_000, login: 'big' },
        { cents: 50_000, login: 'mid' },
        { cents: 500, login: 'tiny' },
      ],
      now,
      sponsorships: [
        sponsorship('big', { createdAt: Date.parse('2024-01-01') }),
        sponsorship('mid', { createdAt: Date.parse('2024-02-01') }),
        sponsorship('tiny', {
          createdAt: Date.parse('2024-03-01'),
          monthlyDollars: 5,
        }),
      ],
    });
    expect(sponsors.map((sponsor) => [sponsor.login, sponsor.weight])).toEqual([
      ['big', 100],
      ['mid', 25],
      ['tiny', 1],
    ]);
  });

  it('counts the monthly tier of a sponsor GitHub has not charged yet', () => {
    const sponsors = sponsorsList({
      config: noConfig,
      lifetimeValues: [{ cents: 10_000, login: 'old' }],
      now,
      sponsorships: [
        sponsorship('old', { monthlyDollars: 10 }),
        sponsorship('new', { monthlyDollars: 50 }),
      ],
    });
    expect(sponsors.map((sponsor) => [sponsor.login, sponsor.weight])).toEqual([
      ['new', 50],
      ['old', 100],
    ]);
  });

  it('merges someone sponsoring several accounts into one sponsor, from when they first started', () => {
    const sponsors = sponsorsList({
      config: noConfig,
      lifetimeValues: [
        { cents: 30_000, login: 'both' },
        { cents: 10_000, login: 'both' },
        { cents: 20_000, login: 'one' },
      ],
      now,
      sponsorships: [
        sponsorship('both', { createdAt: Date.parse('2025-06-01') }),
        sponsorship('one', { createdAt: Date.parse('2025-03-01') }),
        sponsorship('both', { createdAt: Date.parse('2024-06-01') }),
      ],
    });
    expect(sponsors).toEqual([
      expect.objectContaining({
        createdAt: Date.parse('2024-06-01'),
        login: 'both',
        weight: 100,
      }),
      expect.objectContaining({ login: 'one', weight: 50 }),
    ]);
  });

  it('leaves out private sponsors, except those who said they can be shown', () => {
    const sponsors = sponsorsList({
      config: { ...noConfig, shownPrivately: ['fine'] },
      lifetimeValues: [],
      now,
      sponsorships: [
        sponsorship('public'),
        sponsorship('secret', { isPublic: false }),
        sponsorship('fine', { isPublic: false }),
      ],
    });
    expect(sponsors.map((sponsor) => sponsor.login)).toEqual([
      'fine',
      'public',
    ]);
  });

  it('adds direct sponsors and money GitHub does not attribute', () => {
    const sponsors = sponsorsList({
      config: {
        direct: [serpApi],
        extra: [
          { dollars: 1500, login: 'greptileai', why: 'A private account' },
          { dollars: 99, login: 'gone', why: 'No longer sponsors' },
        ],
        shownPrivately: [],
      },
      lifetimeValues: [{ cents: 450_000, login: 'greptileai' }],
      now,
      sponsorships: [
        sponsorship('greptileai', {
          createdAt: Date.parse('2025-03-27'),
          name: 'Greptile',
          websiteUrl: 'https://greptile.com',
        }),
      ],
    });
    expect(sponsors).toEqual([
      {
        createdAt: Date.parse('2025-03-27'),
        imgSrc: 'https://avatars.githubusercontent.com/greptileai?v=4',
        link: 'https://greptile.com/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc',
        login: 'greptileai',
        name: 'Greptile',
        weight: 100,
      },
      {
        createdAt: Date.parse('2026-02-11'),
        imgSrc: 'https://github.com/serpapi.png',
        link: 'https://serpapi.com/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc',
        login: 'SerpApi',
        name: 'SerpApi',
        rank: 1,
        tier: 'silver',
        weight: 100,
      },
    ]);
  });

  it('tiers sponsors by what they give a month across accounts, ranked by that, then by what they paid in all', () => {
    const sponsors = sponsorsList({
      config: { ...noConfig, direct: [serpApi] },
      lifetimeValues: [
        { cents: 100_000, login: 'newSilver' },
        { cents: 500_000, login: 'oldSilver' },
        { cents: 900_000, login: 'gold' },
        { cents: 900_000, login: 'once' },
      ],
      now,
      sponsorships: [
        sponsorship('backer', { monthlyDollars: 249 }),
        sponsorship('bronze', { monthlyDollars: 250 }),
        sponsorship('gold', { monthlyDollars: 600 }),
        sponsorship('gold', { monthlyDollars: 400 }),
        sponsorship('newSilver', { monthlyDollars: 500 }),
        sponsorship('oldSilver', { monthlyDollars: 500 }),
        sponsorship('once', { monthlyDollars: 0 }),
      ],
    });
    expect(
      sponsors
        .filter((sponsor) => sponsor.rank !== undefined)
        .toSorted((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
        .map((sponsor) => [sponsor.rank, sponsor.login, sponsor.tier]),
    ).toEqual([
      [1, 'gold', 'gold'],
      [2, 'SerpApi', 'silver'],
      [3, 'oldSilver', 'silver'],
      [4, 'newSilver', 'silver'],
      [5, 'bronze', 'bronze'],
    ]);
    const untiered = sponsors.filter((sponsor) => sponsor.tier === undefined);
    expect(untiered.map((sponsor) => sponsor.login).toSorted()).toEqual([
      'backer',
      'once',
    ]);
    expect(untiered.every((sponsor) => !('rank' in sponsor))).toBe(true);
  });

  it("adds a direct sponsor's payments to their GitHub sponsorship", () => {
    const sponsors = sponsorsList({
      config: { ...noConfig, direct: [serpApi] },
      lifetimeValues: [
        { cents: 600_000, login: 'SerpApi' },
        { cents: 1_200_000, login: 'other' },
      ],
      now,
      sponsorships: [
        sponsorship('SerpApi', { createdAt: Date.parse('2026-05-01') }),
        sponsorship('other'),
      ],
    });
    expect(sponsors).toEqual([
      expect.objectContaining({ login: 'other', weight: 100 }),
      expect.objectContaining({
        createdAt: Date.parse('2026-02-11'),
        login: 'SerpApi',
        name: 'SERPAPI',
        weight: 100,
      }),
    ]);
  });

  it("links to the sponsor's GitHub profile without a usable website, and names them by login without a name", () => {
    const sponsors = sponsorsList({
      config: noConfig,
      lifetimeValues: [],
      now,
      sponsorships: [
        sponsorship('nosite', { name: null }),
        sponsorship('badsite', { websiteUrl: 'https://not a url' }),
      ],
    });
    expect(
      sponsors.map((sponsor) => [sponsor.login, sponsor.name, sponsor.link]),
    ).toEqual([
      ['badsite', 'BADSITE', 'https://github.com/badsite'],
      ['nosite', 'nosite', 'https://github.com/nosite'],
    ]);
  });

  it('orders sponsors by when they started, then by login', () => {
    const sponsors = sponsorsList({
      config: noConfig,
      lifetimeValues: [],
      now,
      sponsorships: [
        sponsorship('b', { createdAt: 2 }),
        sponsorship('c', { createdAt: 1 }),
        sponsorship('a', { createdAt: 2 }),
      ],
    });
    expect(sponsors.map((sponsor) => sponsor.login)).toEqual(['c', 'a', 'b']);
  });
});
