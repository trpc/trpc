/**
 * Defines runtime checks for values.
 *
 * A `Predicate<A>` returns `true` or `false` for an `A`. A
 * `Refinement<A, B>` is a predicate that also narrows the TypeScript type when
 * it succeeds. This module includes guards for common JavaScript values,
 * property and tag checks, tuple and struct checks, boolean combinators, and
 * helpers for composing predicates and refinements.
 *
 * @since 2.0.0
 */
import { dual } from "./Function.ts"
import type { TypeLambda } from "./HKT.ts"
import type { TupleOf, TupleOfAtLeast } from "./Types.ts"

/**
 * A function that decides whether a value of type `A` satisfies a condition.
 *
 * **When to use**
 *
 * Use when you want a reusable boolean check for `A`, especially when you plan
 * to combine checks with {@link and}/{@link or} or pass a predicate to arrays
 * and iterables.
 *
 * **Details**
 *
 * A predicate returns `true` or `false` and never throws by itself. It does not
 * narrow types unless you use `Refinement`.
 *
 * **Example** (Defining a predicate)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const isPositive: Predicate.Predicate<number> = (n) => n > 0
 *
 * isPositive(1) // => true
 * ```
 *
 * @see {@link Refinement}
 * @see {@link mapInput}
 * @see {@link and}
 * @category models
 * @since 2.0.0
 */
export interface Predicate<in A> {
  (a: A): boolean
}

/**
 * Type-level lambda for higher-kinded usage of {@link Predicate}.
 *
 * **When to use**
 *
 * Use when you are defining APIs that abstract over predicates with HKTs and
 * need a `TypeLambda` instance for predicate-based type classes.
 *
 * **Details**
 *
 * This is type-only, creates no runtime value, and does not affect emitted
 * JavaScript.
 *
 * **Example** (Type-level usage)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * type P = Predicate.Predicate<number>
 * type TL = Predicate.PredicateTypeLambda
 *
 * const witness: P = (value) => value > 0
 * witness(1) // => true
 * ```
 *
 * @see {@link Predicate}
 * @category utility types
 * @since 2.0.0
 */
export interface PredicateTypeLambda extends TypeLambda {
  readonly type: Predicate<this["Target"]>
}

/**
 * A predicate that also narrows the input type when it returns `true`.
 *
 * **When to use**
 *
 * Use when you want a runtime check that refines `A` to `B` for TypeScript,
 * especially when composing type guards with {@link compose} or safely
 * checking `unknown` values.
 *
 * **Details**
 *
 * A refinement returns a type predicate (`a is B`). Use it with `if` or
 * `filter` to narrow types.
 *
 * **Example** (Narrowing unknown values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const isString: Predicate.Refinement<unknown, string> = (u): u is string => typeof u === "string"
 *
 * const data: unknown = "hello"
 * if (isString(data)) {
 *   data.toUpperCase() // => "HELLO"
 * }
 * ```
 *
 * @see {@link Predicate}
 * @see {@link compose}
 * @see {@link isString}
 * @category models
 * @since 2.0.0
 */
export interface Refinement<in A, out B extends A> {
  (a: A): a is B
}

/**
 * Type-level utilities for working with {@link Predicate} types.
 *
 * **When to use**
 *
 * Use when you need to extract input types from predicate signatures while
 * writing generic helpers over predicate types.
 *
 * **Details**
 *
 * These utilities are type-only, create no runtime values, and the namespace is
 * erased at runtime.
 *
 * **Example** (Extracting predicate input)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * type IsString = Predicate.Predicate<string>
 * type Input = Predicate.Predicate.In<IsString>
 *
 * const input: Input = "value"
 * ```
 *
 * @see {@link Predicate}
 * @see {@link Refinement}
 * @since 3.6.0
 */
export declare namespace Predicate {
  /**
   * Extracts the input type `A` from a `Predicate<A>`.
   *
   * **When to use**
   *
   * Use when you want to infer the input type from a predicate type while
   * defining generic utilities over predicates.
   *
   * **Details**
   *
   * This is type-only and creates no runtime value. It resolves to `never` if
   * the type does not match `Predicate`.
   *
   * **Example** (Inferring the input type)
   *
   * ```ts import.meta.vitest
   * import { Predicate } from "effect"
   *
   * type P = Predicate.Predicate<number>
   * type Input = Predicate.Predicate.In<P>
   *
   * const input: Input = 1
   * ```
   *
   * @see {@link Predicate.Any}
   * @see {@link Refinement.In}
   * @category utility types
   * @since 3.6.0
   */
  export type In<T extends Any> = [T] extends [Predicate<infer _A>] ? _A : never

  /**
   * A utility type representing any predicate type.
   *
   * **When to use**
   *
   * Use when you need a constraint for "any predicate" in generic code.
   *
   * **Details**
   *
   * This is type-only and creates no runtime value.
   *
   * **Example** (Using generic constraints)
   *
   * ```ts import.meta.vitest
   * import { Predicate } from "effect"
   *
   * type AnyPredicate = Predicate.Predicate.Any
   *
   * const witness: AnyPredicate = () => true
   * witness("value") // => true
   * ```
   *
   * @see {@link Predicate.In}
   * @category utility types
   * @since 3.6.0
   */
  export type Any = Predicate<any>
}

