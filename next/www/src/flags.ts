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

/**
 * The Experiments menu's query parameter: `?experiments=open` opens it, and
 * `?experiments=<id>` opens it on one experiment, showing its pages. Links
 * keep `?flags=` but not this, so the menu closes on navigating.
 */
export const menuParam = 'experiments';

/** The menu with no experiment picked. */
export const menuOpen = 'open';

export type MenuState = typeof menuOpen | ExperimentId;

/**
 * The root route's search: `?flags=` when it names any experiment, and
 * `?experiments=` while the menu is open.
 */
export interface FlagSearch {
  readonly experiments?: MenuState | undefined;
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

/** The menu state `param` names, or `undefined` for a closed menu. */
export function menuStateOf(param: unknown): MenuState | undefined {
  if (param === menuOpen) {
    return menuOpen;
  }
  return experimentIds.find((id) => id === param);
}

/**
 * The root route's `validateSearch`: keeps `?flags=` with only the known
 * experiments in it, and drops it when it names none; keeps `?experiments=`
 * when it's `open` or an experiment.
 */
export function validateFlagSearch(search: Record<string, unknown>) {
  const value = flagParamFor(flagsIn(search[flagParam]));
  const menu = menuStateOf(search[menuParam]);
  const validated: FlagSearch = {
    ...(menu === undefined ? {} : { experiments: menu }),
    ...(value === undefined ? {} : { flags: value }),
  };
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
 * The experiments the URL turns on, the same on the server and in the
 * browser: a URL with `?flags=` is rendered on demand (`build/on-demand.ts`),
 * so its HTML already lists their pages, and the prerendered pages are the
 * URLs without it.
 */
export function useFlagsOn() {
  const param = useSearch({
    select: (search) => search.flags,
    strict: false,
  });
  return flagsIn(param);
}

/**
 * Rewrites the root route's search in place: the same history entry, no
 * scrolling, the hash kept.
 */
function useReplaceSearch() {
  const navigate = useNavigate();
  return (update: (prev: FlagSearch) => FlagSearch) =>
    void navigate({
      hash: true,
      hashScrollIntoView: false,
      replace: true,
      resetScroll: false,
      search: (prev) => update(prev),
      to: '.',
    });
}

/** Rewrites `?flags=` to turn on `next`, leaving the page where it is. */
export function useSetFlags() {
  const replaceSearch = useReplaceSearch();
  return (next: ReadonlyArray<ExperimentId>) =>
    replaceSearch((prev) => ({ ...prev, flags: flagParamFor(next) }));
}

/**
 * The Experiments menu's state, from `?experiments=`. It opens once the page
 * has hydrated: the menu is a popup, which only renders in the browser.
 */
export function useMenuState() {
  const hydrated = useHydrated();
  const state = useSearch({
    select: (search) => search.experiments,
    strict: false,
  });
  return hydrated ? state : undefined;
}

/** Opens the menu on `state`, or closes it, like `useSetFlags`. */
export function useSetMenuState() {
  const replaceSearch = useReplaceSearch();
  return (state: MenuState | undefined) =>
    replaceSearch((prev) => ({ ...prev, experiments: state }));
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
