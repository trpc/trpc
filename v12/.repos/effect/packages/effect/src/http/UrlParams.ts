/**
 * Models URL query parameters as ordered string pairs.
 *
 * `UrlParams` is used for HTTP client query strings, URL-encoded form bodies,
 * and server-side decoding. Values can be built from records, iterables, or
 * native `URLSearchParams`, then updated, serialized, converted to a `URL`, or
 * decoded with schemas.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Context from "../Context.ts"
import * as Equal from "../Equal.ts"
import * as Equ from "../Equivalence.ts"
import { dual } from "../Function.ts"
import * as Hash from "../Hash.ts"
import type { Inspectable } from "../Inspectable.ts"
import { PipeInspectableProto } from "../internal/core.ts"
import * as InternalRecord from "../internal/record.ts"
import * as Option from "../Option.ts"
import type { Pipeable } from "../Pipeable.ts"
import { hasProperty } from "../Predicate.ts"
import type { ReadonlyRecord } from "../Record.ts"
import * as Redactable from "../Redactable.ts"
import * as Redacted from "../Redacted.ts"
import * as Tuple from "../Tuple.ts"
import * as Headers from "./Headers.ts"
import * as internal from "./internal/urlParams.ts"

const TypeId = "~effect/http/UrlParams"

/**
 * Immutable collection of URL query parameters.
 *
 * **Details**
 *
 * Parameters are ordered key-value pairs, and a key can repeat. Each value is a
 * string or a `Redacted` string, which is sent unwrapped. Inspection redacts
 * `Redacted` values and values whose names match `CurrentRedactedNames`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface UrlParams
  extends Pipeable, Inspectable, Redactable.Redactable, Iterable<readonly [string, string | Redacted.Redacted]>
{
  readonly [TypeId]: typeof TypeId
  readonly params: ReadonlyArray<readonly [string, string | Redacted.Redacted]>
}

/**
 * Returns `true` when a value is a `UrlParams` instance.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isUrlParams = (u: unknown): u is UrlParams => hasProperty(u, TypeId)

/**
 * Input accepted when constructing `UrlParams`.
 *
 * **Details**
 *
 * Values can be provided as a coercible record, an iterable of key-value pairs, or
 * a native `URLSearchParams` value.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Input =
  | UrlParams
  | CoercibleRecordInput
  | Iterable<readonly [string, Coercible]>
  | URLSearchParams

type CoercibleRecordInput = CoercibleRecord & {
  readonly [Symbol.iterator]?: never
}

/**
 * Value that can be converted into a URL parameter string.
 *
 * **Details**
 *
 * `Redacted` values are stored wrapped and sent unwrapped.
 *
 * **Gotchas**
 *
 * `undefined` values are skipped when constructing from input.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Coercible = string | number | bigint | boolean | null | undefined | Redacted.Redacted

/**
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
type CoercibleRecordField<A> = A extends Coercible ? A
  : A extends ReadonlyArray<infer Item> ? ReadonlyArray<Item extends Coercible ? Item : never>
  : A extends object ? CoercibleRecord<A>
  : never

/**
 * Record input whose fields can be coerced into URL parameter values.
 *
 * **Details**
 *
 * Nested records are rendered using bracket notation, and arrays produce repeated
 * parameters.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type CoercibleRecord<A extends object = any> = {
  readonly [K in keyof A]: CoercibleRecordField<A[K]>
}

const Proto = {
  ...PipeInspectableProto,
  [TypeId]: TypeId,
  [Symbol.iterator](this: UrlParams) {
    return this.params[Symbol.iterator]()
  },
  [Redactable.symbolRedactable](this: UrlParams, context: Context.Context<never>): unknown {
    return {
      _id: "UrlParams",
      params: Object.fromEntries(redact(this, Context.get(context, CurrentRedactedNames)))
    }
  },
  toJSON(this: UrlParams): unknown {
    return Redactable.redact(this)
  },
  [Equal.symbol](this: UrlParams, that: UrlParams): boolean {
    return Equivalence(this, that)
  },
  [Hash.symbol](this: UrlParams): number {
    return Hash.array(this.params.flat())
  }
}

/**
 * Creates `UrlParams` from ordered key-value pairs.
 *
 * **Details**
 *
 * The input pairs are used as-is and are not coerced or normalized.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (params: ReadonlyArray<readonly [string, string | Redacted.Redacted]>): UrlParams => {
  const self = Object.create(Proto)
  self.params = params
  return self
}

/**
 * Creates `UrlParams` from a supported input shape.
 *
 * **Details**
 *
 * Primitive values are converted to strings, arrays produce repeated parameters,
 * nested records use bracket notation, and `undefined` values are omitted.
 * `Redacted` values are kept as-is.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromInput = (input: Input): UrlParams => {
  if (isUrlParams(input)) {
    return input
  }
  const parsed = fromInputNested(input)
  const out: Array<[string, string | Redacted.Redacted]> = []
  for (let i = 0; i < parsed.length; i++) {
    if (Array.isArray(parsed[i][0])) {
      const [keys, value] = parsed[i] as [Array<string>, string | Redacted.Redacted]
      out.push([`${keys[0]}[${keys.slice(1).join("][")}]`, value])
    } else {
      out.push(parsed[i] as [string, string | Redacted.Redacted])
    }
  }
  return make(out)
}

const fromInputNested = (input: Input): Array<[string | Array<string>, string | Redacted.Redacted]> => {
  const entries = typeof (input as any)[Symbol.iterator] === "function"
    ? Arr.fromIterable(input as Iterable<readonly [string, Coercible]>)
    : Object.entries(input)
  const out: Array<[string | Array<string>, string | Redacted.Redacted]> = []
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (value[i] !== undefined) {
          out.push([key, coerce(value[i])])
        }
      }
    } else if (value !== null && typeof value === "object" && !Redacted.isRedacted(value)) {
      const nested = fromInputNested(value as CoercibleRecord)
      for (const [k, v] of nested) {
        out.push([[key, ...(typeof k === "string" ? [k] : k)], v])
      }
    } else if (value !== undefined) {
      out.push([key, coerce(value)])
    }
  }
  return out
}

const coerce = (value: Coercible): string | Redacted.Redacted => Redacted.isRedacted(value) ? value : String(value)

/**
 * Provides an order-sensitive `Equivalence` instance for `UrlParams`.
 *
 * **Details**
 *
 * Two values are equivalent when they contain the same key-value pairs in the same
 * order.
 *
 * @stability unstable
 * @category instances
 * @since 4.0.0
 */
