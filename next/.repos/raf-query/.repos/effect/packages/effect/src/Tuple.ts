/**
 * Works with fixed-length arrays, also called tuples.
 *
 * The runtime helpers in this module create new tuples instead of mutating
 * their inputs, and the types preserve element positions where possible. The
 * helpers cover tuple construction, indexed access, selecting or removing
 * positions, appending values, transforming elements, renaming indices, mapping
 * typed positions, and deriving comparison or combination helpers for tuple
 * shapes.
 *
 * @since 2.0.0
 */
import * as Combiner from "./Combiner.ts"
import * as Equivalence from "./Equivalence.ts"
import { dual } from "./Function.ts"
import * as order from "./Order.ts"
import * as Reducer from "./Reducer.ts"
import type { Apply, Lambda } from "./Struct.ts"

/**
 * Creates a tuple from the provided arguments.
 *
 * **When to use**
 *
 * Use when you need a properly typed tuple without writing `[a, b, c] as const`
 * or another manual cast.
 *
 * **Details**
 *
 * The returned value has the exact tuple type, with each element's literal type
 * preserved.
 *
 * **Example** (Creating a tuple)
 *
 * ```ts import.meta.vitest
 * import { Tuple } from "effect"
 *
 * Tuple.make(10, 20, "red") // => [10, 20, "red"]
 * ```
 *
 * @see {@link get} – access a single element by index
 * @see {@link appendElement} – append an element to a tuple
 * @category constructors
 * @since 2.0.0
 */
export const make = <const Elements extends ReadonlyArray<unknown>>(...elements: [...Elements]): [...Elements] =>
  elements

type Indices<T extends ReadonlyArray<unknown>> = Exclude<Partial<T>["length"], T["length"]>

/**
 * Retrieves the element at the specified index from a tuple.
 *
 * **When to use**
 *
 * Use when a single tuple element should be extracted in a pipeline.
 *
 * **Details**
 *
 * The index is constrained to valid tuple positions at the type level.
 *
 * **Example** (Extracting an element by index)
 *
 * ```ts import.meta.vitest
 * import { pipe, Tuple } from "effect"
 *
 * pipe(Tuple.make(1, true, "hello"), Tuple.get(2)) // => "hello"
 * ```
 *
 * @see {@link make} – create a tuple
 * @see {@link pick} – extract multiple elements into a new tuple
 * @category getters
 * @since 4.0.0
 */
export const get: {
  <const T extends ReadonlyArray<unknown>, I extends Indices<T> & keyof T>(index: I): (self: T) => T[I]
  <const T extends ReadonlyArray<unknown>, I extends Indices<T> & keyof T>(self: T, index: I): T[I]
} = dual(2, <T extends ReadonlyArray<unknown>, I extends keyof T>(self: T, index: I): T[I] => self[index])

type _BuildTuple<
  T extends ReadonlyArray<unknown>,
  K,
  Acc extends ReadonlyArray<unknown> = [],
  I extends ReadonlyArray<unknown> = [] // current index counter
> = I["length"] extends T["length"] ? Acc
  : _BuildTuple<
    T,
    K,
    // If current index is in K, keep the element; otherwise skip it
    I["length"] extends K ? [...Acc, T[I["length"]]] : Acc,
    [...I, unknown]
  >

type PickTuple<T extends ReadonlyArray<unknown>, I extends ReadonlyArray<Indices<T>>> = {
  -readonly [K in keyof I]: T[I[K] & keyof T]
}

/**
 * Creates a new tuple containing only the elements at the specified indices.
 *
 * **When to use**
 *
 * Use to select a subset of elements from a tuple by position.
 *
 * **Details**
 *
 * The result order matches the order of the provided indices.
 *
 * **Example** (Selecting elements by index)
 *
 * ```ts import.meta.vitest
 * import { Tuple } from "effect"
 *
 * Tuple.pick(["a", "b", "c", "d"], [0, 2, 3]) // => ["a", "c", "d"]
 * ```
 *
 * @see {@link omit} – the inverse (exclude indices instead)
 * @see {@link get} – extract a single element
 * @category filtering
 * @since 4.0.0
 */
