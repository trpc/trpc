/**
 * Works with JavaScript `bigint` values.
 *
 * This module exposes the native `BigInt` constructor together with helpers for
 * checking, arithmetic, comparison, range checks, safe parsing and conversions
 * that return `Option`, integer square roots, aggregation, ordering,
 * equivalence, reducers, and combiners.
 *
 * @since 2.0.0
 */

import * as Combiner from "./Combiner.ts"
import * as Equ from "./Equivalence.ts"
import { dual } from "./Function.ts"
import * as Option from "./Option.ts"
import * as order from "./Order.ts"
import type { Ordering } from "./Ordering.ts"
import * as predicate from "./Predicate.ts"
import * as Reducer from "./Reducer.ts"

/**
 * Exposes the global bigint constructor for JavaScript bigint coercion.
 *
 * **When to use**
 *
 * Use to access native JavaScript bigint constructor coercion from the Effect
 * module namespace.
 *
 * **Gotchas**
 *
 * This follows native `BigInt` coercion rules. It throws for invalid strings or
 * non-integral numbers, and whitespace-only strings coerce to `0n`.
 *
 * @see {@link fromString} for parsing strings into an `Option`
 * @see {@link fromNumber} for converting safe integers into an `Option`
 *
 * **Example** (Constructing bigints)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.BigInt(123) // => 123n
 * BigInt.BigInt("456") // => 456n
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const BigInt = globalThis.BigInt

const bigint0 = BigInt(0)
const bigint1 = BigInt(1)
const bigint2 = BigInt(2)

/**
 * Checks whether a value is a `bigint`.
 *
 * **When to use**
 *
 * Use to validate unknown input and narrow it to `bigint`.
 *
 * **Example** (Checking for bigints)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.isBigInt(1n) // => true
 * BigInt.isBigInt(1) // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isBigInt: (u: unknown) => u is bigint = predicate.isBigInt

/**
 * Provides an addition operation on `bigint`s.
 *
 * **When to use**
 *
 * Use when you need a binary addition function for piping or higher-order APIs
 * instead of the infix addition operator.
 *
 * **Example** (Adding bigints)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.sum(2n, 3n) // => 5n
 * ```
 *
 * @see {@link sumAll} for summing an iterable of `bigint` values
 *
 * @category math
 * @since 2.0.0
 */
export const sum: {
  (that: bigint): (self: bigint) => bigint
  (self: bigint, that: bigint): bigint
} = dual(2, (self: bigint, that: bigint): bigint => self + that)

/**
 * Provides a multiplication operation on `bigint`s.
 *
 * **When to use**
 *
 * Use to multiply two `bigint` values.
 *
 * **Example** (Multiplying bigints)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.multiply(2n, 3n) // => 6n
 * ```
 *
 * @see {@link multiplyAll} for multiplying an iterable of `bigint` values
 *
 * @category math
 * @since 2.0.0
 */
export const multiply: {
  (that: bigint): (self: bigint) => bigint
  (self: bigint, that: bigint): bigint
} = dual(2, (self: bigint, that: bigint): bigint => self * that)

/**
 * Provides a subtraction operation on `bigint`s.
 *
 * **When to use**
 *
 * Use to subtract one `bigint` value from another.
 *
 * **Example** (Subtracting bigints)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.subtract(2n, 3n) // => -1n
 * ```
 *
 * @category math
 * @since 2.0.0
 */
export const subtract: {
  (that: bigint): (self: bigint) => bigint
  (self: bigint, that: bigint): bigint
} = dual(2, (self: bigint, that: bigint): bigint => self - that)

/**
 * Divides one `bigint` by another safely.
 *
 * **When to use**
 *
 * Use to divide `bigint` values while representing division by zero as
 * `Option.none`.
 *
 * **Details**
 *
 * Uses JavaScript `bigint` division, so non-exact quotients are truncated
 * toward zero. Returns `Option.none()` when the divisor is `0n`.
 *
 * **Example** (Dividing bigints safely)
 *
 * ```ts import.meta.vitest
 * import { BigInt, Option } from "effect"
 *
 * BigInt.divide(6n, 3n) // => Option.some(2n)
 * BigInt.divide(6n, 0n) // => Option.none()
 * ```
 *
 * @see {@link divideUnsafe} for division that throws when the divisor is `0n`
 * @see {@link remainder} for the JavaScript remainder operation
 *
 * @category math
 * @since 2.0.0
 */
