/**
 * Wraps sensitive values so normal output does not reveal them.
 *
 * A `Redacted<A>` shows a redacted placeholder in string, JSON, and inspection
 * output, while still storing the original value for trusted code that needs to
 * recover it. This helps reduce accidental leaks in logs and diagnostics. This
 * module includes constructors, runtime checks, value recovery, wiping of stored
 * values, and comparison helpers that avoid exposing the wrapped value at the
 * call site.
 *
 * @since 3.3.0
 */
import * as Equal from "./Equal.ts"
import * as Equivalence from "./Equivalence.ts"
import * as Hash from "./Hash.ts"
import { PipeInspectableProto } from "./internal/core.ts"
import * as redacted from "./internal/redacted.ts"
import type { Pipeable } from "./Pipeable.ts"
import { hasProperty, isString } from "./Predicate.ts"
import type { Covariant } from "./Types.ts"

const TypeId = "~effect/Redacted"

/**
 * A wrapper for sensitive values whose string, JSON, and inspection output is
 * redacted.
 *
 * **When to use**
 *
 * Use to carry sensitive values while reducing accidental exposure in string,
 * JSON, and inspection output.
 *
 * **Gotchas**
 *
 * The underlying value is still stored in memory and can be recovered with
 * `Redacted.value` until the wrapper is wiped or becomes unreachable. Use
 * `Redacted` to reduce accidental disclosure in logs and diagnostics, not as a
 * cryptographic protection mechanism.
 *
 * **Example** (Creating redacted values)
 *
 * ```ts import.meta.vitest
 * import { Redacted } from "effect"
 *
 * // Create a redacted value to protect sensitive information
 * const apiKey = Redacted.make("secret-key")
 * const userPassword = Redacted.make("user-password")
 *
 * // TypeScript will infer the types as Redacted<string>
 * Array.of(String(apiKey), String(userPassword)) // => ["<redacted>", "<redacted>"]
 * ```
 *
 * @category models
 * @since 3.3.0
 */
export interface Redacted<out A = string> extends Redacted.Variance<A>, Equal.Equal, Pipeable {
  readonly label: string | undefined
}

/**
 * Namespace containing type-level members associated with `Redacted` values.
 *
 * **When to use**
 *
 * Use to access type-level helpers associated with `Redacted`.
 *
 * **Example** (Using namespace utilities)
 *
 * ```ts import.meta.vitest
 * import { Redacted } from "effect"
 *
 * // Use the Redacted namespace for type-level operations
 * const secret = Redacted.make("my-secret")
 *
 * // The namespace contains utilities for working with Redacted values
 * Redacted.isRedacted(secret) // => true
 * ```
 *
 * @since 3.3.0
 */
export declare namespace Redacted {
  /**
   * Type-level variance marker for `Redacted`.
   *
   * **When to use**
   *
   * Use when defining internals that need to preserve the covariant value type
   * carried by `Redacted`.
   *
   * **Details**
   *
   * This interface records the covariant value type carried by a `Redacted`
   * value and is not normally referenced directly by users.
   *
   * @category models
   * @since 3.3.0
   */
  export interface Variance<out A> {
    readonly [TypeId]: {
      readonly _A: Covariant<A>
    }
  }

  /**
   * Extracts the underlying value type from a `Redacted` type.
   *
   * **When to use**
   *
   * Use to infer the sensitive value type from an existing `Redacted` type.
   *
   * **Example** (Extracting the redacted value type)
   *
   * ```ts import.meta.vitest
   * import { Redacted } from "effect"
   *
   * type ApiKey = Redacted.Redacted<{ readonly token: string }>
   * type ApiKeyValue = Redacted.Redacted.Value<ApiKey>
   *
   * const rotate = (value: ApiKeyValue): ApiKeyValue => ({
   *   token: `${value.token}:rotated`
   * })
   *
   * rotate({ token: "secret" }) // => { token: "secret:rotated" }
   * ```
   *
   * @category utility types
   * @since 3.3.0
   */
  export type Value<T extends Redacted<any>> = [T] extends [Redacted<infer _A>] ? _A : never
}

/**
 * Returns `true` if a value is a `Redacted` wrapper.
 *
 * **When to use**
 *
 * Use to validate unknown input and narrow it to `Redacted`.
 *
 * **Details**
 *
 * When this function returns `true`, TypeScript narrows the value to
 * `Redacted<unknown>`.
 *
 * **Example** (Checking for redacted values)
 *
 * ```ts import.meta.vitest
 * import { Redacted } from "effect"
 *
 * const secret = Redacted.make("my-secret")
 * const plainString = "not-secret"
 *
 * Redacted.isRedacted(secret) // => true
 * Redacted.isRedacted(plainString) // => false
 * ```
 *
 * @category guards
 * @since 3.3.0
 */
