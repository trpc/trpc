/**
 * The `Symbol` module contains the runtime predicate for JavaScript primitive
 * `symbol` values. It is most useful at boundaries where a value is `unknown`
 * and must be narrowed before it can be used as a symbol key, identifier, or
 * discriminant.
 *
 * @since 2.0.0
 */

import * as predicate from "./Predicate.ts"

/**
 * Checks whether a value is a `symbol`.
 *
 * **When to use**
 *
 * Use to validate unknown input before treating it as a JavaScript `symbol`.
 *
 * **Example** (Checking for symbols)
 *
 * ```ts import.meta.vitest
 * import { Symbol } from "effect"
 *
 * Symbol.isSymbol(globalThis.Symbol.for("a")) // => true
 * Symbol.isSymbol("a") // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isSymbol: (u: unknown) => u is symbol = predicate.isSymbol
