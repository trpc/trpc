/**
 * Defines Effect's type-level unification protocol.
 *
 * Unification collapses unions of protocol-enabled values into their public data
 * types. It is mostly for maintainers of Effect data types and advanced library
 * authors; application code usually benefits from it through APIs such as
 * `Effect`, `Option`, `Result`, `Stream`, `Layer`, and `Match`. This module
 * exports the protocol symbols, the `Unify` type that performs normalization,
 * and `unify`, an identity function that changes only the inferred type.
 *
 * @since 2.0.0
 */

import { identity } from "./Function.ts"

/**
 * Defines the unique symbol used to identify unification behavior in Effect types.
 *
 * **When to use**
 *
 * Use to define the widened type produced by the `Unify` protocol for a custom
 * protocol-enabled data type.
 *
 * **Details**
 *
 * This symbol is a type-level protocol key. It describes how a protocol-enabled
 * type widens during unification and has no runtime behavior.
 *
 * @see {@link typeSymbol} for storing the source type information used during unification
 * @see {@link ignoreSymbol} for excluding protocol entries from unification
 *
 * @category symbols
 * @since 2.0.0
 */
export declare const unifySymbol: unique symbol

/**
 * The type of the unifySymbol.
 *
 * **When to use**
 *
 * Use to reference the unification behavior property key in type-level
 * protocol definitions.
 *
 * **Details**
 *
 * This type represents the unique symbol used for identifying unification
 * behavior in Effect types. It's typically used in type-level operations
 * to enable automatic type unification.
 *
 * @category symbols
 * @since 2.0.0
 */
export type unifySymbol = typeof unifySymbol

/**
 * Defines the unique symbol used to identify the type information for unification.
 *
 * **When to use**
 *
 * Use when you need a type-level protocol key that exposes the source type
 * read by `Unify` from a protocol-enabled data type.
 *
 * **Details**
 *
 * This symbol is a type-level protocol key. It stores the source type that
 * unification reads when widening protocol-enabled values.
 *
 * @see {@link unifySymbol} for defining how protocol entries widen
 *
 * @category symbols
 * @since 2.0.0
 */
export declare const typeSymbol: unique symbol

/**
 * The type of the typeSymbol.
 *
 * **When to use**
 *
 * Use to reference the type information property key in type-level protocol
 * definitions.
 *
 * **Details**
 *
 * This type represents the unique symbol used for storing type information
 * in types that support unification. It's used in type-level operations
 * to access and manipulate type information.
 *
 * @category symbols
 * @since 2.0.0
 */
export type typeSymbol = typeof typeSymbol

/**
 * Defines the unique symbol used to specify types that should be ignored during unification.
 *
 * **When to use**
 *
 * Use to hide helper protocol entries from `Unify` when they should not
 * contribute to the widened type.
 *
 * **Details**
 *
 * This symbol is a type-level protocol key. It lists protocol entries that
 * unification should ignore when computing the widened type.
 *
 * @see {@link unifySymbol} for defining the protocol entries being filtered
 *
 * @category symbols
 * @since 2.0.0
 */
export declare const ignoreSymbol: unique symbol

/**
 * The type of the ignoreSymbol.
 *
 * **When to use**
 *
 * Use to reference the ignored-property key in type-level protocol
 * definitions.
 *
 * **Details**
 *
 * This type represents the unique symbol used for marking types that should
 * be ignored during unification operations. It's used in type-level operations
 * to exclude specific types from the unification process.
 *
 * @category symbols
 * @since 2.0.0
 */
export type ignoreSymbol = typeof ignoreSymbol

type MaybeReturn<F> = F extends () => infer R ? R : NonNullable<F>

type Keys<X extends [any, any]> = X extends [infer A, infer Ignore] ? Exclude<keyof A, Ignore>
  : never

type Values<X extends [any, any]> = X extends [infer A, infer Ignore]
  ? Keys<[A, Ignore]> extends infer K ? K extends keyof A ? MaybeReturn<A[K]> : never : never
  : never

type Ignore<X> = X extends { [ignoreSymbol]?: infer Obj } ? keyof NonNullable<Obj>
  : never

type ExtractTypes<
  X
> = X extends {
  [typeSymbol]?: infer _Type
  [unifySymbol]?: infer _Unify
} ? [NonNullable<_Unify>, Ignore<X>]
  : never

type FilterIn<A> = A extends any ? typeSymbol extends keyof A ? A : never : never

type FilterInUnmatched<A, K> = A extends any
  ? typeSymbol extends keyof A
    ? A extends { [unifySymbol]?: infer U } ? [Extract<keyof NonNullable<U>, K>] extends [never] ? A : never
    : A
  : never
  : never

