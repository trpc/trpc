import type { Element, ElementContent } from 'hast';
import { toString } from 'hast-util-to-string';
import type { ShikiTransformer } from 'shiki';

import { classNames } from './collapse.ts';

/**
 * Highlights a line that ends in `// [!code highlight]`, Shiki's notation
 * for it, and drops the comment. The marker is a comment, so Twoslash still
 * typechecks the line.
 *
 * Shiki ships this as `transformerNotationHighlight` in
 * `@shikijs/transformers`. It's a few lines here, beside `collapseRegions`,
 * so the site doesn't take a dependency for it.
 */

const marker = /[ \t]*\/\/ \[!code highlight\][ \t]*$/;

/** Drops highlight markers. The lines stay, for agents' markdown. */
export function stripHighlightMarkers(code: string) {
  return code
    .split('\n')
    .map((line) => line.replace(marker, ''))
    .join('\n');
}

/** Cuts every text under `node` from character `at` on. */
function truncate(node: ElementContent, at: number, seen: number): number {
  if (node.type === 'text') {
    const end = seen + node.value.length;
    if (end > at) {
      node.value = node.value.slice(0, Math.max(at - seen, 0));
    }
    return end;
  }
  if (node.type !== 'element') {
    return seen;
  }
  let offset = seen;
  for (const child of node.children) {
    offset = truncate(child, at, offset);
  }
  node.children = node.children.filter(
    (child) => !(child.type === 'element' && toString(child) === ''),
  );
  return offset;
}

function highlightLine(line: Element) {
  const at = toString(line).search(marker);
  if (at < 0) {
    return;
  }
  truncate(line, at, 0);
  // Shiki keeps a line's classes in `class`, as a string.
  line.properties['class'] = [...classNames(line), 'highlighted'].join(' ');
  delete line.properties['className'];
}

export function highlightLines(): ShikiTransformer {
  return {
    code(code) {
      const visit = (node: ElementContent) => {
        if (node.type !== 'element') {
          return;
        }
        if (classNames(node).includes('line')) {
          highlightLine(node);
          return;
        }
        for (const child of node.children) {
          visit(child);
        }
      };
      for (const child of code.children) {
        visit(child);
      }
    },
    name: 'trpc-docs:highlight',
  };
}
