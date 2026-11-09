/**
 * The small glob matcher the `documents` patterns use:
 * `*`, `**`, `?` and `{a,b}`, matched against `/`-separated paths relative
 * to the config file. A `{` without a closing `}` is a literal character.
 *
 * @internal
 */

export interface Glob {
  /** The leading directory segments without wildcards, e.g. `src/app` for `src/app/**\/*.graphql`. */
  readonly root: string
  /** The root runs through a skipped directory, so the generator reads nothing under it. */
  readonly skipped: boolean
  readonly matches: (path: string) => boolean
}

/** Dot-files, dot-directories and `node_modules`, which the generator never reads or watches. */
export const isSkipped = (name: string): boolean => name.startsWith(".") || name === "node_modules"

const wildcard = /[*?{]/

const escapeRegExp = (char: string): string => /[.+^$()|[\]\\{}]/.test(char) ? `\\${char}` : char

/** The indices of the `{` that have a closing `}`, and of those `}`. */
const matchedBraces = (pattern: string): Set<number> => {
  const matched = new Set<number>()
  const open: Array<number> = []
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "{") {
      open.push(i)
    } else if (pattern[i] === "}" && open.length > 0) {
      matched.add(open.pop()!)
      matched.add(i)
    }
  }
  return matched
}

const normalize = (pattern: string): string => pattern.replace(/^(?:\.\/)+/, "")

const toRegExpSource = (pattern: string): string => {
  let out = ""
  let i = 0
  let braces = 0
  const matched = matchedBraces(pattern)
  while (i < pattern.length) {
    const char = pattern[i]!
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        const atSegmentStart = i === 0 || pattern[i - 1] === "/"
        if (atSegmentStart && pattern[i + 2] === "/") {
          out += "(?:[^/]+/)*"
          i += 3
          continue
        }
        out += ".*"
        i += 2
        continue
      }
      out += "[^/]*"
    } else if (char === "?") {
      out += "[^/]"
    } else if (char === "{" && matched.has(i)) {
      braces++
      out += "(?:"
    } else if (char === "}" && matched.has(i)) {
      braces--
      out += ")"
    } else if (char === "," && braces > 0) {
      out += "|"
    } else {
      out += escapeRegExp(char)
    }
    i++
  }
  return out
}

export const make = (pattern: string): Glob => {
  const normalized = normalize(pattern)
  const segments = normalized.split("/")
  const rootSegments: Array<string> = []
  for (const segment of segments.slice(0, -1)) {
    if (wildcard.test(segment)) break
    rootSegments.push(segment)
  }
  const regExp = new RegExp(`^${toRegExpSource(normalized)}$`)
  return {
    root: rootSegments.join("/"),
    // `.` and `..` only navigate, so they don't make a root skipped.
    skipped: rootSegments.some((segment) => segment !== "." && segment !== ".." && isSkipped(segment)),
    matches: (path) => regExp.test(path)
  }
}
