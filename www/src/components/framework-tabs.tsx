import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  savedTab,
  saveTab,
  tabSlug,
  type UrlTabGroup,
  urlTabGroups,
} from '~/tabs.ts';

/** A tab group kept in the URL, whose tab list this renders. */
interface TabList {
  readonly group: UrlTabGroup;
  /** Where its links render, in place of the page's static ones. */
  readonly mount: HTMLElement;
  readonly tabs: ReadonlyArray<string>;
  /** The tab the page shows before the URL picks one. */
  readonly initial: string;
}

/** Shows `tab`'s panel in every group named `group` under `root`. */
function showPanels(root: ParentNode, group: string, tab: string) {
  for (const tabs of root.querySelectorAll(`[data-tabs="${group}"]`)) {
    if (!tabs.querySelector(`:scope > [data-tab="${tab}"]`)) {
      continue;
    }
    for (const panel of tabs.querySelectorAll(':scope > [data-tab]')) {
      panel.toggleAttribute(
        'data-active',
        panel.getAttribute('data-tab') === tab,
      );
    }
  }
}

/** The tab whose panel holds the element the URL's hash names, if one does. */
function hashTab(root: HTMLElement, group: string) {
  const id = decodeURIComponent(window.location.hash.slice(1));
  const target = id === '' ? null : document.getElementById(id);
  const panel = target?.closest(`[data-tabs="${group}"] > [data-tab]`);
  return panel && root.contains(panel) ? panel.getAttribute('data-tab') : null;
}

/**
 * The tab lists of groups kept in the URL (`?framework=`), as router links.
 *
 * The URL is the one place that picks the tab: a link sets it, and the page
 * shows what it says, back and forward included. A click also saves the
 * reader's pick, and a page opened without the group in its URL goes to the
 * saved tab, or to the tab that holds the URL's `#hash`.
 */
export function FrameworkTabs(props: { readonly root: HTMLElement | null }) {
  const [lists, setLists] = useState<ReadonlyArray<TabList>>([]);
  const search: Partial<Record<UrlTabGroup, string>> = useSearch({
    strict: false,
  });
  const navigate = useNavigate();
  // The clicked link and where it was on screen, to keep it there.
  const clicked = useRef<{ link: Element; top: number } | null>(null);

  // The page's HTML has static links; render router links in their place.
  useLayoutEffect(() => {
    const root = props.root;
    if (!root) {
      return;
    }
    setLists(
      urlTabGroups.flatMap((group) =>
        Array.from(
          root.querySelectorAll(`[data-tabs="${group}"] > .code-tabs-list`),
          (list): TabList => {
            const tabs = Array.from(
              list.querySelectorAll('[data-tab-select]'),
              (link) => link.getAttribute('data-tab-select') ?? '',
            );
            const initial =
              list.parentElement
                ?.querySelector(':scope > [data-tab][data-active]')
                ?.getAttribute('data-tab') ??
              tabs[0] ??
              '';
            const mount = document.createElement('span');
            mount.className = 'contents';
            list.replaceChildren(mount);
            return { group, initial, mount, tabs };
          },
        ),
      ),
    );
  }, [props.root]);

  const tabIn = (list: TabList) =>
    list.tabs.find((tab) => tabSlug(tab) === search[list.group]) ??
    list.initial;

  // Without the group in the URL, go to the hash's tab or the saved one.
  useLayoutEffect(() => {
    const root = props.root;
    if (!root) {
      return;
    }
    for (const group of urlTabGroups) {
      const tabs = lists.find((list) => list.group === group)?.tabs;
      if (!tabs || search[group] !== undefined) {
        continue;
      }
      const linked = hashTab(root, group);
      const saved = savedTab(group);
      const tab =
        linked ?? (saved !== null && tabs.includes(saved) ? saved : null);
      if (tab !== null) {
        void navigate({
          hash: true,
          hashScrollIntoView: linked !== null,
          replace: true,
          resetScroll: false,
          search: (prev) => ({ ...prev, [group]: tabSlug(tab) }),
          to: '.',
        });
      }
    }
    // Only on a page's first render of its tab lists: later, links set the URL.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [lists]);

  // Show the tab the URL picks, keeping a clicked link where it was.
  useLayoutEffect(() => {
    const root = props.root;
    if (!root) {
      return;
    }
    for (const list of lists) {
      showPanels(root, list.group, tabIn(list));
    }
    const link = clicked.current;
    clicked.current = null;
    if (link) {
      window.scrollBy({
        behavior: 'instant',
        top: link.link.getBoundingClientRect().top - link.top,
      });
    }
  });

  return lists.map((list) =>
    createPortal(
      list.tabs.map((tab) => (
        <Link
          aria-selected={tab === tabIn(list)}
          className="code-tab"
          hash
          hashScrollIntoView={false}
          key={tab}
          onClick={(event) => {
            clicked.current = {
              link: event.currentTarget,
              top: event.currentTarget.getBoundingClientRect().top,
            };
            saveTab(list.group, tab);
          }}
          replace
          resetScroll={false}
          role="tab"
          search={(prev) => ({ ...prev, [list.group]: tabSlug(tab) })}
          to="."
        >
          {tab}
        </Link>
      )),
      list.mount,
    ),
  );
}
