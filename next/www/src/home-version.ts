import { useSyncExternalStore } from 'react';

import { v11, v12 } from './site.ts';

/** Every version the home page has a panel for, in the HTML. */
export const allHomeVersions = ['v11', 'v12'] as const;

export type HomeVersion = (typeof allHomeVersions)[number];

/** Where the session keeps that it has been to v12, while it's hidden. */
const revealKey = 'trpc-docs:v12';

/**
 * On `<html>` where the page shows v12's UI: always, unless v12 is hidden
 * (`v12.hidden`); then once the session has landed on `/v12/...` or a URL
 * with `?version=12` (`homeVersionScript` sets it before the first paint).
 * Without it, the CSS hides `[data-v12-ui]` and the home page's v12 panels,
 * and their links have no `href` (`useV12Shown`), so crawlers find none.
 */
export const v12Attribute = 'data-v12';

/** Whether the page shows v12's UI (`v12Attribute`). */
export function v12Shown(): boolean {
  return (
    !v12.hidden ||
    (typeof document !== 'undefined' &&
      document.documentElement.hasAttribute(v12Attribute))
  );
}

const revealed = new Set<() => void>();

/** Shows v12's UI for the rest of the session, from a page of v12's. */
export function revealV12() {
  if (v12Shown()) {
    return;
  }
  document.documentElement.setAttribute(v12Attribute, '');
  try {
    sessionStorage.setItem(revealKey, '1');
  } catch {
    // Storage is blocked: shown until the next page load.
  }
  for (const listener of revealed) {
    listener();
  }
}

const onReveal = (listener: () => void) => {
  revealed.add(listener);
  return () => {
    revealed.delete(listener);
  };
};

/**
 * `v12Shown()` for rendering: what the HTML has (hidden, while v12 is)
 * until hydration's done, so they match, then the page's.
 */
export const useV12Shown = () =>
  useSyncExternalStore(onReveal, v12Shown, () => !v12.hidden);

/** The versions the home page shows, `v12Shown()` or not. */
export const shownHomeVersions = (
  shown: boolean = v12Shown(),
): ReadonlyArray<HomeVersion> => (shown ? allHomeVersions : ['v11']);

/** Whether the home page shows `version`'s panel. */
export const showsHomeVersion = (
  version: HomeVersion,
  shown: ReadonlyArray<HomeVersion> = shownHomeVersions(),
) => shown.includes(version);

/** The version `/` without `?version=` names, and the prerendered HTML shows. */
export const defaultHomeVersion: HomeVersion = 'v11';

/** Hosts where `/` opens on `defaultHomeVersion`; elsewhere it opens on v12. */
const stableHosts = ['trpc.io', 'www.trpc.io'];

/** The version `/` opens on off `stableHosts`: v12, if the page shows it. */
const previewHomeVersion = (shown: ReadonlyArray<HomeVersion>): HomeVersion =>
  showsHomeVersion('v12', shown) ? 'v12' : defaultHomeVersion;

/**
 * The version `/` opens on at `hostname` when the reader names or remembers
 * none: v11 on trpc.io, v12 on `v12.trpc.io`, previews and localhost, unless
 * v12 is hidden.
 */
export function hostHomeVersion(
  hostname: string,
  shown: ReadonlyArray<HomeVersion> = shownHomeVersions(),
): HomeVersion {
  return stableHosts.includes(hostname)
    ? defaultHomeVersion
    : previewHomeVersion(shown);
}

export const homeVersionLabels = {
  v11: 'v11',
  v12: 'v12 preview',
} as const satisfies Record<HomeVersion, string>;

/** Search on `/`: `?version=v12`, or omitted for v11. */
export interface HomeSearch {
  readonly version?: 'v12' | undefined;
}

/** `/`'s `validateSearch`: keeps `?version=` only when it names v12, and the page shows it. */
export function validateHomeSearch(
  search: Record<string, unknown>,
  shown: ReadonlyArray<HomeVersion> = shownHomeVersions(),
) {
  const validated: HomeSearch =
    search['version'] === 'v12' && showsHomeVersion('v12', shown)
      ? { version: 'v12' }
      : {};
  return validated;
}

export function homeVersionOf(search: HomeSearch): HomeVersion {
  return search.version ?? defaultHomeVersion;
}

/** The search showing `version`: none for v11, so `/` stays clean, or a version it doesn't show. */
export function homeVersionSearch(
  version: HomeVersion,
  shown: ReadonlyArray<HomeVersion> = shownHomeVersions(),
): HomeSearch {
  return version === 'v12' && showsHomeVersion(version, shown)
    ? { version }
    : {};
}

/** Where the version the reader last browsed is kept, for `/` to open on. */
const storageKey = 'trpc-docs:version';

const docsPaths = {
  v11: v11.basePath,
  v12: v12.basePath,
} as const satisfies Record<HomeVersion, string>;

/**
 * The version a page is browsing, to remember: the one `/` shows, or v11's
 * or v12's on their docs. The other pages (v10's and v9's docs, the blog)
 * leave the remembered one as it is.
 */
