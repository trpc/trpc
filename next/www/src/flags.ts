import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useEffectEvent, useSyncExternalStore } from 'react';

import { type ExperimentId, experimentIds } from './experiments.ts';

/**
 * Which experiments (`src/experiments.ts`) are on. Turn them on with
 * `?flags=<id>` (comma-separated for several), from the header's Experiments
 * menu, or by visiting one of their pages. The URL is the only place they're
 * kept: the site's links carry `?flags=` along while navigating, and a URL
 * without it has every experiment off. This is the query parameter.
 */
export const flagParam = 'flags';

/** The root route's search: `?flags=` when it names any experiment. */
export interface FlagSearch {
  readonly flags?: string | undefined;
}

/**
 * The experiments a `?flags=` value turns on, in `experiments` order:
 * names separated by commas, ignoring unknown ones.
 */
export function flagsIn(param: unknown): ReadonlyArray<ExperimentId> {
  if (typeof param !== 'string') {
    return [];
  }
  const named = new Set(param.split(',').map((name) => name.trim()));
  return experimentIds.filter((name) => named.has(name));
}

/** The `?flags=` value turning on `on`, or `undefined` for none. */
export function flagParamFor(on: ReadonlyArray<ExperimentId>) {
  const value = experimentIds.filter((name) => on.includes(name)).join(',');
  return value === '' ? undefined : value;
}

/** `on` with `name` turned on or off. */
export function withFlag(
  on: ReadonlyArray<ExperimentId>,
  name: ExperimentId,
  enabled: boolean,
): ReadonlyArray<ExperimentId> {
  return experimentIds.filter((other) =>
    other === name ? enabled : on.includes(other),
  );
}

/**
 * The root route's `validateSearch`: keeps `?flags=` with only the known
 * experiments in it, and drops it when it names none.
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
 * The experiments the URL turns on. The prerendered page was built without
 * a query string, so this is empty until the page has hydrated, and an
 * experiment's pages appear right after.
 */
export function useFlagsOn() {
  const hydrated = useHydrated();
  const param = useSearch({
    select: (search) => search.flags,
    strict: false,
  });
  return hydrated ? flagsIn(param) : [];
}

/** Rewrites `?flags=` to turn on `next`, leaving the page where it is. */
export function useSetFlags() {
  const navigate = useNavigate();
  return (next: ReadonlyArray<ExperimentId>) =>
    void navigate({
      hash: true,
      hashScrollIntoView: false,
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, flags: flagParamFor(next) }),
      to: '.',
    });
}

/**
 * Turns on `experiment` when the reader lands on one of its pages, by link
 * or by URL. Only on arriving: turning it off from the menu while on the
 * page keeps it off.
 */
export function useEnableOnVisit(
  experiment: ExperimentId | undefined,
  slug: string,
) {
  const param = useSearch({
    select: (search) => search.flags,
    strict: false,
  });
  const setFlags = useSetFlags();
  const enable = useEffectEvent(() => {
    const on = flagsIn(param);
    if (experiment !== undefined && !on.includes(experiment)) {
      setFlags(withFlag(on, experiment, true));
    }
  });
  useEffect(() => enable(), [experiment, slug]);
}