/**
 * Type-level utilities for working with {@link Refinement} types.
 *
 * **When to use**
 *
 * Use when you need to extract input and output types from refinement
 * signatures while writing generic helpers over refinements.
 *
 * **Details**
 *
 * These utilities are type-only, create no runtime values, and the namespace is
 * erased at runtime.
 *
 * **Example** (Extracting refinement types)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * type IsString = Predicate.Refinement<unknown, string>
 * type Input = Predicate.Refinement.In<IsString>
 * type Output = Predicate.Refinement.Out<IsString>
 *
 * const output: Output = "value"
 * ```
 *
 * @see {@link Refinement}
 * @see {@link Predicate}
 * @since 3.6.0
 */
export declare namespace Refinement {
  /**
   * Extracts the input type `A` from a `Refinement<A, B>`.
   *
   * **When to use**
   *
   * Use when you want to infer the input type from a refinement type.
   *
   * **Details**
   *
   * This is type-only and creates no runtime value. It resolves to `never` if
   * the type does not match `Refinement`.
   *
   * **Example** (Inferring the input type)
   *
   * ```ts import.meta.vitest
   * import { Predicate } from "effect"
   *
   * type R = Predicate.Refinement<unknown, string>
   * type Input = Predicate.Refinement.In<R>
   *
   * const input: Input = "value"
   * ```
   *
   * @see {@link Refinement.Out}
   * @see {@link Predicate.In}
   * @category utility types
   * @since 3.6.0
   */

  export type In<T extends Any> = [T] extends [Refinement<infer _A, infer _>] ? _A : never

  /**
   * Extracts the output type `B` from a `Refinement<A, B>`.
   *
   * **When to use**
   *
   * Use when you want to infer the narrowed type from a refinement type.
   *
   * **Details**
   *
   * This is type-only and creates no runtime value. It resolves to `never` if
   * the type does not match `Refinement`.
   *
   * **Example** (Inferring the output type)
   *
   * ```ts import.meta.vitest
   * import { Predicate } from "effect"
   *
   * type R = Predicate.Refinement<unknown, string>
   * type Output = Predicate.Refinement.Out<R>
   *
   * const output: Output = "value"
   * ```
   *
   * @see {@link Refinement.In}
   * @category utility types
   * @since 3.6.0
   */
  export type Out<T extends Any> = [T] extends [Refinement<infer _, infer _B>] ? _B : never

  /**
   * A utility type representing any refinement type.
   *
   * **When to use**
   *
   * Use when you need a constraint for "any refinement" in generic code.
   *
   * **Details**
   *
   * This is type-only and creates no runtime value.
   *
   * **Example** (Using generic constraints)
   *
   * ```ts import.meta.vitest
   * import { Predicate } from "effect"
   *
   * type AnyRefinement = Predicate.Refinement.Any
   *
   * const witness: AnyRefinement = (_): _ is string => true
   * witness("value") // => true
   * ```
   *
   * @see {@link Refinement.In}
   * @see {@link Refinement.Out}
   * @category utility types
   * @since 3.6.0
   */
  export type Any = Refinement<any, any>
}

/**
 * Transforms the input of a predicate using a mapping function.
 *
 * **When to use**
 *
 * Use when you have a predicate on `A` and want to check `B` values by mapping
 * each `B` to an `A`, such as checking lengths or projections.
 *
 * **Details**
 *
 * Returns a new predicate that applies `f` before `self`. There is no
 * additional short-circuiting beyond what `self` does.
 *
 * **Example** (Checking string length)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const isLongerThan2 = Predicate.mapInput((s: string) => s.length)(
 *   (n: number) => n > 2
 * )
 *
 * isLongerThan2("hello") // => true
 * ```
 *
 * @see {@link Predicate}
 * @see {@link and}
 * @see {@link not}
 * @category combinators
 * @since 2.0.0
 */
export const mapInput: {
  <B, A>(f: (b: B) => A): (self: Predicate<A>) => Predicate<B>
  <A, B>(self: Predicate<A>, f: (b: B) => A): Predicate<B>
} = dual(2, <A, B>(self: Predicate<A>, f: (b: B) => A): Predicate<B> => (b) => self(f(b)))

/**
 * Checks whether a readonly array has exactly `n` elements.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard for exact tuple length that narrows
 * `ReadonlyArray<T>` to `TupleOf<N, T>`.
 *
 * **Details**
 *
 * This only checks length, not element types, and returns a refinement on the
 * array type.
 *
 * **Example** (Checking exact length)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const isPair = Predicate.isTupleOf(2)
 *
 * isPair([1, 2]) // => true
 * ```
 *
 * @see {@link isTupleOfAtLeast}
 * @see {@link Tuple}
 * @category guards
 * @since 3.3.0
 */
export const isTupleOf: {
  <N extends number>(n: N): <T>(self: ReadonlyArray<T>) => self is TupleOf<N, T>
  <T, N extends number>(self: ReadonlyArray<T>, n: N): self is TupleOf<N, T>
} = dual(2, <T, N extends number>(self: ReadonlyArray<T>, n: N): self is TupleOf<N, T> => self.length === n)

/**
 * Checks whether a readonly array has at least `n` elements.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard for tuple-like minimum length that
 * narrows `ReadonlyArray<T>` to `TupleOfAtLeast<N, T>`.
 *
 * **Details**
 *
 * This only checks length, not element types, and returns a refinement on the
 * array type.
 *
 * **Example** (Checking minimum length)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const hasAtLeast2 = Predicate.isTupleOfAtLeast(2)
 *
 * hasAtLeast2([1, 2, 3]) // => true
 * ```
 *
 * @see {@link isTupleOf}
 * @see {@link Tuple}
 * @category guards
 * @since 3.3.0
 */
