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
