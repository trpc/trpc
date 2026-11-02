import { describe, expect, it } from 'vitest';

import { partners, sponsorCard, sponsorCardAlt, sponsors } from './sponsors.ts';

describe('sponsorCard', () => {
  it('draws the partners first, by rank, with their tier', () => {
    expect(sponsorCard.partners.map((partner) => partner.name)).toEqual(
      partners.slice(0, 4).map((partner) => partner.name),
    );
    for (const partner of sponsorCard.partners) {
      expect(['Gold', 'Silver']).toContain(partner.tier);
    }
  });

  it('then the other sponsors, most given first, and counts the rest', () => {
    const weights = sponsorCard.backers.map(
      (backer) =>
        sponsors.find((sponsor) => sponsor.imgSrc === backer.image)?.weight ??
        0,
    );
    expect(weights).toEqual(weights.toSorted((a, b) => b - a));
    expect(sponsorCard.backers.length).toBeLessThanOrEqual(12);
    expect(
      sponsorCard.partners.length +
        sponsorCard.backers.length +
        sponsorCard.more,
    ).toBe(sponsors.length);
    const images = [...sponsorCard.partners, ...sponsorCard.backers].map(
      (sponsor) => sponsor.image,
    );
    expect(new Set(images).size).toBe(images.length);
  });

  it("is /sponsor's, and its alt text says what it shows", () => {
    expect(sponsorCard.path).toBe('/sponsor');
    expect(sponsorCard.url).toBe('https://github.com/sponsors/trpc');
    expect(sponsorCardAlt).toContain(sponsorCard.title);
    expect(sponsorCardAlt).toContain('github.com/sponsors/trpc');
  });
});