export const isTupleOfAtLeast: {
  <N extends number>(n: N): <T>(self: ReadonlyArray<T>) => self is TupleOfAtLeast<N, T>
  <T, N extends number>(self: ReadonlyArray<T>, n: N): self is TupleOfAtLeast<N, T>
} = dual(2, <T, N extends number>(self: ReadonlyArray<T>, n: N): self is TupleOfAtLeast<N, T> => self.length >= n)

/**
 * Checks whether a value is truthy.
 *
 * **When to use**
 *
 * Use when you want a predicate that mirrors JavaScript truthiness and filters
 * out falsy values like `0`, `""`, and `false`.
 *
 * **Details**
 *
 * This uses `!!input` and treats `0`, `""`, `false`, `null`, and `undefined`
 * as false.
 *
 * **Example** (Filtering truthy values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const values = [0, 1, "", "ok", false]
 * const truthy = values.filter(Predicate.isTruthy) // => [1, "ok"]
 * ```
 *
 * @see {@link isNullish}
 * @see {@link isNotNullish}
 * @category predicates
 * @since 2.0.0
 */
export function isTruthy(input: unknown): boolean {
  return !!input
}

/**
 * Checks whether a value is a `Set`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` runtime guard for `Set` values.
 *
 * **Details**
 *
 * Uses `instanceof Set`.
 *
 * **Example** (Guarding a Set)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = new Set([1, 2])
 *
 * if (Predicate.isSet(data)) {
 *   data.size // => 2
 * }
 * ```
 *
 * @see {@link isMap}
 * @see {@link isIterable}
 * @category guards
 * @since 2.0.0
 */
export function isSet(input: unknown): input is Set<unknown> {
  return input instanceof Set
}

/**
 * Checks whether a value is a `Map`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` runtime guard for `Map` values.
 *
 * **Details**
 *
 * Uses `instanceof Map`.
 *
 * **Example** (Guarding a Map)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = new Map([["a", 1]])
 *
 * if (Predicate.isMap(data)) {
 *   data.size // => 1
 * }
 * ```
 *
 * @see {@link isSet}
 * @see {@link isIterable}
 * @category guards
 * @since 2.0.0
 */
export function isMap(input: unknown): input is Map<unknown, unknown> {
  return input instanceof Map
}

/**
 * Checks whether a value is a `string`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard to narrow an `unknown` value to a
 * string.
 *
 * **Details**
 *
 * Uses `typeof input === "string"`.
 *
 * **Example** (Guarding strings)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = "hi"
 *
 * if (Predicate.isString(data)) {
 *   data.toUpperCase() // => "HI"
 * }
 * ```
 *
 * @see {@link isNumber}
 * @see {@link isBoolean}
 * @see {@link Refinement}
 * @category guards
 * @since 2.0.0
 */
export function isString(input: unknown): input is string {
  return typeof input === "string"
}

/**
 * Checks whether a value is a `number`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard to narrow an `unknown` value to a
 * number.
 *
 * **Details**
 *
 * Uses `typeof input === "number"` and does not exclude `NaN` or `Infinity`.
 *
 * **Example** (Guarding numbers)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = 42
 *
 * if (Predicate.isNumber(data)) {
 *   data + 1 // => 43
 * }
 * ```
 *
 * @see {@link isBigInt}
 * @see {@link isString}
 * @category guards
 * @since 2.0.0
 */
export function isNumber(input: unknown): input is number {
  return typeof input === "number"
}

/**
 * Checks whether a value is a `boolean`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard to narrow an `unknown` value to a
 * boolean.
 *
 * **Details**
 *
 * Uses `typeof input === "boolean"`.
 *
 * **Example** (Guarding booleans)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = true
 *
 * if (Predicate.isBoolean(data)) {
 *   data ? "yes" : "no" // => "yes"
 * }
 * ```
 *
 * @see {@link isString}
 * @see {@link isNumber}
 * @category guards
 * @since 2.0.0
 */
export function isBoolean(input: unknown): input is boolean {
  return typeof input === "boolean"
}

/**
 * Checks whether a value is a `bigint`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard to narrow an `unknown` value to a
 * bigint.
 *
 * **Details**
 *
 * Uses `typeof input === "bigint"`.
 *
 * **Example** (Guarding bigints)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = 1n
 *
 * if (Predicate.isBigInt(data)) {
 *   data + 2n // => 3n
 * }
 * ```
 *
 * @see {@link isNumber}
 * @category guards
 * @since 2.0.0
 */
export function isBigInt(input: unknown): input is bigint {
  return typeof input === "bigint"
}

/**
 * Checks whether a value is a `symbol`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard to narrow an `unknown` value to a
 * symbol.
 *
 * **Details**
 *
 * Uses `typeof input === "symbol"`.
 *
 * **Example** (Guarding symbols)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = Symbol.for("id")
 *
 * if (Predicate.isSymbol(data)) {
 *   data.description // => "id"
 * }
 * ```
 *
 * @see {@link isPropertyKey}
 * @category guards
 * @since 2.0.0
 */
export function isSymbol(input: unknown): input is symbol {
  return typeof input === "symbol"
}

/**
 * Checks whether a value is a valid `PropertyKey` (string, number, or symbol).
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard for unknown property keys before
 * indexing.
 *
 * **Details**
 *
 * Uses `isString`, `isNumber`, and `isSymbol`.
 *
 * **Example** (Guarding property keys)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const key: unknown = "name"
 * const obj: Record<PropertyKey, unknown> = { name: "Ada" }
 *
 * if (Predicate.isPropertyKey(key) && key in obj) {
 *   obj[key] // => "Ada"
 * }
 * ```
 *
 * @see {@link isString}
 * @see {@link isNumber}
 * @see {@link isSymbol}
 * @category guards
 * @since 4.0.0
 */
