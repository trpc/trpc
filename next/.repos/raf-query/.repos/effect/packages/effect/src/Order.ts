/**
 * Defines comparison functions for ordered values.
 *
 * An `Order<A>` compares two `A` values and returns whether the first is less
 * than, equal to, or greater than the second. Orders are used for sorting,
 * choosing minimum or maximum values, checking ranges, and building ordered data
 * structures. This module includes built-in orders, constructors for custom
 * orders, tools for reversing and combining comparisons, tuple and struct
 * helpers, comparison predicates, clamping, and reducer support.
 *
 * @since 2.0.0
 */
import { dual } from "./Function.ts"
import type { TypeLambda } from "./HKT.ts"
import type { Ordering } from "./Ordering.ts"
import * as Reducer from "./Reducer.ts"

/**
 * Represents a total ordering for values of type `A`.
 *
 * **When to use**
 *
 * Use when you need to define how values of a type are compared.
 *
 * **Details**
 *
 * An order returns `-1` when the first value is less than the second, `0` when
 * the values are equal according to this ordering, and `1` when the first value
 * is greater than the second. It must satisfy total ordering laws: totality,
 * antisymmetry, and transitivity.
 *
 * **Example** (Defining a custom Order)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const byAge: Order.Order<{ name: string; age: number }> = (self, that) => {
 *   if (self.age < that.age) return -1
 *   if (self.age > that.age) return 1
 *   return 0
 * }
 *
 * const person1 = { name: "Alice", age: 30 }
 * const person2 = { name: "Bob", age: 25 }
 * byAge(person1, person2) // => 1
 * ```
 *
 * @see {@link make} to create an order from a comparison function
 * @see {@link Ordering} for the result type of comparisons
 * @category models
 * @since 2.0.0
 */
export interface Order<in A> {
  (self: A, that: A): Ordering
}

/**
 * Type lambda for the `Order` type class, used internally for higher-kinded type operations.
 *
 * **When to use**
 *
 * Use when you need to abstract over `Order` in higher-kinded type code.
 *
 * **Details**
 *
 * This is type-level only, has no runtime representation, and is used
 * internally by the Effect type system.
 *
 * @category utility types
 * @since 2.0.0
 */
export interface OrderTypeLambda extends TypeLambda {
  readonly type: Order<this["Target"]>
}

/**
 * Creates a new `Order` instance from a comparison function.
 *
 * **When to use**
 *
 * Use when you need a sorting rule not covered by the built-in orders or input
 * mapping helpers, and you can provide a total comparison.
 *
 * **Details**
 *
 * Uses reference equality (`===`) as a shortcut: if `self === that`, it returns
 * `0` without calling the comparison function. The comparison function should
 * return `-1`, `0`, or `1`, and the returned order satisfies total ordering
 * laws when the comparison function does.
 *
 * **Example** (Creating an Order)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const byAge = Order.make<{ name: string; age: number }>((self, that) => {
 *   if (self.age < that.age) return -1
 *   if (self.age > that.age) return 1
 *   return 0
 * })
 *
 * byAge({ name: "Alice", age: 30 }, { name: "Bob", age: 25 }) // => 1
 * byAge({ name: "Alice", age: 25 }, { name: "Bob", age: 30 }) // => -1
 * ```
 *
 * @see {@link mapInput} to transform an order by mapping the input type
 * @see {@link combine} to combine multiple orders
 * @category constructors
 * @since 2.0.0
 */
export function make<A>(
  compare: (self: A, that: A) => -1 | 0 | 1
): Order<A> {
  return (self, that) => self === that ? 0 : compare(self, that)
}

/**
 * Order instance for strings that compares them lexicographically using JavaScript's `<` operator.
 *
 * **When to use**
 *
 * Use when you need lexicographic string ordering.
 *
 * **Details**
 *
 * Uses lexicographic dictionary ordering. The empty string is less than any
 * non-empty string, and comparisons are case-sensitive.
 *
 * **Example** (Ordering strings)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * Order.String("apple", "banana") // => -1
 * Order.String("banana", "apple") // => 1
 * Order.String("apple", "apple") // => 0
 * ```
 *
 * @see {@link mapInput} to compare objects by a string property
 * @see {@link Struct} to combine with other orders for struct comparison
 * @category instances
 * @since 4.0.0
 */
