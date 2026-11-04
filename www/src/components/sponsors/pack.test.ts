import { describe, expect, it } from 'vitest';

import { maxWeight, minWeight } from '../../../build/sponsors-list.ts';
import { drawnSponsors, type Sponsor } from '~/sponsors.ts';

import { cloudHeight, cloudPadding, packSponsors } from './pack.ts';

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

  it("draws every one of sponsors.json's sponsors at least a thirteenth of the cloud across", () => {
    const bubbles = packSponsors(drawnSponsors, cloudPadding);
    expect(Math.min(...bubbles.map((bubble) => bubble.r * 2))).toBeGreaterThan(
      1 / 13,
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
    'packs %s into a heart: two lobes with a dip between them, a point at the foot, and most of it filled',
    (_, list) => {
      const bubbles = packSponsors(list, cloudPadding);
      const height = cloudHeight(bubbles);
      for (const bubble of bubbles) {
        expect(bubble.x - bubble.r).toBeGreaterThanOrEqual(-1e-9);
        expect(bubble.x + bubble.r).toBeLessThanOrEqual(1 + 1e-9);
        expect(bubble.y - bubble.r).toBeGreaterThanOrEqual(-1e-9);
      }
      expect(height).toBeGreaterThan(0.75);
      expect(height).toBeLessThan(1);
      /** How far down the cloud's top edge is, `x` across. */
      const topAt = (x: number) =>
        Math.min(
          ...bubbles
            .filter((bubble) => Math.abs(bubble.x - x) < bubble.r)
            .map(
              (bubble) =>
                bubble.y - Math.sqrt(bubble.r ** 2 - (bubble.x - x) ** 2),
            ),
        );
      expect(Number.isFinite(topAt(0.5))).toBe(true);
      expect(topAt(0.5)).toBeGreaterThan(topAt(0.25) + 0.02);
      expect(topAt(0.5)).toBeGreaterThan(topAt(0.75) + 0.02);
      /** How wide the cloud is, `y` down. */
      const across = (y: number) => {
        const crossing = bubbles.filter(
          (bubble) => Math.abs(bubble.y - y) < bubble.r,
        );
        const half = (bubble: (typeof bubbles)[number]) =>
          Math.sqrt(bubble.r ** 2 - (bubble.y - y) ** 2);
        return (
          Math.max(...crossing.map((bubble) => bubble.x + half(bubble))) -
          Math.min(...crossing.map((bubble) => bubble.x - half(bubble)))
        );
      };
      expect(across(height * 0.3)).toBeGreaterThan(0.85);
      expect(across(height * 0.6)).toBeLessThan(across(height * 0.3));
      expect(across(height * 0.9)).toBeLessThan(0.3);
      const lowest = bubbles.reduce((low, bubble) =>
        bubble.y + bubble.r > low.y + low.r ? bubble : low,
      );
      expect(Math.abs(lowest.x - 0.5)).toBeLessThan(0.08);
      const filled = bubbles.reduce(
        (sum, bubble) => sum + Math.PI * bubble.r ** 2,
        0,
      );
      expect(filled / height).toBeGreaterThan(0.45);
    },
  );

  it.each([
    ['sponsors.json', drawnSponsors],
    ['many sponsors', many],
    [
      'one sponsor who outweighs the rest',
      [
        sponsor('big', maxWeight),
        ...many.slice(0, 2).map((small) => ({ ...small, weight: minWeight })),
      ],
    ],
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
      const middle = cloudHeight(bubbles) / 2;
      const fromMiddle = (bubble: (typeof bubbles)[number]) =>
        Math.hypot(bubble.x - 0.5, bubble.y - middle);
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
