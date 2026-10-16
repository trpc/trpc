/**
 * Provides compile-time utility types for TypeScript.
 *
 * Everything in this module is type-level only; it does not define runtime
 * values. The types are used throughout Effect to work with tuple lengths,
 * object shapes, tagged unions, reason-tagged errors, mutability, exactness,
 * required keys, concurrency settings, and variance markers.
 *
 * @since 4.0.0
 */

/**
 * @category utility types
 * @since 2.0.0
 */
type TupleOf_<T, N extends number, R extends Array<unknown>> = `${N}` extends `-${number}` ? never
  : `${N}` extends `${bigint}` ? R["length"] extends N ? R
    : TupleOf_<T, N, [T, ...R]>
  : Array<T>

/**
 * Constructs a tuple type with exactly `N` elements of type `T`.
 *
 * **When to use**
 *
 * Use when you need a fixed-length array type, especially instead of manually
 * writing `[T, T, T, ...]` for longer tuples.
 *
 * **Details**
 *
 * - If `N` is a non-negative integer literal, produces a tuple of that exact length.
 * - If `N` is the general `number` type (non-literal), degrades to `Array<T>`.
 * - Positive non-integer literals degrade to `Array<T>`.
 * - Negative numbers produce `never`.
 *
 * **Example** (Checking fixed-length tuples)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * // Exactly 3 numbers
 * const triple: Types.TupleOf<3, number> = [1, 2, 3]
 *
 * // @ts-expect-error - too few elements
 * const tooFew: Types.TupleOf<3, number> = [1, 2]
 *
 * // @ts-expect-error - too many elements
 * const tooMany: Types.TupleOf<3, number> = [1, 2, 3, 4]
 * ```
 *
 * @see {@link TupleOfAtLeast}
 *
 * @category utility types
 * @since 3.3.0
 */
export type TupleOf<N extends number, T> = N extends N ? number extends N ? Array<T> : TupleOf_<T, N, []> : never

/**
 * Constructs a tuple type with at least `N` elements of type `T`.
 *
 * **When to use**
 *
 * Use when you need a minimum-length array type that still allows additional
 * elements. This is useful for variadic function signatures that require a
 * minimum arity.
 *
 * **Details**
 *
 * Produces a tuple with `N` fixed positions followed by `...Array<T>`.
 *
 * **Example** (Checking minimum-length tuples)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * // At least 2 strings
 * const ok1: Types.TupleOfAtLeast<2, string> = ["a", "b"]
 * const ok2: Types.TupleOfAtLeast<2, string> = ["a", "b", "c", "d"]
 *
 * // @ts-expect-error - too few elements
 * const bad: Types.TupleOfAtLeast<2, string> = ["a"]
 * ```
 *
 * @see {@link TupleOf}
 *
 * @category utility types
 * @since 3.3.0
 */
export type TupleOfAtLeast<N extends number, T> = [...TupleOf<N, T>, ...Array<T>]

/**
 * Extracts the `_tag` string literal types from a union.
 *
 * **When to use**
 *
 * Use to get all discriminant values from a tagged union type.
 *
 * **Details**
 *
 * Members without a `_tag` field are ignored and produce `never`.
 *
 * **Example** (Extracting tags)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type MyError =
 *   | { readonly _tag: "NotFound"; readonly id: string }
 *   | { readonly _tag: "Timeout"; readonly ms: number }
 *   | string
 *
 * type Result = Types.Tags<MyError>
 * // "NotFound" | "Timeout"
 *
 * const witness: Result = "NotFound"
 * ```
 *
 * @see {@link ExtractTag}
 * @see {@link ExcludeTag}
 *
 * @category utility types
 * @since 2.0.0
 */
export type Tags<E> = E extends { readonly _tag: string } ? E["_tag"] : never