export const String: Order<string> = make((self, that) => self < that ? -1 : 1)

/**
 * Order instance for numbers that compares them numerically.
 *
 * **When to use**
 *
 * Use when you need numeric ordering for numbers.
 *
 * **Details**
 *
 * `0` is considered equal to `-0`. All `NaN` values are considered equal to
 * each other, and any `NaN` is considered less than any non-`NaN` number. All
 * other values use standard numeric comparison.
 *
 * **Example** (Ordering numbers)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * Order.Number(1, 1) // => 0
 * Order.Number(1, 2) // => -1
 * Order.Number(2, 1) // => 1
 *
 * Order.Number(0, -0) // => 0
 * Order.Number(NaN, 1) // => -1
 * ```
 *
 * @see {@link mapInput} to compare objects by a number property
 * @see {@link BigInt} for bigint comparisons
 * @category instances
 * @since 4.0.0
 */
export const Number: Order<number> = make((self, that) => {
  if (globalThis.Number.isNaN(self) && globalThis.Number.isNaN(that)) return 0
  if (globalThis.Number.isNaN(self)) return -1 // NaN < any number
  if (globalThis.Number.isNaN(that)) return 1 // any number > NaN
  return self < that ? -1 : 1
})

/**
 * Order instance for booleans where `false` is considered less than `true`.
 *
 * **When to use**
 *
 * Use when you need boolean ordering where `false` comes before `true`.
 *
 * **Details**
 *
 * `false` is less than `true`, and equal values return `0`.
 *
 * **Example** (Ordering booleans)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * Order.Boolean(false, true) // => -1
 * Order.Boolean(true, false) // => 1
 * Order.Boolean(true, true) // => 0
 * ```
 *
 * @see {@link mapInput} to compare objects by a boolean property
 * @category instances
 * @since 4.0.0
 */
export const Boolean: Order<boolean> = make((self, that) => self < that ? -1 : 1)

/**
 * Order instance for bigints that compares them numerically.
 *
 * **When to use**
 *
 * Use when you need numeric ordering for `bigint` values.
 *
 * **Details**
 *
 * Uses standard numeric comparison for bigint values and handles arbitrarily
 * large integers.
 *
 * **Example** (Ordering BigInts)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * Order.BigInt(1n, 2n) // => -1
 * Order.BigInt(2n, 1n) // => 1
 * Order.BigInt(1n, 1n) // => 0
 * ```
 *
 * @see {@link Number} for regular number comparisons
 * @see {@link mapInput} to compare objects by a bigint property
 * @category instances
 * @since 4.0.0
 */
export const BigInt: Order<bigint> = make((self, that) => self < that ? -1 : 1)

/**
 * Creates a new `Order` that reverses the comparison order of the input `Order`.
 *
 * **When to use**
 *
 * Use when you need the reverse of an existing order.
 *
 * **Details**
 *
 * Returns a new order that swaps the arguments before comparison. If the
 * original order returns `-1`, the flipped order returns `1`, and vice versa.
 * Equal comparisons remain `0`.
 *
 * **Example** (Reversing an Order)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const flip = Order.flip(Order.Number)
 *
 * flip(1, 2) // => 1
 * flip(2, 1) // => -1
 * flip(1, 1) // => 0
 * ```
 *
 * @see {@link combine} to combine orders for multi-criteria comparison
 * @category combinators
 * @since 4.0.0
 */
export function flip<A>(O: Order<A>): Order<A> {
  return make((self, that) => O(that, self))
}

