import type { Sponsor } from '~/sponsors.ts';

/**
 * A sponsor's circle in the cloud: its center and radius are fractions of
 * the cloud's width, which is as tall as `cloudHeight`.
 */
export interface Bubble<T extends Weighed = Sponsor> {
  readonly r: number;
  readonly sponsor: T;
  readonly x: number;
  readonly y: number;
}

/** What `packSponsors` sizes a circle by. */
export type Weighed = Pick<Sponsor, 'weight'>;

/** The gap between the cloud's circles, as a fraction of its width: `/sponsor`'s and the READMEs' (`og/sponsor-cloud.ts`). */
export const cloudPadding = 0.006;

const half = Math.SQRT1_2;

/**
 * How deep `(x, y)` is in the heart, y up, negative outside: a square of
 * side 1 standing on its corner at the origin, with a half disc on each of
 * its upper sides. Inside, it's the depth in the piece `(x, y)` is deepest
 * in, which is never deeper than it is in the heart.
 */
function heartDepth(x: number, y: number) {
  const u = (x + y) * half;
  const w = (y - x) * half;
  const outU = Math.max(-u, 0, u - 1);
  const outW = Math.max(-w, 0, w - 1);
  const square =
    outU === 0 && outW === 0
      ? Math.min(u, 1 - u, w, 1 - w)
      : -Math.sqrt(outU * outU + outW * outW);
  const lobe = (cx: number) => {
    const dx = x - cx;
    const dy = y - 1.5 * half;
    return 0.5 - Math.sqrt(dx * dx + dy * dy);
  };
  return Math.max(square, lobe(-half / 2), lobe(half / 2));
}

/** The widest circle that fits in the heart: one filling its square, or a lobe. */
const deepest = 0.5;

/** The heart's area: its square and two half discs of diameter 1. */
const heartArea = 1 + Math.PI / 4;

/** The heart's width: its square's diagonal and a half disc's overhang each side. */
const heartWidth = 2 * (half / 2 + 0.5);

/**
 * How much of the heart the circles cover: about as much as they fit in
 * with the outline still sharp. Above it they jam, and shrink to fit.
 */
const heartFill = 0.76;

interface Spot {
  readonly depth: number;
  readonly x: number;
  readonly y: number;
}

/** How many columns of spots `heartSpots` tries across the heart. */
const spotsAcross = 48;

let spots: ReadonlyArray<Spot> | undefined;

/** A grid of points inside the heart, left to right, with how deep each is. */
function heartSpots() {
  if (spots === undefined) {
    const found: Array<Spot> = [];
    const pitch = heartWidth / spotsAcross;
    for (let column = 0; column <= spotsAcross; column++) {
      for (let row = 0; row <= spotsAcross; row++) {
        const x = column * pitch - heartWidth / 2;
        const y = row * pitch;
        const depth = heartDepth(x, y);
        if (depth > 0) {
          found.push({ depth, x, y });
        }
      }
    }
    spots = found;
  }
  return spots;
}

/** How far either side `heartDepth` is sampled to find which way is in. */
const step = 1e-6;

/**
 * One sweep over the circles at `xs`, `ys` of radii `rs`, moved in place:
 * it pushes apart each two that overlap, the lighter further, then back in
 * each that pokes out of the heart. It returns how far the worst
 * overlapped, relative to its radius.
 */
function sweep(
  xs: Array<number>,
  ys: Array<number>,
  rs: ReadonlyArray<number>,
) {
  let worst = 0;
  for (let i = 0; i < rs.length; i++) {
    const ri = rs[i] ?? 0;
    for (let j = i + 1; j < rs.length; j++) {
      const rj = rs[j] ?? 0;
      const dx = (xs[j] ?? 0) - (xs[i] ?? 0);
      const dy = (ys[j] ?? 0) - (ys[i] ?? 0);
      const d = Math.sqrt(dx * dx + dy * dy);
      const overlap = ri + rj - d;
      if (overlap <= 0) {
        continue;
      }
      worst = Math.max(worst, overlap / Math.min(ri, rj));
      const share = (ri * ri) / (ri * ri + rj * rj);
      const nx = d === 0 ? 1 : dx / d;
      const ny = d === 0 ? 0 : dy / d;
      xs[i] = (xs[i] ?? 0) - nx * overlap * (1 - share);
      ys[i] = (ys[i] ?? 0) - ny * overlap * (1 - share);
      xs[j] = (xs[j] ?? 0) + nx * overlap * share;
      ys[j] = (ys[j] ?? 0) + ny * overlap * share;
    }
  }
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i] ?? 0;
    const x = xs[i] ?? 0;
    const y = ys[i] ?? 0;
    const depth = heartDepth(x, y);
    if (depth >= r) {
      continue;
    }
    worst = Math.max(worst, (r - depth) / r);
    const gx = heartDepth(x + step, y) - heartDepth(x - step, y);
    const gy = heartDepth(x, y + step) - heartDepth(x, y - step);
    const g = Math.sqrt(gx * gx + gy * gy);
    if (g > 0) {
      xs[i] = x + (gx / g) * (r - depth);
      ys[i] = y + (gy / g) * (r - depth);
    }
  }
  return worst;
}

