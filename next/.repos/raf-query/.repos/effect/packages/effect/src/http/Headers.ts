/**
 * Models HTTP headers for the unstable HTTP client and server modules.
 *
 * `Headers` values are immutable maps keyed by lowercase header name. This
 * module converts common header inputs into that shape, provides helpers for
 * reading and updating header values, and redacts configured sensitive headers
 * when values are inspected.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Equal from "../Equal.ts"
import * as Equ from "../Equivalence.ts"
import { dual } from "../Function.ts"
import * as Hash from "../Hash.ts"
import * as Inspectable from "../Inspectable.ts"
import * as Option from "../Option.ts"
import * as Predicate from "../Predicate.ts"
import * as Record from "../Record.ts"
import * as Redactable from "../Redactable.ts"
import * as Redacted from "../Redacted.ts"
import type { Mutable } from "../Types.ts"

/**
 * Runtime type identifier for `Headers` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: unique symbol = Symbol.for("~effect/http/Headers")

/**
 * Type of the unique symbol used to brand `Headers` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = typeof TypeId

/**
 * Returns `true` if the provided value is a `Headers` value.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isHeaders = (u: unknown): u is Headers => Predicate.hasProperty(u, TypeId)

/**
 * Represents an immutable HTTP header collection keyed by lowercase header name.
 *
 * **Details**
 *
 * `Headers` values also support redaction through the `Redactable` protocol.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Headers extends Redactable.Redactable {
  readonly [TypeId]: TypeId
  readonly [key: string]: string
}

// the properties are folded into the initializer (rather than a separate
// `Object.defineProperties(Proto, ...)` statement) so the whole definition
// is pure-annotated by the build and tree-shakable.
const Proto = Object.defineProperties(Object.create(null), {
  [TypeId]: {
    value: TypeId
  },
  [Redactable.symbolRedactable]: {
    value(this: Headers, context: Context.Context<never>): Record<string, string | Redacted.Redacted<string>> {
      return redact(this, Context.get(context, CurrentRedactedNames))
    }
  },
  toJSON: {
    value(this: Headers) {
      return Redactable.redact(this)
    }
  },
  [Equal.symbol]: {
    value(this: Headers, that: Headers): boolean {
      return Equivalence(this, that)
    }
  },
  [Hash.symbol]: {
    value(this: Headers): number {
      return Hash.structure(this)
    }
  },
  toString: {
    value: Inspectable.BaseProto.toString
  },
  [Inspectable.NodeInspectSymbol]: {
    value: Inspectable.BaseProto[Inspectable.NodeInspectSymbol]
  }
})

const make = (input: Record.ReadonlyRecord<string, string>): Mutable<Headers> =>
  Object.assign(Object.create(Proto), input) as Headers

/**
 * Provides an `Equivalence` instance that compares `Headers` by header names
 * and string values.
 *
 * @stability unstable
 * @category instances
 * @since 4.0.0
 */
export const Equivalence: Equ.Equivalence<Headers> = Record.makeEquivalence(Equ.strictEqual<string>())