export const divide: {
  (that: bigint): (self: bigint) => Option.Option<bigint>
  (self: bigint, that: bigint): Option.Option<bigint>
} = dual(
  2,
  (self: bigint, that: bigint): Option.Option<bigint> => that === bigint0 ? Option.none() : Option.some(self / that)
)

/**
 * Divides one `bigint` by another, throwing if the divisor is zero.
 *
 * **When to use**
 *
 * Use to divide `bigint` values where the divisor is known to be non-zero and
 * division by zero should be a thrown exception.
 *
 * **Details**
 *
 * Uses JavaScript `bigint` division, so non-exact quotients are truncated
 * toward zero.
 *
 * **Gotchas**
 *
 * Throws a `RangeError` when the divisor is `0n`.
 *
 * **Example** (Dividing bigints unsafely)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.divideUnsafe(6n, 3n) // => 2n
 * BigInt.divideUnsafe(6n, 4n) // => 1n
 * ```
 *
 * @see {@link divide} for division that returns `Option.none` when the divisor is `0n`
 *
 * @category math
 * @since 4.0.0
 */
export const divideUnsafe: {
  (that: bigint): (self: bigint) => bigint
  (self: bigint, that: bigint): bigint
} = dual(2, (self: bigint, that: bigint): bigint => self / that)

/**
 * Returns the result of adding `1n` to a `bigint`.
 *
 * **When to use**
 *
 * Use to increment a `bigint` counter by one.
 *
 * **Example** (Incrementing a bigint)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.increment(2n) // => 3n
 * ```
 *
 * @category math
 * @since 2.0.0
 */
export const increment = (n: bigint): bigint => n + bigint1

/**
 * Returns the result of subtracting `1n` from a `bigint`.
 *
 * **When to use**
 *
 * Use to decrement a `bigint` counter by one.
 *
 * **Example** (Decrementing a bigint)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.decrement(3n) // => 2n
 * ```
 *
 * @category math
 * @since 2.0.0
 */
export const decrement = (n: bigint): bigint => n - bigint1

/**
 * Provides an `Order` instance for `bigint` that allows comparing and sorting BigInt values.
 *
 * **When to use**
 *
 * Use when you need to sort or compare bigint values through APIs that accept
 * an ordering instance.
 *
 * **Example** (Comparing bigints with Order)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * const a = 123n
 * const b = 456n
 * const c = 123n
 *
 * BigInt.Order(a, b) // => -1
 * BigInt.Order(b, a) // => 1
 * BigInt.Order(a, c) // => 0
 * ```
 *
 * @category instances
 * @since 2.0.0
 */
export const Order: order.Order<bigint> = order.BigInt

/**
 * Equivalence instance for bigints using strict equality (`===`).
 *
 * **When to use**
 *
 * Use when checking bigint equality through APIs that accept an equivalence
 * relation.
 *
 * **Example** (Comparing bigints for equivalence)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.Equivalence(1n, 1n) // => true
 * BigInt.Equivalence(1n, 2n) // => false
 * ```
 *
 * @category instances
 * @since 2.0.0
 */
export const Equivalence: Equ.Equivalence<bigint> = Equ.BigInt

