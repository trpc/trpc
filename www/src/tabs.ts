/**
 * Tab groups (`<div class="code-tabs" data-tabs="…">`) whose choice is kept
 * in the URL as well as for the reader: `?framework=tanstack-start` opens a
 * page on that tab, so a link can pick it. Their tabs are links to it.
 */
export const urlTabGroups = ['framework'] as const;

export type UrlTabGroup = (typeof urlTabGroups)[number];

export function isUrlTabGroup(group: string): group is UrlTabGroup {
  return urlTabGroups.some((name) => name === group);
}

/** A tab's value in the URL: `Next.js` is `nextjs`, `TanStack Start` is `tanstack-start`. */
export function tabSlug(tab: string) {
  return tab
    .toLowerCase()
    .replaceAll('.', '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

export type TabSearch = Partial<Record<UrlTabGroup, string>>;

/** The root route's search for the tab groups: their values, when strings. */
export function validateTabSearch(search: Record<string, unknown>) {
  const validated: TabSearch = {};
  for (const group of urlTabGroups) {
    const value = search[group];
    if (typeof value === 'string' && value !== '') {
      validated[group] = value;
    }
  }
  return validated;
}

const storageKey = (group: string) => `trpc-docs:tab:${group}`;
const cookieName = (group: string) =>
  `trpc-docs-tab-${encodeURIComponent(group)}`;

/**
 * Keeps the tab the reader picked for `group`, in localStorage and a cookie,
 * so the choice outlasts either being cleared or blocked. Only a click picks.
 */
export function saveTab(group: string, tab: string) {
  document.cookie = `${cookieName(group)}=${encodeURIComponent(tab)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try {
    localStorage.setItem(storageKey(group), tab);
  } catch {
    // Storage is blocked: the cookie keeps the choice.
  }
}

/** The tab the reader last picked for `group`: localStorage's, or else the cookie's. */
export function savedTab(group: string) {
  try {
    const stored = localStorage.getItem(storageKey(group));
    if (stored !== null) {
      return stored;
    }
  } catch {
    // Storage is blocked: read the cookie.
  }
  const name = `${cookieName(group)}=`;
  const cookie = document.cookie
    .split('; ')
    .find((part) => part.startsWith(name));
  try {
    return cookie === undefined
      ? null
      : decodeURIComponent(cookie.slice(name.length));
  } catch {
    return null;
  }
}
