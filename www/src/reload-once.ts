/**
 * Reloads the page once for what a deploy broke, never twice in a row for
 * the same thing, so a page that's really broken doesn't loop. Used where
 * a page asks for a chunk a newer deploy replaced: as it hydrates
 * (`content/page-html.ts`) and when a route throws
 * (`components/error-page.tsx`).
 */

const reloadedKey = (key: string) => `trpc-docs:reloaded-for:${key}`;

/**
 * Whether the browser loaded this page by reloading it: unknown where it
 * doesn't say (navigation timing off).
 */
function isReload() {
  const entry = performance.getEntriesByType('navigation')[0];
  return entry && 'type' in entry ? entry.type === 'reload' : undefined;
}

/** This page load, as the marks name it: when it started. */
const thisLoad = () => String(performance.timeOrigin);

/**
 * Whether `key` has already reloaded: this page load asked for it (an
 * effect that runs twice) or is the reload it asked for. A reader who left
 * before the reloaded page loaded leaves the mark in the tab, and a later
 * visit, which isn't a reload, ignores it. The mark stays until
 * {@link forgetReload}, so a page that fails again never reloads again.
 */
function reloadedFor(key: string) {
  try {
    const mark = sessionStorage.getItem(reloadedKey(key));
    if (mark === null) {
      return false;
    }
    // Not knowing, a mark means this is the reload, so it never loops.
    return mark === thisLoad() || (isReload() ?? true);
  } catch {
    // Storage is off (a private window): never reload, so never loop.
    return true;
  }
}

/** Records that this page load reloads for `key`; false where storage is off. */
function markReloaded(key: string) {
  try {
    sessionStorage.setItem(reloadedKey(key), thisLoad());
    return true;
  } catch {
    return false;
  }
}

/**
 * Forgets `key`'s reload once what failed has loaded, so a later deploy can
 * reload it again.
 */
export function forgetReload(key: string) {
  try {
    sessionStorage.removeItem(reloadedKey(key));
  } catch {
    // Storage is off: there's no mark.
  }
}

/**
 * Calls `reload` for `key`, unless this page load already has, or is that
 * reload. Returns whether it did.
 */
export function reloadOnce(key: string, reload: () => void) {
  if (reloadedFor(key) || !markReloaded(key)) {
    return false;
  }
  reload();
  return true;
}

/**
 * Whether `error` is a module the browser couldn't fetch, as each browser
 * words it: a chunk a newer deploy replaced, or the network.
 */
export function isChunkLoadError(error: unknown) {
  return (
    error instanceof Error &&
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/.test(
      error.message,
    )
  );
}