/**
 * Returns `true` if the first argument is less than the second, otherwise `false`.
 *
 * **When to use**
 *
 * Use to test whether one `bigint` is strictly less than another.
 *
 * **Example** (Checking less-than comparisons)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.isLessThan(2n, 3n) // => true
 * BigInt.isLessThan(3n, 3n) // => false
 * BigInt.isLessThan(4n, 3n) // => false
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isLessThan: {
  (that: bigint): (self: bigint) => boolean
  (self: bigint, that: bigint): boolean
} = order.isLessThan(Order)

/**
 * Returns a function that checks if a given `bigint` is less than or equal to the provided one.
 *
 * **When to use**
 *
 * Use to test whether one `bigint` is less than or equal to another.
 *
 * **Example** (Checking less-than-or-equal comparisons)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.isLessThanOrEqualTo(2n, 3n) // => true
 * BigInt.isLessThanOrEqualTo(3n, 3n) // => true
 * BigInt.isLessThanOrEqualTo(4n, 3n) // => false
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isLessThanOrEqualTo: {
  (that: bigint): (self: bigint) => boolean
  (self: bigint, that: bigint): boolean
} = order.isLessThanOrEqualTo(Order)

/**
 * Returns `true` if the first argument is greater than the second, otherwise `false`.
 *
 * **When to use**
 *
 * Use to test whether one `bigint` is strictly greater than another.
 *
 * **Example** (Checking greater-than comparisons)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.isGreaterThan(2n, 3n) // => false
 * BigInt.isGreaterThan(3n, 3n) // => false
 * BigInt.isGreaterThan(4n, 3n) // => true
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isGreaterThan: {
  (that: bigint): (self: bigint) => boolean
  (self: bigint, that: bigint): boolean
} = order.isGreaterThan(Order)

/**
 * Returns a function that checks if a given `bigint` is greater than or equal to the provided one.
 *
 * **When to use**
 *
 * Use to test whether one `bigint` is greater than or equal to another.
 *
 * **Example** (Checking greater-than-or-equal comparisons)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.isGreaterThanOrEqualTo(2n, 3n) // => false
 * BigInt.isGreaterThanOrEqualTo(3n, 3n) // => true
 * BigInt.isGreaterThanOrEqualTo(4n, 3n) // => true
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isGreaterThanOrEqualTo: {
  (that: bigint): (self: bigint) => boolean
  (self: bigint, that: bigint): boolean
} = order.isGreaterThanOrEqualTo(Order)

/**
 * Checks whether a `bigint` is between a `minimum` and `maximum` value (inclusive).
 *
 * **When to use**
 *
 * Use to test whether a `bigint` falls inside an inclusive range.
 *
 * **Example** (Checking whether a bigint is within bounds)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * const between = BigInt.between({ minimum: 0n, maximum: 5n })
 *
 * between(3n) // => true
 * between(-1n) // => false
 * between(6n) // => false
 * ```
 *
 * @see {@link clamp} for forcing a `bigint` into an inclusive range
 *
 * @category predicates
 * @since 2.0.0
 */
export const between: {
  (options: {
    minimum: bigint
    maximum: bigint
  }): (self: bigint) => boolean
  (self: bigint, options: {
    minimum: bigint
    maximum: bigint
  }): boolean
} = order.isBetween(Order)

/**
 * Restricts the given `bigint` to be within the range specified by the `minimum` and `maximum` values.
 *
 * **When to use**
 *
 * Use to force a `bigint` into an inclusive range.
 *
 * **Details**
 *
 * If the `bigint` is less than the minimum, the function returns the minimum.
 * If the `bigint` is greater than the maximum, the function returns the
 * maximum. Otherwise, it returns the original `bigint`.
 *
 * **Example** (Clamping a bigint to bounds)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * const clamp = BigInt.clamp({ minimum: 1n, maximum: 5n })
 *
 * clamp(3n) // => 3n
 * clamp(0n) // => 1n
 * clamp(6n) // => 5n
 * ```
 *
 * @see {@link between} for checking whether a `bigint` is already inside a range
 *
 * @category math
 * @since 2.0.0
 */
export const clamp: {
  (options: {
    minimum: bigint
    maximum: bigint
  }): (self: bigint) => bigint
  (self: bigint, options: {
    minimum: bigint
    maximum: bigint
  }): bigint
} = order.clamp(Order)

/**
 * Returns the minimum between two `bigint`s.
 *
 * **When to use**
 *
 * Use to select the smaller of two `bigint` values.
 *
 * **Example** (Finding the minimum bigint)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.min(2n, 3n) // => 2n
 * ```
 *
 * @see {@link max} for selecting the larger value
 *
 * @category math
 * @since 2.0.0
 */
export const min: {
  (that: bigint): (self: bigint) => bigint
  (self: bigint, that: bigint): bigint
} = order.min(Order)

/**
 * Returns the maximum between two `bigint`s.
 *
 * **When to use**
 *
 * Use to select the larger of two `bigint` values.
 *
 * **Example** (Finding the maximum bigint)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.max(2n, 3n) // => 3n
 * ```
 *
 * @see {@link min} for selecting the smaller value
 *
 * @category math
 * @since 2.0.0
 */
export const max: {
  (that: bigint): (self: bigint) => bigint
  (self: bigint, that: bigint): bigint
} = order.max(Order)