/**
 * Excludes members of a tagged union by their `_tag` value.
 *
 * **When to use**
 *
 * Use to remove tagged-union members whose `_tag` matches a specific value in
 * type-level code.
 *
 * **Details**
 *
 * Non-tagged members of the union are preserved.
 *
 * **Example** (Removing a variant)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type MyError =
 *   | { readonly _tag: "NotFound"; readonly id: string }
 *   | { readonly _tag: "Timeout"; readonly ms: number }
 *   | string
 *
 * type WithoutTimeout = Types.ExcludeTag<MyError, "Timeout">
 * // { readonly _tag: "NotFound"; readonly id: string } | string
 *
 * const witness: WithoutTimeout = { _tag: "NotFound", id: "1" }
 * ```
 *
 * @see {@link ExtractTag}
 * @see {@link Tags}
 *
 * @category utility types
 * @since 2.0.0
 */
export type ExcludeTag<E, K extends string> = Exclude<E, { readonly _tag: K }>

/**
 * Extracts a specific member of a tagged union by its `_tag` value.
 *
 * **When to use**
 *
 * Use to select tagged-union members whose `_tag` matches a specific value in
 * type-level code.
 *
 * **Details**
 *
 * Returns `never` if no member matches the tag.
 *
 * **Example** (Extracting a variant)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type MyError =
 *   | { readonly _tag: "NotFound"; readonly id: string }
 *   | { readonly _tag: "Timeout"; readonly ms: number }
 *
 * type TimeoutError = Types.ExtractTag<MyError, "Timeout">
 * // { readonly _tag: "Timeout"; readonly ms: number }
 *
 * const witness: TimeoutError = { _tag: "Timeout", ms: 100 }
 * ```
 *
 * @see {@link ExcludeTag}
 * @see {@link Tags}
 *
 * @category utility types
 * @since 2.0.0
 */
export type ExtractTag<E, K extends string> = E extends { readonly _tag: infer T } ? K extends T ? E : never : never

/**
 * Transforms a union type into an intersection type.
 *
 * **When to use**
 *
 * Use to combine all members of a union into a single type with all their
 * properties. This is useful in advanced generic code where you need to merge
 * union variants.
 *
 * **Details**
 *
 * - Uses distributive conditional types and contra-variant inference.
 * - If the union members are incompatible (e.g. `string | number`), the
 *   result is `never`.
 *
 * **Example** (Converting a union to an intersection)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type Union = { a: string } | { b: number }
 * type Result = Types.UnionToIntersection<Union>
 * // { a: string } & { b: number }
 *
 * const witness: Result = { a: "value", b: 1 }
 * ```
 *
 * @see {@link IsUnion}
 *
 * @category utility types
 * @since 2.0.0
 */
export type UnionToIntersection<T> = (T extends any ? (x: T) => any : never) extends (x: infer R) => any ? R
  : never

/**
 * Flattens an intersection type into a single object type for readability.
 *
 * **When to use**
 *
 * Use to clean up IDE tooltips that show `A & B & C` instead of a merged
 * object.
 *
 * **Details**
 *
 * Does not change the type semantically, only its display.
 *
 * **Example** (Simplifying an intersection)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * // Without Simplify: IDE shows { a: number } & { b: string }
 * // With Simplify: IDE shows { a: number; b: string }
 * type Clean = Types.Simplify<{ a: number } & { b: string }>
 *
 * const witness: Clean = { a: 1, b: "value" }
 * ```
 *
 * @see {@link MergeLeft}
 * @see {@link MergeRight}
 *
 * @category utility types
 * @since 2.0.0
 */
export type Simplify<A> = {
  [K in keyof A]: A[K]
} extends infer B ? B : never

/**
 * Determines if two types are exactly equal at the type level.
 *
 * **When to use**
 *
 * Use to assert type equality in conditional types or type-level tests.
 *
 * **Details**
 *
 * - Uses the `<T>() => T extends X ? 1 : 2` trick for exact equality,
 *   distinguishing between `any`, `unknown`, `never`, and other types.
 * - Resolves to `true` if `X` and `Y` are identical, `false` otherwise.
 *
 * **Example** (Checking type equality)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type Yes = Types.Equals<{ a: number }, { a: number }> // true
 * type No = Types.Equals<{ a: number }, { a: string }> // false
 * type AnyCheck = Types.Equals<any, string> // false
 * ```
 *
 * @see {@link EqualsWith}
 *
 * @category utility types
 * @since 2.0.0
 */
