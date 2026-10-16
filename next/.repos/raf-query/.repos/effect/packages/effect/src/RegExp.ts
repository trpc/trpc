/**
 * Tools for working with JavaScript regular expressions from the Effect module
 * namespace. The module exposes the native `RegExp` constructor, a guard for
 * narrowing unknown values, and escaping for literal text that will be embedded
 * in a pattern.
 *
 * Reach for `RegExp` when you need to build a regular expression from user or
 * data-driven text, check whether an unknown value is already a `RegExp`, or
 * access the native constructor without leaving the Effect namespace.
 *
 * @since 2.0.0
 */
import * as predicate from "./Predicate.ts"

/**
 * Exposes the JavaScript regular expression constructor from `globalThis`.
 *
 * **When to use**
 *
 * Use to construct JavaScript regular expressions through the Effect module
 * namespace.
 *
 * **Example** (Creating a regular expression)
 *
 * ```ts import.meta.vitest
 * import { RegExp } from "effect"
 *
 * const pattern = new RegExp.RegExp("hello", "i")
 * pattern // => /hello/i
 * pattern.test("Hello World") // => true
 * pattern.test("goodbye") // => false
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const RegExp = globalThis.RegExp

/**
 * Checks whether a value is a `RegExp`.
 *
 * **When to use**
 *
 * Use to validate unknown input before treating it as a regular expression.
 *
 * **Example** (Checking for regular expressions)
 *
 * ```ts import.meta.vitest
 * import { RegExp } from "effect"
 *
 * RegExp.isRegExp(/a/) // => true
 * RegExp.isRegExp("a") // => false
 * ```
 *
 * @category guards
 * @since 3.9.0
 */
export const isRegExp: (input: unknown) => input is RegExp = predicate.isRegExp

/**
 * Escapes special characters in a regular expression pattern.
 *
 * **When to use**
 *
 * Use to turn literal text into a safe regular expression pattern fragment.
 *
 * **Example** (Escaping a pattern string)
 *
 * ```ts import.meta.vitest
 * import { RegExp } from "effect"
 *
 * RegExp.escape("a*b") // => "a\\*b"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const escape = (string: string): string => string.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")