/**
 * Determines the sign of a given `bigint`.
 *
 * **When to use**
 *
 * Use to classify a `bigint` as negative, zero, or positive.
 *
 * **Example** (Determining bigint signs)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.sign(-5n) // => -1
 * BigInt.sign(0n) // => 0
 * BigInt.sign(5n) // => 1
 * ```
 *
 * @category math
 * @since 2.0.0
 */
export const sign = (n: bigint): Ordering => order.BigInt(n, bigint0)

/**
 * Determines the absolute value of a given `bigint`.
 *
 * **When to use**
 *
 * Use to remove the sign from a `bigint` while preserving its magnitude.
 *
 * **Example** (Calculating absolute values)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.abs(-5n) // => 5n
 * BigInt.abs(0n) // => 0n
 * BigInt.abs(5n) // => 5n
 * ```
 *
 * @category math
 * @since 2.0.0
 */
export const abs = (n: bigint): bigint => (n < bigint0 ? -n : n)

/**
 * Determines the greatest common divisor of two `bigint`s.
 *
 * **When to use**
 *
 * Use to compute the greatest common divisor of two integer values.
 *
 * **Example** (Calculating greatest common divisors)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.gcd(2n, 3n) // => 1n
 * BigInt.gcd(2n, 4n) // => 2n
 * BigInt.gcd(16n, 24n) // => 8n
 * ```
 *
 * @see {@link lcm} for computing the least common multiple
 *
 * @category math
 * @since 2.0.0
 */
export const gcd: {
  (that: bigint): (self: bigint) => bigint
  (self: bigint, that: bigint): bigint
} = dual(2, (self: bigint, that: bigint): bigint => {
  while (that !== bigint0) {
    const t = that
    that = self % that
    self = t
  }
  return abs(self)
})

/**
 * Determines the least common multiple of two `bigint`s.
 *
 * **When to use**
 *
 * Use to compute the least common multiple of two integer values.
 *
 * **Example** (Calculating least common multiples)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.lcm(2n, 3n) // => 6n
 * BigInt.lcm(2n, 4n) // => 4n
 * BigInt.lcm(16n, 24n) // => 48n
 * ```
 *
 * @see {@link gcd} for computing the greatest common divisor
 *
 * @category math
 * @since 2.0.0
 */
export const lcm: {
  (that: bigint): (self: bigint) => bigint
  (self: bigint, that: bigint): bigint
} = dual(
  2,
  (self: bigint, that: bigint): bigint =>
    self === bigint0 || that === bigint0 ? bigint0 : abs((self * that) / gcd(self, that))
)

/**
 * Returns the integer square root of a non-negative `bigint`.
 *
 * **When to use**
 *
 * Use when you need to compute an integer square root for a `bigint` that has
 * already been validated as non-negative, and you want negative input to throw
 * instead of returning `Option.none`.
 *
 * **Details**
 *
 * For non-perfect squares, returns the largest `bigint` whose square is less
 * than or equal to the input.
 *
 * **Gotchas**
 *
 * Throws a `RangeError` if the input is negative.
 *
 * **Example** (Calculating square roots unsafely)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.sqrtUnsafe(4n) // => 2n
 * BigInt.sqrtUnsafe(9n) // => 3n
 * BigInt.sqrtUnsafe(16n) // => 4n
 * ```
 *
 * @see {@link sqrt} for returning `Option.none` when the input is negative
 *
 * @category math
 * @since 4.0.0
 */
export const sqrtUnsafe = (n: bigint): bigint => {
  if (n < bigint0) {
    throw new RangeError("Cannot take the square root of a negative number")
  }
  if (n < bigint2) {
    return n
  }
  let x = n / bigint2
  while (x * x > n) {
    x = ((n / x) + x) / bigint2
  }
  return x
}

/**
 * Computes the integer square root of a `bigint` safely.
 *
 * **When to use**
 *
 * Use to compute an integer square root while representing negative input as
 * `Option.none`.
 *
 * **Details**
 *
 * For non-perfect squares, returns the largest `bigint` whose square is less
 * than or equal to the input. Returns `Option.none()` when the input is
 * negative.
 *
 * **Example** (Calculating square roots safely)
 *
 * ```ts import.meta.vitest
 * import { BigInt, Option } from "effect"
 *
 * BigInt.sqrt(4n) // => Option.some(2n)
 * BigInt.sqrt(9n) // => Option.some(3n)
 * BigInt.sqrt(16n) // => Option.some(4n)
 * BigInt.sqrt(-1n) // => Option.none()
 * ```
 *
 * @see {@link sqrtUnsafe} for square root computation that throws on negative input
 *
 * @category math
 * @since 2.0.0
 */