export type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <
  T
>() => T extends Y ? 1 : 2 ? true
  : false

/**
 * Determines if two types are equal, returning custom types for each case.
 *
 * **When to use**
 *
 * Use when you need a type-level if/else based on type equality.
 *
 * **Details**
 *
 * Returns `Y` when `A` and `B` are equal, `N` otherwise.
 *
 * **Example** (Choosing a conditional type based on equality)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type R1 = Types.EqualsWith<string, string, "same", "diff"> // "same"
 * type R2 = Types.EqualsWith<string, number, "same", "diff"> // "diff"
 * ```
 *
 * @see {@link Equals}
 *
 * @category utility types
 * @since 3.15.0
 */
export type EqualsWith<A, B, Y, N> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? Y : N

/**
 * Checks whether an object type contains any of the specified keys.
 *
 * **When to use**
 *
 * Use to branch type-level logic when at least one key from a candidate key set
 * exists on an object type.
 *
 * **Details**
 *
 * Returns `true` if at least one key from `Key` exists in `A`, `false`
 * otherwise.
 *
 * **Example** (Checking key presence)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type Yes = Types.Has<{ a: number; b: string }, "a" | "c"> // true
 * type No = Types.Has<{ a: number }, "b" | "c"> // false
 * ```
 *
 * @category utility types
 * @since 2.0.0
 */
export type Has<A, Key extends string> = (Key extends infer K ? K extends keyof A ? true : never : never) extends never
  ? false
  : true

/**
 * Left-biased merge of two object types where keys from `Source` take
 * precedence over `Target` on conflict.
 *
 * **When to use**
 *
 * Use when you want left-biased merging where the first argument wins.
 *
 * **Details**
 *
 * Implemented as `MergeRight<Target, Source>`.
 *
 * **Example** (Merging with left bias)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type Result = Types.MergeLeft<
 *   { a: number; b: number },
 *   { a: string; c: boolean }
 * >
 * // { a: number; b: number; c: boolean }
 *
 * const witness: Result = { a: 1, b: 2, c: true }
 * ```
 *
 * @see {@link MergeRight}
 * @see {@link Simplify}
 *
 * @category utility types
 * @since 2.0.0
 */
export type MergeLeft<Source, Target> = MergeRight<Target, Source>

/**
 * Right-biased merge of two object types where keys from `Source` take
 * precedence over `Target` on conflict.
 *
 * **When to use**
 *
 * Use when you want right-biased merging where the second argument wins.
 *
 * **Details**
 *
 * The result is automatically simplified via {@link Simplify}.
 *
 * **Example** (Right-biased merge)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type Result = Types.MergeRight<
 *   { a: number; b: number },
 *   { a: string; c: boolean }
 * >
 * // { a: string; b: number; c: boolean }
 *
 * const witness: Result = { a: "value", b: 2, c: true }
 * ```
 *
 * @see {@link MergeLeft}
 * @see {@link Simplify}
 *
 * @category utility types
 * @since 2.0.0
 */
export type MergeRight<Target, Source> = Simplify<
  & Source
  & {
    [Key in keyof Target as Key extends keyof Source ? never : Key]: Target[Key]
  }
>

