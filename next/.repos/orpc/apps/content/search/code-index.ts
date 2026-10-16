/**
 * Blume's search index strips fenced code before indexing (`collectCode` in
 * `blume/src/search/documents.ts`), so a query like `createSafeClient` or
 * `onSuccess` only matches pages that also happen to name it in prose. On oRPC's
 * docs that hides most of the answer: the pages are code-first, and the snippet
 * a reader is hunting for usually lives inside a ```ts fence.
 *
 * Blume's own `search.indexing.includeCodeBlocks` would index every fence as
 * written — twoslash directives, `[!code]` notations, and the same imports
 * repeated across a dozen examples — flattened onto one line. This keeps the
 * index to the code a reader would search for, one line per line.
 *
 * Blume serves the index as the in-memory `blume:search-index` module, which the
 * generated `/blume-search.json` endpoint imports, and every route's full
 * Markdown as `blume:raw-markdown` (behind the raw `.md` URLs), which is where
 * the fences come from — no second content pass. The index module is rewritten
 * to import that Markdown and fold the fences in as it evaluates, so the import
 * also keeps the index current when a page's code changes in dev.
 *
 * Working on the generated module rather than a fork of Blume's document builder
 * keeps this to one hook: the index keeps its shape, and Orama, FlexSearch, the
 * preview pane and the hosted syncs all read the enriched `content` unchanged.
 */

import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import { stringifyJSON } from '@orpc/shared'

/** Vite's id for the module this plugin rewrites (a resolved virtual module). */
const SEARCH_INDEX = '\0blume:search-index'
/** How Blume loads that module: one default export of the parsed snapshot. */
const DEFAULT_EXPORT = 'export default '

/**
 * Opening fence, its info string, body, and closing fence of the same length.
 * The info string cannot open with a backtick, so it can never absorb part of
 * the opening run — the ambiguity that would let a long line of backticks
 * backtrack quadratically.
 */
const FENCE = /^[ \t]*(?<ticks>`{3,})(?<info>(?:[^\n`][^\n]*)?)\n(?<body>[\s\S]*?)^[ \t]*\k<ticks>[ \t]*$/gmu

/**
 * Fence bodies Blume renders as something other than code, so their text is
 * chrome rather than content: `package-install` expands to a tabbed install
 * widget, and Mermaid to a diagram.
 */
const NON_CODE_LANGUAGES = new Set(['mermaid', 'package-install'])

/** Shiki transformer notations (`// [!code highlight]`) — markup, not code. */
const NOTATION = /\s*(?:\/\/|#|<!--)\s*\[!code[^\]]*\][^\n]*/gu
/** Twoslash directives and query markers, which name compiler flags, not API. */
const TWOSLASH_LINE = /^[ \t]*\/\/[ \t]*(?:@[a-zA-Z]|-{3}cut|\^[?^|])[^\n]*$/gmu
/** A fence's info string: language first, then meta such as `twoslash` or a title. */
const INFO_LANGUAGE = /^[a-zA-Z0-9-]+/u

/** The fields of a search document this plugin reads and rewrites. */
interface IndexedDocument {
  route: string
  content: string
}

/** `blume:raw-markdown`: each route's source, keyed by route. */
type RawMarkdown = Record<string, { mdx?: string }>

/**
 * Pull the indexable text out of one page's Markdown: every fenced block that
 * renders as code, stripped of the annotations that drive rendering.
 *
 * Lines are deduplicated per page. Docs pages repeat the same imports and
 * `const router = { ... }` scaffolding across a dozen examples, and Orama scores
 * a bag of words — the repeats add weight to boilerplate and bytes to the index
 * the browser downloads, without making any page easier to find.
 */
function extractCode(markdown: string): string {
  const lines = new Set<string>()

  for (const match of markdown.matchAll(FENCE)) {
    const info = match.groups?.info ?? ''
    const language = INFO_LANGUAGE.exec(info.trim())?.[0]?.toLowerCase() ?? ''
    if (NON_CODE_LANGUAGES.has(language)) {
      continue
    }

    const body = (match.groups?.body ?? '')
      .replaceAll(TWOSLASH_LINE, '')
      .replaceAll(NOTATION, '')

    for (const line of body.split('\n')) {
      const trimmed = line.trim()
      if (trimmed) {
        lines.add(trimmed)
      }
    }
  }

  return [...lines].join('\n')
}

/**
 * Fold each page's fenced code into its search document, so code is searchable
 * and the preview pane can find the block a query matched. Imported by the
 * rewritten index module, so it runs wherever that module evaluates.
 */
export function foldCodeIntoSearchIndex(documents: IndexedDocument[], raw: RawMarkdown): IndexedDocument[] {
  // Rewritten in place: the snapshot module parses a fresh copy on evaluation,
  // and the endpoint is its only importer.
  for (const doc of documents) {
    const markdown = raw[doc.route]?.mdx
    const extracted = markdown ? extractCode(markdown) : ''
    if (extracted) {
      doc.content = `${doc.content}\n${extracted}`
    }
  }

  return documents
}

export function searchCodeIndexPlugin(): Plugin {
  const self = fileURLToPath(import.meta.url)

  return {
    name: 'orpc:search-code-index',
    enforce: 'pre',
    transform(code, id) {
      if (id !== SEARCH_INDEX) {
        return null
      }

      // Fail the build loudly rather than ship an index without code: a newer
      // Blume that loads the snapshot differently needs this hook updated.
      if (!code.startsWith(DEFAULT_EXPORT)) {
        this.error(`Unexpected shape for ${id.slice(1)}; update apps/content/search/code-index.ts for this Blume version.`)
      }

      const snapshot = code.slice(DEFAULT_EXPORT.length).trim().replace(/;$/u, '')
      return {
        code: [
          `import raw from 'blume:raw-markdown'`,
          `import { foldCodeIntoSearchIndex } from ${stringifyJSON(self)}`,
          `export default foldCodeIntoSearchIndex(${snapshot}, raw)`,
        ].join('\n'),
        map: null,
      }
    },
  }
}