/**
 * Input accepted when constructing headers.
 *
 * **Details**
 *
 * Records may contain string values, string arrays, or `undefined`; arrays are joined with `", "`, and `undefined` values are omitted.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Input =
  | Record.ReadonlyRecord<string, string | ReadonlyArray<string> | undefined>
  | Iterable<readonly [string, string]>

/**
 * An empty `Headers` collection.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const empty: Headers = Object.create(Proto)

/**
 * Creates `Headers` from a record or iterable of header entries.
 *
 * **Details**
 *
 * Header names are normalized to lowercase. Array values in record input are joined with `", "`, and `undefined` values are omitted.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromInput: (input?: Input) => Headers = (input) => {
  if (input === undefined) {
    return empty
  } else if (Symbol.iterator in input) {
    const out: Record<string, string> = Object.create(Proto)
    for (const [k, v] of input) {
      out[k.toLowerCase()] = v
    }
    return out as Headers
  }
  const out: Record<string, string> = Object.create(Proto)
  for (const [k, v] of Object.entries(input)) {
    if (Array.isArray(v)) {
      out[k.toLowerCase()] = v.join(", ")
    } else if (v !== undefined) {
      out[k.toLowerCase()] = v as string
    }
  }
  return out as Headers
}

/**
 * Treats an existing record as `Headers` unsafely.
 *
 * **Gotchas**
 *
 * This mutates the record's prototype and does not normalize header names; callers must provide the expected lowercase keys.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromRecordUnsafe = (input: Record.ReadonlyRecord<string, string>): Headers =>
  Object.setPrototypeOf(input, Proto) as Headers

/**
 * Returns `true` when a header with the given name is present.
 *
 * **Details**
 *
 * The lookup lowercases the provided header name.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const has: {
  (key: string): (self: Headers) => boolean
  (self: Headers, key: string): boolean
} = dual<
  (key: string) => (self: Headers) => boolean,
  (self: Headers, key: string) => boolean
>(2, (self, key) => key.toLowerCase() in self)

/**
 * Gets a header value by name safely.
 *
 * **Details**
 *
 * The lookup lowercases the provided header name and returns `Option.none()` when absent.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const get: {
  (key: string): (self: Headers) => Option.Option<string>
  (self: Headers, key: string): Option.Option<string>
} = dual<
  (key: string) => (self: Headers) => Option.Option<string>,
  (self: Headers, key: string) => Option.Option<string>
>(2, (self, key) => Option.fromUndefinedOr(self[key.toLowerCase()]))

/**
 * Returns a new `Headers` collection with the given header set.
 *
 * **Details**
 *
 * The header name is normalized to lowercase.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const set: {
  (key: string, value: string): (self: Headers) => Headers
  (self: Headers, key: string, value: string): Headers
} = dual<
  (key: string, value: string) => (self: Headers) => Headers,
  (self: Headers, key: string, value: string) => Headers
>(3, (self, key, value) => {
  const out = make(self)
  out[key.toLowerCase()] = value
  return out
})

/**
 * Returns a new `Headers` collection with all provided headers set.
 *
 * **Details**
 *
 * Input headers are normalized with `fromInput` and override existing headers with the same lowercase name.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setAll: {
  (headers: Input): (self: Headers) => Headers
  (self: Headers, headers: Input): Headers
} = dual<
  (headers: Input) => (self: Headers) => Headers,
  (self: Headers, headers: Input) => Headers
>(2, (self, headers) =>
  make({
    ...self,
    ...fromInput(headers)
  }))

/**
 * Returns a new `Headers` collection containing headers from both collections.
 *
 * **Details**
 *
 * Headers from the second collection override headers from the first collection with the same name.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const merge: {
  (headers: Headers): (self: Headers) => Headers
  (self: Headers, headers: Headers): Headers
} = dual<
  (headers: Headers) => (self: Headers) => Headers,
  (self: Headers, headers: Headers) => Headers
>(2, (self, headers) => {
  const out = make(self)
  Object.assign(out, headers)
  return out
})

/**
 * Returns a new `Headers` collection with the named header removed.
 *
 * **Details**
 *
 * The provided header name is normalized to lowercase before removal.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const remove: {
  (key: string): (self: Headers) => Headers
  (self: Headers, key: string): Headers
} = dual<
  (key: string) => (self: Headers) => Headers,
  (self: Headers, key: string) => Headers
>(2, (self, key) => {
  const out = make(self)
  delete out[key.toLowerCase()]
  return out
})

/**
 * Returns a new `Headers` collection with each named header removed.
 *
 * **Details**
 *
 * Each provided header name is normalized to lowercase before removal.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const removeMany: {
  (keys: Iterable<string>): (self: Headers) => Headers
  (self: Headers, keys: Iterable<string>): Headers
} = dual<
  (keys: Iterable<string>) => (self: Headers) => Headers,
  (self: Headers, keys: Iterable<string>) => Headers
>(2, (self, keys) => {
  const out = make(self)
  for (const key of keys) {
    delete out[key.toLowerCase()]
  }
  return out
})

/**
 * Returns a plain record with selected header values wrapped in `Redacted`.
 *
 * **Details**
 *
 * String keys are normalized to lowercase before matching; regular expressions are tested against the stored header names.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const redact: {
  (
    key: string | RegExp | ReadonlyArray<string | RegExp>
  ): (self: Headers) => Record<string, string | Redacted.Redacted>
  (
    self: Headers,
    key: string | RegExp | ReadonlyArray<string | RegExp>
  ): Record<string, string | Redacted.Redacted>
} = dual(
  2,
  (
    self: Headers,
    key: string | RegExp | ReadonlyArray<string | RegExp>
  ): Record<string, string | Redacted.Redacted> => {
    const out: Record<string, string | Redacted.Redacted> = { ...self }
    const modify = (key: string | RegExp) => {
      if (typeof key === "string") {
        const k = key.toLowerCase()
        if (k in self) {
          out[k] = Redacted.make(self[k])
        }
      } else {
        for (const name in self) {
          if (name.search(key) !== -1) {
            out[name] = Redacted.make(self[name])
          }
        }
      }
    }
    if (Array.isArray(key)) {
      for (let i = 0; i < key.length; i++) {
        modify(key[i])
      }
    } else {
      modify(key as string | RegExp)
    }
    return out
  }
)

/**
 * Checks whether a header name matches one of the redaction patterns.
 *
 * **Details**
 *
 * String patterns are compared case-insensitively against the header name;
 * regular expressions are tested against it. Use to avoid the record copy of
 * `redact` when only a membership check is needed.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const isRedactedName = (
  name: string,
  patterns: ReadonlyArray<string | RegExp>
): boolean => {
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i]
    if (typeof pattern === "string") {
      if (pattern.toLowerCase() === name.toLowerCase()) {
        return true
      }
    } else if (name.search(pattern) !== -1) {
      return true
    }
  }
  return false
}

/**
 * Context reference listing header names or patterns that should be redacted when `Headers` are inspected or rendered.
 *
 * **Details**
 *
 * Defaults include `authorization`, `cookie`, `set-cookie`, and `x-api-key`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const CurrentRedactedNames = Context.Reference<
  ReadonlyArray<string | RegExp>
>("effect/Headers/CurrentRedactedNames", {
  defaultValue: () => [
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key"
  ]
})