/**
 * Describes the concurrency level for Effect operations that run multiple
 * effects.
 *
 * **When to use**
 *
 * Use to type options that control how many effects may run at the same time.
 *
 * **Details**
 *
 * - `number` — run at most N effects concurrently.
 * - `"unbounded"` — run all effects concurrently with no limit.
 *
 * **Example** (Setting concurrency values)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * const sequential: Types.Concurrency = 1
 * const limited: Types.Concurrency = 5
 * const unbounded: Types.Concurrency = "unbounded"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export type Concurrency = number | "unbounded"

/**
 * Removes `readonly` from all properties of `T`. Supports arrays, tuples,
 * and records.
 *
 * **When to use**
 *
 * Use when you need a mutable version of a readonly type.
 *
 * **Details**
 *
 * Only affects the top level; nested properties remain readonly.
 *
 * **Example** (Converting shallowly to mutable types)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type Obj = Types.Mutable<{
 *   readonly a: string
 *   readonly b: ReadonlyArray<number>
 * }>
 * // { a: string; b: ReadonlyArray<number> }
 * //   ^ mutable    ^ still readonly inside
 *
 * type Arr = Types.Mutable<ReadonlyArray<string>>
 * // string[]
 *
 * type Tup = Types.Mutable<readonly [string, number]>
 * // [string, number]
 *
 * const tuple: Tup = ["value", 1]
 * tuple[1] = 2
 * ```
 *
 * @see {@link DeepMutable}
 *
 * @category utility types
 * @since 2.0.0
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P]
}

type DeepMutableIsOpaque<T> = Extract<keyof T, symbol> extends never
  ? Extract<T[keyof T], Function> extends never ? false : true
  : true

/**
 * Recursively removes `readonly` from plain objects, arrays, tuples, `Map`,
 * and `Set` while preserving opaque objects.
 *
 * **When to use**
 *
 * Use when you need a fully mutable version of deeply readonly structural
 * data.
 *
 * **Details**
 *
 * Recursion stops at primitives, functions, objects with methods, and objects
 * with symbol-keyed properties. This preserves built-in objects and Effect
 * data types while still transforming their surrounding arrays and records.
 *
 * **Example** (Converting deeply to mutable types)
 *
 * ```ts import.meta.vitest
 * import { DateTime, type Types } from "effect"
 *
 * type Deep = Types.DeepMutable<{
 *   readonly a: string
 *   readonly b: ReadonlyArray<{ readonly c: number }>
 *   readonly createdAt: DateTime.DateTime
 * }>
 * // { a: string; b: Array<{ c: number }>; createdAt: DateTime.DateTime }
 *
 * const witness: Deep = {
 *   a: "value",
 *   b: [{ c: 1 }],
 *   createdAt: DateTime.makeUnsafe(0)
 * }
 * witness.b[0].c = 2
 * ```
 *
 * @see {@link Mutable}
 *
 * @category utility types
 * @since 3.1.0
 */
export type DeepMutable<T> = T extends ReadonlyMap<infer K, infer V> ? Map<DeepMutable<K>, DeepMutable<V>>
  : T extends ReadonlySet<infer V> ? Set<DeepMutable<V>>
  : T extends ReadonlyArray<unknown> ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
  : T extends string | number | boolean | bigint | symbol | Function ? T
  : DeepMutableIsOpaque<T> extends true ? T
  : { -readonly [K in keyof T]: DeepMutable<T[K]> }

/**
 * Prevents TypeScript from inferring a type parameter from a specific
 * position.
 *
 * **When to use**
 *
 * Use when a function parameter must match an inferred type without becoming
 * an inference source.
 *
 * **Details**
 *
 * The parameter using `NoInfer` must still match the inferred type.
 *
 * **Example** (Controlling inference)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * function withDefault<T>(value: T, _fallback: Types.NoInfer<T>): T {
 *   return value
 * }
 *
 * // T is inferred as "a" | "b" from the first argument only
 * const result = withDefault<"a" | "b">("a", "b")
 * ```
 *
 * @category utility types
 * @since 2.0.0
 */
export type NoInfer<A> = [A][A extends any ? 0 : never]

