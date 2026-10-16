/**
 * Works with TypeScript `boolean` values.
 *
 * This module exposes the native `Boolean` constructor together with helpers
 * for checking values, choosing between lazy branches, combining booleans with
 * logical operations, checking collections with `every` or `some`, ordering
 * booleans, and reducing boolean values.
 *
 * @since 2.0.0
 */
import * as Equ from "./Equivalence.ts"
import type { LazyArg } from "./Function.ts"
import { dual } from "./Function.ts"
import * as order from "./Order.ts"
import * as predicate from "./Predicate.ts"
import * as Reducer from "./Reducer.ts"

/**
 * Exposes the global boolean constructor for JavaScript truthiness
 * coercion.
 *
 * **When to use**
 *
 * Use to access native JavaScript truthiness coercion from the Effect module
 * namespace.
 *
 * **Gotchas**
 *
 * This follows native truthiness rules. For example, non-empty strings such as
 * `"false"` coerce to `true`.
 *
 * **Example** (Coercing values to booleans)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.Boolean(1) // => true
 * Boolean.Boolean("false") // => true
 * Boolean.Boolean(0) // => false
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const Boolean = globalThis.Boolean

/**
 * Checks whether a value is a `boolean`.
 *
 * **When to use**
 *
 * Use to validate unknown input and narrow it to `boolean`.
 *
 * **Example** (Checking for booleans)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.isBoolean(true) // => true
 * Boolean.isBoolean("true") // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isBoolean: (input: unknown) => input is boolean = predicate.isBoolean

/**
 * Chooses between two lazy branches based on a boolean value.
 *
 * **When to use**
 *
 * Use to choose between two lazy branches based on a boolean value.
 *
 * **Example** (Pattern matching on booleans)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.match(true, {
 *   onFalse: () => "It's false!",
 *   onTrue: () => "It's true!"
 * }) // => "It's true!"
 * ```
 *
 * @category pattern matching
 * @since 2.0.0
 */
export const match: {
  <A, B = A>(options: {
    readonly onFalse: LazyArg<A>
    readonly onTrue: LazyArg<B>
  }): (value: boolean) => A | B
  <A, B>(value: boolean, options: {
    readonly onFalse: LazyArg<A>
    readonly onTrue: LazyArg<B>
  }): A | B
} = dual(2, <A, B>(value: boolean, options: {
  readonly onFalse: LazyArg<A>
  readonly onTrue: LazyArg<B>
}): A | B => value ? options.onTrue() : options.onFalse())

/**
 * Provides an `Order` instance for `boolean` that allows comparing and sorting boolean values.
 * In this ordering, `false` is considered less than `true`.
 *
 * **When to use**
 *
 * Use when you need to sort or compare boolean values through APIs that accept
 * an ordering instance where `false` comes before `true`.
 *
 * **Example** (Comparing booleans)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.Order(false, true) // => -1
 * Boolean.Order(true, false) // => 1
 * Boolean.Order(true, true) // => 0
 * ```
 *
 * @category instances
 * @since 2.0.0
 */
export const Order: order.Order<boolean> = order.Boolean

/**
 * Equivalence instance for booleans using strict equality (`===`).
 *
 * **When to use**
 *
 * Use when checking boolean equality through APIs that accept an equivalence
 * relation.
 *
 * **Example** (Comparing booleans for equivalence)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.Equivalence(true, true) // => true
 * Boolean.Equivalence(true, false) // => false
 * ```
 *
 * @category instances
 * @since 2.0.0
 */
export const Equivalence: Equ.Equivalence<boolean> = Equ.Boolean

