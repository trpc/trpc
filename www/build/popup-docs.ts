import type { TwoslashRenderer } from '@shikijs/twoslash/core';
import type { ElementContent } from 'hast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

type NodeHover = Parameters<TwoslashRenderer['nodeStaticInfo']>[0];
type NodeQuery = Parameters<NonNullable<TwoslashRenderer['lineQuery']>>[0];

/**
 * The JSDoc tags a hover popup shows. `@example`s are long, and `@since`,
 * `@remarks` and the like say little next to the type.
 */
const shownTags = new Set(['deprecated', 'param', 'returns', 'see']);

/**
 * A hover's or a `^?` type's JSDoc as a popup shows it: its first
 * paragraph, so a long comment (Node's `console`) stays a short popup, and
 * only {@link shownTags}.
 */
export function conciseDocs<T extends NodeHover | NodeQuery>(info: T): T {
  const docs = info.docs?.trim().split(/\n\s*\n/)[0];
  const tags = info.tags?.filter(([name]) => shownTags.has(name));
  const concise = { ...info };
  delete concise.docs;
  delete concise.tags;
  if (docs) {
    Object.assign(concise, { docs });
  }
  if (tags?.length) {
    Object.assign(concise, { tags });
  }
  return concise;
}

/**
 * `{@link Name}` as `` `Name` ``, and `{@link https://… text}` as a
 * markdown link. TypeScript puts a line break after a link, which would
 * read as a space before the punctuation that follows it.
 */
function inlineLinks(markdown: string) {
  return markdown.replaceAll(
    /\{@link(?:code|plain)?\s+([^\s}|]+)\s*(?:[\s|]\s*([^}]*?))?\s*\}(?:\n(?=[.,;:!?)]))?/g,
    (_match, target: string, text: string | undefined) =>
      /^https?:\/\//.test(target)
        ? `[${text || target}](${target})`
        : `\`${text || target}\``,
  );
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);

type RenderedNode = ReturnType<typeof processor.runSync>['children'][number];

/**
 * A rendered node as popup content: its elements and text, copied into the
 * `hast` types Shiki uses. Anything else (comments) is left out.
 */
function popupContent(node: RenderedNode): Array<ElementContent> {
  if (node.type === 'text') {
    return [{ type: 'text', value: node.value }];
  }
  if (node.type === 'element') {
    return [
      {
        type: 'element',
        tagName: node.tagName,
        properties: node.properties,
        children: node.children.flatMap(popupContent),
      },
    ];
  }
  return [];
}

/** JSDoc markdown as HTML: code, emphasis and links. */
export function renderPopupMarkdown(markdown: string): Array<ElementContent> {
  const root = processor.runSync(processor.parse(inlineLinks(markdown)));
  return root.children.flatMap(popupContent);
}

/**
 * A tag's value as HTML, without the paragraph around it. A `@param`'s
 * name is code, apart from its description.
 */
export function renderPopupMarkdownInline(
  markdown: string,
  context: string,
): Array<ElementContent> {
  const param =
    context === 'tag:param'
      ? /^(\S+)\s+(?:-\s+)?([\s\S]*)$/.exec(markdown)
      : null;
  const url = /^https?:\/\/(\S+)$/.exec(markdown.trim());
  const text = param
    ? `\`${param[1]}\` — ${param[2]}`
    : // A bare URL (`@see https://trpc.io/docs/…`) reads without its scheme.
      url
      ? `[${url[1]}](${markdown.trim()})`
      : markdown;
  return renderPopupMarkdown(text).flatMap((child) =>
    child.type === 'element' && child.tagName === 'p'
      ? child.children
      : [child],
  );
}

/**
 * A `^?` line with its indent, a run of spaces, in an element of its own.
 * The line is a flex row, which would drop bare spaces, so the pinned type
 * shrinks to the room right of its indent instead of running past the
 * block.
 */
function indentedQueryLine(line: ElementContent): ElementContent {
  if (line.type !== 'element') {
    return line;
  }
  return {
    ...line,
    children: line.children.map((child) =>
      child.type === 'text'
        ? {
            type: 'element',
            tagName: 'span',
            properties: { class: 'twoslash-query-indent' },
            children: [child],
          }
        : child,
    ),
  };
}

/**
 * `renderer` with each hover's and `^?` type's JSDoc made
 * {@link conciseDocs}, and each `^?` line's indent an element
 * ({@link indentedQueryLine}).
 */
export function withConciseDocs(renderer: TwoslashRenderer): TwoslashRenderer {
  return {
    ...renderer,
    nodeStaticInfo(info, node) {
      return renderer.nodeStaticInfo.call(this, conciseDocs(info), node);
    },
    lineQuery(query, node) {
      const lines =
        renderer.lineQuery?.call(this, conciseDocs(query), node) ?? [];
      return lines.map(indentedQueryLine);
    },
  };
}