/**
 * Function-type alias encoding invariant variance for a phantom type
 * parameter.
 *
 * **When to use**
 *
 * Use as a phantom field type to make a type parameter invariant, neither
 * covariant nor contravariant.
 *
 * **Details**
 *
 * A value of type `Invariant<A>` cannot be assigned to `Invariant<B>` unless
 * `A` and `B` are the same type.
 *
 * **Example** (Defining an invariant phantom type)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * interface Container<T> {
 *   readonly _phantom: Types.Invariant<T>
 *   readonly value: T
 * }
 *
 * const container: Container<number> = { _phantom: (value) => value, value: 1 }
 * ```
 *
 * @see {@link Invariant.Type}
 * @see {@link Covariant}
 * @see {@link Contravariant}
 *
 * @category utility types
 * @since 2.0.0
 */
export type Invariant<A> = (_: A) => A

/**
 * Namespace for {@link Invariant}-related utilities.
 *
 * **When to use**
 *
 * Use when referring to type-level helpers nested under `Invariant`.
 *
 * @since 3.9.0
 */
export declare namespace Invariant {
  /**
   * Extracts the type parameter `A` from an `Invariant<A>`.
   *
   * **When to use**
   *
   * Use to recover the carried type from an invariant phantom marker.
   *
   * **Example** (Extracting the inner type)
   *
   * ```ts import.meta.vitest
   * import type { Types } from "effect"
   *
   * type Inner = Types.Invariant.Type<Types.Invariant<number>>
   * // number
   *
   * const witness: Inner = 1
   * ```
   *
   * @see {@link Invariant}
   *
   * @category utility types
   * @since 3.9.0
   */
  export type Type<A> = A extends Invariant<infer U> ? U : never
}

/**
 * Function-type alias encoding covariant variance for a phantom type
 * parameter.
 *
 * **When to use**
 *
 * Use as a phantom field type to make a type parameter covariant in output
 * position.
 *
 * **Details**
 *
 * `Covariant<A>` is assignable to `Covariant<B>` when `A extends B`, following
 * the subtype direction.
 *
 * **Example** (Defining a covariant phantom type)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * interface Producer<T> {
 *   readonly _phantom: Types.Covariant<T>
 *   readonly get: () => T
 * }
 *
 * const producer: Producer<string> = { _phantom: () => "value", get: () => "value" }
 * ```
 *
 * @see {@link Covariant.Type}
 * @see {@link Contravariant}
 * @see {@link Invariant}
 *
 * @category utility types
 * @since 2.0.0
 */
export type Covariant<A> = (_: never) => A

/**
 * Namespace for {@link Covariant}-related utilities.
 *
 * **When to use**
 *
 * Use when referring to type-level helpers nested under `Covariant`.
 *
 * @since 3.9.0
 */
export declare namespace Covariant {
  /**
   * Extracts the type parameter `A` from a `Covariant<A>`.
   *
   * **When to use**
   *
   * Use to recover the carried type from a covariant phantom marker.
   *
   * **Example** (Extracting the inner type)
   *
   * ```ts import.meta.vitest
   * import type { Types } from "effect"
   *
   * type Inner = Types.Covariant.Type<Types.Covariant<string>>
   * // string
   *
   * const witness: Inner = "value"
   * ```
   *
   * @see {@link Covariant}
   *
   * @category utility types
   * @since 3.9.0
   */
  export type Type<A> = A extends Covariant<infer U> ? U : never
}

/**
 * Function-type alias encoding contravariant variance for a phantom type
 * parameter.
 *
 * **When to use**
 *
 * Use as a phantom field type to make a type parameter contravariant in input
 * position.
 *
 * **Details**
 *
 * `Contravariant<A>` is assignable to `Contravariant<B>` when `B extends A`,
 * following the supertype direction.
 *
 * **Example** (Defining a contravariant phantom type)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * interface Consumer<T> {
 *   readonly _phantom: Types.Contravariant<T>
 *   readonly accept: (value: T) => void
 * }
 *
 * const consumer: Consumer<string> = {
 *   _phantom: () => {},
 *   accept: (_value) => {}
 * }
 * ```
 *
 * @see {@link Contravariant.Type}
 * @see {@link Covariant}
 * @see {@link Invariant}
 *
 * @category utility types
 * @since 2.0.0
 */
