/**
 * The search results the reader last opened, newest first, which the search
 * dialog lists before they type: by entry id (`client/links#batching`), per
 * docs version, in `localStorage`.
 */

const kept = 6;

const keyOf = (version: string) => `trpc-docs:recent-searches:${version}`;

/** The ids stored as `raw`: anything else, or nothing, is none. */
export function parseRecent(raw: string | null): ReadonlyArray<string> {
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .filter((id): id is string => typeof id === 'string')
          .slice(0, kept)
      : [];
  } catch {
    return [];
  }
}

/** `ids` with `id` first, once, keeping the newest. */
export function withRecent(
  ids: ReadonlyArray<string>,
  id: string,
): ReadonlyArray<string> {
  return [id, ...ids.filter((one) => one !== id)].slice(0, kept);
}

// Storage throws where it's off (a private window, a sandboxed frame), and
// the dialog works without it.
export function readRecent(version: string): ReadonlyArray<string> {
  try {
    return parseRecent(localStorage.getItem(keyOf(version)));
  } catch {
    return [];
  }
}

export function writeRecent(version: string, ids: ReadonlyArray<string>) {
  try {
    if (ids.length === 0) {
      localStorage.removeItem(keyOf(version));
    } else {
      localStorage.setItem(keyOf(version), JSON.stringify(ids));
    }
  } catch {
    // Not remembered, then.
  }
}
