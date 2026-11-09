/**
 * Matches `/`-separated paths without accessing the file system, using the
 * same pattern syntax as `FileSystem.glob`.
 *
 * @stability experimental
 * @since 4.0.0
 */
import { format } from "./Formatter.ts"
import { dual } from "./Function.ts"
import { type Inspectable, NodeInspectSymbol } from "./Inspectable.ts"
import * as internal from "./internal/glob.ts"
import { type Pipeable, pipeArguments } from "./Pipeable.ts"

const TypeId = "~effect/Glob"

/**
 * A compiled glob pattern.
 *
 * **Details**
 *
 * `pattern` is the source text and `dot` records whether wildcards match names
 * that start with `.`. Match paths against it with {@link match}.
 *
 * @see {@link make} for compiling a pattern
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface Glob extends Pipeable, Inspectable {
  readonly [TypeId]: typeof TypeId
  readonly pattern: string
  readonly dot: boolean
}

interface GlobImpl extends Glob {
  readonly compiled: internal.Compiled
}

const GlobProto = {
  [TypeId]: TypeId,
  toJSON(this: Glob) {
    return { _id: "Glob", pattern: this.pattern, dot: this.dot }
  },
  toString(this: Glob) {
    return `Glob(${format(this.toJSON())})`
  },
  [NodeInspectSymbol](this: Glob) {
    return this.toJSON()
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * Compiles a glob pattern into a reusable `Glob`.
 *
 * **Details**
 *
 * Patterns use `/` as the separator. `*` matches any run of characters within
 * one path segment, `?` matches one character, and `[...]` matches one
 * character from a set, with `!` or `^` negating it and POSIX classes such as
 * `[[:digit:]]` allowed. `{a,b}` expands to each alternative and may nest. A
 * segment that is exactly `**` matches zero or more whole segments. A trailing
 * `/` matches only directories, and `\` makes the next character literal.
 *
 * **Gotchas**
 *
 * Wildcards and `**` skip names that start with `.` unless the pattern segment
 * itself starts with `.` or `dot` is `true`; they never match `.` or `..`.
 * `x/.` is the same as `x/`, and a `.` or `..` segment after `**` makes the
 * pattern match nothing, as does the empty pattern. UNC patterns and paths
 * such as `//server/share` are not supported and never match. Braces and
 * commas inside `[...]` are class members. Extended glob syntax and leading
 * `!` negation are not interpreted, but ordinary wildcards still apply within
 * them (for example, `?(a)` matches `x(a)`). Malformed syntax, such as an
 * unclosed `[`, matches literally. Braces also stay literal if expansion would
 * exceed 10,000 alternatives.
 *
 * **Example** (Matching source files)
 *
 * ```ts import.meta.vitest
 * import { Glob } from "effect"
 *
 * const sources = Glob.make("src/**\/*.{ts,tsx}")
 *
 * Glob.match(sources, "src/index.ts") // => true
 * Glob.match(sources, "src/ui/Button.tsx") // => true
 * Glob.match(sources, "src/.cache/index.ts") // => false
 * Glob.match(sources, "test/index.ts") // => false
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.0
 */
export const make = (pattern: string, options?: {
  /** Whether wildcards and `**` match names that start with `.`. */
  readonly dot?: boolean | undefined
}): Glob => {
  const dot = options?.dot ?? false
  const self = Object.create(GlobProto)
  self.pattern = pattern
  self.dot = dot
  self.compiled = internal.compile([pattern], dot)
  return self
}

/**
 * Tests whether a `/`-separated path matches a `Glob`.
 *
 * **Details**
 *
 * Empty segments and `./` segments in the path are ignored. A trailing `/`
 * marks the path as a directory, which a pattern ending in `/` requires.
 *
 * **Example** (Filtering paths)
 *
 * ```ts import.meta.vitest
 * import { Glob, pipe } from "effect"
 *
 * const tests = Glob.make("**\/*.test.ts")
 * const paths = ["src/a.ts", "src/a.test.ts", "test/b.test.ts"]
 *
 * paths.filter((path) => Glob.match(tests, path)) // => ["src/a.test.ts", "test/b.test.ts"]
 * pipe(tests, Glob.match("./src/a.test.ts")) // => true
 * ```
 *
 * @stability experimental
 * @category predicates
 * @since 4.0.0
 */
export const match: {
  (path: string): (self: Glob) => boolean
  (self: Glob, path: string): boolean
} = dual(2, (self: Glob, path: string): boolean => internal.match((self as GlobImpl).compiled, path))

/**
 * Escapes glob syntax so a string matches only itself.
 *
 * **Example** (Matching a literal file name)
 *
 * ```ts import.meta.vitest
 * import { Glob } from "effect"
 *
 * const name = "report[1].txt"
 *
 * Glob.match(Glob.make(name), name) // => false
 * Glob.match(Glob.make(Glob.escape(name)), name) // => true
 * ```
 *
 * @stability experimental
 * @category utils
 * @since 4.0.0
 */
export const escape = (input: string): string => input.replace(/[\\*?[\]{}]/g, "\\$&")