export type Contravariant<A> = (_: A) => void

/**
 * Namespace for {@link Contravariant}-related utilities.
 *
 * **When to use**
 *
 * Use when referring to type-level helpers nested under `Contravariant`.
 *
 * @since 3.9.0
 */
export declare namespace Contravariant {
  /**
   * Extracts the type parameter `A` from a `Contravariant<A>`.
   *
   * **When to use**
   *
   * Use to recover the carried type from a contravariant phantom marker.
   *
   * **Example** (Extracting the inner type)
   *
   * ```ts import.meta.vitest
   * import type { Types } from "effect"
   *
   * type Inner = Types.Contravariant.Type<Types.Contravariant<string>>
   * // string
   *
   * const witness: Inner = "value"
   * ```
   *
   * @see {@link Contravariant}
   *
   * @category utility types
   * @since 3.9.0
   */
  export type Type<A> = A extends Contravariant<infer U> ? U : never
}

/**
 * Conditional type that returns `void` if `S` is an empty object type,
 * otherwise returns `S`.
 *
 * **When to use**
 *
 * Use to erase an empty object type from an API result or parameter position.
 *
 * @category utility types
 * @since 3.19.20
 */
export type VoidIfEmpty<S> = keyof S extends never ? void : S

/**
 * Excludes function types from a union, keeping only non-function members.
 *
 * **When to use**
 *
 * Use to filter out callable types from a union.
 *
 * **Details**
 *
 * Returns `never` if the entire union consists of function types.
 *
 * **Example** (Filtering out functions)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type Result = Types.NotFunction<string | (() => void) | number>
 * // string | number
 *
 * const witness: Result = "value"
 * ```
 *
 * @category utility types
 * @since 2.0.0
 */
export type NotFunction<T> = T extends Function ? never : T

/**
 * Constrains a type to prevent excess properties not present in `T`.
 *
 * **When to use**
 *
 * Use to catch accidental extra properties in generic functions at compile time.
 *
 * **Details**
 *
 * Extra keys from `U` that are not in `T` are mapped to `never`.
 *
 * **Example** (Preventing extra properties)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type Expected = { a: number; b: string }
 * type Input = { a: number; b: string; c: boolean }
 *
 * type Result = Types.NoExcessProperties<Expected, Input>
 * // { a: number; b: string; readonly c: never }
 *
 * const accepted: Types.NoExcessProperties<Expected, Expected> = { a: 1, b: "value" }
 * ```
 *
 * @category utility types
 * @since 3.9.0
 */
export type NoExcessProperties<T, U> = T & Readonly<Record<Exclude<keyof U, keyof T>, never>>

/**
 * Branded marker interface representing an unassigned type parameter.
 *
 * **When to use**
 *
 * Use when Effect's type-level machinery needs to represent a type parameter
 * that has not been assigned yet.
 *
 * **Details**
 *
 * Used internally by the Effect type system to indicate that a type parameter
 * has not been assigned a concrete type.
 *
 * @see {@link unhandled}
 *
 * @category utility types
 * @since 4.0.0
 */
export interface unassigned {
  readonly _: unique symbol
}

/**
 * Branded marker interface representing an unhandled error type.
 *
 * **When to use**
 *
 * Use when Effect's type-level machinery needs to represent an error type that
 * has not been handled yet.
 *
 * **Details**
 *
 * Used internally by the Effect type system to indicate that an error type
 * has not been handled.
 *
 * @see {@link unassigned}
 *
 * @category utility types
 * @since 4.0.0
 */
export interface unhandled {
  readonly _: unique symbol
}

