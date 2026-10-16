/**
 * Formats JavaScript values into readable strings.
 *
 * `format` is intended for logs, diagnostics, and error messages. It handles
 * primitives, objects, arrays, dates, regular expressions, maps, sets, class
 * instances, errors, circular references, and redactable values. `formatJson`
 * wraps JSON formatting with redaction and circular-reference handling, and the
 * module also includes helpers for property keys, paths, and dates.
 *
 * @since 4.0.0
 */
import * as Predicate from "./Predicate.ts"
import { getRedacted, redact, symbolRedactable } from "./Redactable.ts"

/**
 * A callable interface representing a function that converts a `Value` into a `Format`, which defaults to `string`.
 *
 * **When to use**
 *
 * Use when you want to type a formatting or rendering function generically, or when you are building a pipeline that accepts pluggable formatters.
 *
 * **Details**
 *
 * This is a pure callable type and carries no runtime implementation. It is contravariant in `Value` and covariant in `Format`.
 *
 * **Example** (Defining a custom formatter)
 *
 * ```ts import.meta.vitest
 * import type { Formatter } from "effect"
 *
 * const upper: Formatter.Formatter<string> = (s) => s.toUpperCase()
 *
 * upper("hello") // => "HELLO"
 * ```
 *
 * @see {@link format}
 * @see {@link formatJson}
 * @category models
 * @since 4.0.0
 */
export interface Formatter<in Value, out Format = string> {
  (value: Value): Format
}

/**
 * Converts any JavaScript value into a human-readable string.
 *
 * **When to use**
 *
 * Use when you need to format arbitrary JavaScript values for debugging,
 * logging, or error messages.
 *
 * **Details**
 *
 * - Output is **not** valid JSON; use {@link formatJson} when you need
 *   parseable JSON.
 * - Handles `BigInt`, `Symbol`, `Set`, `Map`, `Date`, `RegExp`, and class
 *   instances that `JSON.stringify` cannot represent.
 * - Circular references are shown as `"[Circular]"` instead of throwing.
 * - Failures while inspecting a value are rendered as diagnostic placeholders instead of throwing.
 * - Primitives: stringified naturally (`null`, `undefined`, `123`, `true`).
 *   Strings are JSON-quoted.
 * - Objects with a custom `toString` (not `Object.prototype.toString`):
 *   `toString()` is called unless `ignoreToString` is `true`.
 * - Errors with a `cause`: formatted as `"<message> (cause: <cause>)"`.
 * - Iterables (`Set`, `Map`, etc.): formatted as
 *   `ClassName([...elements])`.
 * - Class instances: wrapped as `ClassName({...})`.
 * - `Redactable` values are automatically redacted.
 * - Arrays/objects with 0–1 entries are inline; larger ones are
 *   pretty-printed when `space` is set.
 * - `space` — indentation unit (number of spaces, or a string like
 *   `"\t"`). Defaults to `0` (compact).
 * - `ignoreToString` — skip calling `toString()`. Defaults to `false`.
 *
 * **Example** (Formatting compact output)
 *
 * ```ts import.meta.vitest
 * import { Formatter } from "effect"
 *
 * Formatter.format({ a: 1, b: [2, 3] }) // => "{\"a\":1,\"b\":[2,3]}"
 * ```
 *
 * **Example** (Pretty-printed output)
 *
 * ```ts import.meta.vitest
 * import { Formatter } from "effect"
 *
 * const output = Formatter.format({ a: 1, b: [2, 3] }, { space: 2 })
 * output // => "{\n  \"a\": 1,\n  \"b\": [\n    2,\n    3\n  ]\n}"
 * ```
 *
 * **Example** (Handling circular references)
 *
 * ```ts import.meta.vitest
 * import { Formatter } from "effect"
 *
 * const obj: any = { name: "loop" }
 * obj.self = obj
 * Formatter.format(obj) // => "{\"name\":\"loop\",\"self\":[Circular]}"
 * ```
 *
 * @see {@link formatJson}
 * @see {@link Formatter}
 * @category formatting
 * @since 2.0.0
 */
export function format(input: unknown, options?: {
  readonly space?: number | string | undefined
  readonly ignoreToString?: boolean | undefined
}): string {
  const space = options?.space ?? 0
  const ancestors = new WeakSet<object>()
  const gap = !space ? "" : (typeof space === "number" ? " ".repeat(space) : space)
  const ind = (d: number) => gap.repeat(d)

  const wrap = (v: unknown, body: string): string => {
    const ctor = (v as any)?.constructor
    return ctor && ctor !== Object.prototype.constructor && ctor.name ? `${ctor.name}(${body})` : body
  }

  const ownKeys = (o: object): Array<PropertyKey> => {
    try {
      return Reflect.ownKeys(o)
    } catch {
      return ["[ownKeys threw]"]
    }
  }

  function recur(v: unknown, d = 0): string {
    try {
      return recurUnsafe(v, d)
    } catch {
      if ((typeof v === "object" && v !== null) || typeof v === "function") ancestors.delete(v)
      return "[inspection threw]"
    }
  }

  function recurUnsafe(v: unknown, d = 0): string {
    if (typeof v === "string") return JSON.stringify(v)

    if (
      typeof v === "number" ||
      v == null ||
      typeof v === "boolean" ||
      typeof v === "symbol"
    ) return String(v)

    if (typeof v === "bigint") return String(v) + "n"

    if (typeof v === "object" || typeof v === "function") {
      if (ancestors.has(v)) return CIRCULAR
      ancestors.add(v)

      let output: string
      if (symbolRedactable in v) {
        output = recur(getRedacted(v as any), d)
      } else if (Array.isArray(v)) {
        output = !gap || v.length <= 1
          ? `[${v.map((x) => recur(x, d)).join(",")}]`
          : `[\n${ind(d + 1)}${v.map((x) => recur(x, d + 1)).join(",\n" + ind(d + 1))}\n${ind(d)}]`
      } else if (v instanceof Date) {
        output = formatDate(v)
      } else if (
        !options?.ignoreToString &&
        Predicate.hasProperty(v, "toString") &&
        typeof v["toString"] === "function" &&
        v["toString"] !== Object.prototype.toString &&
        v["toString"] !== Array.prototype.toString
      ) {
        const s = safeToString(v)
        output = v instanceof Error && v.cause !== undefined ? `${s} (cause: ${recur(v.cause, d)})` : s
      } else if (Symbol.iterator in v) {
        output = `${v.constructor.name}(${recur(Array.from(v as any), d)})`
      } else {
        const keys = ownKeys(v)
        if (!gap || keys.length <= 1) {
          const body = `{${keys.map((k) => `${formatPropertyKey(k)}:${recur(safeGet(v, k), d)}`).join(",")}}`
          output = wrap(v, body)
        } else {
          const body = `{\n${
            keys.map((k) => `${ind(d + 1)}${formatPropertyKey(k)}: ${recur(safeGet(v, k), d + 1)}`).join(",\n")
          }\n${ind(d)}}`
          output = wrap(v, body)
        }
      }
      ancestors.delete(v)
      return output
    }

    return String(v)
  }

  return recur(input, 0)
}