export const Equivalence: Equ.Equivalence<UrlParams> = Equ.make<UrlParams>((a, b) =>
  arrayEquivalence(a.params, b.params)
)

const arrayEquivalence = Arr.makeEquivalence(
  Tuple.makeEquivalence([Equ.strictEqual<string>(), Equal.asEquivalence<string | Redacted.Redacted>()])
)

/**
 * An empty `UrlParams` value.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const empty: UrlParams = make([])

/**
 * Returns all values for a query parameter key in insertion order.
 *
 * **Details**
 *
 * Returns an empty array when the key is absent.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const getAll: {
  (key: string): (self: UrlParams) => ReadonlyArray<string>
  (self: UrlParams, key: string): ReadonlyArray<string>
} = dual(
  2,
  (self: UrlParams, key: string): ReadonlyArray<string> =>
    Arr.reduce(self.params, [] as Array<string>, (acc, [k, value]) => {
      if (k === key) {
        acc.push(internal.unwrap(value))
      }
      return acc
    })
)

/**
 * Returns the first value for a query parameter key safely.
 *
 * **When to use**
 *
 * Use when duplicate query parameters are ordered and the first occurrence has
 * precedence.
 *
 * **Details**
 *
 * Returns `Option.none` when the key is absent.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const getFirst: {
  (key: string): (self: UrlParams) => Option.Option<string>
  (self: UrlParams, key: string): Option.Option<string>
} = dual(
  2,
  (self: UrlParams, key: string): Option.Option<string> =>
    Arr.findFirst(self.params, ([k]) => k === key).pipe(
      Option.map(([, value]) => internal.unwrap(value))
    )
)

/**
 * Returns the last value for a query parameter key safely.
 *
 * **When to use**
 *
 * Use when duplicate query parameters are ordered and the last occurrence has
 * precedence.
 *
 * **Details**
 *
 * Returns `Option.none` when the key is absent.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const getLast: {
  (key: string): (self: UrlParams) => Option.Option<string>
  (self: UrlParams, key: string): Option.Option<string>
} = dual(2, (self: UrlParams, key: string): Option.Option<string> =>
  Arr.findLast(self.params, ([k]) => k === key).pipe(
    Option.map(([, value]) => internal.unwrap(value))
  ))

/**
 * Sets a query parameter to a single value.
 *
 * **Details**
 *
 * Existing values for the same key are removed, and the new value is appended to
 * the end.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const set: {
  (key: string, value: Coercible): (self: UrlParams) => UrlParams
  (self: UrlParams, key: string, value: Coercible): UrlParams
} = dual(3, (self: UrlParams, key: string, value: Coercible): UrlParams =>
  make(
    Arr.append(
      Arr.filter(self.params, ([k]) => k !== key),
      [key, coerce(value)]
    )
  ))

/**
 * Transforms the underlying ordered key-value pairs of `UrlParams`.
 *
 * **Details**
 *
 * The result is wrapped in a new `UrlParams` value.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const transform: {
  (f: (params: UrlParams["params"]) => UrlParams["params"]): (self: UrlParams) => UrlParams
  (self: UrlParams, f: (params: UrlParams["params"]) => UrlParams["params"]): UrlParams
} = dual(
  2,
  (self: UrlParams, f: (params: UrlParams["params"]) => UrlParams["params"]): UrlParams => make(f(self.params))
)

/**
 * Sets multiple query parameters from input.
 *
 * **Details**
 *
 * Keys present in the input replace existing values for those keys, while
 * unmentioned existing parameters are preserved.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setAll: {
  (input: Input): (self: UrlParams) => UrlParams
  (self: UrlParams, input: Input): UrlParams
} = dual(2, (self: UrlParams, input: Input): UrlParams => {
  const params = fromInput(input).params.slice()
  const keys = new Set()
  for (let i = 0; i < params.length; i++) {
    keys.add(params[i][0])
  }
  for (let i = 0; i < self.params.length; i++) {
    if (keys.has(self.params[i][0])) continue
    params.push(self.params[i])
  }
  return make(params)
})

/**
 * Appends a query parameter value without removing existing values for the key.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const append: {
  (key: string, value: Coercible): (self: UrlParams) => UrlParams
  (self: UrlParams, key: string, value: Coercible): UrlParams
} = dual(3, (self: UrlParams, key: string, value: Coercible): UrlParams =>
  make(Arr.append(
    self.params,
    [key, coerce(value)]
  )))

/**
 * Appends all query parameters produced from the supplied input.
 *
 * **Details**
 *
 * Existing parameters are preserved.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const appendAll: {
  (input: Input): (self: UrlParams) => UrlParams
  (self: UrlParams, input: Input): UrlParams
} = dual(2, (self: UrlParams, input: Input): UrlParams => transform(self, Arr.appendAll(fromInput(input).params)))

/**
 * Removes all query parameter values for the specified key.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const remove: {
  (key: string): (self: UrlParams) => UrlParams
  (self: UrlParams, key: string): UrlParams
} = dual(2, (self: UrlParams, key: string): UrlParams => transform(self, Arr.filter(([k]) => k !== key)))

/**
 * Serializes `UrlParams` to a URL query string without a leading question mark.
 *
 * **Gotchas**
 *
 * The output contains the unwrapped values of `Redacted` parameters.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toString = (input: Input): string =>
  new URLSearchParams(fromInput(input).params.map(([key, value]) => [key, internal.unwrap(value)])).toString()

/**
 * Builds a `Record` containing all the key-value pairs in the given `UrlParams`
 * as `string` (if only one value for a key) or a `NonEmptyArray<string>`
 * (when more than one value for a key)
 *
 * **Example** (Converting parameters to a record)
 *
 * ```ts import.meta.vitest
 * import { UrlParams } from "effect/http"
 *
 * const urlParams = UrlParams.fromInput({
 *   a: 1,
 *   b: true,
 *   c: "string",
 *   e: [1, 2, 3]
 * })
 * UrlParams.toRecord(urlParams) // => { a: "1", b: "true", c: "string", e: ["1", "2", "3"] }
 * ```
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toRecord = (self: UrlParams): Record<string, string | Arr.NonEmptyArray<string>> => {
  const out: Record<string, string | Arr.NonEmptyArray<string>> = {}
  for (const [k, v] of self.params) {
    const value = internal.unwrap(v)
    if (!Object.hasOwn(out, k)) {
      InternalRecord.assignProperty(out, k, value)
    } else {
      const current = out[k]
      if (typeof current === "string") {
        InternalRecord.assignProperty(out, k, [current, value])
      } else {
        current.push(value)
      }
    }
  }
  return out
}

/**
 * Builds a readonly record from `UrlParams`.
 *
 * **Details**
 *
 * Keys with one value map to a string, and keys with multiple values map to a
 * non-empty readonly array of strings.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toReadonlyRecord: (self: UrlParams) => ReadonlyRecord<string, string | Arr.NonEmptyReadonlyArray<string>> =
  toRecord as any

/**
 * Returns the parameter pairs with selected values wrapped in `Redacted`.
 *
 * **Details**
 *
 * Keeps `Redacted` values and wraps values whose names match `isRedactedName`,
 * preserving order and repeated names.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const redact: {
  (
    key: string | RegExp | ReadonlyArray<string | RegExp>
  ): (self: UrlParams) => Array<[string, string | Redacted.Redacted<string>]>
  (
    self: UrlParams,
    key: string | RegExp | ReadonlyArray<string | RegExp>
  ): Array<[string, string | Redacted.Redacted<string>]>
} = dual(
  2,
  (
    self: UrlParams,
    key: string | RegExp | ReadonlyArray<string | RegExp>
  ): Array<[string, string | Redacted.Redacted<string>]> => {
    const patterns: ReadonlyArray<string | RegExp> = Array.isArray(key) ? key : [key as string | RegExp]
    return self.params.map(([name, value]) => [
      name,
      typeof value === "string" && isRedactedName(name, patterns) ? Redacted.make(value) : value
    ])
  }
)

/**
 * Checks whether a parameter name matches one of the redaction patterns.
 *
 * **Details**
 *
 * String patterns match case-insensitively; regular expressions test the name.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const isRedactedName: (name: string, patterns: ReadonlyArray<string | RegExp>) => boolean =
  Headers.isRedactedName

/**
 * Redacts URL userinfo and the values of matching query parameters.
 *
 * **Details**
 *
 * Replaces userinfo with `REDACTED:REDACTED` and query values with `REDACTED`
 * when their decoded names match `isRedactedName`. Preserves all other text.
 * When names are omitted, uses the current fiber's `CurrentRedactedNames`,
 * falling back to the defaults outside a fiber.
 *
 * **Example** (Redacting a signed URL)
 *
 * ```ts import.meta.vitest
 * import { UrlParams } from "effect/http"
 *
 * const url = UrlParams.redactUrl("https://bucket.test/file?Signature=abc&size=1")
 * url // => "https://bucket.test/file?Signature=REDACTED&size=1"
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const redactUrl = (
  url: string,
  redactedNames: ReadonlyArray<string | RegExp> = currentRedactedNames()
): string => {
  if (url.includes("@")) url = redactUserinfo(url)
  const queryStart = url.indexOf("?")
  if (queryStart === -1 || redactedNames.length === 0) return url
  const hashStart = url.indexOf("#")
  if (hashStart !== -1 && hashStart < queryStart) return url
  const queryEnd = hashStart === -1 ? url.length : hashStart
  return url.slice(0, queryStart + 1) + redactQuery(url.slice(queryStart + 1, queryEnd), redactedNames) +
    url.slice(queryEnd)
}

const authorityStart = /^(?:(https?|ftp|wss?):[/\\]*|[a-z][a-z\d+.-]*:\/\/|[/\\]{2,})/i
const specialAuthorityEnd = /[/\\?#]/
const authorityEnd = /[/?#]/

// Normalize only to locate userinfo; offsets preserve the original URL spelling.
const redactUserinfo = (url: string): string => {
  let normalized = ""
  const offsets: Array<number> = []
  for (let i = 0; i < url.length; i++) {
    const code = url.charCodeAt(i)
    if (code === 9 || code === 10 || code === 13 || (normalized === "" && code <= 32)) continue
    normalized += url[i]
    offsets.push(i)
  }
  const authority = authorityStart.exec(normalized)
  if (authority === null) return url
  const start = authority[0].length
  const special = authority[1] !== undefined || !authority[0].includes(":")
  const rest = normalized.slice(start)
  const end = rest.search(special ? specialAuthorityEnd : authorityEnd)
  const userinfoEnd = (end === -1 ? rest : rest.slice(0, end)).lastIndexOf("@")
  return userinfoEnd === -1
    ? url
    : url.slice(0, offsets[start]) + "REDACTED:REDACTED" + url.slice(offsets[start + userinfoEnd])
}

const redactQuery = (query: string, redactedNames: ReadonlyArray<string | RegExp>): string =>
  query.split("&").map((part) => {
    const index = part.indexOf("=")
    return index !== -1 && isRedactedName(decodeQueryKey(part.slice(0, index)), redactedNames)
      ? part.slice(0, index + 1) + "REDACTED"
      : part
  }).join("&")

const decodeQueryKey = (key: string): string => {
  if (!key.includes("%") && !key.includes("+")) return key
  try {
    return decodeURIComponent(key.replace(/\+/g, " "))
  } catch {
    return key
  }
}

const currentRedactedNames = (): ReadonlyArray<string | RegExp> =>
  Context.get((globalThis as any)[Redactable.currentFiberTypeId]?.context ?? Context.empty(), CurrentRedactedNames)

/**
 * Query parameter names or patterns to redact in inspection, spans and errors.
 *
 * **Details**
 *
 * Defaults match the OpenTelemetry `url.full` list: `X-Amz-Signature`,
 * `X-Amz-Credential`, `X-Amz-Security-Token`, `AWSAccessKeyId`, `Signature`,
 * `sig` and `X-Goog-Signature`.
 * A custom list replaces the defaults. Matching uses `isRedactedName`.
 * Redaction leaves request URLs and parameter values unchanged. `Redacted`
 * values are redacted regardless of this list.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const CurrentRedactedNames = Context.Reference<
  ReadonlyArray<string | RegExp>
>("effect/http/UrlParams/CurrentRedactedNames", {
  defaultValue: () => [
    "X-Amz-Signature",
    "X-Amz-Credential",
    "X-Amz-Security-Token",
    "AWSAccessKeyId",
    "Signature",
    "sig",
    "X-Goog-Signature"
  ]
})
