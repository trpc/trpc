/**
 * A seeded random number generator (mulberry32), so a demo's timings vary
 * between runs but a test can pin them.
 */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** A number in `[min, max)`. */
    between: (min: number, max: number) => min + next() * (max - min),
    next,
  };
}

export type Random = ReturnType<typeof createRandom>;

/** How far a simulated request's time can stray from its usual time. */
export const jitter = { max: 1.25, min: 0.75 } as const;
