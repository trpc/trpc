/**
 * @since 4.0.0
 */

import { readFile } from "node:fs/promises"

/**
 * Represents an executable TypeScript code snippet.
 *
 * @category models
 * @since 4.0.0
 */
export interface Snippet {
  readonly source: string
  readonly line: number
  readonly name: string | undefined
}

/**
 * Identifies how documentation is embedded in the source text.
 *
 * @category models
 * @since 4.0.0
 */
export type SourceFormat = "jsdoc" | "markdown"

/**
 * Returns whether a file uses Markdown or MDX documentation syntax.
 *
 * @category guards
 * @since 4.0.0
 */
export const isMarkdown = (file: string): boolean => file.endsWith(".md") || file.endsWith(".mdx")

const jsdocPattern = /\/\*\*[\s\S]*?\*\//g
const fencePattern = /(?:```|~~~)(.*?)\n([\s\S]*?)(?:(?:```|~~~)|$)/g
const runnableMarker = "import.meta.vitest"
const namePattern = /(?:^|\s)name=(?:"([^"]+)"|'([^']+)'|([^\s]+))/

const lineNumberAt = (source: string): (offset: number) => number => {
  const starts = [0]
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1)
  }

  return (offset) => {
    let low = 0
    let high = starts.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (starts[middle] <= offset) low = middle + 1
      else high = middle
    }
    return low
  }
}

const snippets = (
  text: string,
  offset: number,
  lineAt: (offset: number) => number,
  jsdoc = false
): ReadonlyArray<Snippet> => {
  return Array.from(text.matchAll(fencePattern)).flatMap((match) => {
    const metadata = match[1].toLowerCase()
    if ((!metadata.startsWith("ts") && !metadata.startsWith("typescript")) || !metadata.includes(runnableMarker)) {
      return []
    }

    const name = namePattern.exec(match[1])
    const source = jsdoc ? match[2].replace(/^[ \t]*\* ?/gm, "").trim() : match[2].trim()

    return [{
      source,
      line: lineAt(offset + (match.index ?? 0)),
      name: name?.[1] ?? name?.[2] ?? name?.[3]
    }]
  })
}

/**
 * Extracts marked TypeScript code snippets from documentation text.
 *
 * **Details**
 *
 * Extraction uses an ordered text scan and does not parse the containing source file.
 *
 * @category extraction
 * @since 4.0.0
 */
export const extract = (source: string, format: SourceFormat = "jsdoc"): ReadonlyArray<Snippet> => {
  if (!source.includes(runnableMarker)) {
    return []
  }

  const lineAt = lineNumberAt(source)
  return format === "markdown"
    ? snippets(source, 0, lineAt)
    : Array.from(source.matchAll(jsdocPattern)).flatMap((match) => snippets(match[0], match.index ?? 0, lineAt, true))
}

/**
 * Reads a file and extracts its marked code snippets.
 *
 * @category extraction
 * @since 4.0.0
 */
export const extractFile = (file: string): Promise<ReadonlyArray<Snippet>> =>
  readFile(file, "utf8").then((source) => extract(source, isMarkdown(file) ? "markdown" : "jsdoc"))
