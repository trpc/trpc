import { describe, expect, it } from '@effect/vitest';

import {
  homeVersionOf,
  homeVersionSearch,
  validateHomeSearch,
} from './home-version.ts';
import {
  homeVersionBarLayout,
  type HomeVersionBarLayoutInput,
} from './home-version-bar-layout.ts';

describe('validateHomeSearch', () => {
  it('keeps ?version= only when it names v12', () => {
    expect(validateHomeSearch({ version: 'v12' })).toEqual({ version: 'v12' });
    expect(validateHomeSearch({ version: 'v11' })).toEqual({});
    expect(validateHomeSearch({ version: 'v9' })).toEqual({});
    expect(validateHomeSearch({})).toEqual({});
  });

  it('defaults to v11, and leaves it out of the URL', () => {
    expect(homeVersionOf({})).toBe('v11');
    expect(homeVersionOf({ version: 'v12' })).toBe('v12');
    expect(homeVersionSearch('v11')).toEqual({});
    expect(homeVersionSearch('v12')).toEqual({ version: 'v12' });
  });
});

describe('homeVersionBarLayout', () => {
  const layout = (input: Partial<HomeVersionBarLayoutInput> = {}) =>
    homeVersionBarLayout({
      code: { left: 700, top: 400, width: 500 },
      isLarge: true,
      pillHeight: 40,
      reducedMotion: false,
      scrollY: 0,
      sponsorsTop: 3000,
      stickyTop: 64,
      viewportWidth: 1280,
      ...input,
    });

  it('docks centered above the code at the top of the page', () => {
    expect(layout()).toEqual({
      left: 250,
      position: 'absolute',
      progress: 0,
      top: 0,
    });
  });

  it('drifts toward the viewport center as the code nears the header', () => {
    const drifting = layout({
      code: { left: 700, top: 204, width: 500 },
      scrollY: 196,
    });
    expect(drifting.position).toBe('absolute');
    expect(drifting.progress).toBeCloseTo(0.5);
    // Halfway from the code's center (950) to the viewport's (640).
    expect(drifting.left).toBeCloseTo(795 - 700);
  });

  it('only drifts on large screens, and jumps there with reduced motion', () => {
    const near: Partial<HomeVersionBarLayoutInput> = {
      code: { left: 700, top: 204, width: 500 },
      scrollY: 196,
    };
    expect(layout({ ...near, isLarge: false }).left).toBe(250);
    expect(layout({ ...near, reducedMotion: true }).left).toBe(250);
    expect(
      layout({
        code: { left: 700, top: 0, width: 500 },
        reducedMotion: true,
      }).left,
    ).toBe(640);
  });

  it('sticks under the header, at the viewport center', () => {
    expect(layout({ code: { left: 700, top: -500, width: 500 } })).toEqual({
      left: 640,
      position: 'fixed',
      progress: 1,
      top: 64,
    });
  });

  it('leaves above the sponsors section once it reaches the pill', () => {
    const scrolled: Partial<HomeVersionBarLayoutInput> = {
      code: { left: 700, top: -2000, width: 500 },
    };
    expect(layout({ ...scrolled, sponsorsTop: 104 }).top).toBe(64);
    expect(layout({ ...scrolled, sponsorsTop: 80 }).top).toBe(40);
    expect(layout({ ...scrolled, sponsorsTop: -100 }).top).toBe(-140);
  });
});
