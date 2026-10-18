/** Which tRPC the home page shows: v11, the stable release, unless `?version=v12`. */
export const homeVersions = ['v11', 'v12'] as const;

export type HomeVersion = (typeof homeVersions)[number];

export const defaultHomeVersion: HomeVersion = 'v11';

export const homeVersionLabels = {
  v11: 'v11',
  v12: 'v12 preview',
} as const satisfies Record<HomeVersion, string>;

/** Search on `/`: `?version=v12`, or omitted for v11. */
export interface HomeSearch {
  readonly version?: 'v12' | undefined;
}

/** `/`'s `validateSearch`: keeps `?version=` only when it names v12. */
export function validateHomeSearch(search: Record<string, unknown>) {
  const validated: HomeSearch =
    search['version'] === 'v12' ? { version: 'v12' } : {};
  return validated;
}

export function homeVersionOf(search: HomeSearch): HomeVersion {
  return search.version ?? defaultHomeVersion;
}

/** The search showing `version`: none for v11, so `/` stays clean. */
export function homeVersionSearch(version: HomeVersion): HomeSearch {
  return version === 'v12' ? { version } : {};
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
 * Runs before first paint so `/?version=v12` never flashes the prerendered
 * v11 panels. Pairs with the `[data-home-panel]` CSS.
 */
export const homeVersionScript = `(${applyHomeVersion.toString()})(((v)=>${JSON.stringify(homeVersions)}.includes(v)?v:${JSON.stringify(defaultHomeVersion)})(new URLSearchParams(location.search).get("version")));`;

/** Keep `<html data-home-version>` in sync after client navigations. */
export function syncHomeVersionAttribute(version: HomeVersion) {
  try {
    applyHomeVersion(version);
  } catch {
    // No document during SSR; homeVersionScript handles first paint.
  }
}
