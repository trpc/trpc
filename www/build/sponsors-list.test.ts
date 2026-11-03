import { describe, expect, it } from '@effect/vitest';

import { sponsorKey } from '../src/sponsors.ts';
import type { Sponsorship } from './sponsors-github.ts';
import {
  type DirectSponsor,
  directDollars,
  type SponsorsConfig,
  sponsorsList,
  trackingLink,
} from './sponsors-list.ts';
import type { OpenCollectiveBacker } from './sponsors-opencollective.ts';

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

function backer(
  slug: string,
  overrides: Partial<OpenCollectiveBacker> = {},
): OpenCollectiveBacker {
  return {
    avatarUrl: `https://images.opencollective.com/${slug}/avatar.png`,
    createdAt: Date.parse('2026-01-01'),
    githubLogin: null,
    isCurrent: true,
    monthlyDollars: 10,
    name: slug.toUpperCase(),
    paidCents: 1_000,
    slug,
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
    expect(
      sponsors.map((sponsor) => [sponsorKey(sponsor), sponsor.weight]),
    ).toEqual([
      ['github/big', 100],
      ['github/mid', 25],
      ['github/tiny', 1],
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
    expect(
      sponsors.map((sponsor) => [sponsorKey(sponsor), sponsor.weight]),
    ).toEqual([
      ['github/new', 50],
      ['github/old', 100],
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
    expect(sponsors.map(sponsorKey)).toEqual(['github/fine', 'github/public']);
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
        source: 'github',
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
        source: 'github',
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
        .map((sponsor) => [sponsor.rank, sponsorKey(sponsor), sponsor.tier]),
    ).toEqual([
      [1, 'github/gold', 'gold'],
      [2, 'github/SerpApi', 'silver'],
      [3, 'github/oldSilver', 'silver'],
      [4, 'github/newSilver', 'silver'],
      [5, 'github/bronze', 'bronze'],
    ]);
    const untiered = sponsors.filter((sponsor) => sponsor.tier === undefined);
    expect(untiered.map(sponsorKey).toSorted()).toEqual([
      'github/backer',
      'github/once',
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
      sponsors.map((sponsor) => [
        sponsorKey(sponsor),
        sponsor.name,
        sponsor.link,
      ]),
    ).toEqual([
      ['github/badsite', 'BADSITE', 'https://github.com/badsite'],
      ['github/nosite', 'nosite', 'https://github.com/nosite'],
    ]);
  });

  it('adds who backs on Open Collective now as Open Collective sponsors, weighed against GitHub sponsors by what they paid and tiered by what they give a month', () => {
    const sponsors = sponsorsList({
      config: noConfig,
      lifetimeValues: [{ cents: 100_000, login: 'gh' }],
      now,
      openCollective: [
        backer('venue-ink', {
          avatarUrl:
            'https://images.opencollective.com/venue-ink/49dbae6/logo.png',
          createdAt: Date.parse('2026-05-27'),
          monthlyDollars: 25,
          name: 'Venue.ink',
          paidCents: 15_000,
          websiteUrl: 'https://www.venue.ink',
        }),
        backer('big', { monthlyDollars: 600, paidCents: 60_000 }),
        backer('plain', { monthlyDollars: 0, paidCents: 1_000 }),
        backer('linked', { githubLogin: 'LinkedOnGithub' }),
        backer('past', { isCurrent: false, paidCents: 10_000_000 }),
      ],
      sponsorships: [sponsorship('gh')],
    });
    expect(sponsors).toEqual([
      expect.objectContaining({ login: 'gh', source: 'github', weight: 100 }),
      expect.objectContaining({
        link: 'https://opencollective.com/big',
        profileUrl: 'https://opencollective.com/big',
        rank: 1,
        slug: 'big',
        source: 'opencollective',
        tier: 'silver',
        weight: 60,
      }),
      {
        createdAt: Date.parse('2026-01-01'),
        imgSrc: 'https://images.opencollective.com/linked/avatar.png',
        link: 'https://opencollective.com/linked',
        name: 'LINKED',
        profileUrl: 'https://opencollective.com/linked',
        slug: 'linked',
        source: 'opencollective',
        weight: 1,
      },
      expect.objectContaining({
        link: 'https://opencollective.com/plain',
        slug: 'plain',
        source: 'opencollective',
        weight: 1,
      }),
      {
        createdAt: Date.parse('2026-05-27'),
        imgSrc: 'https://images.opencollective.com/venue-ink/49dbae6/logo.png',
        link: 'https://www.venue.ink/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc',
        name: 'Venue.ink',
        profileUrl: 'https://opencollective.com/venue-ink',
        slug: 'venue-ink',
        source: 'opencollective',
        weight: 15,
      },
    ]);
  });

  it('merges an Open Collective backer who sponsors on GitHub too, by GitHub login or website', () => {
    const sponsors = sponsorsList({
      config: noConfig,
      lifetimeValues: [
        { cents: 40_000, login: 'byLogin' },
        { cents: 40_000, login: 'bySite' },
      ],
      now,
      openCollective: [
        backer('by-login', {
          createdAt: Date.parse('2024-01-01'),
          githubLogin: 'BYLOGIN',
          monthlyDollars: 300,
          paidCents: 60_000,
        }),
        backer('by-site', {
          monthlyDollars: 100,
          paidCents: 20_000,
          websiteUrl: 'http://www.bysite.dev/',
        }),
        backer('bySite', { paidCents: 5_000 }),
      ],
      sponsorships: [
        sponsorship('byLogin', { monthlyDollars: 200 }),
        sponsorship('bySite', {
          monthlyDollars: 200,
          websiteUrl: 'https://bysite.dev',
        }),
      ],
    });
    expect(sponsors).toEqual([
      expect.objectContaining({
        createdAt: Date.parse('2024-01-01'),
        imgSrc: 'https://avatars.githubusercontent.com/byLogin?v=4',
        login: 'byLogin',
        source: 'github',
        tier: 'silver',
        weight: 100,
      }),
      expect.objectContaining({
        login: 'bySite',
        source: 'github',
        tier: 'bronze',
        weight: 60,
      }),
      expect.objectContaining({
        slug: 'bySite',
        source: 'opencollective',
        weight: 5,
      }),
    ]);
  });

  it('merges Open Collective backers who are one another, and tells sites apart by their query', () => {
    const sponsors = sponsorsList({
      config: noConfig,
      lifetimeValues: [],
      now,
      openCollective: [
        backer('alice', { githubLogin: 'alice', monthlyDollars: 200 }),
        backer('alice-co', { githubLogin: 'Alice', monthlyDollars: 100 }),
        backer('page-1', { websiteUrl: 'https://host.dev/?id=1&utm_source=x' }),
        backer('page-1-again', { websiteUrl: 'https://host.dev/?ref=y&id=1' }),
        backer('page-2', { websiteUrl: 'https://host.dev/?id=2' }),
      ],
      sponsorships: [],
    });
    expect(
      sponsors.map((sponsor) => [sponsorKey(sponsor), sponsor.tier ?? null]),
    ).toEqual([
      ['opencollective/alice', 'bronze'],
      ['opencollective/page-1', null],
      ['opencollective/page-2', null],
    ]);
  });

  it('orders sponsors by when they started, then by source and login', () => {
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
    expect(sponsors.map(sponsorKey)).toEqual([
      'github/c',
      'github/a',
      'github/b',
    ]);
  });
});
