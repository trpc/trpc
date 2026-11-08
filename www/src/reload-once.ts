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

/**
 * Whether this page load is the reload for `key`, forgetting the mark
 * either way. A reader who leaves before the reloaded page loads leaves
 * the mark in the tab, and a later visit, which isn't a reload, ignores it.
 */
export function forgetReload(key: string) {
  try {
    const marked = sessionStorage.getItem(reloadedKey(key)) !== null;
    sessionStorage.removeItem(reloadedKey(key));
    // Not knowing, a mark means this is the reload, so it never loops.
    return marked && (isReload() ?? true);
  } catch {
    // Storage is off (a private window): never reload, so never loop.
    return true;
  }
}

function markReloaded(key: string) {
  try {
    sessionStorage.setItem(reloadedKey(key), '');
    return true;
  } catch {
    return false;
  }
}

/**
 * Calls `reload` for `key`, unless this page load is already its reload.
 * Returns whether it did.
 */
export function reloadOnce(key: string, reload: () => void) {
  if (forgetReload(key) || !markReloaded(key)) {
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
