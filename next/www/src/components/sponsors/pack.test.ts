import { describe, expect, it } from '@effect/vitest';

import { sponsors } from '../../sponsors.ts';
import { packSponsors } from './pack.ts';

describe('packSponsors', () => {
  const bubbles = packSponsors(sponsors, 0.005);

  it('draws every sponsor once, biggest first', () => {
    expect(bubbles.map((bubble) => bubble.sponsor.login).toSorted()).toEqual(
      sponsors.map((sponsor) => sponsor.login).toSorted(),
    );
    const radii = bubbles.map((bubble) => bubble.r);
    expect(radii).toEqual(radii.toSorted((a, b) => b - a));
  });

  it('keeps every circle in the square, apart from the others', () => {
    for (const [index, bubble] of bubbles.entries()) {
      expect(bubble.x - bubble.r).toBeGreaterThanOrEqual(0);
      expect(bubble.y - bubble.r).toBeGreaterThanOrEqual(0);
      expect(bubble.x + bubble.r).toBeLessThanOrEqual(1);
      expect(bubble.y + bubble.r).toBeLessThanOrEqual(1);
      for (const other of bubbles.slice(index + 1)) {
        const distance = Math.hypot(bubble.x - other.x, bubble.y - other.y);
        expect(distance).toBeGreaterThan(bubble.r + other.r);
      }
    }
  });
});
