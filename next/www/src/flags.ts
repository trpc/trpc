import { useSyncExternalStore } from 'react';

/**
 * Features the site ships turned off. Turn one on from the dev menu (in
 * development and preview builds), or anywhere with `?flags=<name>`; turn it
 * off with `?flags=-<name>`, and every flag back to its default with
 * `?flags=reset`. The choice is kept in this browser.
 */
export const flags = {
  partners: {
    description:
      'Our biggest sponsors as partners: on the home page, under the hero and beside the docs.',
    label: 'Partner placements',
  },
} as const satisfies Record<
  string,
  { readonly description: string; readonly label: string }
>;

export type FlagName = keyof typeof flags;

export type FlagOverrides = Readonly<Partial<Record<FlagName, boolean>>>;

export const flagNames = Object.keys(flags) as ReadonlyArray<FlagName>;

/** The query parameter that turns flags on and off. */
export const flagParam = 'flags';

const isFlagName = (name: string): name is FlagName =>
  Object.hasOwn(flags, name);

/**
 * `overrides` after a `?flags=` value: comma-separated names to turn on,
 * `-name` to turn off, and `reset` to forget every override. Unknown names
 * are ignored.
 */
export function applyFlagParam(
  overrides: FlagOverrides,
  param: string,
): FlagOverrides {
  let next: Partial<Record<FlagName, boolean>> = { ...overrides };
  for (const raw of param.split(',')) {
    const token = raw.trim();
    if (token === 'reset') {
      next = {};
      continue;
    }
    const off = token.startsWith('-');
    const name = off ? token.slice(1) : token;
    if (isFlagName(name)) {
      next[name] = !off;
    }
  }
  return next;
}

/** The overrides in `stored`, keeping only known flags set to a boolean. */
export function parseOverrides(stored: string | null): FlagOverrides {
  if (stored === null) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return {};
  }
  const overrides: Partial<Record<FlagName, boolean>> = {};
  for (const [name, value] of Object.entries(parsed)) {
    if (isFlagName(name) && typeof value === 'boolean') {
      overrides[name] = value;
    }
  }
  return overrides;
}

/**
 * Where the site runs: `vp dev`, a build that isn't Vercel's production
 * deployment (a local `vp preview`, a Vercel preview), or production.
 */
export type SiteEnv = 'development' | 'preview' | 'production';

export function siteEnvOf(env: {
  readonly DEV: boolean;
  readonly VERCEL_ENV: string;
}): SiteEnv {
  if (env.DEV) {
    return 'development';
  }
  return env.VERCEL_ENV === 'production' ? 'production' : 'preview';
}

export const siteEnv = siteEnvOf({
  DEV: import.meta.env.DEV,
  VERCEL_ENV: import.meta.env.VERCEL_ENV,
});

const storageKey = 'trpc-docs:flags';
const noOverrides: FlagOverrides = {};
const listeners = new Set<() => void>();
let current: FlagOverrides | undefined;

function readStored() {
  try {
    return parseOverrides(localStorage.getItem(storageKey));
  } catch {
    // Storage is blocked: every flag keeps its default.
    return noOverrides;
  }
}

export function getOverrides() {
  current ??= readStored();
  return current;
}

export function setOverrides(next: FlagOverrides) {
  current = next;
  try {
    if (Object.keys(next).length === 0) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, JSON.stringify(next));
    }
  } catch {
    // Storage is blocked: the overrides last until the page reloads.
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey) {
      current = readStored();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * The flags this browser turned on or off. The prerendered page has none,
 * so a flagged feature appears once the page hydrates.
 */
export function useFlagOverrides() {
  return useSyncExternalStore(subscribe, getOverrides, () => noOverrides);
}

/** Whether `name` is on: every flag is off unless this browser turned it on. */
export function useFlag(name: FlagName) {
  return useFlagOverrides()[name] ?? false;
}
