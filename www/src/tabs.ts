/**
 * Tab groups (`<div class="code-tabs" data-tabs="…">`) whose choice is kept
 * in the URL as well as for the reader: `?framework=tanstack-start` opens a
 * page on that tab, so a link can pick it.
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

/** Where a tab group's choice is kept: localStorage, and a cookie beside it. */
export const tabStoragePrefix = 'trpc-docs:tab:';
export const tabCookiePrefix = 'trpc-docs-tab-';

/** The `document.cookie` assignment that keeps `tab` for `group` for a year. */
export function tabCookie(group: string, tab: string) {
  return `${tabCookiePrefix}${encodeURIComponent(group)}=${encodeURIComponent(tab)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/**
 * Each tab group's saved choice, from the cookies and then localStorage,
 * which wins. Stringified into `savedTabsScript`, so it uses nothing from
 * its module scope: the prefixes are spelled out, and a test checks them.
 */
export function readSavedTabs(
  cookie: string,
  storage: Pick<Storage, 'getItem' | 'key' | 'length'> | null,
) {
  const saved: Record<string, string> = {};
  for (const part of cookie.split(';')) {
    const at = part.indexOf('=');
    const name = part.slice(0, at).trim();
    if (at > 0 && name.startsWith('trpc-docs-tab-')) {
      try {
        saved[decodeURIComponent(name.slice('trpc-docs-tab-'.length))] =
          decodeURIComponent(part.slice(at + 1));
      } catch {
        // A malformed cookie: skip it.
      }
    }
  }
  if (storage) {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      const tab = key === null ? null : storage.getItem(key);
      if (key?.startsWith('trpc-docs:tab:') && tab !== null) {
        saved[key.slice('trpc-docs:tab:'.length)] = tab;
      }
    }
  }
  return saved;
}

/**
 * CSS that shows each saved tab in its groups, before `DocBody` applies the
 * choice. A group the URL picks (`?framework=`) is left to `DocBody`.
 * Stringified into `savedTabsScript`, so it uses nothing from its module
 * scope.
 */
export function savedTabsCss(saved: Record<string, string>, search: string) {
  const inUrl = new URLSearchParams(search);
  const quote = (value: string) => `"${value.replaceAll(/["\\]/g, '\\$&')}"`;
  return Object.entries(saved)
    .filter(([group]) => !inUrl.has(group))
    .map(([group, tab]) => {
      const tabs = `[data-tabs=${quote(group)}]:has(> [data-tab=${quote(tab)}])`;
      return [
        `${tabs} > [data-tab]{display:none}`,
        `${tabs} > [data-tab=${quote(tab)}]{display:block}`,
        `${tabs} .code-tab{background:none;color:var(--muted-foreground)}`,
        `${tabs} .code-tab[data-tab-select=${quote(tab)}]{background:var(--muted);color:var(--foreground)}`,
      ].join('\n');
    })
    .join('\n');
}

/** The `<style>` that `savedTabsScript` adds, removed once `DocBody` has applied the choices. */
export const savedTabsStyleId = 'saved-tabs';

function applySavedTabs(
  read: typeof readSavedTabs,
  css: typeof savedTabsCss,
  styleId: string,
) {
  let storage: Storage | null = null;
  try {
    storage = localStorage;
  } catch {
    // Storage is blocked: the cookies still count.
  }
  const rules = css(read(document.cookie, storage), location.search);
  if (rules) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = rules;
    document.head.append(style);
  }
}

/** Runs before first paint, so a page opens on the reader's tabs without a flash. */
export const savedTabsScript = `(${applySavedTabs.toString()})(${readSavedTabs.toString()}, ${savedTabsCss.toString()}, ${JSON.stringify(savedTabsStyleId)});`;