const CIRCULAR = "[Circular]"

/**
 * @internal
 */
export function formatPropertyKey(name: PropertyKey): string {
  return typeof name === "string" ? JSON.stringify(name) : String(name)
}

/**
 * Formats an array of property keys as a bracket-notation path string.
 *
 * @internal
 */
export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.map((key) => `[${formatPropertyKey(key)}]`).join("")
}

/**
 * Formats a `Date` as an ISO 8601 string, returning `"Invalid Date"` for
 * invalid dates instead of throwing.
 *
 * @internal
 */
export function formatDate(date: Date): string {
  try {
    return date.toISOString()
  } catch {
    return "Invalid Date"
  }
}

function safeToString(input: any): string {
  try {
    const s = input.toString()
    return typeof s === "string" ? s : String(s)
  } catch {
    return "[toString threw]"
  }
}

function safeGet(input: object, key: PropertyKey): unknown {
  try {
    return (input as any)[key]
  } catch {
    return "[property access threw]"
  }
}

/**
 * Stringifies a value to JSON safely, silently dropping circular references.
 *
 * **When to use**
 *
 * Use when you need valid JSON output, unlike `format`, and the input may
 * contain circular references that should be silently omitted rather than
 * throwing a `TypeError`.
 *
 * **Details**
 *
 * Uses `JSON.stringify` internally with a replacer that tracks the current
 * object ancestry. Circular references are replaced with `undefined`, which
 * omits them from object output. `Redactable` values are automatically redacted
 * before serialization. `BigInt` values are stringified with an `n` suffix.
 * `Error` instances without a `toJSON` property include their enumerable
 * properties plus `name` and `message`. Errors with `toJSON` keep their custom
 * representation. Other values follow standard `JSON.stringify` behavior. The
 * `space` parameter controls indentation and defaults to `0`.
 *
 * **Gotchas**
 *
 * When the root input is `undefined`, a symbol, or a function, `formatJson`
 * returns `"null"` instead of the `undefined` returned by `JSON.stringify`.
 * Nested values retain standard `JSON.stringify` behavior.
 *
 * **Example** (Formatting compact JSON)
 *
 * ```ts import.meta.vitest
 * import { Formatter } from "effect"
 *
 * Formatter.formatJson({ name: "Alice", age: 30 }) // => "{\"name\":\"Alice\",\"age\":30}"
 * ```
 *
 * **Example** (Handling circular references)
 *
 * ```ts import.meta.vitest
 * import { Formatter } from "effect"
 *
 * const obj: any = { name: "test" }
 * obj.self = obj
 * Formatter.formatJson(obj) // => "{\"name\":\"test\"}"
 * ```
 *
 * **Example** (Pretty-printed JSON)
 *
 * ```ts import.meta.vitest
 * import { Formatter } from "effect"
 *
 * const output = Formatter.formatJson({ name: "Alice", age: 30 }, { space: 2 })
 * output // => "{\n  \"name\": \"Alice\",\n  \"age\": 30\n}"
 * ```
 *
 * @see {@link format}
 * @see {@link Formatter}
 * @category serialization
 * @since 4.0.0
 */
export function formatJson(input: unknown, options?: {
  readonly space?: number | string | undefined
}): string {
  const ancestors: Array<object> = []
  return JSON.stringify(
    input,
    function(this: object, key: string, value: unknown) {
      const original = Object.getOwnPropertyDescriptor(this, key)?.value
      const redacted = Predicate.hasProperty(original, symbolRedactable)
        ? redact(original)
        : redact(value)
      if (typeof redacted === "bigint") {
        return format(redacted)
      }
      if (typeof redacted !== "object" || redacted === null) {
        return redacted
      }
      const current = redacted instanceof Error && !Predicate.hasProperty(redacted, "toJSON")
        ? { ...redacted, name: redacted.name, message: redacted.message }
        : redacted
      while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
        ancestors.pop()
      }
      if (ancestors.includes(redacted)) {
        return undefined // circular reference
      }
      ancestors.push(redacted)
      if (current !== redacted) {
        ancestors.push(current)
      }
      return current
    },
    options?.space
  ) ?? "null"
}