/**
 * Combines two `Order` instances to create a new `Order` that first compares using the first `Order`,
 * and if the values are equal, then compares using the second `Order`.
 *
 * **When to use**
 *
 * Use when you need tie-breaking with exactly two orders.
 *
 * **Details**
 *
 * First applies the first order. If the result is non-zero, that result is
 * returned; otherwise, the second order is applied. The result is the first
 * non-zero comparison result, or `0` if both orders return `0`.
 *
 * **Example** (Combining two Orders)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const byAge = Order.mapInput(
 *   Order.Number,
 *   (person: { name: string; age: number }) => person.age
 * )
 * const byName = Order.mapInput(
 *   Order.String,
 *   (person: { name: string; age: number }) => person.name
 * )
 * const byAgeAndName = Order.combine(byAge, byName)
 *
 * const person1 = { name: "Alice", age: 30 }
 * const person2 = { name: "Bob", age: 30 }
 * const person3 = { name: "Charlie", age: 25 }
 *
 * byAgeAndName(person1, person2) // => -1
 * byAgeAndName(person1, person3) // => 1
 * ```
 *
 * @see {@link combineAll} to combine multiple orders from a collection
 * @see {@link mapInput} to transform orders to work with different types
 * @category combining
 * @since 2.0.0
 */
export const combine: {
  <A>(that: Order<A>): (self: Order<A>) => Order<A>
  <A>(self: Order<A>, that: Order<A>): Order<A>
} = dual(2, <A>(self: Order<A>, that: Order<A>): Order<A> =>
  make((a1, a2) => {
    const out = self(a1, a2)
    if (out !== 0) {
      return out
    }
    return that(a1, a2)
  }))

/**
 * Creates an `Order` that considers all values as equal.
 *
 * **When to use**
 *
 * Use when you need an order that treats all values as equal.
 *
 * **Details**
 *
 * Always returns `0` regardless of input values, making it useful as a neutral
 * element in order composition.
 *
 * **Example** (Ordering with an always-equal Order)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const alwaysEqualOrder = Order.alwaysEqual<number>()
 *
 * alwaysEqualOrder(1, 2) // => 0
 * alwaysEqualOrder(2, 1) // => 0
 * alwaysEqualOrder(1, 1) // => 0
 * ```
 *
 * @see {@link combine} to combine with other orders
 * @category constructors
 * @since 4.0.0
 */
export function alwaysEqual<A>(): Order<A> {
  return make(() => 0)
}

/**
 * Combines all `Order` instances in the provided collection into a single `Order`.
 * The resulting `Order` compares using each `Order` in sequence until a non-zero result is found.
 *
 * **When to use**
 *
 * Use when you need tie-breaking across a variable number of orders.
 *
 * **Details**
 *
 * Applies orders in iteration order and short-circuits on the first non-zero
 * result. It returns `0` only if all orders return `0`.
 * The collection is materialized when the order is created, so it must be finite.
 *
 * **Example** (Combining multiple Orders)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const byAge = Order.mapInput(
 *   Order.Number,
 *   (person: { name: string; age: number }) => person.age
 * )
 * const byName = Order.mapInput(
 *   Order.String,
 *   (person: { name: string; age: number }) => person.name
 * )
 *
 * const combinedOrder = Order.combineAll([byAge, byName])
 *
 * const person1 = { name: "Alice", age: 30 }
 * const person2 = { name: "Bob", age: 30 }
 *
 * combinedOrder(person1, person2) // => -1
 * ```
 *
 * @see {@link combine} to combine two orders
 * @see {@link makeReducer} to create a reducer for combining orders
 * @category combining
 * @since 2.0.0
 */
export function combineAll<A>(collection: Iterable<Order<A>>): Order<A> {
  const orders = Array.from(collection)
  return make((a1, a2) => {
    let out: Ordering = 0
    for (const O of orders) {
      out = O(a1, a2)
      if (out !== 0) {
        return out
      }
    }
    return out
  })
}