export const pick: {
  <const T extends ReadonlyArray<unknown>, const I extends ReadonlyArray<Indices<T>>>(
    indices: I
  ): (self: T) => PickTuple<T, I>
  <const T extends ReadonlyArray<unknown>, const I extends ReadonlyArray<Indices<T>>>(
    self: T,
    indices: I
  ): PickTuple<T, I>
} = dual(
  2,
  <const T extends ReadonlyArray<unknown>>(
    self: T,
    indices: ReadonlyArray<number>
  ) => {
    return indices.map((i) => self[i])
  }
)

type OmitTuple<T extends ReadonlyArray<unknown>, K> = _BuildTuple<T, Exclude<Indices<T>, K>>

/**
 * Creates a new tuple with the elements at the specified indices removed.
 *
 * **When to use**
 *
 * Use to drop elements from a tuple by position.
 *
 * **Details**
 *
 * Elements not at the specified indices are kept in their original order.
 *
 * **Example** (Removing elements by index)
 *
 * ```ts import.meta.vitest
 * import { Tuple } from "effect"
 *
 * Tuple.omit(["a", "b", "c", "d"], [1, 3]) // => ["a", "c"]
 * ```
 *
 * @see {@link pick} – the inverse (keep only specified indices)
 * @category filtering
 * @since 4.0.0
 */
export const omit: {
  <const T extends ReadonlyArray<unknown>, const I extends ReadonlyArray<Indices<T>>>(
    indices: I
  ): (self: T) => OmitTuple<T, I[number]>
  <const T extends ReadonlyArray<unknown>, const I extends ReadonlyArray<Indices<T>>>(
    self: T,
    indices: I
  ): OmitTuple<T, I[number]>
} = dual(
  2,
  <const T extends ReadonlyArray<unknown>>(
    self: T,
    indices: ReadonlyArray<number>
  ) => {
    const toDrop = new Set<number>(indices)
    return self.filter((_, i) => !toDrop.has(i))
  }
)

/**
 * Appends a single element to the end of a tuple.
 *
 * **When to use**
 *
 * Use when you need the appended value to remain part of the tuple's type-level
 * shape and preserve literal element positions.
 *
 * **Details**
 *
 * The result type is `[...T, E]`, preserving all existing element types.
 *
 * **Example** (Appending an element)
 *
 * ```ts import.meta.vitest
 * import { pipe, Tuple } from "effect"
 *
 * pipe(Tuple.make(1, 2), Tuple.appendElement("end")) // => [1, 2, "end"]
 * ```
 *
 * @see {@link appendElements} – append multiple elements (another tuple)
 * @category combining
 * @since 2.0.0
 */
export const appendElement: {
  <const E>(element: E): <const T extends ReadonlyArray<unknown>>(self: T) => [...T, E]
  <const T extends ReadonlyArray<unknown>, const E>(self: T, element: E): [...T, E]
} = dual(2, <T extends ReadonlyArray<unknown>, E>(self: T, element: E): [...T, E] => [...self, element])

/**
 * Concatenates two tuples into a single tuple.
 *
 * **When to use**
 *
 * Use to append all elements from one tuple to another tuple.
 *
 * **Details**
 *
 * The result type is `[...T1, ...T2]`, preserving all element types from both
 * tuples. Neither input tuple is mutated; a fresh tuple is returned.
 *
 * **Example** (Concatenating tuples)
 *
 * ```ts import.meta.vitest
 * import { pipe, Tuple } from "effect"
 *
 * pipe(Tuple.make(1, 2), Tuple.appendElements(["a", "b"] as const)) // => [1, 2, "a", "b"]
 * ```
 *
 * @see {@link appendElement} – append a single element
 * @category combining
 * @since 4.0.0
 */
