import { describe, expect, it } from 'vitest';

import { maxWeight, minWeight } from '../../../build/sponsors-list.ts';
import { drawnSponsors, type Sponsor } from '~/sponsors.ts';

import { cloudPadding, packSponsors } from './pack.ts';

const sponsor = (login: string, weight: number): Sponsor => ({
  createdAt: 0,
  imgSrc: `https://example.com/${login}.png`,
  link: `https://example.com/${login}`,
  login,
  name: login,
  source: 'github',
  weight,
});

describe('packSponsors', () => {
  it('draws a sponsor who weighs more never smaller, and the lightest at a fair fraction of the heaviest', () => {
    const weights = [minWeight, 15, 20, 30, 45, 60, 80, maxWeight];
    const bubbles = packSponsors(
      weights.map((weight) => sponsor(`w${weight}`, weight)),
      cloudPadding,
    );
    const byWeight = bubbles.toSorted(
      (a, b) => a.sponsor.weight - b.sponsor.weight,
    );
    const radii = byWeight.map((bubble) => bubble.r);
    expect(radii).toEqual(radii.toSorted((a, b) => a - b));
    expect(radii[0]! / radii.at(-1)!).toBeCloseTo(
      Math.sqrt(minWeight / maxWeight),
      2,
    );
  });

  it("draws every one of sponsors.json's sponsors at least a twelfth of the cloud across", () => {
    const bubbles = packSponsors(drawnSponsors, cloudPadding);
    expect(Math.min(...bubbles.map((bubble) => bubble.r * 2))).toBeGreaterThan(
      1 / 12,
    );
  });

  /** Many sponsors, of weights spread over the whole range, in no order. */
  const many = Array.from({ length: 60 }, (_, index) =>
    sponsor(
      `m${index}`,
      Math.round(
        minWeight + ((maxWeight - minWeight) * ((index * 37) % 60)) / 59,
      ),
    ),
  );

  it.each([
    ['sponsors.json', drawnSponsors],
    ['many sponsors', many],
  ])(
    'packs %s into a round cloud, not a diamond: it reaches near the edge every way out, and fills most of its circle',
    (_, list) => {
      const bubbles = packSponsors(list, cloudPadding);
      for (const bubble of bubbles) {
        expect(
          Math.hypot(bubble.x - 0.5, bubble.y - 0.5) + bubble.r,
        ).toBeLessThanOrEqual(0.5 + 1e-9);
      }
      for (let step = 0; step < 64; step++) {
        const angle = (step / 64) * 2 * Math.PI;
        const reach = Math.max(
          ...bubbles.map(
            (bubble) =>
              (bubble.x - 0.5) * Math.cos(angle) +
              (bubble.y - 0.5) * Math.sin(angle) +
              bubble.r,
          ),
        );
        expect(reach).toBeGreaterThan(0.4);
      }
      const filled = bubbles.reduce(
        (sum, bubble) => sum + (bubble.r / 0.5) ** 2,
        0,
      );
      expect(filled).toBeGreaterThan(0.63);
    },
  );

  it.each([
    ['sponsors.json', drawnSponsors],
    ['many sponsors', many],
  ])(
    "doesn't overlap any of %s, and keeps the heaviest in the middle",
    (_, list) => {
      const bubbles = packSponsors(list, cloudPadding);
      for (const [index, a] of bubbles.entries()) {
        for (const b of bubbles.slice(index + 1)) {
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
            a.r + b.r,
          );
        }
      }
      const fromMiddle = (bubble: (typeof bubbles)[number]) =>
        Math.hypot(bubble.x - 0.5, bubble.y - 0.5);
      const byWeight = bubbles.toSorted(
        (a, b) => b.sponsor.weight - a.sponsor.weight,
      );
      const half = Math.floor(byWeight.length / 2);
      const mean = (some: typeof bubbles) =>
        some.reduce((sum, bubble) => sum + fromMiddle(bubble), 0) / some.length;
      expect(mean(byWeight.slice(0, half))).toBeLessThan(
        mean(byWeight.slice(half)),
      );
    },
  );

  it('lays out the same sponsors the same way every time', () => {
    expect(packSponsors(drawnSponsors, cloudPadding)).toEqual(
      packSponsors(drawnSponsors, cloudPadding),
    );
  });
});