/**
 * Checks whether a type `T` is a union type.
 *
 * **When to use**
 *
 * Use to branch type-level logic depending on whether a type is a union.
 *
 * **Details**
 *
 * - Compares `[T]` against `[UnionToIntersection<T>]`. If they differ, `T`
 *   must be a union.
 * - Returns `true` if `T` is a union of two or more members.
 * - Returns `false` for single types, `never`, or `any`.
 *
 * **Example** (Detecting union types)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type Yes = Types.IsUnion<"a" | "b"> // true
 * type No = Types.IsUnion<string> // false
 * ```
 *
 * @see {@link UnionToIntersection}
 *
 * @category utility types
 * @since 4.0.0
 */
export type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true

/**
 * Extracts the `reason` type from an error that has a `reason` field.
 *
 * **When to use**
 *
 * Use when an error type stores nested sub-errors in a `reason` field and you
 * need that field's full union type as a standalone type.
 *
 * **Details**
 *
 * Returns `never` if `E` has no `reason` field.
 *
 * **Example** (Extracting reason types)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
 * type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
 * type ApiError = { readonly _tag: "ApiError"; readonly reason: RateLimitError | QuotaError }
 *
 * type Reasons = Types.ReasonOf<ApiError>
 * // RateLimitError | QuotaError
 *
 * const witness: Reasons = { _tag: "QuotaError", limit: 10 }
 * ```
 *
 * @see {@link ReasonTags}
 * @see {@link ExtractReason}
 * @see {@link ExcludeReason}
 *
 * @category utility types
 * @since 4.0.0
 */
export type ReasonOf<E> = E extends { readonly reason: infer R } ? R : never

/**
 * Extracts the `_tag` values from the `reason` type of an error.
 *
 * **When to use**
 *
 * Use to get the discriminant values available inside a nested `reason`
 * error union.
 *
 * **Details**
 *
 * This is shorthand for `Tags<ReasonOf<E>>`. It returns `never` if `E` has no
 * `reason` field or the reason has no `_tag`.
 *
 * **Example** (Getting reason tags)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
 * type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
 * type ApiError = { readonly _tag: "ApiError"; readonly reason: RateLimitError | QuotaError }
 *
 * type Result = Types.ReasonTags<ApiError>
 * // "RateLimitError" | "QuotaError"
 *
 * const witness: Result = "RateLimitError"
 * ```
 *
 * @see {@link ReasonOf}
 * @see {@link ExtractReason}
 *
 * @category utility types
 * @since 4.0.0
 */
export type ReasonTags<E> = E extends { readonly reason: { readonly _tag: string } } ? E["reason"]["_tag"]
  : never

/**
 * Extracts a specific reason variant by its `_tag` from an error's `reason`
 * field.
 *
 * **When to use**
 *
 * Use when you need the nested reason variant type itself, selected by `_tag`,
 * rather than the enclosing error type.
 *
 * **Details**
 *
 * Returns `never` if `E` has no matching reason variant.
 *
 * **Example** (Extracting a reason variant)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
 * type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
 * type ApiError = { readonly _tag: "ApiError"; readonly reason: RateLimitError | QuotaError }
 *
 * type Result = Types.ExtractReason<ApiError, "RateLimitError">
 * // { readonly _tag: "RateLimitError"; readonly retryAfter: number }
 *
 * const witness: Result = { _tag: "RateLimitError", retryAfter: 30 }
 * ```
 *
 * @see {@link ExcludeReason}
 * @see {@link ReasonOf}
 * @see {@link ReasonTags}
 *
 * @category utility types
 * @since 4.0.0
 */
export type ExtractReason<E, K extends string> = E extends { readonly reason: infer R }
  ? R extends { readonly _tag: infer T } ? K extends T ? R : never
  : never
  : never