export function isPropertyKey(u: unknown): u is PropertyKey {
  return isString(u) || isNumber(u) || isSymbol(u)
}

/**
 * Checks whether a value is a `function`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard to narrow an `unknown` value to a
 * callable function.
 *
 * **Details**
 *
 * Uses `typeof input === "function"`.
 *
 * **Example** (Guarding functions)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = () => 1
 *
 * if (Predicate.isFunction(data)) {
 *   data() // => 1
 * }
 * ```
 *
 * @see {@link isObjectKeyword}
 * @category guards
 * @since 2.0.0
 */
export function isFunction(input: unknown): input is Function {
  return typeof input === "function"
}

/**
 * Checks whether a value is `undefined`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard for values that are exactly
 * `undefined`.
 *
 * **Details**
 *
 * Uses `input === undefined`.
 *
 * **Example** (Guarding undefined values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = undefined
 *
 * Predicate.isUndefined(data) // => true
 * ```
 *
 * @see {@link isNotUndefined}
 * @see {@link isNullish}
 * @category guards
 * @since 2.0.0
 */
export function isUndefined(input: unknown): input is undefined {
  return input === undefined
}

/**
 * Checks whether a value is not `undefined`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` refinement that filters out `undefined`
 * while preserving other falsy values.
 *
 * **Details**
 *
 * Returns a refinement that excludes `undefined`.
 *
 * **Example** (Filtering undefined values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const values = [1, undefined, 2]
 * const defined = values.filter(Predicate.isNotUndefined) // => [1, 2]
 * ```
 *
 * @see {@link isUndefined}
 * @see {@link isNotNullish}
 * @category guards
 * @since 2.0.0
 */
export function isNotUndefined<A>(input: A): input is Exclude<A, undefined> {
  return input !== undefined
}

/**
 * Checks whether a value is `null`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard for nullable values.
 *
 * **Details**
 *
 * Uses `input === null`.
 *
 * **Example** (Guarding null values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = null
 *
 * Predicate.isNull(data) // => true
 * ```
 *
 * @see {@link isNotNull}
 * @see {@link isNullish}
 * @category guards
 * @since 2.0.0
 */
export function isNull(input: unknown): input is null {
  return input === null
}

/**
 * Checks whether a value is not `null`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` refinement that filters out `null` while
 * preserving other falsy values.
 *
 * **Details**
 *
 * Returns a refinement that excludes `null`.
 *
 * **Example** (Filtering null values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const values = [1, null, 2]
 * const nonNull = values.filter(Predicate.isNotNull) // => [1, 2]
 * ```
 *
 * @see {@link isNull}
 * @see {@link isNotNullish}
 * @category guards
 * @since 2.0.0
 */
export function isNotNull<A>(input: A): input is Exclude<A, null> {
  return input !== null
}

/**
 * Checks whether a value is `null` or `undefined`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard for nullish values.
 *
 * **Details**
 *
 * Uses `input === null || input === undefined`.
 *
 * **Example** (Guarding nullish values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const values = [0, null, "", undefined]
 * const nullish = values.filter(Predicate.isNullish) // => [null, undefined]
 * ```
 *
 * @see {@link isNotNullish}
 * @see {@link isUndefined}
 * @see {@link isNull}
 * @category guards
 * @since 4.0.0
 */
export function isNullish<A>(input: A): input is A & (null | undefined) {
  return input === null || input === undefined
}

/**
 * Checks whether a value is not `null` and not `undefined`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` refinement that filters out nullish values
 * but keeps other falsy ones.
 *
 * **Details**
 *
 * Uses `input != null`.
 *
 * **Example** (Filtering non-nullish values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const values = [0, null, "", undefined]
 * const present = values.filter(Predicate.isNotNullish) // => [0, ""]
 * ```
 *
 * @see {@link isNullish}
 * @see {@link isNotNull}
 * @see {@link isNotUndefined}
 * @category guards
 * @since 4.0.0
 */
export function isNotNullish<A>(input: A): input is NonNullable<A> {
  return input != null
}

/**
 * Type guard that always returns `false`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` that never accepts, e.g. in default branches.
 *
 * **Example** (Matching no values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * Predicate.isNever("anything") // => false
 * ```
 *
 * @see {@link isUnknown}
 * @category guards
 * @since 2.0.0
 */
export function isNever(_: unknown): _ is never {
  return false
}

/**
 * Type guard that always returns `true`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` that always accepts, e.g. as a placeholder.
 *
 * **Example** (Matching every value)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * Predicate.isUnknown(123) // => true
 * ```
 *
 * @see {@link isNever}
 * @category guards
 * @since 2.0.0
 */
export function isUnknown(_: unknown): _ is unknown {
  return true
}

/**
 * Checks whether a value is an object or an array (non-null object).
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard that accepts plain objects and arrays,
 * but not `null`.
 *
 * **Details**
 *
 * Uses `typeof input === "object" && input !== null` and includes arrays.
 *
 * **Example** (Checking objects or arrays)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * Predicate.isObjectOrArray([]) // => true
 * ```
 *
 * @see {@link isObject}
 * @see {@link isObjectKeyword}
 * @category guards
 * @since 4.0.0
 */
export function isObjectOrArray(input: unknown): input is { [x: PropertyKey]: unknown } | Array<unknown> {
  return typeof input === "object" && input !== null
}

