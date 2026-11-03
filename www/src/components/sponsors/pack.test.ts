import { describe, expect, it } from 'vitest';

import { maxWeight, minWeight } from '../../../build/sponsors-list.ts';
import { drawnSponsors, type Sponsor } from '~/sponsors.ts';

import { packSponsors } from './pack.ts';

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
      0.006,
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

  it("draws every one of sponsors.json's sponsors at least a tenth of the cloud across", () => {
    const bubbles = packSponsors(drawnSponsors, 0.006);
    expect(Math.min(...bubbles.map((bubble) => bubble.r * 2))).toBeGreaterThan(
      0.1,
    );
  });
});