/**
 * Transforms an `Order` on type `A` into an `Order` on type `B` by providing a function that
 * maps values of type `B` to values of type `A`.
 *
 * **When to use**
 *
 * Use when you need to adapt an `Order` to compare a larger value by one
 * derived property.
 *
 * **Details**
 *
 * Applies the mapping function to both values before comparison. The mapping
 * function should be pure and not have side effects so the ordering properties
 * of the original order are preserved.
 *
 * **Example** (Mapping Input)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const byLength = Order.mapInput(Order.Number, (s: string) => s.length)
 *
 * byLength("a", "bb") // => -1
 * byLength("bb", "a") // => 1
 * byLength("aa", "bb") // => 0
 * ```
 *
 * @see {@link combine} to combine mapped orders for multi-criteria comparison
 * @see {@link Struct} to create orders for structs with multiple fields
 * @category mapping
 * @since 2.0.0
 */
export const mapInput: {
  <B, A>(f: (b: B) => A): (self: Order<A>) => Order<B>
  <A, B>(self: Order<A>, f: (b: B) => A): Order<B>
} = dual(
  2,
  <A, B>(self: Order<A>, f: (b: B) => A): Order<B> => make((b1, b2) => self(f(b1), f(b2)))
)

/**
 * Order instance for `Date` objects that compares them chronologically by their timestamp.
 *
 * **When to use**
 *
 * Use when you need chronological ordering for JavaScript date values.
 *
 * **Details**
 *
 * Compares dates by their underlying timestamp in milliseconds since the epoch.
 * Earlier dates are less than later dates. Invalid dates are compared through
 * their `getTime()` result.
 *
 * **Example** (Ordering Dates)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const date1 = new Date("2023-01-01")
 * const date2 = new Date("2023-01-02")
 *
 * Order.Date(date1, date2) // => -1
 * Order.Date(date2, date1) // => 1
 * Order.Date(date1, date1) // => 0
 * ```
 *
 * @see {@link mapInput} to compare objects by a date property
 * @category instances
 * @since 2.0.0
 */
export const Date: Order<Date> = mapInput(Number, (date) => date.getTime())

/**
 * Creates an `Order` for a tuple type based on orders for each element.
 *
 * **When to use**
 *
 * Use when you need fixed-length tuple ordering with per-position orders.
 *
 * **Details**
 *
 * Compares tuples element-by-element using the corresponding order and stops at
 * the first non-zero comparison result. Tuples must have the same length as the
 * order collection, and the result is `0` only if all elements are equal.
 *
 * **Example** (Ordering tuples)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const tupleOrder = Order.Tuple([Order.Number, Order.String])
 *
 * tupleOrder([1, "a"], [2, "b"]) // => -1
 * tupleOrder([1, "b"], [1, "a"]) // => 1
 * tupleOrder([1, "a"], [1, "a"]) // => 0
 * ```
 *
 * @see {@link Array} to compare arrays with length consideration
 * @category combinators
 * @since 4.0.0
 */
export function Tuple<const Elements extends ReadonlyArray<Order<any>>>(
  elements: Elements
): Order<{ readonly [I in keyof Elements]: [Elements[I]] extends [Order<infer A>] ? A : never }> {
  return make((self, that) => {
    const len = elements.length
    for (let i = 0; i < len; i++) {
      const o = elements[i](self[i], that[i])
      if (o !== 0) {
        return o
      }
    }
    return 0
  })
}

/**
 * @since 4.0.0
 */
function Array_<A>(O: Order<A>): Order<ReadonlyArray<A>> {
  return make((self, that) => {
    const aLen = self.length
    const bLen = that.length
    const len = Math.min(aLen, bLen)
    for (let i = 0; i < len; i++) {
      const o = O(self[i], that[i])
      if (o !== 0) {
        return o
      }
    }
    return Number(aLen, bLen)
  })
}

export {
  /**
   * Creates an `Order` for arrays by applying the given `Order` to each element, then comparing by length if all elements are equal.
   *
   * **When to use**
   *
   * Use when you need lexicographic ordering for arrays of one element type.
   *
   * **Details**
   *
   * Compares arrays element-by-element using the provided order and stops at the
   * first non-zero comparison result. If all elements are equal, shorter arrays
   * are less than longer arrays. The result is `0` only if arrays have the same
   * length and all elements are equal.
   *
   * **Example** (Ordering array elements)
   *
   * ```ts import.meta.vitest
   * import { Order } from "effect"
   *
   * const arrayOrder = Order.Array(Order.Number)
   *
   * arrayOrder([1, 2], [1, 3]) // => -1
   * arrayOrder([1, 2], [1, 2, 3]) // => -1
   * arrayOrder([1, 2, 3], [1, 2]) // => 1
   * arrayOrder([1, 2], [1, 2]) // => 0
   * ```
   *
   * @see {@link Tuple} for type-safe tuple ordering
   * @category combinators
   * @since 4.0.0
   */
  Array_ as Array
}

