import { describe, expect, it, vi } from '@effect/vitest';
import { runInNewContext } from 'node:vm';

import {
  homeVersionAt,
  homeVersionOf,
  hostHomeVersion,
  homeVersionScriptOf,
  homeVersionSearch,
  rememberHomeVersion,
  validateHomeSearch,
} from './home-version.ts';

/** The home page showing v12 too, as off trpc.io until the cutover. */
const both = ['v11', 'v12'] as const;

describe('validateHomeSearch', () => {
  it('keeps ?version= only when it names v12', () => {
    expect(validateHomeSearch({ version: 'v12' }, both)).toEqual({
      version: 'v12',
    });
    expect(validateHomeSearch({ version: 'v11' }, both)).toEqual({});
    expect(validateHomeSearch({ version: 'v9' }, both)).toEqual({});
    expect(validateHomeSearch({}, both)).toEqual({});
  });

  it('defaults to v11, and leaves it out of the URL', () => {
    expect(homeVersionOf({})).toBe('v11');
    expect(homeVersionOf({ version: 'v12' })).toBe('v12');
    expect(homeVersionSearch('v11', both)).toEqual({});
    expect(homeVersionSearch('v12', both)).toEqual({ version: 'v12' });
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
 * Runs `homeVersionScriptOf(hidden)` at `href` in a fresh context, as the
 * browser's head does: the version it shows, the URLs it replaces, whether
 * it shows v12's UI (`data-v12`), and the session's storage after.
 */
function landing(
  href: string,
  localStorage: ReturnType<typeof storage>,
  hidden: boolean,
  sessionStorage: ReturnType<typeof storage> = storage(new Map()),
) {
  const replaced: Array<string> = [];
  const attributes = new Map<string, string>();
  runInNewContext(homeVersionScriptOf(hidden), {
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attributes.set(name, value);
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
    sessionStorage,
    URL,
  });
  return {
    replaced,
    shown: attributes.get('data-home-version'),
    v12: attributes.has('data-v12'),
  };
}

/** `landing` with v12 shown, as on v12.trpc.io: the version and the URLs it replaces. */
function land(href: string, localStorage: ReturnType<typeof storage>) {
  const landed = landing(href, localStorage, false);
  return { replaced: landed.replaced, shown: landed.shown };
}

describe('remembering the version', () => {
  it('remembers v11 or v12 from the home page and their docs only', () => {
    expect(homeVersionAt('/', {}, both)).toBe('v11');
    expect(homeVersionAt('/', { version: 'v12' }, both)).toBe('v12');
    expect(homeVersionAt('/docs', {}, both)).toBe('v11');
    expect(homeVersionAt('/docs/client/links', {}, both)).toBe('v11');
    expect(homeVersionAt('/v12/docs', {}, both)).toBe('v12');
    expect(homeVersionAt('/v12/docs/server/routers', {}, both)).toBe('v12');
    expect(homeVersionAt('/v10/docs/intro', {}, both)).toBeUndefined();
    expect(homeVersionAt('/v9/docs', {}, both)).toBeUndefined();
    expect(homeVersionAt('/blog', {}, both)).toBeUndefined();
    expect(homeVersionAt('/docsx', {}, both)).toBeUndefined();
  });

  it("stores the version, and clears it for the host's default", () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', storage(stored));
    vi.stubGlobal('location', new URL('https://trpc.io/'));
    rememberHomeVersion('v12', both);
    expect([...stored]).toEqual([['trpc-docs:version', 'v12']]);
    rememberHomeVersion('v11', both);
    expect([...stored]).toEqual([]);
    vi.stubGlobal('location', new URL('https://v12.trpc.io/'));
    rememberHomeVersion('v11', both);
    expect([...stored]).toEqual([['trpc-docs:version', 'v11']]);
    rememberHomeVersion('v12', both);
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
    expect(() => rememberHomeVersion('v12', both)).not.toThrow();
  });
});

describe("the host's default", () => {
  it('is v11 on trpc.io only', () => {
    expect(hostHomeVersion('trpc.io', both)).toBe('v11');
    expect(hostHomeVersion('www.trpc.io', both)).toBe('v11');
    expect(hostHomeVersion('v12.trpc.io', both)).toBe('v12');
    expect(hostHomeVersion('trpc-git-v12-trpc.vercel.app', both)).toBe('v12');
    expect(hostHomeVersion('localhost', both)).toBe('v12');
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

describe('the home page while v12 is hidden', () => {
  const shown = ['v11'] as const;
  const remembered = () => storage(new Map([['trpc-docs:version', 'v12']]));

  it('validates and links ?version=v12 only where v12 is shown', () => {
    expect(validateHomeSearch({ version: 'v12' }, shown)).toEqual({});
    expect(homeVersionSearch('v12', shown)).toEqual({});
  });

  it("doesn't remember v12 from its docs where it isn't shown", () => {
    expect(
      homeVersionAt('/v12/docs/server/routers', {}, shown),
    ).toBeUndefined();
    expect(homeVersionAt('/docs/client/links', {}, shown)).toBe('v11');
  });

  it("opens on v11 with no v12 UI, on every host, until the session's been to v12", () => {
    expect(hostHomeVersion('v12.trpc.io', shown)).toBe('v11');
    expect(hostHomeVersion('localhost', shown)).toBe('v11');
    for (const href of [
      'https://trpc.io/',
      'https://trpc-v12-git-a-trpc.vercel.app/',
      'https://trpc.io/docs/client/links',
      'https://trpc.io/blog?version=v11',
    ]) {
      expect(landing(href, remembered(), true)).toEqual({
        replaced: [],
        shown: 'v11',
        v12: false,
      });
    }
  });

  it('shows v12 on landing on /v12/... or ?version=12, and for the rest of the session', () => {
    const session = new Map<string, string>();
    expect(
      landing(
        'https://trpc.io/v12/docs/client/links',
        storage(new Map()),
        true,
        storage(session),
      ),
    ).toEqual({ replaced: [], shown: 'v11', v12: true });
    expect([...session]).toEqual([['trpc-docs:v12', '1']]);
    expect(
      landing('https://trpc.io/', storage(new Map()), true, storage(session)),
    ).toEqual({ replaced: [], shown: 'v11', v12: true });
    expect(
      landing('https://trpc.io/', remembered(), true, storage(session)),
    ).toEqual({
      replaced: ['https://trpc.io/?version=v12'],
      shown: 'v12',
      v12: true,
    });

    const asked = new Map<string, string>();
    expect(
      landing(
        'https://trpc.io/?version=12#steps',
        storage(new Map()),
        true,
        storage(asked),
      ),
    ).toEqual({
      replaced: ['https://trpc.io/?version=v12#steps'],
      shown: 'v12',
      v12: true,
    });
    expect([...asked]).toEqual([['trpc-docs:v12', '1']]);
    expect(
      landing(
        'https://trpc.io/docs/client/links?version=12',
        storage(new Map()),
        true,
      ).v12,
    ).toBe(true);
    expect(
      landing('https://trpc.io/?version=v12', storage(new Map()), true).shown,
    ).toBe('v12');
    expect(landing('https://trpc.io/v12x', storage(new Map()), true).v12).toBe(
      false,
    );
  });

  it('shows v12 only where the URL asks when the session storage is blocked', () => {
    expect(
      landing(
        'https://trpc.io/v12/docs',
        storage(new Map()),
        true,
        storage('blocked'),
      ).v12,
    ).toBe(true);
    expect(
      landing('https://trpc.io/', storage(new Map()), true, storage('blocked'))
        .v12,
    ).toBe(false);
  });

  it("always shows v12's UI where it isn't hidden, and keeps nothing for the session", () => {
    const session = new Map<string, string>();
    expect(
      landing(
        'https://v12.trpc.io/docs/client/links',
        storage(new Map()),
        false,
        storage(session),
      ).v12,
    ).toBe(true);
    expect(session.size).toBe(0);
  });
});
