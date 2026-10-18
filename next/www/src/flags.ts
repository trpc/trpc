import { useSearch } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';

/**
 * Features the site ships turned off. Turn them on with `?flags=<name>`
 * (comma-separated for several), or from the header's Experiments menu. The
 * URL is the only place they're kept: the site's links carry `?flags=` along
 * while navigating, and a URL without it has every flag off.
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

export const flagNames = Object.keys(flags) as ReadonlyArray<FlagName>;

/** The query parameter that lists the flags turned on. */
export const flagParam = 'flags';

/** The root route's search: `?flags=` when it names any flag. */
export interface FlagSearch {
  readonly flags?: string | undefined;
}

/**
 * The flags a `?flags=` value turns on, in `flagNames` order: names
 * separated by commas, ignoring unknown ones.
 */
export function flagsIn(param: unknown): ReadonlyArray<FlagName> {
  if (typeof param !== 'string') {
    return [];
  }
  const named = new Set(param.split(',').map((name) => name.trim()));
  return flagNames.filter((name) => named.has(name));
}

/** The `?flags=` value turning on `on`, or `undefined` for none. */
export function flagParamFor(on: ReadonlyArray<FlagName>) {
  const value = flagNames.filter((name) => on.includes(name)).join(',');
  return value === '' ? undefined : value;
}

/** `on` with `name` turned on or off. */
export function withFlag(
  on: ReadonlyArray<FlagName>,
  name: FlagName,
  enabled: boolean,
): ReadonlyArray<FlagName> {
  return flagNames.filter((other) =>
    other === name ? enabled : on.includes(other),
  );
}

/**
 * The root route's `validateSearch`: keeps `?flags=` with only the known
 * flags in it, and drops it when it names none.
 */
export function validateFlagSearch(search: Record<string, unknown>) {
  const value = flagParamFor(flagsIn(search[flagParam]));
  const validated: FlagSearch = value === undefined ? {} : { flags: value };
  return validated;
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

const subscribeNever = () => () => {};

/** `false` while the page is prerendered and hydrated, `true` after. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

/**
 * The flags the URL turns on. The prerendered page was built without a
 * query string, so this is empty until the page has hydrated, and a flagged
 * feature appears right after.
 */
export function useFlagsOn() {
  const hydrated = useHydrated();
  const param = useSearch({
    select: (search) => search.flags,
    strict: false,
  });
  return hydrated ? flagsIn(param) : [];
}

/** Whether the URL turns `name` on. */
export function useFlag(name: FlagName) {
  return useFlagsOn().includes(name);
}
