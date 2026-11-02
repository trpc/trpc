import { describe, expect, it } from 'vitest';

import {
  cardFooterPartners,
  drawnSponsors,
  isSmallSponsor,
  type Partner,
  partners,
  type Sponsor,
  sponsorCard,
  sponsorCardAlt,
  sponsorCardOf,
  sponsors,
} from './sponsors.ts';

describe('cardFooterPartners', () => {
  it("are sponsors.json's partners, by rank, as /sponsor's card draws them", () => {
    expect(cardFooterPartners).toEqual(
      sponsorCard.partners.map(({ image, name }) => ({ image, name })),
    );
    expect(cardFooterPartners.map((partner) => partner.image)).toEqual(
      partners.slice(0, 4).map((partner) => partner.imgSrc),
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
  it('draws the partners first, by rank, with their tier', () => {
    expect(sponsorCard.partners.map((partner) => partner.name)).toEqual(
      partners.slice(0, 4).map((partner) => partner.name),
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
    const sponsor = (login: string, weight: number): Sponsor => ({
      createdAt: 0,
      imgSrc: `https://example.com/${login}.png`,
      link: `https://example.com/${login}`,
      login,
      name: login,
      weight,
    });
    const ranked = ['a', 'b', 'c', 'd', 'e', 'f'].map(
      (login, index): Partner => ({
        ...sponsor(login, 1),
        accent: '#888888',
        blurb: login,
        domain: 'example.com',
        rank: index + 1,
        tier: 'silver',
      }),
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

  it("is /sponsor's, and its alt text says what it shows", () => {
    expect(sponsorCard.path).toBe('/sponsor');
    expect(sponsorCard.url).toBe('https://github.com/sponsors/trpc');
    expect(sponsorCardAlt).toContain(sponsorCard.title);
    expect(sponsorCardAlt).toContain('github.com/sponsors/trpc');
  });
});