/**
 * Negates the given boolean: `!self`
 *
 * **When to use**
 *
 * Use to invert a boolean value.
 *
 * **Example** (Negating booleans)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.not(true) // => false
 * Boolean.not(false) // => true
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const not = (self: boolean): boolean => !self

/**
 * Combines two booleans using logical AND: `self && that`.
 *
 * **When to use**
 *
 * Use to require both boolean operands to be `true`.
 *
 * **Details**
 *
 * Supports both data-first and data-last forms.
 *
 * **Example** (Combining booleans with AND)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.and(true, true) // => true
 * Boolean.and(true, false) // => false
 * Boolean.and(false, true) // => false
 * Boolean.and(false, false) // => false
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const and: {
  (that: boolean): (self: boolean) => boolean
  (self: boolean, that: boolean): boolean
} = dual(2, (self: boolean, that: boolean): boolean => self && that)

/**
 * Combines two booleans using NAND: `!(self && that)`.
 *
 * **When to use**
 *
 * Use to negate a logical AND result.
 *
 * **Example** (Combining booleans with NAND)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.nand(true, true) // => false
 * Boolean.nand(true, false) // => true
 * Boolean.nand(false, true) // => true
 * Boolean.nand(false, false) // => true
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const nand: {
  (that: boolean): (self: boolean) => boolean
  (self: boolean, that: boolean): boolean
} = dual(2, (self: boolean, that: boolean): boolean => !(self && that))

/**
 * Combines two booleans using OR: `self || that`.
 *
 * **When to use**
 *
 * Use to accept when either boolean operand is `true`.
 *
 * **Example** (Combining booleans with OR)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.or(true, true) // => true
 * Boolean.or(true, false) // => true
 * Boolean.or(false, true) // => true
 * Boolean.or(false, false) // => false
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const or: {
  (that: boolean): (self: boolean) => boolean
  (self: boolean, that: boolean): boolean
} = dual(2, (self: boolean, that: boolean): boolean => self || that)

/**
 * Combines two booleans using NOR: `!(self || that)`.
 *
 * **When to use**
 *
 * Use to accept only when both boolean operands are `false`.
 *
 * **Example** (Combining booleans with NOR)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.nor(true, true) // => false
 * Boolean.nor(true, false) // => false
 * Boolean.nor(false, true) // => false
 * Boolean.nor(false, false) // => true
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const nor: {
  (that: boolean): (self: boolean) => boolean
  (self: boolean, that: boolean): boolean
} = dual(2, (self: boolean, that: boolean): boolean => !(self || that))

/**
 * Combines two booleans using XOR: `(!self && that) || (self && !that)`.
 *
 * **When to use**
 *
 * Use to accept when exactly one boolean operand is `true`.
 *
 * **Example** (Combining booleans with XOR)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.xor(true, true) // => false
 * Boolean.xor(true, false) // => true
 * Boolean.xor(false, true) // => true
 * Boolean.xor(false, false) // => false
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const xor: {
  (that: boolean): (self: boolean) => boolean
  (self: boolean, that: boolean): boolean
} = dual(2, (self: boolean, that: boolean): boolean => (!self && that) || (self && !that))

/**
 * Combines two booleans using EQV (aka XNOR): `!xor(self, that)`.
 *
 * **When to use**
 *
 * Use to accept when both boolean operands have the same truth value.
 *
 * **Example** (Checking boolean equivalence)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.eqv(true, true) // => true
 * Boolean.eqv(true, false) // => false
 * Boolean.eqv(false, true) // => false
 * Boolean.eqv(false, false) // => true
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const eqv: {
  (that: boolean): (self: boolean) => boolean
  (self: boolean, that: boolean): boolean
} = dual(2, (self: boolean, that: boolean): boolean => !xor(self, that))

/**
 * Combines two booleans using an implication: `(!self || that)`.
 *
 * **When to use**
 *
 * Use to model logical implication between a condition and a consequence.
 *
 * **Example** (Checking boolean implication)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.implies(true, true) // => true
 * Boolean.implies(true, false) // => false
 * Boolean.implies(false, true) // => true
 * Boolean.implies(false, false) // => true
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const implies: {
  (that: boolean): (self: boolean) => boolean
  (self: boolean, that: boolean): boolean
} = dual(2, (self, that) => self ? that : true)

/**
 * Checks whether every boolean in a collection is `true`.
 *
 * **When to use**
 *
 * Use to check that every boolean in an iterable is `true`.
 *
 * **Example** (Checking every boolean)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.every([true, true, true]) // => true
 * Boolean.every([true, false, true]) // => false
 * ```
 *
 * @see {@link some} for checking whether at least one value is `true`
 * @see {@link ReducerAnd} for reducing booleans with AND through a `Reducer`
 *
 * @category predicates
 * @since 2.0.0
 */
export const every = (collection: Iterable<boolean>): boolean => {
  for (const b of collection) {
    if (!b) {
      return false
    }
  }
  return true
}

/**
 * Checks whether at least one boolean in a collection is `true`.
 *
 * **When to use**
 *
 * Use to check that at least one boolean in an iterable is `true`.
 *
 * **Example** (Checking some booleans)
 *
 * ```ts import.meta.vitest
 * import { Boolean } from "effect"
 *
 * Boolean.some([true, false, true]) // => true
 * Boolean.some([false, false, false]) // => false
 * ```
 *
 * @see {@link every} for checking whether all values are `true`
 * @see {@link ReducerOr} for reducing booleans with OR through a `Reducer`
 *
 * @category predicates
 * @since 2.0.0
 */
export const some = (collection: Iterable<boolean>): boolean => {
  for (const b of collection) {
    if (b) {
      return true
    }
  }
  return false
}

/**
 * Reducer for combining `boolean`s using AND.
 *
 * **When to use**
 *
 * Use to require every accumulated boolean to be `true` through APIs that
 * consume a `Reducer`.
 *
 * **Details**
 *
 * The `initialValue` is `true`, so `combineAll([])` returns `true`.
 *
 * **Gotchas**
 *
 * `combineAll` uses the default left-to-right `Reducer.make` fold and does not
 * short-circuit on `false`.
 *
 * @see {@link ReducerOr} for reducing with OR semantics
 * @see {@link every} for checking an iterable directly
 *
 * @category math
 * @since 4.0.0
 */
export const ReducerAnd: Reducer.Reducer<boolean> = Reducer.make((a, b) => a && b, true)

/**
 * Reducer for combining `boolean`s using OR.
 *
 * **When to use**
 *
 * Use to reduce boolean values where the result should be `true` if any
 * combined value is `true`.
 *
 * **Details**
 *
 * The `initialValue` is `false`.
 *
 * @see {@link ReducerAnd} for reducing with AND semantics
 * @see {@link some} for checking an iterable directly
 *
 * @category math
 * @since 4.0.0
 */
export const ReducerOr: Reducer.Reducer<boolean> = Reducer.make((a, b) => a || b, false)