export const sqrt = (n: bigint): Option.Option<bigint> =>
  isGreaterThanOrEqualTo(n, bigint0) ? Option.some(sqrtUnsafe(n)) : Option.none()

/**
 * Takes an `Iterable` of `bigint`s and returns their sum as a single `bigint`. Returns `0n` for an empty iterable.
 *
 * **When to use**
 *
 * Use when you want an immediate aggregate from an iterable instead of a
 * folding reducer owned by another API.
 *
 * **Example** (Summing iterable bigints)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.sumAll([2n, 3n, 4n]) // => 9n
 * ```
 *
 * @see {@link sum} for adding two `bigint` values
 * @see {@link ReducerSum} for summing through APIs that consume a `Reducer`
 *
 * @category math
 * @since 2.0.0
 */
export const sumAll = (collection: Iterable<bigint>): bigint => {
  let out = bigint0
  for (const n of collection) {
    out += n
  }
  return out
}

/**
 * Takes an `Iterable` of `bigint`s and returns their product as a single `bigint`. Returns `1n` for an empty iterable.
 *
 * **When to use**
 *
 * Use to multiply all `bigint` values in an iterable.
 *
 * **Example** (Multiplying iterable bigints)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.multiplyAll([2n, 3n, 4n]) // => 24n
 * ```
 *
 * @see {@link multiply} for multiplying two `bigint` values
 * @see {@link ReducerMultiply} for multiplying through APIs that consume a `Reducer`
 *
 * @category math
 * @since 2.0.0
 */
export const multiplyAll = (collection: Iterable<bigint>): bigint => {
  let out = bigint1
  for (const n of collection) {
    if (n === bigint0) {
      return bigint0
    }
    out *= n
  }
  return out
}

/**
 * Converts a `bigint` to a `number` safely.
 *
 * **When to use**
 *
 * Use to convert a `bigint` to a JavaScript number only when it is a safe
 * integer.
 *
 * **Details**
 *
 * If the `bigint` is outside the safe integer range for JavaScript (`Number.MAX_SAFE_INTEGER`
 * and `Number.MIN_SAFE_INTEGER`), it returns `Option.none()`.
 *
 * **Example** (Converting bigints to numbers)
 *
 * ```ts import.meta.vitest
 * import { BigInt as BI, Option } from "effect"
 *
 * BI.toNumber(42n) // => Option.some(42)
 * BI.toNumber(9007199254740992n) // => Option.none()
 * BI.toNumber(-9007199254740992n) // => Option.none()
 * ```
 *
 * @see {@link fromNumber} for converting a safe integer number to `bigint`
 *
 * @category converting
 * @since 2.0.0
 */
export const toNumber = (b: bigint): Option.Option<number> => {
  if (b > BigInt(Number.MAX_SAFE_INTEGER) || b < BigInt(Number.MIN_SAFE_INTEGER)) {
    return Option.none()
  }
  return Option.some(Number(b))
}

/**
 * Parses a string into a `bigint` safely.
 *
 * **When to use**
 *
 * Use to parse a string as a `bigint` without throwing on invalid input.
 *
 * **Details**
 *
 * If the string is empty or contains characters that cannot be converted into a
 * `bigint`, it returns `Option.none()`.
 *
 * **Example** (Parsing strings as bigints)
 *
 * ```ts import.meta.vitest
 * import { BigInt, Option } from "effect"
 *
 * BigInt.fromString("42") // => Option.some(42n)
 * BigInt.fromString(" ") // => Option.none()
 * BigInt.fromString("a") // => Option.none()
 * ```
 *
 * @see {@link BigInt} for native constructor coercion that throws on invalid input
 *
 * @category converting
 * @since 2.4.12
 */
export const fromString = (s: string): Option.Option<bigint> => {
  try {
    return s.trim() === ""
      ? Option.none()
      : Option.some(BigInt(s))
  } catch {
    return Option.none()
  }
}