export const appendElements: {
  <const T2 extends ReadonlyArray<unknown>>(
    that: T2
  ): <const T1 extends ReadonlyArray<unknown>>(self: T1) => [...T1, ...T2]
  <const T1 extends ReadonlyArray<unknown>, const T2 extends ReadonlyArray<unknown>>(self: T1, that: T2): [...T1, ...T2]
} = dual(
  2,
  <T1 extends ReadonlyArray<unknown>, T2 extends ReadonlyArray<unknown>>(
    self: T1,
    that: T2
  ): [...T1, ...T2] => [...self, ...that]
)

type Evolver<T> = { readonly [I in keyof T]?: ((a: T[I]) => unknown) | undefined }

type EvolveElement<A, F> = F extends (...a: any) => infer R ? R : A

type Evolved<T, E> = { [I in keyof T]: I extends keyof E ? EvolveElement<T[I], E[I]> : T[I] }

/**
 * Transforms elements of a tuple by providing an array of transform functions.
 * Each function applies to the element at the same position. Positions beyond
 * the array's length are copied unchanged.
 *
 * **When to use**
 *
 * Use when you want to update the first N elements while keeping the rest.
 *
 * **Details**
 *
 * Each transform function receives the current value and can return a different
 * type.
 *
 * **Example** (Transforming selected elements)
 *
 * ```ts import.meta.vitest
 * import { pipe, Tuple } from "effect"
 *
 * pipe(
 *   Tuple.make("hello", 42, true),
 *   Tuple.evolve([
 *     (s) => s.toUpperCase(),
 *     (n) => n * 2
 *   ])
 * ) // => ["HELLO", 84, true]
 * ```
 *
 * @see {@link map} – apply the same transformation to all elements
 * @see {@link renameIndices} – swap element positions
 * @category mapping
 * @since 4.0.0
 */
export const evolve: {
  <const T extends ReadonlyArray<unknown>, const E extends Evolver<T>>(evolver: E): (self: T) => Evolved<T, E>
  <const T extends ReadonlyArray<unknown>, const E extends Evolver<T>>(self: T, evolver: E): Evolved<T, E>
} = dual(
  2,
  <const T extends ReadonlyArray<unknown>, const E extends Evolver<T>>(self: T, evolver: E) => {
    return self.map((e, i) => (evolver[i] !== undefined ? evolver[i](e) : e))
  }
)

/**
 * Renames tuple indices by providing an array of stringified source
 * indices. Each position in the array specifies which index to read from
 * (e.g., `["2", "1", "0"]` reverses a 3-element tuple).
 *
 * **When to use**
 *
 * Use to reorder tuple elements while preserving index-specific types.
 *
 * **Details**
 *
 * The mapping returns a tuple in the requested index order.
 *
 * **Gotchas**
 *
 * The mapping uses stringified source indices, not arbitrary names.
 *
 * **Example** (Swapping elements)
 *
 * ```ts import.meta.vitest
 * import { pipe, Tuple } from "effect"
 *
 * pipe(
 *   Tuple.make("a", "b", "c"),
 *   Tuple.renameIndices(["2", "1", "0"])
 * ) // => ["c", "b", "a"]
 * ```
 *
 * @see {@link evolve} – transform element values instead of positions
 * @category transforming
 * @since 4.0.0
 */
export const renameIndices: {
  <const T extends ReadonlyArray<unknown>, const M extends { readonly [I in keyof T]?: `${keyof T & string}` }>(
    mapping: M
  ): (self: T) => { [I in keyof T]: I extends keyof M ? M[I] extends keyof T ? T[M[I]] : T[I] : T[I] }
  <const T extends ReadonlyArray<unknown>, const M extends { readonly [I in keyof T]?: `${keyof T & string}` }>(
    self: T,
    mapping: M
  ): { [I in keyof T]: I extends keyof M ? M[I] extends keyof T ? T[M[I]] : T[I] : T[I] }
} = dual(
  2,
  <const T extends ReadonlyArray<unknown>, const M extends { readonly [I in keyof T]?: `${keyof T & string}` }>(
    self: T,
    mapping: M
  ) => {
    return self.map((e, i) => mapping[i] !== undefined ? self[mapping[i]] : e)
  }
)

