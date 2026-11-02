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

  it('then the partners past the fourth, the others most given first, and counts the rest', () => {
    const later = partners.slice(4).map((partner) => partner.imgSrc);
    const backerImages = sponsorCard.backers.map((backer) => backer.image);
    expect(backerImages.slice(0, later.length)).toEqual(later.slice(0, 12));
    const weights = backerImages
      .slice(later.length)
      .map(
        (image) =>
          sponsors.find((sponsor) => sponsor.imgSrc === image)?.weight ?? 0,
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
