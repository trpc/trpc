import type { Element, ElementContent, Root } from 'hast';
import { SKIP, visit } from 'unist-util-visit';

import { classNames } from './collapse.ts';

/** A `style` attribute's custom properties, by name, lower-cased. */
function shikiColors(node: Element) {
  const style = node.properties['style'];
  if (typeof style !== 'string') {
    return undefined;
  }
  const colors = new Map<string, string>();
  for (const declaration of style.split(';')) {
    const [name, value] = declaration.split(':');
    if (name !== undefined && value !== undefined) {
      colors.set(name.trim(), value.trim().toLowerCase());
    }
  }
  return colors;
}

/** Whether `token` sets only the colours `block` sets already. */
function inheritsColors(token: Element, block: ReadonlyMap<string, string>) {
  const colors = shikiColors(token);
  return (
    colors !== undefined &&
    colors.size > 0 &&
    [...colors].every(([name, value]) => block.get(name) === value)
  );
}

/** A span with nothing on it, which renders as its children do. */
function isBareSpan(node: ElementContent): node is Element {
  return (
    node.type === 'element' &&
    node.tagName === 'span' &&
    Object.keys(node.properties).length === 0
  );
}

/**
 * Drops what code blocks repeat. Shiki gives each token its colours
 * (`--shiki-light`, `--shiki-dark`), and most tokens have the block's
 * own, which they inherit from it anyway: 2,592 of the 4,159 tokens on the
 * handles page. A token left with nothing on it becomes its text.
 *
 * Popups keep theirs, as they're on a background of their own.
 */
export function compactCode(tree: Root) {
  visit(tree, 'element', (pre) => {
    if (pre.tagName !== 'pre' || !classNames(pre).includes('shiki')) {
      return undefined;
    }
    const block = shikiColors(pre);
    if (!block) {
      return SKIP;
    }
    visit(pre, 'element', (node) => {
      if (classNames(node).includes('twoslash-popup-container')) {
        return SKIP;
      }
      if (node !== pre && inheritsColors(node, block)) {
        delete node.properties['style'];
      }
      return undefined;
    });
    // Children first, so a bare span inside a bare span goes too.
    visit(pre, 'element', (node) => {
      if (classNames(node).includes('twoslash-popup-container')) {
        return SKIP;
      }
      node.children = node.children.flatMap((child) =>
        isBareSpan(child) ? child.children : [child],
      );
      return undefined;
    });
    return SKIP;
  });
}
