import type { Element, ElementContent, Root } from 'hast';
import { SKIP, visit } from 'unist-util-visit';

import { classNames } from './collapse.ts';

/** A `style` attribute's custom properties, by name, lower-cased. */
function shikiColors(node: Element) {
  const style = node.properties['style'];
  // Shiki's colours are never quoted. A quoted value can hold a `;`, which
  // splitting would cut, so a style with quotes is left as it is.
  if (typeof style !== 'string' || /["']/.test(style)) {
    return undefined;
  }
  const colors = new Map<string, string>();
  for (const declaration of style.split(';')) {
    // A value can hold a colon too (a quoted font name), so split at the first.
    const colon = declaration.indexOf(':');
    if (colon !== -1) {
      colors.set(
        declaration.slice(0, colon).trim(),
        declaration
          .slice(colon + 1)
          .trim()
          .toLowerCase(),
      );
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

/** `children` with each bare span, and each inside it, replaced by its children. */
function unwrapBareSpans(
  children: ReadonlyArray<ElementContent>,
): Array<ElementContent> {
  return children.flatMap((child) =>
    isBareSpan(child) ? unwrapBareSpans(child.children) : [child],
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
    visit(pre, 'element', (node) => {
      if (classNames(node).includes('twoslash-popup-container')) {
        return SKIP;
      }
      node.children = unwrapBareSpans(node.children);
      return undefined;
    });
    return SKIP;
  });
}