export function homeVersionAt(
  pathname: string,
  search: HomeSearch,
  shown: ReadonlyArray<HomeVersion> = shownHomeVersions(),
): HomeVersion | undefined {
  if (pathname === '/') {
    return homeVersionOf(search);
  }
  return shown.find(
    (version) =>
      pathname === docsPaths[version] ||
      pathname.startsWith(`${docsPaths[version]}/`),
  );
}

/** Stores `version` for the next visit to `/`; the host's default clears it. */
export function rememberHomeVersion(
  version: HomeVersion,
  shown: ReadonlyArray<HomeVersion> = shownHomeVersions(),
) {
  try {
    if (version === hostHomeVersion(location.hostname, shown)) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, version);
    }
  } catch {
    // Storage is blocked: the next visit opens on the default.
  }
}

/**
 * The version the page opens on: `?version=` when the URL names one, else on
 * `/` the remembered one, else the host's (`preview` off `stableHosts`). One
 * other than `fallback` is written into the URL with `replaceState` (no extra
 * history entry) before the router reads it. Stringified into
 * `homeVersionScript`, so it can't use anything from its module scope.
 */
function landingHomeVersion(
  key: string,
  versions: ReadonlyArray<string>,
  fallback: string,
  hosts: ReadonlyArray<string>,
  preview: string,
) {
  const url = new URL(location.href);
  let param = url.searchParams.get('version');
  // `/?version=12` is `/?version=v12`, which the router reads.
  if (param === '12' && url.pathname === '/') {
    param = 'v12';
    url.searchParams.set('version', param);
    history.replaceState(history.state, '', url);
  }
  if (param !== null || url.pathname !== '/') {
    return param !== null && versions.includes(param) ? param : fallback;
  }
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(key);
  } catch {
    // Storage is blocked: open on the host's default.
  }
  let opened = hosts.includes(url.hostname) ? fallback : preview;
  if (stored !== null && versions.includes(stored)) {
    opened = stored;
  }
  if (opened === fallback) {
    return fallback;
  }
  url.searchParams.set('version', opened);
  history.replaceState(history.state, '', url);
  return opened;
}

/**
 * Whether the page shows v12's UI (`v12Attribute`, which it sets): always
 * unless `hidden`; then if the URL is v12's (`/v12/...`) or asks for it
 * (`?version=12`, `?version=v12`), which the session remembers, or the
 * session has been to v12 before. Stringified into `homeVersionScript`.
 */
function revealedV12(key: string, attribute: string, hidden: boolean) {
  const url = new URL(location.href);
  const version = url.searchParams.get('version');
  let shown =
    !hidden ||
    url.pathname === '/v12' ||
    url.pathname.startsWith('/v12/') ||
    version === '12' ||
    version === 'v12';
  if (hidden) {
    try {
      if (shown) {
        sessionStorage.setItem(key, '1');
      } else {
        shown = sessionStorage.getItem(key) === '1';
      }
    } catch {
      // Storage is blocked: shown only where the URL asks.
    }
  }
  if (shown) {
    document.documentElement.setAttribute(attribute, '');
  }
  return shown;
}

/**
 * Apply `data-home-version` and move shared step `id`s onto the visible
 * panel only (every version ships in the static HTML). Stringified into
 * `homeVersionScript`, so it can't close over module bindings, and it
 * assumes a browser document (the script only runs there).
 */
function applyHomeVersion(version: HomeVersion) {
  document.documentElement.setAttribute('data-home-version', version);
  for (const panel of document.querySelectorAll('[data-home-panel]')) {
    const on = panel.getAttribute('data-home-panel') === version;
    for (const el of panel.querySelectorAll<HTMLElement>('[data-step-id]')) {
      const stepId = el.getAttribute('data-step-id');
      if (!stepId) {
        continue;
      }
      if (on) {
        el.id = stepId;
      } else {
        el.removeAttribute('id');
      }
    }
  }
}

const landingArgs = (shown: ReadonlyArray<HomeVersion>) =>
  JSON.stringify([
    storageKey,
    shown,
    defaultHomeVersion,
    stableHosts,
    previewHomeVersion(shown),
  ]);

/**
 * Runs before first paint so `/?version=v12`, typed, remembered or the host's
 * default, never flashes the prerendered v11 panels, and v12's UI shows only
 * where it may (`revealedV12`, `hidden`: `v12.hidden`). Pairs with the
 * `[data-home-panel]` and `[data-v12-ui]` CSS.
 */
export const homeVersionScriptOf = (hidden: boolean) =>
  `(${applyHomeVersion.toString()})((${landingHomeVersion.toString()})(...((${revealedV12.toString()})(${[revealKey, v12Attribute, hidden].map((arg) => JSON.stringify(arg)).join(',')})?${landingArgs(allHomeVersions)}:${landingArgs(['v11'])})));`;

export const homeVersionScript = homeVersionScriptOf(v12.hidden);

/** Keep `<html data-home-version>` in sync after client navigations. */
export function syncHomeVersionAttribute(version: HomeVersion) {
  try {
    applyHomeVersion(version);
  } catch {
    // No document during SSR; homeVersionScript handles first paint.
  }
}