/**
 * Applies a `Struct.Lambda` transformation to every element in a tuple.
 *
 * **When to use**
 *
 * Use when you want to apply the same transformation to every tuple element.
 *
 * **Details**
 *
 * The lambda lets the compiler track the output type for each element.
 *
 * **Gotchas**
 *
 * The lambda must be created with `Struct.lambda`; a plain function will not
 * type-check.
 *
 * **Example** (Wrapping every element in an array)
 *
 * ```ts import.meta.vitest
 * import { pipe, Struct, Tuple } from "effect"
 *
 * interface AsArray extends Struct.Lambda {
 *   <A>(self: A): Array<A>
 *   readonly "~lambda.out": Array<this["~lambda.in"]>
 * }
 *
 * const asArray = Struct.lambda<AsArray>((a) => [a])
 * pipe(Tuple.make(1, "hello", true), Tuple.map(asArray)) // => [[1], ["hello"], [true]]
 * ```
 *
 * @see {@link mapPick} – apply a lambda only to selected indices
 * @see {@link mapOmit} – apply a lambda to all indices except selected ones
 * @see {@link evolve} – apply different functions to different indices
 * @category mapping
 * @since 3.9.0
 */
export const map: {
  <L extends Lambda>(
    lambda: L
  ): <const T extends ReadonlyArray<unknown>>(
    self: T
  ) => { [K in keyof T]: Apply<L, T[K]> }
  <const T extends ReadonlyArray<unknown>, L extends Lambda>(
    self: T,
    lambda: L
  ): { [K in keyof T]: Apply<L, T[K]> }
} = dual(
  2,
  <const T extends ReadonlyArray<unknown>, L extends Function>(self: T, lambda: L) => {
    return self.map((e) => lambda(e))
  }
)

/**
 * Applies a `Struct.Lambda` transformation only to the elements at the
 * specified indices; all other elements are copied unchanged.
 *
 * **When to use**
 *
 * Use when you want to apply the same transformation to a subset of
 * positions.
 *
 * **Example** (Wrapping only selected elements in arrays)
 *
 * ```ts import.meta.vitest
 * import { pipe, Struct, Tuple } from "effect"
 *
 * interface AsArray extends Struct.Lambda {
 *   <A>(self: A): Array<A>
 *   readonly "~lambda.out": Array<this["~lambda.in"]>
 * }
 *
 * const asArray = Struct.lambda<AsArray>((a) => [a])
 * pipe(
 *   Tuple.make(1, "hello", true),
 *   Tuple.mapPick([0, 2], asArray)
 * ) // => [[1], "hello", [true]]
 * ```
 *
 * @see {@link map} – apply a lambda to all elements
 * @see {@link mapOmit} – apply a lambda to all elements except selected ones
 * @category mapping
 * @since 4.0.0
 */
export const mapPick: {
  <const T extends ReadonlyArray<unknown>, const I extends ReadonlyArray<Indices<T>>, L extends Lambda>(
    indices: I,
    lambda: L
  ): (
    self: T
  ) => { [K in keyof T]: K extends `${I[number]}` ? Apply<L, T[K]> : T[K] }
  <const T extends ReadonlyArray<unknown>, const I extends ReadonlyArray<Indices<T>>, L extends Lambda>(
    self: T,
    indices: I,
    lambda: L
  ): { [K in keyof T]: K extends `${I[number]}` ? Apply<L, T[K]> : T[K] }
} = dual(
  3,
  <const T extends ReadonlyArray<unknown>, L extends Function>(
    self: T,
    indices: ReadonlyArray<number>,
    lambda: L
  ) => {
    const toPick = new Set<number>(indices)
    return self.map((e, i) => (toPick.has(i) ? lambda(e) : e))
  }
)