/**
 * Lays out circles of `radii`, in order, in a heart of side 1 (`heartDepth`)
 * that they cover `heartFill` of: each where it has the most room, from the
 * heart's edge and the circles before it, so with the largest first the
 * largest take its middle and lobes and the rest fill in around them. Then
 * it sweeps them (`sweep`) until none overlap or poke out, so the outer ones
 * trace the heart, and shrinks them should any still overlap.
 * It uses only arithmetic and square roots, so the server and the browser
 * place every circle at the same point. Circles are y down.
 */
function heartOut(radii: ReadonlyArray<number>) {
  const area = radii.reduce((sum, r) => sum + Math.PI * r * r, 0);
  // No deeper than a lobe, else the largest could never fit.
  const scale = Math.min(
    Math.sqrt((heartFill * heartArea) / area),
    deepest / Math.max(...radii),
  );
  const rs = radii.map((r) => r * scale);
  const xs: Array<number> = [];
  const ys: Array<number> = [];
  for (const r of rs) {
    let best: Spot | undefined;
    let bestRoom = Number.NEGATIVE_INFINITY;
    for (const spot of heartSpots()) {
      let room = spot.depth - r;
      for (let j = 0; j < xs.length && room > bestRoom; j++) {
        const dx = spot.x - (xs[j] ?? 0);
        const dy = spot.y - (ys[j] ?? 0);
        room = Math.min(room, Math.sqrt(dx * dx + dy * dy) - r - (rs[j] ?? 0));
      }
      if (room > bestRoom) {
        best = spot;
        bestRoom = room;
      }
    }
    xs.push(best?.x ?? 0);
    ys.push(best?.y ?? 0);
  }
  let rounds = 0;
  while (rounds < 2000 && sweep(xs, ys, rs) > 1e-3) {
    rounds++;
  }
  let fit = 1;
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const dx = (xs[j] ?? 0) - (xs[i] ?? 0);
      const dy = (ys[j] ?? 0) - (ys[i] ?? 0);
      fit = Math.min(
        fit,
        Math.sqrt(dx * dx + dy * dy) / ((rs[i] ?? 0) + (rs[j] ?? 0)),
      );
    }
  }
  return rs.map((r, index) => ({
    r: r * fit,
    x: xs[index] ?? 0,
    y: -(ys[index] ?? 0),
  }));
}

/**
 * Packs `list` into a heart, each sponsor's area in proportion to their
 * weight, the heaviest in the middle and the lobes and the rest around
 * them, about `padding` (a fraction of the width) apart. Their centers and
 * radii are fractions of the cloud's width, from its top left. The layout
 * is the same on the server and in the browser, so it's prerendered and
 * drawn in percentages.
 */
export function packSponsors<T extends Weighed>(
  list: ReadonlyArray<T>,
  padding: number,
): ReadonlyArray<Bubble<T>> {
  const sorted = list
    .map((sponsor, index) => ({ index, sponsor }))
    .toSorted(
      (a, b) => b.sponsor.weight - a.sponsor.weight || a.index - b.index,
    )
    .map((entry) => entry.sponsor);
  const radii = sorted.map((sponsor) => Math.sqrt(Math.max(0, sponsor.weight)));
  const area = radii.reduce((sum, r) => sum + Math.PI * r * r, 0);
  if (area === 0) {
    return [];
  }
  // The gap at the scale the circles alone would fill the heart at.
  const gap = padding * heartWidth * Math.sqrt(area / (heartFill * heartArea));
  const circles = heartOut(radii.map((r) => r + gap / 2));
  const left = Math.min(...circles.map((circle) => circle.x - circle.r));
  const right = Math.max(...circles.map((circle) => circle.x + circle.r));
  const top = Math.min(...circles.map((circle) => circle.y - circle.r));
  const scale = 1 / (right - left);
  return sorted.flatMap((sponsor, index) => {
    const circle = circles[index];
    const r = radii[index] ?? 0;
    return circle === undefined
      ? []
      : [
          {
            r: ((circle.r * r) / (r + gap / 2)) * scale,
            sponsor,
            x: (circle.x - left) * scale,
            y: (circle.y - top) * scale,
          },
        ];
  });
}

/** How tall `bubbles`, from `packSponsors`, reach: a fraction of their width. */
export const cloudHeight = (bubbles: ReadonlyArray<Bubble<Weighed>>) =>
  Math.max(0, ...bubbles.map((bubble) => bubble.y + bubble.r));