export const isRedacted = (u: unknown): u is Redacted<unknown> => hasProperty(u, TypeId)

/**
 * Creates a `Redacted` wrapper for a sensitive value.
 *
 * **When to use**
 *
 * Use to wrap a sensitive value so normal string, JSON, and inspection output
 * is redacted.
 *
 * **Details**
 *
 * The wrapper redacts string, JSON, and inspection output to reduce accidental
 * disclosure. The original value remains retrievable with `Redacted.value`
 * until the wrapper is wiped or becomes unreachable.
 *
 * **Example** (Creating a redacted value)
 *
 * ```ts import.meta.vitest
 * import { Redacted } from "effect"
 *
 * const API_KEY = Redacted.make("1234567890")
 * String(API_KEY) // => "<redacted>"
 * ```
 *
 * @category constructors
 * @since 3.3.0
 */
export const make = <T>(value: T, options?: {
  readonly label?: string | undefined
}): Redacted<T> => {
  const self = Object.create(Proto)
  if (options?.label) {
    self.label = options.label
  }
  redacted.redactedRegistry.set(self, value)
  return self
}

const Proto = {
  [TypeId]: {
    _A: (_: never) => _
  },
  label: undefined,
  ...PipeInspectableProto,
  toJSON() {
    return this.toString()
  },
  toString() {
    return `<redacted${isString(this.label) ? ":" + this.label : ""}>`
  },
  [Hash.symbol]<T>(this: Redacted<T>): number {
    return Hash.hash(redacted.redactedRegistry.get(this))
  },
  [Equal.symbol]<T>(this: Redacted<T>, that: unknown): boolean {
    return (
      isRedacted(that) &&
      Equal.equals(
        redacted.redactedRegistry.get(this),
        redacted.redactedRegistry.get(that)
      )
    )
  }
}

/**
 * Retrieves the original value from a `Redacted` instance. Use this function
 * with caution, as it exposes the sensitive data.
 *
 * **When to use**
 *
 * Use when you need the underlying sensitive value at a trusted boundary.
 *
 * **Example** (Retrieving a redacted value)
 *
 * ```ts import.meta.vitest
 * import { Redacted } from "effect"
 *
 * const API_KEY = Redacted.make("1234567890")
 *
 * Redacted.value(API_KEY) // => "1234567890"
 * ```
 *
 * @category getters
 * @since 3.3.0
 */
export const value: <T>(self: Redacted<T>) => T = redacted.value

/**
 * Deletes the stored value for a `Redacted` wrapper, making future
 * `Redacted.value` calls on that wrapper fail.
 *
 * **When to use**
 *
 * Use when a `Redacted` wrapper should no longer be able to reveal its stored
 * value.
 *
 * **Gotchas**
 *
 * This unsafe operation does not zero memory and does not affect other
 * references to the original value. It only removes the value from the
 * internal redacted registry.
 *
 * **Example** (Wiping a redacted value)
 *
 * ```ts import.meta.vitest
 * import { Redacted, Result } from "effect"
 *
 * const API_KEY = Redacted.make("1234567890")
 *
 * Redacted.value(API_KEY) // => "1234567890"
 *
 * Redacted.wipeUnsafe(API_KEY)
 *
 * const failure = Result.try({
 *   try: () => Redacted.value(API_KEY),
 *   catch: (error) => (error as Error).message
 * })
 * failure // => Result.fail("Unable to get redacted value")
 * ```
 *
 * @category unsafe
 * @since 4.0.0
 */
export const wipeUnsafe = <T>(self: Redacted<T>): boolean => redacted.redactedRegistry.delete(self)

/**
 * Generates an equivalence relation for `Redacted<A>` values based on an
 * equivalence relation for the underlying values `A`. This function is useful
 * for comparing `Redacted` instances without exposing their contents.
 *
 * **When to use**
 *
 * Use when you need to compare wrapped secrets through an approved equality
 * rule without exposing the underlying values at each comparison site.
 *
 * **Example** (Comparing redacted values)
 *
 * ```ts import.meta.vitest
 * import { Equivalence, Redacted } from "effect"
 *
 * const API_KEY1 = Redacted.make("1234567890")
 * const API_KEY2 = Redacted.make("1-34567890")
 * const API_KEY3 = Redacted.make("1234567890")
 *
 * const equivalence = Redacted.makeEquivalence(Equivalence.strictEqual<string>())
 *
 * equivalence(API_KEY1, API_KEY2) // => false
 * equivalence(API_KEY1, API_KEY3) // => true
 * ```
 *
 * @category instances
 * @since 4.0.0
 */
export const makeEquivalence = <A>(isEquivalent: Equivalence.Equivalence<A>): Equivalence.Equivalence<Redacted<A>> =>
  Equivalence.make((x, y) => isEquivalent(value(x), value(y)))
