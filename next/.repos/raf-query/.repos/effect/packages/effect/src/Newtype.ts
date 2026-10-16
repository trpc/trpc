/**
 * Creates compile-time-only wrappers around existing value types.
 *
 * A newtype lets TypeScript distinguish values with the same runtime shape, such
 * as two different ids that are both strings. The tag exists only in the type
 * system, so wrapping does not allocate a runtime object. This module includes
 * the base `Newtype` interface, wrapping and unwrapping helpers, optics, and
 * helpers for reusing carrier instances such as `Equivalence`, `Order`,
 * `Combiner`, and `Reducer`.
 *
 * @since 4.0.0
 */
import type * as Combiner from "./Combiner.ts"
import type * as Equivalence from "./Equivalence.ts"
import { cast } from "./Function.ts"
import * as Optic from "./Optic.ts"
import type * as Order from "./Order.ts"
import type * as Reducer from "./Reducer.ts"

const TypeId = "~effect/Newtype"

/**
 * A tagged interface that wraps a carrier type under a unique key, preventing
 * accidental interchange of structurally identical values.
 *
 * **When to use**
 *
 * Use to define a newtype as an `interface` extending
 * `Newtype<"MyKey", CarrierType>` when structurally identical carrier types
 * should remain distinct in TypeScript.
 *
 * **Details**
 *
 * The tag is compile-time only, so no runtime wrapper is allocated. Use
 * {@link makeIso} to create a two-way conversion, or {@link value} to unwrap.
 *
 * **Example** (Defining a newtype)
 *
 * ```ts import.meta.vitest
 * import { Newtype } from "effect"
 *
 * interface UserId extends Newtype.Newtype<"UserId", number> {}
 * interface OrderId extends Newtype.Newtype<"OrderId", number> {}
 *
 * const userId = Newtype.makeIso<UserId>().set(1)
 * // UserId and OrderId are not assignable to each other
 * // even though both wrap `number`.
 * // @ts-expect-error
 * const orderId: OrderId = userId
 *
 * Newtype.value(userId) // => 1
 * ```
 *
 * @see {@link makeIso} — create an iso to wrap and unwrap
 * @see {@link value} — unwrap a newtype value
 *
 * @category models
 * @since 4.0.0
 */
export interface Newtype<in out Key extends string, out Carrier> {
  readonly [TypeId]: {
    readonly key: Key
    readonly carrier: Carrier
  }
}

/**
 * Namespace containing type-level helpers for `Newtype` values, including
 * constraints and utilities for extracting a newtype's key and carrier type.
 *
 * **When to use**
 *
 * Use to access generic constraints and type-level utilities for `Newtype`
 * values.
 *
 * @since 4.0.0
 */
