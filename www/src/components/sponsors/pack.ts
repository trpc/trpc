import { hierarchy, pack } from 'd3-hierarchy';

import type { Sponsor } from '~/sponsors.ts';

/** A sponsor's circle, in a unit square: its center and radius are fractions of the side. */
export interface Bubble {
  readonly r: number;
  readonly sponsor: Sponsor;
  readonly x: number;
  readonly y: number;
}

interface PackNode {
  readonly children?: ReadonlyArray<PackNode>;
  readonly sponsor?: Sponsor;
}

/**
 * Packs `list` into a circle in the unit square, each sponsor's area in
 * proportion to their weight, biggest first. The layout is the same on the
 * server and in the browser, so it's prerendered and drawn in percentages.
 */
export function packSponsors(
  list: ReadonlyArray<Sponsor>,
  padding: number,
): ReadonlyArray<Bubble> {
  const root = hierarchy<PackNode>({
    children: list.map((sponsor) => ({ sponsor })),
  })
    .sum((node) => node.sponsor?.weight ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return pack<PackNode>()
    .size([1, 1])
    .padding(padding)(root)
    .leaves()
    .flatMap((leaf) =>
      leaf.data.sponsor
        ? [{ r: leaf.r, sponsor: leaf.data.sponsor, x: leaf.x, y: leaf.y }]
        : [],
    );
}