/**
 * Narrows a specific reason variant by its `_tag` from an error's `reason`
 * field.
 *
 * **When to use**
 *
 * Use to preserve the original error shape while narrowing its nested reason
 * field to the matching variant.
 *
 * **Details**
 *
 * Returns `never` if `E` has no matching reason variant.
 *
 * **Example** (Narrowing a reason variant)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
 * type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
 * type ApiError = { readonly _tag: "ApiError"; readonly reason: RateLimitError | QuotaError }
 *
 * type Result = Types.NarrowReason<ApiError, "RateLimitError">
 * // ApiError & { readonly reason: { readonly _tag: "RateLimitError"; readonly retryAfter: number } }
 *
 * const witness: Result = {
 *   _tag: "ApiError",
 *   reason: { _tag: "RateLimitError", retryAfter: 30 }
 * }
 * ```
 *
 * @see {@link ExcludeReason}
 * @see {@link ReasonOf}
 * @see {@link ReasonTags}
 *
 * @category utility types
 * @since 4.0.0
 */
export type NarrowReason<E, K extends string> = E extends { readonly reason: infer R }
  ? R extends { readonly _tag: infer T } ? K extends T ? E & { readonly reason: R } : never
  : never
  : never

/**
 * Narrows an error's `reason` field to exclude a specific reason variant by
 * its `_tag`.
 *
 * **When to use**
 *
 * Use to narrow the error to only the remaining reason variants after
 * excluding the matched one.
 *
 * **Details**
 *
 * Returns `never` if `E` has no `reason` field or no remaining variants.
 *
 * **Example** (Omitting a reason variant)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
 * type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
 * type ApiError = { readonly _tag: "ApiError"; readonly reason: RateLimitError | QuotaError }
 *
 * type Result = Types.OmitReason<ApiError, "RateLimitError">
 * // ApiError & { readonly reason: { readonly _tag: "QuotaError"; readonly limit: number } }
 *
 * const witness: Result = {
 *   _tag: "ApiError",
 *   reason: { _tag: "QuotaError", limit: 10 }
 * }
 * ```
 *
 * @see {@link NarrowReason}
 * @see {@link ExcludeReason}
 * @see {@link ReasonOf}
 * @see {@link ReasonTags}
 *
 * @category utility types
 * @since 4.0.0
 */
export type OmitReason<E, K extends string> = E extends { readonly reason: infer R }
  ? R extends { readonly _tag: infer T } ? K extends T ? never : E & { readonly reason: R }
  : never
  : never

/**
 * Excludes a specific reason variant by its `_tag` from an error's `reason`
 * field.
 *
 * **When to use**
 *
 * Use when you need the remaining nested reason union type after removing
 * variants handled by `_tag`, rather than the enclosing error type.
 *
 * **Details**
 *
 * Returns `never` if `E` has no `reason` field.
 *
 * **Example** (Excluding a reason variant)
 *
 * ```ts import.meta.vitest
 * import type { Types } from "effect"
 *
 * type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
 * type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
 * type ApiError = { readonly _tag: "ApiError"; readonly reason: RateLimitError | QuotaError }
 *
 * type Result = Types.ExcludeReason<ApiError, "RateLimitError">
 * // { readonly _tag: "QuotaError"; readonly limit: number }
 *
 * const witness: Result = { _tag: "QuotaError", limit: 10 }
 * ```
 *
 * @see {@link ExtractReason}
 * @see {@link ReasonOf}
 * @see {@link ReasonTags}
 *
 * @category utility types
 * @since 4.0.0
 */
export type ExcludeReason<E, K extends string> = E extends { readonly reason: infer R }
  ? Exclude<R, { readonly _tag: K }>
  : never

type RequiredKeysFrom_<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T]

type IsIndexKey_<K> = string extends K ? true : number extends K ? true : symbol extends K ? true : false

type WithoutIndexSignature_<T> = {
  [K in keyof T as IsIndexKey_<K> extends true ? never : K]: T[K]
}

/**
 * Extracts the keys of required properties from a type.
 *
 * @category utility types
 * @since 4.0.0
 */
export type RequiredKeys<T> = RequiredKeysFrom_<
  [T] extends [ReadonlyArray<unknown>] ? T
    : IsIndexKey_<keyof T> extends true ? WithoutIndexSignature_<T>
    : T
>
