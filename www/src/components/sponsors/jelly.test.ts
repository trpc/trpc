import { describe, expect, it } from 'vitest';

import { type Home, Jelly } from './jelly.ts';

/** Two bubbles side by side, 4px apart, as the cloud packs them. */
const pair: ReadonlyArray<Home> = [
  { r: 50, x: 100, y: 100 },
  { r: 30, x: 184, y: 100 },
];

/** Steps `jelly` for `seconds` at 120 steps a second; whether it's still moving after. */
const run = (jelly: Jelly, seconds: number, each?: () => void) => {
  let moving = true;
  for (let step = 0; step < seconds * 120; step++) {
    moving = jelly.step(1 / 120);
    each?.();
  }
  return moving;
};

/** The 2×2 part of a transform's `matrix(…)`, else the identity. */
const squish = (transform: string) => {
  const match = /matrix\(([^)]*)\)/.exec(transform);
  const [a = 1, b = 0, c = 0, d = 1] = match?.[1]?.split(',').map(Number) ?? [];
  return { a, b, c, d };
};

describe('Jelly', () => {
  it('springs a pushed bubble back to its place, wobbling, then stops and draws it untransformed', () => {
    const jelly = new Jelly(pair);
    jelly.ox[1] = 20;
    let overshoot = 0;
    expect(
      run(jelly, 0.5, () => {
        overshoot = Math.min(overshoot, jelly.ox[1] ?? 0);
      }),
    ).toBe(true);
    expect(overshoot).toBeLessThan(-1);
    expect(overshoot).toBeGreaterThan(-10);
    expect(run(jelly, 4)).toBe(false);
    expect(jelly.transform(0)).toBe('');
    expect(jelly.transform(1)).toBe('');
  });

  it('squishes a moving bubble along the way it moves, keeping its area', () => {
    const jelly = new Jelly(pair);
    jelly.vx[1] = 600;
    run(jelly, 0.05);
    const { a, b, c, d } = squish(jelly.transform(1));
    expect(a).toBeGreaterThan(1.03);
    expect(d).toBeLessThan(1);
    expect(a * d - b * c).toBeCloseTo(1, 3);
  });

  it('pushes the bubbles near a pointer gently away from it, but not the one under it', () => {
    const jelly = new Jelly(pair);
    jelly.pointer = { vx: 0, vy: 0, x: 225, y: 100 };
    run(jelly, 1);
    expect(jelly.ox[1]).toBeLessThan(-1);
    expect(jelly.ox[1]).toBeGreaterThan(-4);
    expect(Math.abs(jelly.ox[0] ?? 0)).toBeLessThan(0.5);

    const hovered = new Jelly(pair);
    hovered.grown.add(1);
    hovered.pointer = { vx: 0, vy: 0, x: 190, y: 100 };
    run(hovered, 1);
    expect(Math.abs(hovered.ox[1] ?? 0)).toBeLessThan(0.5);
  });

  it('comes to rest under a pointer that holds still, so it stops drawing frames', () => {
    const jelly = new Jelly(pair);
    jelly.pointer = { vx: 0, vy: 0, x: 225, y: 100 };
    expect(run(jelly, 4)).toBe(false);
  });

  it('drags the bubbles a moving pointer passes along with it, until it stops', () => {
    const jelly = new Jelly(pair);
    jelly.pointer = { vx: 0, vy: 900, x: 184, y: 50 };
    run(jelly, 0.1);
    expect(jelly.vy[1]).toBeGreaterThan(5);
    expect(run(jelly, 4)).toBe(false);
    const still = new Jelly(pair);
    still.pointer = { vx: 0, vy: 0, x: 184, y: 50 };
    run(still, 4);
    expect(Math.abs((jelly.oy[1] ?? 0) - (still.oy[1] ?? 0))).toBeLessThan(0.5);
  });

  it('nudges the neighbours of a grown (hovered or focused) bubble out of its way', () => {
    const jelly = new Jelly([
      { r: 50, x: 100, y: 100 },
      { r: 30, x: 181, y: 100 },
    ]);
    jelly.grown.add(0);
    run(jelly, 1);
    expect(jelly.ox[1]).toBeGreaterThan(0.2);
    expect(jelly.ox[0]).toBeLessThan(0);
    expect(Math.abs(jelly.ox[0] ?? 0)).toBeLessThan(jelly.ox[1] ?? 0);
  });

  it('drops bubbles in from above, each after its delay, to settle in place', () => {
    const jelly = new Jelly(pair);
    jelly.drop([0, 0.4]);
    expect(jelly.oy[0]).toBeLessThan(-10);
    run(jelly, 0.25);
    expect(jelly.oy[0]).toBeGreaterThan(-5);
    expect(jelly.held[1]).toBeDefined();
    let lowest = 0;
    run(jelly, 1, () => {
      lowest = Math.max(lowest, jelly.oy[0] ?? 0);
    });
    expect(jelly.held[1]).toBeUndefined();
    expect(lowest).toBeLessThan(16);
    expect(run(jelly, 4)).toBe(false);
  });

  it('pushes the bubbles round a tap out from it, but not the one tapped', () => {
    const jelly = new Jelly(pair);
    jelly.ripple(100, 100, 160, 0);
    expect(jelly.vx[1]).toBeGreaterThan(0);
    expect(jelly.vx[0]).toBe(0);
    expect(run(jelly, 4)).toBe(false);
  });
});
