import { describe, expect, it, vi } from '@effect/vitest';
import { runInNewContext } from 'node:vm';

import {
  homeVersionAt,
  homeVersionOf,
  hostHomeVersion,
  homeVersionScript,
  homeVersionSearch,
  rememberHomeVersion,
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

/** A `localStorage` holding `stored`, or one that throws, as in private mode. */
function storage(stored: Map<string, string> | 'blocked') {
  const blocked = () => {
    throw new Error('blocked');
  };
  return stored === 'blocked'
    ? { getItem: blocked, removeItem: blocked, setItem: blocked }
    : {
        getItem: (key: string) => stored.get(key) ?? null,
        removeItem: (key: string) => stored.delete(key),
        setItem: (key: string, value: string) => stored.set(key, value),
      };
}

/**
 * Runs `homeVersionScript` at `href` in a fresh context, as the browser's
 * head does: the version it shows and the URLs it replaces.
 */
function land(href: string, localStorage: ReturnType<typeof storage>) {
  const replaced: Array<string> = [];
  let shown: string | undefined;
  runInNewContext(homeVersionScript, {
    document: {
      documentElement: {
        setAttribute: (_name: string, value: string) => {
          shown = value;
        },
      },
      querySelectorAll: () => [],
    },
    history: {
      replaceState: (_state: unknown, _title: string, url: URL) => {
        replaced.push(String(url));
      },
      state: null,
    },
    localStorage,
    location: new URL(href),
    URL,
  });
  return { replaced, shown };
}

describe('remembering the version', () => {
  it('remembers v11 or v12 from the home page and their docs only', () => {
    expect(homeVersionAt('/', {})).toBe('v11');
    expect(homeVersionAt('/', { version: 'v12' })).toBe('v12');
    expect(homeVersionAt('/docs', {})).toBe('v11');
    expect(homeVersionAt('/docs/client/links', {})).toBe('v11');
    expect(homeVersionAt('/v12/docs', {})).toBe('v12');
    expect(homeVersionAt('/v12/docs/server/routers', {})).toBe('v12');
    expect(homeVersionAt('/v10/docs/intro', {})).toBeUndefined();
    expect(homeVersionAt('/v9/docs', {})).toBeUndefined();
    expect(homeVersionAt('/blog', {})).toBeUndefined();
    expect(homeVersionAt('/docsx', {})).toBeUndefined();
  });

  it("stores the version, and clears it for the host's default", () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', storage(stored));
    vi.stubGlobal('location', new URL('https://trpc.io/'));
    rememberHomeVersion('v12');
    expect([...stored]).toEqual([['trpc-docs:version', 'v12']]);
    rememberHomeVersion('v11');
    expect([...stored]).toEqual([]);
    vi.stubGlobal('location', new URL('https://v12.trpc.io/'));
    rememberHomeVersion('v11');
    expect([...stored]).toEqual([['trpc-docs:version', 'v11']]);
    rememberHomeVersion('v12');
    expect([...stored]).toEqual([]);
  });

  it('forwards `/` to the remembered version without a new history entry', () => {
    const remembered = storage(new Map([['trpc-docs:version', 'v12']]));
    expect(land('https://v12.trpc.io/#steps', remembered)).toEqual({
      replaced: ['https://v12.trpc.io/?version=v12#steps'],
      shown: 'v12',
    });
  });

  it('lets an explicit ?version= win', () => {
    const remembered = storage(new Map([['trpc-docs:version', 'v12']]));
    expect(land('https://v12.trpc.io/?version=v11', remembered)).toEqual({
      replaced: [],
      shown: 'v11',
    });
    expect(
      land('https://v12.trpc.io/?version=v12', storage(new Map())),
    ).toEqual({
      replaced: [],
      shown: 'v12',
    });
  });

  it('leaves other pages, nothing remembered and blocked storage alone on trpc.io', () => {
    const remembered = storage(new Map([['trpc-docs:version', 'v12']]));
    expect(
      land('https://v12.trpc.io/docs/client', remembered).replaced,
    ).toEqual([]);
    expect(land('https://trpc.io/', storage(new Map()))).toEqual({
      replaced: [],
      shown: 'v11',
    });
    expect(land('https://www.trpc.io/', storage('blocked'))).toEqual({
      replaced: [],
      shown: 'v11',
    });
    vi.stubGlobal('localStorage', storage('blocked'));
    vi.stubGlobal('location', new URL('https://trpc.io/'));
    expect(() => rememberHomeVersion('v12')).not.toThrow();
  });
});

describe("the host's default", () => {
  it('is v11 on trpc.io only', () => {
    expect(hostHomeVersion('trpc.io')).toBe('v11');
    expect(hostHomeVersion('www.trpc.io')).toBe('v11');
    expect(hostHomeVersion('v12.trpc.io')).toBe('v12');
    expect(hostHomeVersion('trpc-git-v12-trpc.vercel.app')).toBe('v12');
    expect(hostHomeVersion('localhost')).toBe('v12');
  });

  it('forwards `/` to v12 off trpc.io when nothing is remembered', () => {
    for (const origin of [
      'https://v12.trpc.io',
      'https://trpc-git-v12-trpc.vercel.app',
      'http://localhost:3000',
    ]) {
      expect(land(`${origin}/#steps`, storage(new Map()))).toEqual({
        replaced: [`${origin}/?version=v12#steps`],
        shown: 'v12',
      });
      expect(land(`${origin}/`, storage('blocked')).shown).toBe('v12');
    }
  });

  it('gives way to ?version= and a remembered v11', () => {
    expect(
      land('https://v12.trpc.io/?version=v11', storage(new Map())),
    ).toEqual({ replaced: [], shown: 'v11' });
    const remembered = storage(new Map([['trpc-docs:version', 'v11']]));
    expect(land('https://v12.trpc.io/', remembered)).toEqual({
      replaced: [],
      shown: 'v11',
    });
    expect(land('https://v12.trpc.io/docs', storage(new Map()))).toEqual({
      replaced: [],
      shown: 'v11',
    });
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