/**
 * Creates an `Order` for structs by applying the given `Order`s to each property in sequence.
 *
 * **When to use**
 *
 * Use when you need multi-field ordering for objects with known properties.
 *
 * **Details**
 *
 * Compares structs field-by-field in the key order of the fields object and
 * stops at the first non-zero comparison result. Field order matters: earlier
 * fields take precedence. The result is `0` only if all fields are equal.
 *
 * **Example** (Ordering structs)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const personOrder = Order.Struct({
 *   name: Order.String,
 *   age: Order.Number
 * })
 *
 * const person1 = { name: "Alice", age: 30 }
 * const person2 = { name: "Bob", age: 25 }
 * const person3 = { name: "Alice", age: 25 }
 *
 * personOrder(person1, person2) // => -1
 * personOrder(person1, person3) // => 1
 * personOrder(person1, person1) // => 0
 * ```
 *
 * @see {@link combine} to combine orders manually
 * @see {@link mapInput} to extract and compare by a single property
 * @category combinators
 * @since 4.0.0
 */
export function Struct<const R extends { readonly [x: string]: Order<any> }>(
  fields: R
): Order<{ [K in keyof R]: [R[K]] extends [Order<infer A>] ? A : never }> {
  const keys = Object.keys(fields)
  return make((self, that) => {
    for (const key of keys) {
      const o = fields[key](self[key], that[key])
      if (o !== 0) {
        return o
      }
    }
    return 0
  })
}

/**
 * Checks whether one value is strictly less than another according to the given order.
 *
 * **When to use**
 *
 * Use when you need a boolean less-than predicate using an `Order`.
 *
 * **Details**
 *
 * Returns `true` if the order returns `-1`, meaning the first value is less
 * than the second. Equal or greater values return `false`.
 *
 * **Example** (Checking less-than comparisons)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const isLessThanNumber = Order.isLessThan(Order.Number)
 *
 * isLessThanNumber(1, 2) // => true
 * isLessThanNumber(2, 1) // => false
 * isLessThanNumber(1, 1) // => false
 * ```
 *
 * @see {@link isLessThanOrEqualTo} for non-strict less than or equal
 * @see {@link isGreaterThan} for strict greater than
 * @category predicates
 * @since 4.0.0
 */
export const isLessThan = <A>(O: Order<A>): {
  (that: A): (self: A) => boolean
  (self: A, that: A): boolean
} => dual(2, (self: A, that: A) => O(self, that) === -1)

/**
 * Checks whether one value is strictly greater than another according to the given order.
 *
 * **When to use**
 *
 * Use when you need a boolean greater-than predicate using an `Order`.
 *
 * **Details**
 *
 * Returns `true` if the order returns `1`, meaning the first value is greater
 * than the second. Equal or lesser values return `false`.
 *
 * **Example** (Checking greater-than comparisons)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const isGreaterThanNumber = Order.isGreaterThan(Order.Number)
 *
 * isGreaterThanNumber(2, 1) // => true
 * isGreaterThanNumber(1, 2) // => false
 * isGreaterThanNumber(1, 1) // => false
 * ```
 *
 * @see {@link isGreaterThanOrEqualTo} for non-strict greater than or equal
 * @see {@link isLessThan} for strict less than
 * @category predicates
 * @since 4.0.0
 */
export const isGreaterThan = <A>(O: Order<A>): {
  (that: A): (self: A) => boolean
  (self: A, that: A): boolean
} => dual(2, (self: A, that: A) => O(self, that) === 1)

