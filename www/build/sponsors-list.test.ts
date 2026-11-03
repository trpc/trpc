import { describe, expect, it } from '@effect/vitest';

import { sponsorKey } from '../src/sponsors.ts';
import type { Sponsorship } from './sponsors-github.ts';
import {
  type DirectSponsor,
  directDollars,
  maxWeight,
  minWeight,
  type SponsorsConfig,
  sponsorsList,
  trackingLink,
  weightFor,
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

const acme: DirectSponsor = {
  avatarUrl: 'https://github.com/acme.png',
  dollars: 7_200,
  every: 'year',
  login: 'Acme',
  name: 'Acme',
  since: '2026-02-11',
  websiteUrl: 'https://acme.dev/',
};

describe('trackingLink', () => {
  it("adds trpc's ref and UTM parameters", () => {
    expect(trackingLink('https://globex.dev/')).toBe(
      'https://globex.dev/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc',
    );
  });

  it("keeps a sponsor's own ref, and replaces their UTM parameters", () => {
    expect(
      trackingLink('https://www.initech.dev/?ref=cr&utm_source=x&page=1'),
    ).toBe(
      'https://www.initech.dev/?ref=cr&utm_source=github&page=1&utm_medium=referral&utm_campaign=trpc',
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

describe('weightFor', () => {
  it('runs from the least weight for nothing paid to the most for the top sponsor', () => {
    expect(weightFor(0)).toBe(minWeight);
    expect(weightFor(1)).toBe(maxWeight);
    expect(weightFor(-1)).toBe(minWeight);
    expect(weightFor(2)).toBe(maxWeight);
  });

  it('never goes down as a share grows, and grows in proportion to it above the floor', () => {
    const shares = Array.from({ length: 1001 }, (_, index) => index / 1000);
    const weights = shares.map(weightFor);
    expect(weights).toEqual(weights.toSorted((a, b) => a - b));
    expect(weightFor(0.5)).toBe(52.5);
    expect(weightFor(0.2)).toBe(24);
    expect(weightFor(0.01)).toBe(6);
  });
});

describe('directDollars', () => {
  it('counts every period started, the current one included', () => {
    expect(directDollars(acme, Date.parse('2026-02-11'))).toBe(7_200);
    expect(directDollars(acme, Date.parse('2027-02-10'))).toBe(7_200);
    expect(directDollars(acme, Date.parse('2027-02-12'))).toBe(14_400);
    const monthly: DirectSponsor = { ...acme, dollars: 300, every: 'month' };
    expect(directDollars(monthly, Date.parse('2026-02-11') + 45 * day)).toBe(
      600,
    );
  });

  it('counts the first period for a sponsor who starts later', () => {
    expect(directDollars(acme, Date.parse('2026-01-01'))).toBe(7_200);
  });
});

describe('sponsorsList', () => {
  it('weighs sponsors by their share of what the top sponsor paid in all, above a floor', () => {
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
      ['github/mid', 28.8],
      ['github/tiny', 5.2],
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
      ['github/new', 52.5],
      ['github/old', 100],
    ]);
  });

  it('merges someone sponsoring several accounts into one sponsor, from when they first started, whatever the case of their login', () => {
    const sponsors = sponsorsList({
      config: noConfig,
      lifetimeValues: [
        { cents: 30_000, login: 'both' },
        { cents: 10_000, login: 'Both' },
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
      expect.objectContaining({ login: 'one', weight: 52.5 }),
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
        direct: [acme],
        extra: [
          { dollars: 1_200, login: 'globex', why: 'A private account' },
          { dollars: 99, login: 'gone', why: 'No longer sponsors' },
        ],
        shownPrivately: [],
      },
      lifetimeValues: [{ cents: 600_000, login: 'globex' }],
      now,
      sponsorships: [
        sponsorship('globex', {
          createdAt: Date.parse('2025-03-27'),
          name: 'Globex',
          websiteUrl: 'https://globex.dev',
        }),
      ],
    });
    expect(sponsors).toEqual([
      {
        createdAt: Date.parse('2025-03-27'),
        imgSrc: 'https://avatars.githubusercontent.com/globex?v=4',
        link: 'https://globex.dev/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc',
        login: 'globex',
        source: 'github',
        name: 'Globex',
        weight: 100,
      },
      {
        createdAt: Date.parse('2026-02-11'),
        imgSrc: 'https://github.com/acme.png',
        link: 'https://acme.dev/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc',
        login: 'Acme',
        name: 'Acme',
        rank: 1,
        source: 'github',
        tier: 'silver',
        weight: 100,
      },
    ]);
  });

  it('tiers sponsors by what they give a month across accounts, ranked by that, then by what they paid in all', () => {
    const sponsors = sponsorsList({
      config: { ...noConfig, direct: [acme] },
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
      [2, 'github/Acme', 'silver'],
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
      config: { ...noConfig, direct: [acme] },
      lifetimeValues: [
        { cents: 720_000, login: 'Acme' },
        { cents: 1_440_000, login: 'other' },
      ],
      now,
      sponsorships: [
        sponsorship('Acme', { createdAt: Date.parse('2026-05-01') }),
        sponsorship('other'),
      ],
    });
    expect(sponsors).toEqual([
      expect.objectContaining({ login: 'other', weight: 100 }),
      expect.objectContaining({
        createdAt: Date.parse('2026-02-11'),
        login: 'Acme',
        name: 'ACME',
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
        backer('hooli', {
          avatarUrl: 'https://images.opencollective.com/hooli/1a2b3c4/logo.png',
          createdAt: Date.parse('2026-05-27'),
          monthlyDollars: 30,
          name: 'Hooli',
          paidCents: 20_000,
          websiteUrl: 'https://www.hooli.dev',
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
        weight: 62,
      }),
      {
        createdAt: Date.parse('2026-01-01'),
        imgSrc: 'https://images.opencollective.com/linked/avatar.png',
        link: 'https://opencollective.com/linked',
        name: 'LINKED',
        profileUrl: 'https://opencollective.com/linked',
        slug: 'linked',
        source: 'opencollective',
        weight: 6,
      },
      expect.objectContaining({
        link: 'https://opencollective.com/plain',
        slug: 'plain',
        source: 'opencollective',
        weight: 6,
      }),
      {
        createdAt: Date.parse('2026-05-27'),
        imgSrc: 'https://images.opencollective.com/hooli/1a2b3c4/logo.png',
        link: 'https://www.hooli.dev/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc',
        name: 'Hooli',
        profileUrl: 'https://opencollective.com/hooli',
        slug: 'hooli',
        source: 'opencollective',
        weight: 24,
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
        weight: 62,
      }),
      expect.objectContaining({
        slug: 'bySite',
        source: 'opencollective',
        weight: 9.8,
      }),
    ]);
  });

  it('merges a direct sponsor with their Open Collective backer, and their extra payments, whatever the case of their login', () => {
    const sponsors = sponsorsList({
      config: {
        ...noConfig,
        direct: [acme],
        extra: [{ dollars: 1_400, login: 'ACME', why: 'Paid by invoice' }],
      },
      lifetimeValues: [{ cents: 2_000_000, login: 'other' }],
      now,
      openCollective: [
        backer('acme-oc', {
          githubLogin: 'acme',
          monthlyDollars: 0,
          paidCents: 140_000,
        }),
      ],
      sponsorships: [sponsorship('other')],
    });
    expect(sponsors).toEqual([
      expect.objectContaining({ login: 'other', weight: 100 }),
      expect.objectContaining({
        login: 'Acme',
        source: 'github',
        weight: 52.5,
      }),
    ]);
  });

  it('merges an Open Collective backer by GitHub account before website', () => {
    const sponsors = sponsorsList({
      config: noConfig,
      lifetimeValues: [
        { cents: 10_000, login: 'earlier' },
        { cents: 10_000, login: 'later' },
      ],
      now,
      openCollective: [
        backer('later-oc', {
          githubLogin: 'later',
          paidCents: 10_000,
          websiteUrl: 'https://earlier.dev',
        }),
      ],
      sponsorships: [
        sponsorship('earlier', {
          createdAt: Date.parse('2024-01-01'),
          websiteUrl: 'https://earlier.dev',
        }),
        sponsorship('later'),
      ],
    });
    expect(
      sponsors.map((sponsor) => [sponsorKey(sponsor), sponsor.weight]),
    ).toEqual([
      ['github/earlier', 52.5],
      ['github/later', 100],
    ]);
  });

  it('merges Open Collective backers who are one another, and tells sites apart by their port, path and query', () => {
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
        backer('path-lower', { websiteUrl: 'https://HOST.dev/team' }),
        backer('path-upper', { websiteUrl: 'https://host.dev/Team' }),
        backer('port', { websiteUrl: 'https://host.dev:8443/team' }),
      ],
      sponsorships: [],
    });
    expect(
      sponsors.map((sponsor) => [sponsorKey(sponsor), sponsor.tier ?? null]),
    ).toEqual([
      ['opencollective/alice', 'bronze'],
      ['opencollective/page-1', null],
      ['opencollective/page-2', null],
      ['opencollective/path-lower', null],
      ['opencollective/path-upper', null],
      ['opencollective/port', null],
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
