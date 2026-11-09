/**
 * Tab groups on a rendered page (`<div class="code-tabs" data-tabs="…">`).
 *
 * The reader's choice lives in localStorage and a cookie, and for a group
 * kept in the URL (`?framework=`), in the URL too. Choosing a tab writes all
 * of them at once, so restoring the tabs at any time shows the same choice.
 * `src/tabs.ts` has the parts that don't touch the page.
 */
import {
  isUrlTabGroup,
  readSavedTabs,
  savedTabsStyleId,
  tabCookie,
  tabSlug,
  tabStoragePrefix,
  urlTabGroups,
} from '~/tabs.ts';

/** Shows `tab` in every tab group named `group` under `root`. */
function selectTab(root: ParentNode, group: string, tab: string) {
  for (const tabs of root.querySelectorAll(`[data-tabs="${group}"]`)) {
    if (!tabs.querySelector(`:scope > [data-tab="${tab}"]`)) {
      continue;
    }
    for (const block of tabs.querySelectorAll(':scope > [data-tab]')) {
      block.toggleAttribute(
        'data-active',
        block.getAttribute('data-tab') === tab,
      );
    }
    for (const button of tabs.querySelectorAll('[data-tab-select]')) {
      button.setAttribute(
        'aria-selected',
        String(button.getAttribute('data-tab-select') === tab),
      );
    }
  }
}

/** Keeps `tab` as the reader's choice for `group`, for this and later pages. */
function saveTab(group: string, tab: string) {
  document.cookie = tabCookie(group, tab);
  try {
    localStorage.setItem(tabStoragePrefix + group, tab);
  } catch {
    // Storage is blocked: the cookie keeps the choice.
  }
}

/** The reader's saved tab for `group`, from localStorage or its cookie. */
function savedTab(group: string) {
  let storage: Storage | null = null;
  try {
    storage = localStorage;
  } catch {
    // Storage is blocked: the cookie still counts.
  }
  return readSavedTabs(document.cookie, storage)[group] ?? null;
}

/** The tab `search` picks for `group` (`?framework=nextjs`), if it picks one. */
function urlTab(root: ParentNode, group: string, search: string) {
  if (!isUrlTabGroup(group)) {
    return null;
  }
  const value = new URLSearchParams(search).get(group);
  for (const button of root.querySelectorAll(`[data-tab-group="${group}"]`)) {
    const tab = button.getAttribute('data-tab-select');
    if (tab !== null && tabSlug(tab) === value) {
      return tab;
    }
  }
  return null;
}

/**
 * Shows `tab` in every group named `group` on the page, and keeps it: saved,
 * and in the URL for a group kept there. The URL changes in place, outside
 * the router, so nothing renders in between.
 */
export function chooseTab(group: string, tab: string) {
  selectTab(document, group, tab);
  saveTab(group, tab);
  if (isUrlTabGroup(group)) {
    const url = new URL(window.location.href);
    url.searchParams.set(group, tabSlug(tab));
    window.history.replaceState(window.history.state, '', url);
  }
}

/**
 * Shows the tabs a link on this page picks (`?framework=nextjs#frameworks`)
 * before the router scrolls to its hash, which may be in one of them.
 */
export function chooseLinkedTabs(root: ParentNode, search: string) {
  for (const group of urlTabGroups) {
    const tab = urlTab(root, group, search);
    if (tab !== null) {
      selectTab(root, group, tab);
      saveTab(group, tab);
    }
  }
}

/**
 * Shows each group's tab: the one the URL picks, which is saved too, or else
 * the reader's saved one. Safe to run again: it reads the same choice.
 */
export function restoreTabs(root: HTMLElement) {
  const groups = new Set(
    Array.from(root.querySelectorAll('[data-tabs]'), (tabs) =>
      tabs.getAttribute('data-tabs'),
    ),
  );
  for (const group of groups) {
    if (group === null) {
      continue;
    }
    const linked = urlTab(root, group, window.location.search);
    if (linked !== null) {
      saveTab(group, linked);
    }
    const tab = linked ?? savedTab(group);
    if (tab !== null) {
      selectTab(root, group, tab);
    }
  }
  // The tabs are applied now, so the CSS that showed them before is spent,
  // and would pin them against a later click.
  document.getElementById(savedTabsStyleId)?.remove();
}