/**
 * Checks whether one value is less than or equal to another according to the given order.
 *
 * **When to use**
 *
 * Use when you need a boolean less-than-or-equal predicate using an `Order`.
 *
 * **Details**
 *
 * Returns `true` if the order returns `-1` or `0`, and returns `false` only if
 * the order returns `1`.
 *
 * **Example** (Checking less-than-or-equal comparisons)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const isLessThanOrEqualToNumber = Order.isLessThanOrEqualTo(Order.Number)
 *
 * isLessThanOrEqualToNumber(1, 2) // => true
 * isLessThanOrEqualToNumber(1, 1) // => true
 * isLessThanOrEqualToNumber(2, 1) // => false
 * ```
 *
 * @see {@link isLessThan} for strict less than
 * @see {@link isGreaterThan} for strict greater than
 * @category predicates
 * @since 4.0.0
 */
export const isLessThanOrEqualTo = <A>(O: Order<A>): {
  (that: A): (self: A) => boolean
  (self: A, that: A): boolean
} => dual(2, (self: A, that: A) => O(self, that) !== 1)

/**
 * Checks whether one value is greater than or equal to another according to the given order.
 *
 * **When to use**
 *
 * Use when you need a boolean greater-than-or-equal predicate using an
 * `Order`.
 *
 * **Details**
 *
 * Returns `true` if the order returns `1` or `0`, and returns `false` only if
 * the order returns `-1`.
 *
 * **Example** (Checking greater-than-or-equal comparisons)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const isGreaterThanOrEqualToNumber = Order.isGreaterThanOrEqualTo(Order.Number)
 *
 * isGreaterThanOrEqualToNumber(2, 1) // => true
 * isGreaterThanOrEqualToNumber(1, 1) // => true
 * isGreaterThanOrEqualToNumber(1, 2) // => false
 * ```
 *
 * @see {@link isGreaterThan} for strict greater than
 * @see {@link isLessThanOrEqualTo} for less than or equal
 * @category predicates
 * @since 4.0.0
 */
export const isGreaterThanOrEqualTo = <A>(O: Order<A>): {
  (that: A): (self: A) => boolean
  (self: A, that: A): boolean
} => dual(2, (self: A, that: A) => O(self, that) !== -1)

/**
 * Returns the minimum of two values according to the given order. If they are equal, returns the first argument.
 *
 * **When to use**
 *
 * Use when you need to select the smaller of two values according to an
 * `Order`.
 *
 * **Details**
 *
 * Returns the value that compares as less than or equal to the other value. If
 * values are equal, the first argument is returned.
 *
 * **Example** (Selecting the minimum value)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const minNumber = Order.min(Order.Number)
 *
 * minNumber(1, 2) // => 1
 * minNumber(2, 1) // => 1
 * minNumber(1, 1) // => 1
 * ```
 *
 * @see {@link max} for the maximum of two values
 * @see {@link clamp} to clamp a value between min and max
 * @category comparisons
 * @since 2.0.0
 */
export const min = <A>(O: Order<A>): {
  (that: A): (self: A) => A
  (self: A, that: A): A
} => dual(2, (self: A, that: A) => self === that || O(self, that) < 1 ? self : that)

/**
 * Returns the maximum of two values according to the given order. If they are equal, returns the first argument.
 *
 * **When to use**
 *
 * Use when you need to select the larger of two values according to an
 * `Order`.
 *
 * **Details**
 *
 * Returns the value that compares as greater than or equal to the other value.
 * If values are equal, the first argument is returned.
 *
 * **Example** (Selecting the maximum value)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const maxNumber = Order.max(Order.Number)
 *
 * maxNumber(1, 2) // => 2
 * maxNumber(2, 1) // => 2
 * maxNumber(1, 1) // => 1
 * ```
 *
 * @see {@link min} for the minimum of two values
 * @see {@link clamp} to clamp a value between min and max
 * @category comparisons
 * @since 2.0.0
 */
export const max = <A>(O: Order<A>): {
  (that: A): (self: A) => A
  (self: A, that: A): A
} => dual(2, (self: A, that: A) => self === that || O(self, that) > -1 ? self : that)

