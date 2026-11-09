/**
 * Tab groups on a rendered page (`<div class="code-tabs" data-tabs="…">`):
 * showing a tab, and keeping the reader's choice. `DocBody` wires them to
 * clicks; `src/tabs.ts` has the parts that don't touch the page.
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
export function selectTab(root: ParentNode, group: string, tab: string) {
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

/**
 * Keeps `tab` as the reader's choice for `group`, in a cookie as well as
 * localStorage, so it outlasts either being cleared or blocked.
 */
export function saveTab(group: string, tab: string) {
  document.cookie = tabCookie(group, tab);
  try {
    localStorage.setItem(tabStoragePrefix + group, tab);
  } catch {
    // Storage is blocked: the cookie keeps the choice.
  }
}

/** The reader's saved tab for `group`, from localStorage or its cookie. */
function storedTab(group: string) {
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
  for (const link of root.querySelectorAll(`[data-tab-group="${group}"]`)) {
    const tab = link.getAttribute('data-tab-select');
    if (tab !== null && tabSlug(tab) === value) {
      return tab;
    }
  }
  return null;
}

/**
 * Shows the tabs a link on this page picks (`?framework=nextjs#frameworks`),
 * and keeps them as the reader's choice. The page stays mounted, so
 * `restoreTabs` doesn't run again; this runs before the router scrolls to the
 * link's hash, which may be in one of them.
 */
export function showLinkedTabs(root: HTMLElement, search: string) {
  for (const group of urlTabGroups) {
    const tab = urlTab(root, group, search);
    if (tab !== null) {
      selectTab(root, group, tab);
      saveTab(group, tab);
    }
  }
}

/**
 * Applies the tab the URL picks, and keeps it as the reader's choice, or
 * else the reader's saved choice, like the package manager.
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
    const tab = linked ?? storedTab(group);
    if (tab !== null) {
      selectTab(root, group, tab);
    }
  }
  // The tabs are applied now, so the CSS that showed them before is spent,
  // and would pin them against a later click.
  document.getElementById(savedTabsStyleId)?.remove();
}

const restored = new WeakSet<HTMLElement>();

/**
 * `restoreTabs`, once per rendered page. A ref callback runs again on every
 * render, and a click's URL update renders: restoring then could read the
 * URL from before the click and switch the tab back.
 */
export function restoreTabsOnce(root: HTMLElement) {
  if (restored.has(root)) {
    return;
  }
  restored.add(root);
  restoreTabs(root);
}