/**
 * Checks whether a value is a non-null object value that is not an array.
 *
 * **When to use**
 *
 * Use to narrow unknown input to a non-null, non-array object with a
 * `Predicate` guard.
 *
 * **Details**
 *
 * This is a structural runtime check using `typeof input === "object"`, so it
 * also accepts object instances such as `Date`, `Map`, class instances, and
 * typed arrays. It excludes `null` and arrays.
 *
 * **Example** (Guarding objects)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * Predicate.isObject({ a: 1 }) // => true
 * Predicate.isObject([1, 2]) // => false
 * ```
 *
 * @see {@link isObjectOrArray}
 * @see {@link isReadonlyObject}
 * @category guards
 * @since 2.0.0
 */
export function isObject(input: unknown): input is { [x: PropertyKey]: unknown } {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

/**
 * Checks whether a value is a non-null, non-array object and narrows it to a
 * readonly indexable object type.
 *
 * **When to use**
 *
 * Use to narrow unknown input to a readonly view of a non-null, non-array
 * object with a `Predicate` guard.
 *
 * **Details**
 *
 * Readonly-ness is a TypeScript type-level view; it is not observable at
 * runtime. This delegates to `isObject`, so class instances and built-in object
 * instances are accepted.
 *
 * **Example** (Checking readonly objects)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = { a: 1 }
 *
 * Predicate.isReadonlyObject(data) // => true
 * ```
 *
 * @see {@link isObject}
 * @category guards
 * @since 4.0.0
 */
export function isReadonlyObject(input: unknown): input is { readonly [x: PropertyKey]: unknown } {
  return isObject(input)
}

/**
 * Checks whether a value is an `object` in the JavaScript sense (objects, arrays, functions).
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard that accepts arrays and functions as
 * well as objects.
 *
 * **Details**
 *
 * Returns `true` for arrays and functions, and `false` for `null`.
 *
 * **Example** (Checking object keywords)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * Predicate.isObjectKeyword(() => 1) // => true
 * Predicate.isObjectKeyword(null) // => false
 * ```
 *
 * @see {@link isObject}
 * @see {@link isObjectOrArray}
 * @category guards
 * @since 4.0.0
 */
export function isObjectKeyword(input: unknown): input is object {
  return (typeof input === "object" && input !== null) || isFunction(input)
}

/**
 * Checks whether a value has a given property key.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard for property access on `unknown`
 * values with a simple structural object check.
 *
 * **Details**
 *
 * Uses the `in` operator and `isObjectKeyword`. This does not check property
 * value types.
 *
 * **Example** (Guarding object properties)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const hasName = Predicate.hasProperty("name")
 * const data: unknown = { name: "Ada" }
 *
 * if (hasName(data)) {
 *   data.name // => "Ada"
 * }
 * ```
 *
 * @see {@link isTagged}
 * @see {@link isObjectKeyword}
 * @category guards
 * @since 2.0.0
 */
export const hasProperty: {
  <P extends PropertyKey>(property: P): (self: unknown) => self is { [K in P]: unknown }
  <P extends PropertyKey>(self: unknown, property: P): self is { [K in P]: unknown }
} = dual(
  2,
  <P extends PropertyKey>(self: unknown, property: P): self is { [K in P]: unknown } =>
    isObjectKeyword(self) && (property in self)
)

/**
 * Checks whether a value has a `_tag` property equal to the given tag.
 *
 * **When to use**
 *
 * Use when you model tagged unions with a `_tag` field and want a quick
 * `Predicate` guard for tagged values.
 *
 * **Details**
 *
 * Uses `hasProperty` and strict equality on `_tag`.
 *
 * **Example** (Guarding tagged values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const isOk = Predicate.isTagged("Ok")
 *
 * isOk({ _tag: "Ok", value: 1 }) // => true
 * ```
 *
 * @see {@link hasProperty}
 * @category guards
 * @since 2.0.0
 */
export const isTagged: {
  <K extends string>(tag: K): (self: unknown) => self is { _tag: K }
  <K extends string>(self: unknown, tag: K): self is { _tag: K }
} = dual(
  2,
  <K extends string>(self: unknown, tag: K): self is { _tag: K } => hasProperty(self, "_tag") && self["_tag"] === tag
)

/**
 * Checks whether a value is an `Error`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard for errors caught from unknown sources.
 *
 * **Details**
 *
 * Uses `instanceof Error`.
 *
 * **Example** (Guarding errors)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = new Error("boom")
 *
 * Predicate.isError(data) // => true
 * ```
 *
 * @see {@link isUnknown}
 * @category guards
 * @since 2.0.0
 */
export function isError(input: unknown): input is Error {
  return input instanceof Error
}

/**
 * Checks whether a value is a `Uint8Array`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` runtime guard for binary data.
 *
 * **Details**
 *
 * Uses `instanceof Uint8Array`.
 *
 * **Example** (Guarding Uint8Array values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = new Uint8Array([1, 2])
 *
 * Predicate.isUint8Array(data) // => true
 * ```
 *
 * @see {@link isIterable}
 * @see {@link isSet}
 * @category guards
 * @since 2.0.0
 */
export function isUint8Array(input: unknown): input is Uint8Array {
  return input instanceof Uint8Array
}

/**
 * Checks whether a value is a `Date`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` runtime guard for dates.
 *
 * **Details**
 *
 * Uses `instanceof Date`.
 *
 * **Example** (Guarding Date values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = new Date()
 *
 * Predicate.isDate(data) // => true
 * ```
 *
 * @see {@link isRegExp}
 * @category guards
 * @since 2.0.0
 */
export function isDate(input: unknown): input is Date {
  return input instanceof Date
}

/**
 * Checks whether a value is iterable.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard before iterating an unknown value.
 *
 * **Details**
 *
 * Accepts strings as iterable and uses `hasProperty` for `Symbol.iterator`.
 *
 * **Example** (Guarding iterables)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = [1, 2, 3]
 *
 * Predicate.isIterable(data) // => true
 * ```
 *
 * @see {@link isSet}
 * @see {@link isMap}
 * @category guards
 * @since 2.0.0
 */
export function isIterable(input: unknown): input is Iterable<unknown> {
  return hasProperty(input, Symbol.iterator) || isString(input)
}

/**
 * Checks whether a value is a `Promise`-like object with `then` and `catch`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard for promise instances across realms.
 *
 * **Details**
 *
 * Performs a structural check for `then` and `catch` functions.
 *
 * **Example** (Guarding promises)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = Promise.resolve(1)
 *
 * Predicate.isPromise(data) // => true
 * ```
 *
 * @see {@link isPromiseLike}
 * @category guards
 * @since 2.0.0
 */
export function isPromise(input: unknown): input is Promise<unknown> {
  return hasProperty(input, "then") && "catch" in input && isFunction(input.then) && isFunction(input.catch)
}

/**
 * Checks whether a value is `PromiseLike` (has a `then` method).
 *
 * **When to use**
 *
 * Use when you need a `Predicate` guard for promise-like values with a
 * callable `then` method.
 *
 * **Details**
 *
 * Performs a structural check for a callable `then`.
 *
 * **Example** (Guarding promise-like values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = { then: () => {} }
 *
 * Predicate.isPromiseLike(data) // => true
 * ```
 *
 * @see {@link isPromise}
 * @category guards
 * @since 2.0.0
 */
export function isPromiseLike(input: unknown): input is PromiseLike<unknown> {
  return hasProperty(input, "then") && isFunction(input.then)
}

/**
 * Checks whether a value is a `RegExp`.
 *
 * **When to use**
 *
 * Use when you need a `Predicate` runtime guard for regular expressions.
 *
 * **Details**
 *
 * Uses `instanceof RegExp`.
 *
 * **Example** (Guarding RegExp values)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const data: unknown = /abc/
 *
 * Predicate.isRegExp(data) // => true
 * ```
 *
 * @see {@link isDate}
 * @category guards
 * @since 3.9.0
 */
export function isRegExp(input: unknown): input is RegExp {
  return input instanceof RegExp
}

/**
 * Composes two predicates or refinements into one.
 *
 * **When to use**
 *
 * Use when you want to compose two `Predicate` checks in sequence, especially
 * when chaining refinements for progressive narrowing.
 *
 * **Details**
 *
 * For refinements, the output type is narrowed by both checks. Evaluation
 * short-circuits on the first `false`.
 *
 * **Example** (Composing refinements)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const isNumber: Predicate.Refinement<unknown, number> = (u): u is number => typeof u === "number"
 * const isInteger: Predicate.Refinement<number, number> = (n): n is number => Number.isInteger(n)
 *
 * const isIntegerNumber = Predicate.compose(isNumber, isInteger)
 *
 * isIntegerNumber(1) // => true
 * ```
 *
 * @see {@link and}
 * @see {@link Refinement}
 * @category combinators
 * @since 2.0.0
 */
export const compose: {
  <A, B extends A, C extends B>(bc: Refinement<B, C>): (ab: Refinement<A, B>) => Refinement<A, C>
  <A, B extends A>(bc: Predicate<NoInfer<B>>): (ab: Refinement<A, B>) => Refinement<A, B>
  <A, B extends A, C extends B>(ab: Refinement<A, B>, bc: Refinement<B, C>): Refinement<A, C>
  <A, B extends A>(ab: Refinement<A, B>, bc: Predicate<NoInfer<B>>): Refinement<A, B>
} = dual(
  2,
  <A, B extends A, C extends B>(ab: Refinement<A, B>, bc: Refinement<B, C>): Refinement<A, C> => (a): a is C =>
    ab(a) && bc(a)
)

/**
 * Creates a predicate for tuples by applying predicates to each element.
 *
 * **When to use**
 *
 * Use when you want to validate tuple positions independently by lifting
 * element predicates into a tuple predicate.
 *
 * **Details**
 *
 * Returns a refinement if any element predicate is a refinement. Evaluation
 * stops at the first failing element.
 *
 * **Example** (Checking tuples)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const tupleCheck = Predicate.Tuple([(n: number) => n > 0, Predicate.isString])
 *
 * tupleCheck([1, "ok"]) // => true
 * ```
 *
 * @see {@link Struct}
 * @see {@link isTupleOf}
 * @category combinators
 * @since 4.0.0
 */
export function Tuple<const T extends ReadonlyArray<Predicate.Any>>(
  elements: T
): [Extract<T[number], Refinement.Any>] extends [never] ? Predicate<{ readonly [I in keyof T]: Predicate.In<T[I]> }>
  : Refinement<
    { readonly [I in keyof T]: T[I] extends Refinement.Any ? Refinement.In<T[I]> : Predicate.In<T[I]> },
    { readonly [I in keyof T]: T[I] extends Refinement.Any ? Refinement.Out<T[I]> : Predicate.In<T[I]> }
  >
{
  return ((as: Array<unknown>) => {
    for (let i = 0; i < elements.length; i++) {
      if (elements[i](as[i]) === false) {
        return false
      }
    }
    return true
  }) as any
}

/**
 * Creates a predicate for objects by applying predicates to named properties.
 *
 * **When to use**
 *
 * Use when you want to validate a record shape at runtime by lifting property
 * predicates into an object predicate.
 *
 * **Details**
 *
 * Returns a refinement if any field predicate is a refinement. Only the
 * specified keys are checked, and extra keys are ignored.
 *
 * **Example** (Checking structs)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const userCheck = Predicate.Struct({
 *   id: Predicate.isNumber,
 *   name: Predicate.isString
 * })
 *
 * userCheck({ id: 1, name: "Ada" }) // => true
 * ```
 *
 * @see {@link Tuple}
 * @see {@link hasProperty}
 * @category combinators
 * @since 4.0.0
 */
export function Struct<R extends Record<string, Predicate.Any>>(
  fields: R
): [Extract<R[keyof R], Refinement.Any>] extends [never] ? Predicate<{ readonly [K in keyof R]: Predicate.In<R[K]> }> :
  Refinement<
    { readonly [K in keyof R]: R[K] extends Refinement.Any ? Refinement.In<R[K]> : Predicate.In<R[K]> },
    { readonly [K in keyof R]: R[K] extends Refinement.Any ? Refinement.Out<R[K]> : Predicate.In<R[K]> }
  >
{
  const keys = Object.keys(fields)
  return ((a: Record<string, unknown>) => {
    for (const key of keys) {
      if (!fields[key](a[key] as never)) {
        return false
      }
    }
    return true
  }) as any
}

/**
 * Negates a predicate.
 *
 * **When to use**
 *
 * Use when you want the inverse of an existing predicate.
 *
 * **Details**
 *
 * Returns a new predicate that flips the boolean result.
 *
 * **Example** (Negating a predicate)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const isNotString = Predicate.not(Predicate.isString)
 *
 * isNotString(1) // => true
 * ```
 *
 * @see {@link and}
 * @see {@link or}
 * @see {@link xor}
 * @category combinators
 * @since 2.0.0
 */
export function not<A>(self: Predicate<A>): Predicate<A> {
  return (a) => !self(a)
}

/**
 * Creates a predicate that returns `true` if either predicate is `true`.
 *
 * **When to use**
 *
 * Use when you want to combine `Predicate`s with OR, accepting values that
 * satisfy at least one condition, including refinements that narrow to a union.
 *
 * **Details**
 *
 * Evaluation short-circuits on the first `true`. For refinements, the output
 * type is a union.
 *
 * **Example** (Checking either condition)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const isStringOrNumber = Predicate.or(Predicate.isString, Predicate.isNumber)
 *
 * isStringOrNumber("a") // => true
 * ```
 *
 * @see {@link and}
 * @see {@link xor}
 * @category combinators
 * @since 2.0.0
 */
export const or: {
  <A, C extends A>(that: Refinement<A, C>): <B extends A>(self: Refinement<A, B>) => Refinement<A, B | C>
  <A, B extends A, C extends A>(self: Refinement<A, B>, that: Refinement<A, C>): Refinement<A, B | C>
  <A>(that: Predicate<A>): (self: Predicate<A>) => Predicate<A>
  <A>(self: Predicate<A>, that: Predicate<A>): Predicate<A>
} = dual(2, <A>(self: Predicate<A>, that: Predicate<A>): Predicate<A> => (a) => self(a) || that(a))

/**
 * Creates a predicate that returns `true` only if both predicates are `true`.
 *
 * **When to use**
 *
 * Use when you want to combine `Predicate`s with AND, accepting values that
 * satisfy multiple conditions, including refinements that narrow to an
 * intersection.
 *
 * **Details**
 *
 * Evaluation short-circuits on the first `false`. For refinements, the output
 * type is an intersection.
 *
 * **Example** (Checking both conditions)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const hasAAndB = Predicate.and(
 *   Predicate.hasProperty("a"),
 *   Predicate.hasProperty("b")
 * )
 *
 * const input: unknown = JSON.parse(`{"a":1,"b":"ok"}`)
 * if (hasAAndB(input)) {
 *   // input has both properties at this point
 *   const a = input.a
 *   const b = input.b
 *
 *   const values = [a, b] // => [1, "ok"]
 * }
 * ```
 *
 * @see {@link or}
 * @see {@link not}
 * @category combinators
 * @since 2.0.0
 */
export const and: {
  <A, C extends A>(that: Refinement<A, C>): <B extends A>(self: Refinement<A, B>) => Refinement<A, B & C>
  <A, B extends A, C extends A>(self: Refinement<A, B>, that: Refinement<A, C>): Refinement<A, B & C>
  <A>(that: Predicate<A>): (self: Predicate<A>) => Predicate<A>
  <A>(self: Predicate<A>, that: Predicate<A>): Predicate<A>
} = dual(2, <A>(self: Predicate<A>, that: Predicate<A>): Predicate<A> => (a) => self(a) && that(a))

/**
 * Creates a predicate that returns `true` if exactly one predicate is `true`.
 *
 * **When to use**
 *
 * Use when you want to combine two `Predicate`s with exclusive-or semantics.
 *
 * **Details**
 *
 * Returns `true` when results differ.
 *
 * **Example** (Checking exclusive-or conditions)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const isEven = (n: number) => n % 2 === 0
 * const isPositive = (n: number) => n > 0
 * const either = Predicate.xor(isEven, isPositive)
 *
 * either(-2) // => true
 * ```
 *
 * @see {@link or}
 * @see {@link and}
 * @category combinators
 * @since 2.0.0
 */
export const xor: {
  <A>(that: Predicate<A>): (self: Predicate<A>) => Predicate<A>
  <A>(self: Predicate<A>, that: Predicate<A>): Predicate<A>
} = dual(2, <A>(self: Predicate<A>, that: Predicate<A>): Predicate<A> => (a) => self(a) !== that(a))

/**
 * Creates a predicate that returns `true` when both predicates agree.
 *
 * **When to use**
 *
 * Use when you want to check equivalence of two `Predicate`s.
 *
 * **Details**
 *
 * Returns `true` when both results are equal.
 *
 * **Example** (Defining equivalence)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const isEven = (n: number) => n % 2 === 0
 * const same = Predicate.eqv(isEven, isEven)
 *
 * same(3) // => true
 * ```
 *
 * @see {@link xor}
 * @category combinators
 * @since 2.0.0
 */
export const eqv: {
  <A>(that: Predicate<A>): (self: Predicate<A>) => Predicate<A>
  <A>(self: Predicate<A>, that: Predicate<A>): Predicate<A>
} = dual(2, <A>(self: Predicate<A>, that: Predicate<A>): Predicate<A> => (a) => self(a) === that(a))

/**
 * Creates a predicate representing logical implication: if `antecedent`, then `consequent`.
 *
 * **When to use**
 *
 * Use when you need to encode logical implication between `Predicate` rules,
 * where one rule only applies when a precondition holds.
 *
 * **Details**
 *
 * Models constraints like "if A then B" and returns `true` when the antecedent
 * is `false`.
 *
 * **Example** (Checking implication)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const isAdult = (age: number) => age >= 18
 * const canVote = (age: number) => age >= 18
 * const implies = Predicate.implies(isAdult, canVote)
 *
 * implies(16) // => true
 * ```
 *
 * @see {@link and}
 * @see {@link or}
 * @category combinators
 * @since 2.0.0
 */
export const implies: {
  <A>(consequent: Predicate<A>): (antecedent: Predicate<A>) => Predicate<A>
  <A>(antecedent: Predicate<A>, consequent: Predicate<A>): Predicate<A>
} = dual(
  2,
  <A>(antecedent: Predicate<A>, consequent: Predicate<A>): Predicate<A> => (a) => antecedent(a) ? consequent(a) : true
)

/**
 * Creates a predicate that returns `true` when neither predicate is `true`.
 *
 * **When to use**
 *
 * Use when you want to combine two `Predicate`s with logical NOR semantics.
 *
 * **Details**
 *
 * Returns the negation of `or`.
 *
 * **Example** (Checking NOR conditions)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const neither = Predicate.nor(Predicate.isString, Predicate.isNumber)
 *
 * neither(true) // => true
 * ```
 *
 * @see {@link or}
 * @see {@link not}
 * @category combinators
 * @since 2.0.0
 */
export const nor: {
  <A>(that: Predicate<A>): (self: Predicate<A>) => Predicate<A>
  <A>(self: Predicate<A>, that: Predicate<A>): Predicate<A>
} = dual(
  2,
  <A>(self: Predicate<A>, that: Predicate<A>): Predicate<A> => (a) => !(self(a) || that(a))
)

/**
 * Creates a predicate that returns `true` unless both predicates are `true`.
 *
 * **When to use**
 *
 * Use when you want to combine two `Predicate`s with logical NAND semantics.
 *
 * **Details**
 *
 * Returns the negation of `and`.
 *
 * **Example** (Checking NAND conditions)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const notBoth = Predicate.nand(Predicate.isString, Predicate.isNumber)
 *
 * notBoth("a") // => true
 * ```
 *
 * @see {@link and}
 * @see {@link not}
 * @category combinators
 * @since 2.0.0
 */
export const nand: {
  <A>(that: Predicate<A>): (self: Predicate<A>) => Predicate<A>
  <A>(self: Predicate<A>, that: Predicate<A>): Predicate<A>
} = dual(
  2,
  <A>(self: Predicate<A>, that: Predicate<A>): Predicate<A> => (a) => !(self(a) && that(a))
)

/**
 * Creates a predicate that returns `true` if all predicates in the collection return `true`.
 *
 * **When to use**
 *
 * Use when you have a dynamic list of predicates to apply.
 *
 * **Details**
 *
 * Evaluation short-circuits on the first `false`. The collection is iterated
 * each time the predicate is called.
 *
 * **Example** (Checking all predicates)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const allChecks = Predicate.every([Predicate.isNumber, (n: number) => n > 0])
 *
 * allChecks(2) // => true
 * ```
 *
 * @see {@link some}
 * @see {@link and}
 * @category combining
 * @since 2.0.0
 */
export function every<A>(collection: Iterable<Predicate<A>>): Predicate<A> {
  return (a) => {
    for (const p of collection) {
      if (!p(a)) {
        return false
      }
    }
    return true
  }
}

/**
 * Creates a predicate that returns `true` if any predicate in the collection returns `true`.
 *
 * **When to use**
 *
 * Use when you have a dynamic list of predicates and only need one to pass.
 *
 * **Details**
 *
 * Evaluation short-circuits on the first `true`. The collection is iterated
 * each time the predicate is called.
 *
 * **Example** (Checking any predicate)
 *
 * ```ts import.meta.vitest
 * import { Predicate } from "effect"
 *
 * const anyCheck = Predicate.some([Predicate.isString, Predicate.isNumber])
 *
 * anyCheck("ok") // => true
 * ```
 *
 * @see {@link every}
 * @see {@link or}
 * @category combining
 * @since 2.0.0
 */
export function some<A>(collection: Iterable<Predicate<A>>): Predicate<A> {
  return (a) => {
    for (const p of collection) {
      if (p(a)) {
        return true
      }
    }
    return false
  }
}