/**
 * Applies a `Struct.Lambda` transformation to all elements except those at the
 * specified indices; the excluded elements are copied unchanged.
 *
 * **When to use**
 *
 * Use when most elements should be transformed but a few should be
 * preserved.
 *
 * **Example** (Wrapping all elements except one in arrays)
 *
 * ```ts import.meta.vitest
 * import { pipe, Struct, Tuple } from "effect"
 *
 * interface AsArray extends Struct.Lambda {
 *   <A>(self: A): Array<A>
 *   readonly "~lambda.out": Array<this["~lambda.in"]>
 * }
 *
 * const asArray = Struct.lambda<AsArray>((a) => [a])
 * pipe(
 *   Tuple.make(1, "hello", true),
 *   Tuple.mapOmit([1], asArray)
 * ) // => [[1], "hello", [true]]
 * ```
 *
 * @see {@link map} – apply a lambda to all elements
 * @see {@link mapPick} – apply a lambda only to selected indices
 * @category mapping
 * @since 4.0.0
 */
export const mapOmit: {
  <const T extends ReadonlyArray<unknown>, const I extends ReadonlyArray<Indices<T>>, L extends Lambda>(
    indices: I,
    lambda: L
  ): (
    self: T
  ) => { [K in keyof T]: K extends `${I[number]}` ? T[K] : Apply<L, T[K]> }
  <const T extends ReadonlyArray<unknown>, const I extends ReadonlyArray<Indices<T>>, L extends Lambda>(
    self: T,
    indices: I,
    lambda: L
  ): { [K in keyof T]: K extends `${I[number]}` ? T[K] : Apply<L, T[K]> }
} = dual(
  3,
  <const T extends ReadonlyArray<unknown>, L extends Function>(
    self: T,
    indices: ReadonlyArray<number>,
    lambda: L
  ) => {
    const toOmit = new Set<number>(indices)
    return self.map((e, i) => (toOmit.has(i) ? e : lambda(e)))
  }
)

/**
 * Creates an `Equivalence` for tuples by comparing corresponding elements
 * using the provided per-position `Equivalence`s. Two tuples are equivalent
 * when all their corresponding elements are equivalent.
 *
 * **When to use**
 *
 * Use when you need an `Equivalence` to compare tuples element-by-element.
 *
 * **Details**
 *
 * This is an alias of `Equivalence.Tuple`.
 *
 * **Example** (Comparing tuples for equivalence)
 *
 * ```ts import.meta.vitest
 * import { Equivalence, Tuple } from "effect"
 *
 * const eq = Tuple.makeEquivalence([
 *   Equivalence.strictEqual<string>(),
 *   Equivalence.strictEqual<number>()
 * ])
 *
 * eq(["Alice", 30], ["Alice", 30]) // => true
 * eq(["Alice", 30], ["Bob", 30]) // => false
 * ```
 *
 * @see {@link makeOrder} – create an `Order` for tuples
 * @category instances
 * @since 4.0.0
 */
export const makeEquivalence = Equivalence.Tuple

/**
 * Creates an `Order` for tuples by comparing corresponding elements using the
 * provided per-position `Order`s. Elements are compared left-to-right; the
 * first non-zero comparison determines the result.
 *
 * **When to use**
 *
 * Use when you need to sort fixed-position arrays lexicographically, with each
 * position using its own ordering rule.
 *
 * **Details**
 *
 * This is an alias of `Order.Tuple`.
 *
 * **Example** (Ordering tuples)
 *
 * ```ts import.meta.vitest
 * import { Number, String, Tuple } from "effect"
 *
 * const ord = Tuple.makeOrder([String.Order, Number.Order])
 *
 * ord(["Alice", 30], ["Bob", 25]) // => -1
 * ord(["Alice", 30], ["Alice", 30]) // => 0
 * ```
 *
 * @see {@link makeEquivalence} – create an `Equivalence` for tuples
 * @category ordering
 * @since 4.0.0
 */
export const makeOrder = order.Tuple