export declare namespace Newtype {
  /**
   * A type that matches any `Newtype`, useful as a generic constraint:
   * `<N extends Newtype.Any>`.
   *
   * **When to use**
   *
   * Use as a generic constraint when a type parameter can be any `Newtype`.
   *
   * @see {@link Newtype} — the base tagged interface
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Any = Newtype<any, unknown>

  /**
   * Extracts the key literal type from a newtype.
   *
   * **When to use**
   *
   * Use to inspect or constrain a newtype's key in generic code.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Key<N extends Any> = N extends Newtype<infer Key, unknown> ? Key : never

  /**
   * Extracts the carrier (underlying) type from a newtype.
   *
   * **When to use**
   *
   * Use when you need to refer to the wrapped type in generic utilities.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Carrier<N extends Any> = N extends Newtype<infer _Key, infer Carrier> ? Carrier : never
}

/**
 * Unwraps a newtype value, returning the underlying carrier value.
 *
 * **When to use**
 *
 * Use when you need the carrier value from an existing newtype without
 * constructing a new newtype value at the same call site.
 *
 * **Details**
 *
 * This has zero runtime cost because it is an identity cast.
 *
 * **Example** (Unwrapping a newtype)
 *
 * ```ts import.meta.vitest
 * import { Newtype } from "effect"
 *
 * interface Label extends Newtype.Newtype<"Label", string> {}
 *
 * const iso = Newtype.makeIso<Label>()
 * const label = iso.set("hello")
 *
 * const raw: string = Newtype.value(label)
 * raw // => "hello"
 * ```
 *
 * @see {@link makeIso} — two-way conversion (wrap and unwrap)
 *
 * @category getters
 * @since 4.0.0
 */
export const value: <N extends Newtype.Any>(newtype: N) => Newtype.Carrier<N> = cast

/**
 * Creates an `Optic.Iso` for a newtype, providing both wrapping (`set`) and
 * unwrapping (`get`).
 *
 * **When to use**
 *
 * Use as the primary way to construct and deconstruct newtype values.
 *
 * **Details**
 *
 * The returned iso composes with other optics via the standard `Optic` API.
 * Both directions have zero runtime cost because they are identity casts.
 *
 * **Example** (Wrapping and unwrapping with an iso)
 *
 * ```ts import.meta.vitest
 * import { Newtype } from "effect"
 *
 * interface Label extends Newtype.Newtype<"Label", string> {}
 *
 * const labelIso = Newtype.makeIso<Label>()
 *
 * const label: Label = labelIso.set("world")
 * const str: string = labelIso.get(label)
 * str // => "world"
 * ```
 *
 * @see {@link value} — unwrap only
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeIso<N extends Newtype.Any>(): Optic.Iso<N, Newtype.Carrier<N>> {
  return Optic.makeIso(value, cast)
}

/**
 * Lifts an `Equivalence` for the carrier type into an `Equivalence` for the
 * newtype.
 *
 * **When to use**
 *
 * Use when you need equality for newtype-wrapped values to behave like
 * equality for the wrapped carrier value, without manually unwrapping.
 *
 * **Details**
 *
 * The returned equivalence delegates to the provided carrier equivalence and
 * has zero runtime cost beyond the underlying equivalence check.
 *
 * **Example** (Comparing newtypes)
 *
 * ```ts import.meta.vitest
 * import { Equivalence, Newtype } from "effect"
 *
 * interface Label extends Newtype.Newtype<"Label", string> {}
 *
 * const eq = Newtype.makeEquivalence<Label>(Equivalence.String)
 * const iso = Newtype.makeIso<Label>()
 *
 * eq(iso.set("a"), iso.set("a")) // => true
 * eq(iso.set("a"), iso.set("b")) // => false
 * ```
 *
 * @see {@link makeOrder} — lift an `Order` for the carrier
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeEquivalence: <N extends Newtype.Any>(
  equivalence: Equivalence.Equivalence<Newtype.Carrier<N>>
) => Equivalence.Equivalence<N> = cast

/**
 * Lifts an `Order` for the carrier type into an `Order` for the newtype.
 *
 * **When to use**
 *
 * Use when you need to sort newtype-wrapped values according to the ordering
 * of the wrapped carrier value, without manually unwrapping.
 *
 * **Details**
 *
 * The returned order delegates to the provided carrier order.
 *
 * **Example** (Ordering newtypes)
 *
 * ```ts import.meta.vitest
 * import { Newtype, Order } from "effect"
 *
 * interface Score extends Newtype.Newtype<"Score", number> {}
 *
 * const ord = Newtype.makeOrder<Score>(Order.Number)
 * const iso = Newtype.makeIso<Score>()
 *
 * ord(iso.set(1), iso.set(2)) // => -1
 * ```
 *
 * @see {@link makeEquivalence} — lift an `Equivalence` for the carrier
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeOrder: <N extends Newtype.Any>(order: Order.Order<Newtype.Carrier<N>>) => Order.Order<N> = cast

/**
 * Lifts a `Combiner` for the carrier type into a `Combiner` for the newtype.
 *
 * **When to use**
 *
 * Use when you need to combine newtype-wrapped values with the carrier's
 * combining logic, without manually unwrapping.
 *
 * **Details**
 *
 * The returned combiner delegates to the provided carrier combiner.
 *
 * **Example** (Combining newtypes)
 *
 * ```ts import.meta.vitest
 * import { Combiner, Newtype } from "effect"
 *
 * interface Amount extends Newtype.Newtype<"Amount", number> {}
 *
 * const sum = Combiner.make<number>((a, b) => a + b)
 * const combiner = Newtype.makeCombiner<Amount>(sum)
 * const iso = Newtype.makeIso<Amount>()
 *
 * const total = combiner.combine(iso.set(10), iso.set(20))
 * Newtype.value(total) // => 30
 * ```
 *
 * @see {@link makeReducer} — lift a `Reducer` for the carrier
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeCombiner: <N extends Newtype.Any>(
  combiner: Combiner.Combiner<Newtype.Carrier<N>>
) => Combiner.Combiner<N> = cast

/**
 * Lifts a `Reducer` for the carrier type into a `Reducer` for the newtype.
 *
 * **When to use**
 *
 * Use when you need to reduce a collection of newtype-wrapped values with the
 * carrier's reducer, without manually unwrapping.
 *
 * **Details**
 *
 * The returned reducer delegates to the provided carrier reducer.
 *
 * **Example** (Reducing newtypes)
 *
 * ```ts import.meta.vitest
 * import { Newtype, Reducer } from "effect"
 *
 * interface Score extends Newtype.Newtype<"Score", number> {}
 *
 * const sum = Reducer.make<number>((a, b) => a + b, 0)
 * const reducer = Newtype.makeReducer<Score>(sum)
 * const iso = Newtype.makeIso<Score>()
 *
 * const total = reducer.combineAll([iso.set(1), iso.set(2), iso.set(3)])
 * Newtype.value(total) // => 6
 * ```
 *
 * @see {@link makeCombiner} — lift a `Combiner` for the carrier
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeReducer: <N extends Newtype.Any>(reducer: Reducer.Reducer<Newtype.Carrier<N>>) => Reducer.Reducer<N> =
  cast
