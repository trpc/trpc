import { describe, expect, it } from 'vitest';

import {
  avatarUrl,
  cardFooter,
  cardFooterOf,
  drawnSponsors,
  isSmallSponsor,
  type Partner,
  partners,
  partnersByTier,
  type Sponsor,
  sponsorCard,
  sponsorCardAlt,
  sponsorCardOf,
  sponsors,
  sponsorTiers,
  type SponsorTier,
} from './sponsors.ts';

const sponsor = (login: string, weight: number): Sponsor => ({
  createdAt: 0,
  imgSrc: `https://example.com/${login}.png`,
  link: `https://example.com/${login}`,
  login,
  name: login,
  weight,
});

/** Partners `a`, `b`, … by rank, each of the tier it's given. */
const rankedOf = (tiers: ReadonlyArray<SponsorTier>) =>
  tiers.map((tier, index): Partner => ({
    ...sponsor(String.fromCodePoint(97 + index), 1),
    accent: '#888888',
    blurb: '',
    domain: 'example.com',
    rank: index + 1,
    tier,
  }));

const tierOrder = (partner: Partner) =>
  sponsorTiers.findIndex((entry) => entry.tier === partner.tier);

describe('cardFooter', () => {
  it("names every one of sponsors.json's partners, gold first, then by rank", () => {
    expect(cardFooter.partners).toEqual(
      partners
        .toSorted((a, b) => tierOrder(a) - tierOrder(b))
        .map((partner) => ({
          image: partner.imgSrc,
          name: partner.name,
        })),
    );
  });

  it('lists gold partners first, then each lower tier, by rank within a tier', () => {
    const ranked = rankedOf(['silver', 'gold', 'silver', 'gold']);
    expect(
      cardFooterOf(ranked, ranked).partners.map((partner) => partner.name),
    ).toEqual(['b', 'd', 'a', 'c']);
  });

  it('then the other drawn sponsors most given first, twice as many as it draws faces of, small', () => {
    const others = drawnSponsors
      .filter((sponsor) => !partners.some((p) => p.login === sponsor.login))
      .toSorted((a, b) => b.weight - a.weight);
    expect(cardFooter.backers).toEqual(
      others.slice(0, cardFooter.faceSlots * 2).map((sponsor) => ({
        image: avatarUrl(sponsor, 68),
        name: sponsor.name,
      })),
    );
    expect(cardFooter.sponsorCount).toBe(sponsors.length);
  });
});

describe('partnersByTier', () => {
  it('is every partner in the order the social cards name them', () => {
    expect(partnersByTier.map((partner) => partner.name)).toEqual(
      cardFooter.partners.map((partner) => partner.name),
    );
    expect(partnersByTier.map((partner) => tierOrder(partner))).toEqual(
      partnersByTier
        .map((partner) => tierOrder(partner))
        .toSorted((a, b) => a - b),
    );
  });
});

describe('isSmallSponsor', () => {
  it('is a sponsor below the partner tiers', () => {
    expect(isSmallSponsor({})).toBe(true);
    expect(isSmallSponsor({ tier: 'bronze' })).toBe(true);
    expect(isSmallSponsor({ tier: 'silver' })).toBe(false);
    expect(isSmallSponsor({ tier: 'gold' })).toBe(false);
  });
});

describe('drawnSponsors', () => {
  it('are the sponsors but the imageless, who are all small', () => {
    expect(drawnSponsors).toEqual(
      sponsors.filter((sponsor) => sponsor.imageless !== true),
    );
    for (const sponsor of sponsors.filter((s) => s.imageless === true)) {
      expect(isSmallSponsor(sponsor)).toBe(true);
    }
  });
});

describe('sponsorCard', () => {
  it('draws the partners first, gold first, then by rank, with their tier', () => {
    expect(sponsorCard.partners.map((partner) => partner.name)).toEqual(
      partners
        .toSorted((a, b) => tierOrder(a) - tierOrder(b))
        .slice(0, 4)
        .map((partner) => partner.name),
    );
    for (const partner of sponsorCard.partners) {
      expect(['Gold', 'Silver']).toContain(partner.tier);
    }
  });

  it('then the partners past the fourth, the other drawn sponsors most given first, twice as many as fit', () => {
    const later = partners.slice(4).map((partner) => partner.imgSrc);
    const backerImages = sponsorCard.backers.map((backer) => backer.image);
    expect(backerImages.slice(0, later.length)).toEqual(
      later.slice(0, sponsorCard.backerSlots * 2),
    );
    const backers = backerImages
      .slice(later.length)
      .map((image) => sponsors.find((sponsor) => sponsor.imgSrc === image));
    const weights = backers.map((backer) => backer?.weight ?? 0);
    expect(weights).toEqual(weights.toSorted((a, b) => b - a));
    expect(sponsorCard.backers.length).toBeLessThanOrEqual(
      sponsorCard.backerSlots * 2,
    );
    expect(backers.every((backer) => backer?.imageless !== true)).toBe(true);
    expect(sponsorCard.sponsorCount).toBe(sponsors.length);
    const images = [...sponsorCard.partners, ...sponsorCard.backers].map(
      (sponsor) => sponsor.image,
    );
    expect(new Set(images).size).toBe(images.length);
  });

  it('puts the partners past the fourth before the others, who go by what they gave, and leaves out the imageless', () => {
    const ranked = rankedOf(
      Array.from({ length: 6 }, (): SponsorTier => 'silver'),
    );
    const card = sponsorCardOf(ranked, [
      sponsor('low', 5),
      sponsor('high', 90),
      ...ranked,
      sponsor('mid', 40),
      { ...sponsor('imageless', 60), imageless: true },
    ]);
    expect(card.partners.map((partner) => partner.name)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(card.backers).toEqual([
      expect.objectContaining({ name: 'e', partner: true }),
      expect.objectContaining({ name: 'f', partner: true }),
      { image: 'https://example.com/high.png', name: 'high' },
      { image: 'https://example.com/mid.png', name: 'mid' },
      { image: 'https://example.com/low.png', name: 'low' },
    ]);
    expect(card.sponsorCount).toBe(10);
    expect(card.description).toContain('10 sponsors');
  });

  it('draws gold partners first, then each lower tier, by rank within a tier', () => {
    const ranked = rankedOf([
      'silver',
      'silver',
      'gold',
      'silver',
      'silver',
      'gold',
    ]);
    const card = sponsorCardOf(ranked, ranked);
    expect(
      card.partners.map((partner) => [partner.name, partner.tier]),
    ).toEqual([
      ['c', 'Gold'],
      ['f', 'Gold'],
      ['a', 'Silver'],
      ['b', 'Silver'],
    ]);
    expect(card.backers.map((backer) => backer.name)).toEqual(['d', 'e']);
  });

  it("is /sponsor's, and its alt text says what it shows", () => {
    expect(sponsorCard.path).toBe('/sponsor');
    expect(sponsorCard.url).toBe('https://github.com/sponsors/trpc');
    expect(sponsorCardAlt).toContain(sponsorCard.title);
    expect(sponsorCardAlt).toContain('github.com/sponsors/trpc');
  });
});
