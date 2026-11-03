import { packEnclose } from 'd3-hierarchy';

import type { Sponsor } from '~/sponsors.ts';

/** A sponsor's circle, in a unit square: its center and radius are fractions of the side. */
export interface Bubble {
  readonly r: number;
  readonly sponsor: Sponsor;
  readonly x: number;
  readonly y: number;
}

interface Circle {
  readonly r: number;
  readonly x: number;
  readonly y: number;
}

/** How far circles may overlap, relative to their radii, and still count as touching. */
const epsilon = 1e-9;

const overlaps = (a: Circle, b: Circle) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const reach = a.r + b.r;
  return dx * dx + dy * dy < reach * reach * (1 - epsilon);
};

/** Where a circle of radius `r` touches both `a` and `b`: none, one or two places. */
function touching(a: Circle, b: Circle, r: number): ReadonlyArray<Circle> {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const da = a.r + r;
  const db = b.r + r;
  if (d === 0 || d > da + db || d < Math.abs(da - db)) {
    return [];
  }
  const along = (da * da - db * db + d * d) / (2 * d);
  const across = Math.sqrt(Math.max(0, da * da - along * along));
  const x = a.x + (along * dx) / d;
  const y = a.y + (along * dy) / d;
  return [
    { r, x: x - (across * dy) / d, y: y + (across * dx) / d },
    { r, x: x + (across * dy) / d, y: y - (across * dx) / d },
  ];
}

/**
 * Lays out circles of `radii`, in order, from the middle outward: the
 * first at the center, the second beside it, and each after where it
 * touches two placed circles nearest their center of mass without
 * overlapping any.
 * With the largest first, the largest sit in the middle and the cloud grows
 * round. It uses only arithmetic and square roots, so the server and the
 * browser place every circle at the same point.
 */
function centerOut(radii: ReadonlyArray<number>): ReadonlyArray<Circle> {
  const placed: Array<Circle> = [];
  for (const r of radii) {
    const [first] = placed;
    if (first === undefined) {
      placed.push({ r, x: 0, y: 0 });
      continue;
    }
    if (placed.length === 1) {
      placed.push({ r, x: first.r + r, y: 0 });
      continue;
    }
    const mass = placed.reduce((sum, circle) => sum + circle.r * circle.r, 0);
    const cx =
      placed.reduce((sum, circle) => sum + circle.x * circle.r * circle.r, 0) /
      mass;
    const cy =
      placed.reduce((sum, circle) => sum + circle.y * circle.r * circle.r, 0) /
      mass;
    let best: Circle | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [index, a] of placed.entries()) {
      for (const b of placed.slice(index + 1)) {
        for (const spot of touching(a, b, r)) {
          const dx = spot.x - cx;
          const dy = spot.y - cy;
          const distance = dx * dx + dy * dy;
          if (
            distance < bestDistance &&
            !placed.some((other) => overlaps(spot, other))
          ) {
            best = spot;
            bestDistance = distance;
          }
        }
      }
    }
    // Beyond every placed circle, should no spot touching two be free.
    const reach = Math.max(
      ...placed.map(
        (other) => Math.sqrt(other.x * other.x + other.y * other.y) + other.r,
      ),
    );
    placed.push(best ?? { r, x: reach + r, y: 0 });
  }
  return placed;
}

/**
 * Packs `list` into a circle in the unit square, each sponsor's area in
 * proportion to their weight, the heaviest in the middle and the rest
 * around them, `padding` (a fraction of the side) apart. The layout is the
 * same on the server and in the browser, so it's prerendered and drawn in
 * percentages.
 */
export function packSponsors(
  list: ReadonlyArray<Sponsor>,
  padding: number,
): ReadonlyArray<Bubble> {
  const sorted = list
    .map((sponsor, index) => ({ index, sponsor }))
    .toSorted(
      (a, b) => b.sponsor.weight - a.sponsor.weight || a.index - b.index,
    )
    .map((entry) => entry.sponsor);
  const radii = sorted.map((sponsor) => Math.sqrt(Math.max(0, sponsor.weight)));
  if (radii.length === 0) {
    return [];
  }
  // Lay out once to learn the scale, then again with the gap at that scale.
  const plain = packEnclose([...centerOut(radii)]);
  const gap = padding * 2 * plain.r;
  const circles = centerOut(radii.map((r) => r + gap / 2));
  const enclosing = packEnclose([...circles]);
  const scale = 0.5 / enclosing.r;
  return sorted.flatMap((sponsor, index) => {
    const circle = circles[index];
    return circle === undefined
      ? []
      : [
          {
            r: (circle.r - gap / 2) * scale,
            sponsor,
            x: 0.5 + (circle.x - enclosing.x) * scale,
            y: 0.5 + (circle.y - enclosing.y) * scale,
          },
        ];
  });
}