/**
 * Restricts a value between a minimum and a maximum according to the given order.
 *
 * **When to use**
 *
 * Use when you need to clamp a value to an inclusive range according to an
 * `Order`.
 *
 * **Details**
 *
 * Returns the value itself when it is between minimum and maximum, inclusive.
 * Values below the range return minimum, and values above the range return
 * maximum. The minimum must be less than or equal to the maximum according to
 * the order.
 *
 * **Example** (Clamping values)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const clamp = Order.clamp(Order.Number)({ minimum: 1, maximum: 5 })
 *
 * clamp(3) // => 3
 * clamp(0) // => 1
 * clamp(6) // => 5
 * ```
 *
 * @see {@link min} for the minimum of two values
 * @see {@link max} for the maximum of two values
 * @see {@link isBetween} to check if a value is within a range
 * @category comparisons
 * @since 2.0.0
 */
export const clamp = <A>(O: Order<A>): {
  (options: {
    minimum: A
    maximum: A
  }): (self: A) => A
  (self: A, options: {
    minimum: A
    maximum: A
  }): A
} =>
  dual(
    2,
    (self: A, options: {
      minimum: A
      maximum: A
    }): A => min(O)(options.maximum, max(O)(options.minimum, self))
  )

/**
 * Checks whether a value is between a minimum and a maximum (inclusive) according to the given order.
 *
 * **When to use**
 *
 * Use when you need range checks that respect domain-specific ordering, such as
 * dates, versions, or custom priorities, instead of JavaScript numeric
 * comparison.
 *
 * **Details**
 *
 * Returns `true` when the value is greater than or equal to minimum and less
 * than or equal to maximum. Values outside the range return `false`. Both
 * bounds are inclusive.
 *
 * **Example** (Checking ranges)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const betweenNumber = Order.isBetween(Order.Number)
 *
 * betweenNumber(5, { minimum: 1, maximum: 10 }) // => true
 * betweenNumber(1, { minimum: 1, maximum: 10 }) // => true
 * betweenNumber(10, { minimum: 1, maximum: 10 }) // => true
 * betweenNumber(0, { minimum: 1, maximum: 10 }) // => false
 * betweenNumber(11, { minimum: 1, maximum: 10 }) // => false
 * ```
 *
 * @see {@link clamp} to clamp a value to a range
 * @see {@link isLessThanOrEqualTo} for less than or equal check
 * @see {@link isGreaterThanOrEqualTo} for greater than or equal check
 * @category predicates
 * @since 4.0.0
 */
export const isBetween = <A>(O: Order<A>): {
  (options: {
    minimum: A
    maximum: A
  }): (self: A) => boolean
  (self: A, options: {
    minimum: A
    maximum: A
  }): boolean
} =>
  dual(
    2,
    (self: A, options: {
      minimum: A
      maximum: A
    }): boolean => !isLessThan(O)(self, options.minimum) && !isGreaterThan(O)(self, options.maximum)
  )

/**
 * Creates a `Reducer` for combining `Order` instances, useful for aggregating orders in collections.
 *
 * **When to use**
 *
 * Use when you need a reducer that combines orders.
 *
 * **Details**
 *
 * Returns a reducer that combines orders using `combine`, uses `alwaysEqual` as
 * the identity element for empty collections, and uses `combineAll` for
 * combining collections of orders. The reducer can be used with fold operations
 * on collections.
 *
 * **Example** (Creating a Reducer)
 *
 * ```ts import.meta.vitest
 * import { Order } from "effect"
 *
 * const reducer = Order.makeReducer<number>()
 * const orders = [Order.Number, Order.flip(Order.Number)]
 *
 * const combined = reducer.combineAll(orders)
 * combined(1, 2) // => -1
 * ```
 *
 * @see {@link combine} to combine two orders
 * @see {@link combineAll} to combine multiple orders
 * @see {@link Reducer} for reducing orders as a collection operation
 * @category constructors
 * @since 4.0.0
 */
export function makeReducer<A>() {
  return Reducer.make<Order<A>>(
    combine,
    () => 0,
    combineAll
  )
}
