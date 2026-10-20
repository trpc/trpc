import { v11, v12 } from './site.ts';

const allHomeVersions = ['v11', 'v12'] as const;

export type HomeVersion = (typeof allHomeVersions)[number];

/**
 * Which tRPC the home page shows: v11, the stable release, unless
 * `?version=v12`, which `/` gets off trpc.io (`hostHomeVersion`). Only v11
 * while v12 is hidden (`v12.hidden`): the page has no v12 panel then.
 */
export const homeVersions: ReadonlyArray<HomeVersion> = v12.hidden
  ? ['v11']
  : allHomeVersions;

/** Whether the home page has `version`'s panel. */
export const showsHomeVersion = (
  version: HomeVersion,
  shown: ReadonlyArray<HomeVersion> = homeVersions,
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
  shown: ReadonlyArray<HomeVersion> = homeVersions,
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
  shown: ReadonlyArray<HomeVersion> = homeVersions,
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
  shown: ReadonlyArray<HomeVersion> = homeVersions,
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
): HomeVersion | undefined {
  if (pathname === '/') {
    return homeVersionOf(search);
  }
  return homeVersions.find(
    (version) =>
      pathname === docsPaths[version] ||
      pathname.startsWith(`${docsPaths[version]}/`),
  );
}

/** Stores `version` for the next visit to `/`; the host's default clears it. */
export function rememberHomeVersion(version: HomeVersion) {
  try {
    if (version === hostHomeVersion(location.hostname)) {
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
  const param = url.searchParams.get('version');
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

/**
 * Runs before first paint so `/?version=v12`, typed, remembered or the host's
 * default, never flashes the prerendered v11 panels. Pairs with the
 * `[data-home-panel]` CSS.
 */
export const homeVersionScriptOf = (shown: ReadonlyArray<HomeVersion>) =>
  `(${applyHomeVersion.toString()})((${landingHomeVersion.toString()})(${[storageKey, shown, defaultHomeVersion, stableHosts, previewHomeVersion(shown)].map((arg) => JSON.stringify(arg)).join(',')}));`;

export const homeVersionScript = homeVersionScriptOf(homeVersions);

/** Keep `<html data-home-version>` in sync after client navigations. */
export function syncHomeVersionAttribute(version: HomeVersion) {
  try {
    applyHomeVersion(version);
  } catch {
    // No document during SSR; homeVersionScript handles first paint.
  }
}