type FilterOut<A> = A extends any ? typeSymbol extends keyof A ? never : A : never

/**
 * Unifies types that implement the unification protocol.
 *
 * **When to use**
 *
 * Use to normalize unions of types that expose Effect's unification protocol.
 *
 * **Details**
 *
 * This type performs automatic type unification for types that contain
 * the unification symbols (`unifySymbol`, `typeSymbol`, `ignoreSymbol`).
 * It's primarily used internally by the Effect type system to handle
 * complex type unions and provide better type inference.
 *
 * **Example** (Unifying protocol types)
 *
 * ```ts import.meta.vitest
 * import type { Unify } from "effect"
 *
 * // Example of types that can be unified
 * type UnifiableA = {
 *   value: string
 *   [Unify.typeSymbol]?: string
 *   [Unify.unifySymbol]?: { String: () => string }
 * }
 *
 * type UnifiableB = {
 *   value: number
 *   [Unify.typeSymbol]?: number
 *   [Unify.unifySymbol]?: { Number: () => number }
 * }
 *
 * // Unify automatically handles the union
 * type Unified = Unify.Unify<UnifiableA | UnifiableB>
 *
 * const witness: Unified = "value"
 * ```
 *
 * @see {@link unify} for applying this normalization to a value or function
 *
 * @category models
 * @since 2.0.0
 */
export type Unify<A> = Values<
  ExtractTypes<
    (
      & FilterIn<A>
      & { [typeSymbol]: A }
    )
  >
> extends infer Z ?
    | Z
    | FilterInUnmatched<
      A,
      Keys<
        ExtractTypes<
          (
            & FilterIn<A>
            & { [typeSymbol]: A }
          )
        >
      >
    >
    | FilterOut<A>
  : never

/**
 * Applies `Unify` to a value or function return type at compile time.
 *
 * **When to use**
 *
 * Use to keep a value or function unchanged at runtime while normalizing its
 * inferred type with Effect's unification protocol.
 *
 * **Details**
 *
 * This is an identity function at runtime. For functions, the returned function
 * has the same runtime behavior while its return type is normalized with the
 * Effect unification protocol.
 *
 * **Example** (Unifying values and function results)
 *
 * ```ts import.meta.vitest
 * import { Unify } from "effect"
 *
 * // Unify a simple value
 * const unifiedValue = Unify.unify("hello") // => "hello"
 * // Type: string
 *
 * // Unify a function result
 * const createValue = () => ({ value: "test" })
 *
 * const unifiedFunction = Unify.unify(createValue)
 * unifiedFunction().value // => "test"
 *
 * // Unify with curried functions
 * const curriedFunction = (a: string) => (b: number) => ({ result: a + b })
 * const unifiedCurried = Unify.unify(curriedFunction)
 * // Type: (a: string) => (b: number) => Unify<{ result: string }>
 * unifiedCurried("value-")(1).result // => "value-1"
 * ```
 *
 * @see {@link Unify} for the type-level normalization applied by this helper
 *
 * @category utility types
 * @since 2.0.0
 */
export const unify: {
  <
    Args extends Array<any>,
    Args2 extends Array<any>,
    Args3 extends Array<any>,
    Args4 extends Array<any>,
    Args5 extends Array<any>,
    T
  >(
    x: (...args: Args) => (...args: Args2) => (...args: Args3) => (...args: Args4) => (...args: Args5) => T
  ): (...args: Args) => (...args: Args2) => (...args: Args3) => (...args: Args4) => (...args: Args5) => Unify<T>
  <
    Args extends Array<any>,
    Args2 extends Array<any>,
    Args3 extends Array<any>,
    Args4 extends Array<any>,
    T
  >(
    x: (...args: Args) => (...args: Args2) => (...args: Args3) => (...args: Args4) => T
  ): (...args: Args) => (...args: Args2) => (...args: Args3) => (...args: Args4) => Unify<T>
  <
    Args extends Array<any>,
    Args2 extends Array<any>,
    Args3 extends Array<any>,
    T
  >(
    x: (...args: Args) => (...args: Args2) => (...args: Args3) => T
  ): (...args: Args) => (...args: Args2) => (...args: Args3) => Unify<T>
  <
    Args extends Array<any>,
    Args2 extends Array<any>,
    T
  >(
    x: (...args: Args) => (...args: Args2) => T
  ): (...args: Args) => (...args: Args2) => Unify<T>
  <
    Args extends Array<any>,
    T
  >(x: (...args: Args) => T): (...args: Args) => Unify<T>
  <T>(x: T): Unify<T>
} = identity as any