export {
  /**
   * Checks whether an array has exactly `N` elements, narrowing the type to a
   * fixed-length tuple.
   *
   * **When to use**
   *
   * Use to guard that an array has exactly the tuple length expected at
   * runtime.
   *
   * **Details**
   *
   * This is a re-export of `Predicate.isTupleOf`. It narrows the type to
   * `TupleOf<N, T>` in the truthy branch.
   *
   * **Gotchas**
   *
   * This only checks `.length`; it does not validate element types.
   *
   * **Example** (Checking exact length)
   *
   * ```ts import.meta.vitest
   * import { Tuple } from "effect"
   *
   * const arr: Array<number> = [1, 2, 3]
   * if (Tuple.isTupleOf(arr, 3)) {
   *   arr // => [1, 2, 3]
   * }
   * ```
   *
   * @see `isTupleOfAtLeast` – check for a minimum length
   * @category guards
   * @since 3.3.0
   */
  isTupleOf,
  /**
   * Checks whether an array has at least `N` elements, narrowing the type to a
   * tuple with a minimum length.
   *
   * **When to use**
   *
   * Use to guard that an array has at least the tuple length expected at
   * runtime.
   *
   * **Details**
   *
   * This is a re-export of `Predicate.isTupleOfAtLeast`. It narrows the type to
   * `TupleOfAtLeast<N, T>` in the truthy branch.
   *
   * **Gotchas**
   *
   * This only checks `.length`; it does not validate element types.
   *
   * **Example** (Checking minimum length)
   *
   * ```ts import.meta.vitest
   * import { Tuple } from "effect"
   *
   * const arr: Array<number> = [1, 2, 3, 4]
   * if (Tuple.isTupleOfAtLeast(arr, 3)) {
   *   arr // => [1, 2, 3, 4]
   * }
   * ```
   *
   * @see `isTupleOf` – check for an exact length
   * @category guards
   * @since 3.3.0
   */
  isTupleOfAtLeast
} from "./Predicate.ts"

/**
 * Creates a `Combiner` for a tuple shape by providing a `Combiner` for each
 * position. When two tuples are combined, each element is merged using its
 * corresponding combiner.
 *
 * **When to use**
 *
 * Use when you need to merge two same-shape tuples by combining each position
 * independently, such as summing counters or concatenating strings.
 *
 * **Example** (Combining tuple elements)
 *
 * ```ts import.meta.vitest
 * import { Number, String, Tuple } from "effect"
 *
 * const C = Tuple.makeCombiner<readonly [number, string]>([
 *   Number.ReducerSum,
 *   String.ReducerConcat
 * ])
 *
 * C.combine([1, "hello"], [2, " world"]) // => [3, "hello world"]
 * ```
 *
 * @see {@link makeReducer} – like `makeCombiner` but with an initial value
 * @category combining
 * @since 4.0.0
 */
export function makeCombiner<A extends ReadonlyArray<unknown>>(
  combiners: { readonly [K in keyof A]: Combiner.Combiner<A[K]> }
): Combiner.Combiner<A> {
  return Combiner.make((self, that) => {
    const out = []
    for (let i = 0; i < self.length; i++) {
      out.push(combiners[i].combine(self[i], that[i]))
    }
    return out as any
  })
}

/**
 * Creates a `Reducer` for a tuple shape by providing a `Reducer` for each
 * position. The initial value is derived from each position's
 * `Reducer.initialValue`. When reducing a collection of tuples, each element
 * is combined independently.
 *
 * **When to use**
 *
 * Use when you need to fold same-shape tuples by accumulating each position
 * independently into one summary tuple.
 *
 * **Example** (Reducing a collection of tuples)
 *
 * ```ts import.meta.vitest
 * import { Number, String, Tuple } from "effect"
 *
 * const R = Tuple.makeReducer<readonly [number, string]>([
 *   Number.ReducerSum,
 *   String.ReducerConcat
 * ])
 *
 * R.combineAll([
 *   [1, "a"],
 *   [2, "b"],
 *   [3, "c"]
 * ]) // => [6, "abc"]
 * ```
 *
 * @see {@link makeCombiner} – like `makeReducer` but without an initial value
 * @category folding
 * @since 4.0.0
 */
export function makeReducer<A extends ReadonlyArray<unknown>>(
  reducers: { readonly [K in keyof A]: Reducer.Reducer<A[K]> }
): Reducer.Reducer<A> {
  const combine = makeCombiner(reducers).combine
  const initialValue = []
  for (let i = 0; i < reducers.length; i++) {
    initialValue.push(reducers[i].initialValue)
  }
  return Reducer.make(combine, initialValue as unknown as A)
}