/**
 * Converts a number to a `bigint`.
 *
 * **When to use**
 *
 * Use to convert a JavaScript number to `bigint` only when it is a safe integer.
 *
 * **Details**
 *
 * If the number is outside the safe integer range for JavaScript
 * (`Number.MAX_SAFE_INTEGER` and `Number.MIN_SAFE_INTEGER`) or if the number is
 * not a valid `bigint`, it returns `Option.none()`.
 *
 * **Example** (Converting numbers to bigints)
 *
 * ```ts import.meta.vitest
 * import { BigInt, Option } from "effect"
 *
 * BigInt.fromNumber(42) // => Option.some(42n)
 * BigInt.fromNumber(Number.MAX_SAFE_INTEGER + 1) // => Option.none()
 * BigInt.fromNumber(Number.MIN_SAFE_INTEGER - 1) // => Option.none()
 * ```
 *
 * @see {@link toNumber} for converting `bigint` values back to safe integer numbers
 * @see {@link BigInt} for native constructor coercion
 *
 * @category converting
 * @since 2.4.12
 */
export function fromNumber(n: number): Option.Option<bigint> {
  if (n > Number.MAX_SAFE_INTEGER || n < Number.MIN_SAFE_INTEGER) {
    return Option.none()
  }

  try {
    return Option.some(BigInt(n))
  } catch {
    return Option.none()
  }
}

/**
 * Returns the JavaScript remainder of dividing one `bigint` by another.
 *
 * **When to use**
 *
 * Use when you want native remainder semantics, including signed remainders and
 * a thrown division-by-zero error.
 *
 * **Gotchas**
 *
 * Throws a `RangeError` when the divisor is `0n`.
 *
 * **Example** (Calculating remainders)
 *
 * ```ts import.meta.vitest
 * import { BigInt } from "effect"
 *
 * BigInt.remainder(10n, 3n) // => 1n
 * BigInt.remainder(15n, 4n) // => 3n
 * ```
 *
 * @see {@link divide} for quotient calculation with division-by-zero represented as `Option.none`
 *
 * @category math
 * @since 4.0.0
 */
export const remainder: {
  (divisor: bigint): (self: bigint) => bigint
  (self: bigint, divisor: bigint): bigint
} = dual(2, (self: bigint, divisor: bigint): bigint => self % divisor)

/**
 * Reducer for combining `bigint`s using addition.
 *
 * **When to use**
 *
 * Use to sum many `bigint` values through APIs that consume a `Reducer`.
 *
 * **Details**
 *
 * The initial value is `0n`, so `combineAll([])` returns `0n`.
 *
 * @see {@link sumAll} for summing an iterable directly
 * @see {@link ReducerMultiply} for multiplying `bigint` values
 *
 * @category math
 * @since 4.0.0
 */
export const ReducerSum: Reducer.Reducer<bigint> = Reducer.make((a, b) => a + b, bigint0)

/**
 * Reducer for combining `bigint`s using multiplication.
 *
 * **When to use**
 *
 * Use to multiply many `bigint` values through APIs that consume a `Reducer`.
 *
 * **Details**
 *
 * The initial value is `1n`, so `combineAll([])` returns `1n`.
 *
 * @see {@link multiplyAll} for multiplying an iterable directly
 * @see {@link ReducerSum} for summing `bigint` values
 *
 * @category math
 * @since 4.0.0
 */
export const ReducerMultiply: Reducer.Reducer<bigint> = Reducer.make((a, b) => a * b, bigint1, (collection) => {
  let acc = bigint1
  for (const n of collection) {
    if (n === bigint0) return bigint0
    acc *= n
  }
  return acc
})

/**
 * Combiner that returns the maximum `bigint`.
 *
 * **When to use**
 *
 * Use to keep the largest `bigint` when an API consumes a `Combiner`.
 *
 * @see {@link CombinerMin} for keeping the smallest `bigint`
 * @see {@link max} for comparing two `bigint` values directly
 *
 * @category math
 * @since 4.0.0
 */
export const CombinerMax: Combiner.Combiner<bigint> = Combiner.max(Order)

/**
 * Combiner that returns the minimum `bigint`.
 *
 * **When to use**
 *
 * Use to keep the smallest `bigint` through APIs that consume a `Combiner`.
 *
 * @see {@link CombinerMax} for keeping the largest `bigint`
 * @see {@link min} for comparing two `bigint` values directly
 *
 * @category math
 * @since 4.0.0
 */
export const CombinerMin: Combiner.Combiner<bigint> = Combiner.min(Order)
