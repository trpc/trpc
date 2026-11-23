import type { Root } from 'hast';
import { toHtml } from 'hast-util-to-html';
import { visit } from 'unist-util-visit';

import { classNames } from './collapse.ts';

/**
 * Takes each hover popup out of `tree`, leaving its name with the popup's
 * content's index in the returned list (`data-popup`), which the page loads
 * when a reader first hovers (`installTwoslashHovers`).
 *
 * A page has a popup for every name in its code, and most recur, so the
 * popups were most of a page: 5.8 of the 6.6 MB of HTML of the handles
 * page, sent again for hydration. Each distinct popup is listed once.
 * Pinned `^?` types show without a hover, so they stay.
 */
export function takePopups(tree: Root): ReadonlyArray<string> {
  const popups: Array<string> = [];
  const indexes = new Map<string, number>();
  visit(tree, 'element', (node) => {
    const classes = classNames(node);
    if (
      !classes.includes('twoslash-hover') ||
      classes.includes('twoslash-query-persisted')
    ) {
      return;
    }
    const container = node.children.find(
      (child) =>
        child.type === 'element' &&
        classNames(child).includes('twoslash-popup-container'),
    );
    if (container?.type !== 'element') {
      return;
    }
    const html = toHtml({ type: 'root', children: container.children });
    let index = indexes.get(html);
    if (index === undefined) {
      index = popups.length;
      popups.push(html);
      indexes.set(html, index);
    }
    node.children = node.children.filter((child) => child !== container);
    node.properties['dataPopup'] = String(index);
  });
  return popups;
}

/**
 * Whether a module id asks for a page's popups, not the page: the query
 * that `import.meta.glob(…, { query: '?popups' })` adds (`page.md?popups`).
 * Dev adds queries of its own after it (`&import`).
 */
export function isPopupsId(id: string) {
  const query = id.split('?')[1];
  return query !== undefined && new URLSearchParams(query).has('popups');
}
