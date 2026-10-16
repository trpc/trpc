/**
 * Works with TypeScript `number` values.
 *
 * This module exposes the native `Number` constructor together with helpers for
 * checking, parsing, arithmetic, safe division, comparison, range checks,
 * clamping, rounding, ordering, equivalence, and numeric aggregation.
 *
 * @since 2.0.0
 */
import * as Equ from "./Equivalence.ts"
import { dual } from "./Function.ts"
import * as Option from "./Option.ts"
import * as order from "./Order.ts"
import type { Ordering } from "./Ordering.ts"
import * as predicate from "./Predicate.ts"
import * as Reducer from "./Reducer.ts"

/**
 * Exposes the global number constructor.
 *
 * **When to use**
 *
 * Use to access native JavaScript numeric coercion from the Effect module
 * namespace.
 *
 * **Gotchas**
 *
 * This follows native `Number` coercion rules, including empty strings
 * becoming `0` and invalid numeric strings becoming `NaN`.
 *
 * @see {@link parse} for parsing strings into an `Option`
 *
 * **Example** (Coercing values to numbers)
 *
 * ```ts import.meta.vitest
 * import { Number as N } from "effect"
 *
 * N.Number("42") // => 42
 * N.Number("3.14") // => 3.14
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const Number = globalThis.Number

/**
 * Checks whether a value is a `number`.
 *
 * **When to use**
 *
 * Use to validate unknown input and narrow it to `number`.
 *
 * **Example** (Checking for numbers)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.isNumber(2) // => true
 * Number.isNumber("2") // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isNumber: (input: unknown) => input is number = predicate.isNumber

/**
 * Provides an addition operation on `number`s.
 *
 * **When to use**
 *
 * Use to add two numbers.
 *
 * **Example** (Adding numbers)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.sum(2, 3) // => 5
 * ```
 *
 * @see {@link sumAll} for summing an iterable of numbers
 *
 * @category math
 * @since 2.0.0
 */
export const sum: {
  (that: number): (self: number) => number
  (self: number, that: number): number
} = dual(2, (self: number, that: number): number => self + that)

/**
 * Provides a multiplication operation on `number`s.
 *
 * **When to use**
 *
 * Use to multiply two numbers.
 *
 * **Example** (Multiplying numbers)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.multiply(2, 3) // => 6
 * ```
 *
 * @see {@link multiplyAll} for multiplying an iterable of numbers
 *
 * @category math
 * @since 2.0.0
 */
export const multiply: {
  (that: number): (self: number) => number
  (self: number, that: number): number
} = dual(2, (self: number, that: number): number => self * that)

/**
 * Provides a subtraction operation on `number`s.
 *
 * **When to use**
 *
 * Use to subtract one number from another.
 *
 * **Example** (Subtracting numbers)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.subtract(2, 3) // => -1
 * ```
 *
 * @category math
 * @since 2.0.0
 */
export const subtract: {
  (that: number): (self: number) => number
  (self: number, that: number): number
} = dual(2, (self: number, that: number): number => self - that)

/**
 * Divides `number`s safely, returning `Option.none()` if the divisor is `0`.
 *
 * **When to use**
 *
 * Use to divide numbers while representing division by zero as `Option.none`.
 *
 * **Example** (Dividing numbers safely)
 *
 * ```ts import.meta.vitest
 * import { Number, Option } from "effect"
 *
 * Number.divide(6, 3) // => Option.some(2)
 * Number.divide(6, 0) // => Option.none()
 * ```
 *
 * @see {@link divideUnsafe} for division that throws when the divisor is zero
 * @see {@link remainder} for the numeric remainder operation
 *
 * @category math
 * @since 2.0.0
 */
export const divide: {
  (that: number): (self: number) => Option.Option<number>
  (self: number, that: number): Option.Option<number>
} = dual(
  2,
  (self: number, that: number): Option.Option<number> => that === 0 ? Option.none() : Option.some(self / that)
)

/**
 * Divides two `number` values without returning an `Option`.
 *
 * **When to use**
 *
 * Use to divide `number` values where the divisor is known to be non-zero and
 * a plain `number` result is preferred over handling `Option.none`.
 *
 * **Gotchas**
 *
 * Throws a `RangeError` if the divisor is `0`.
 *
 * **Example** (Dividing numbers unsafely)
 *
 * ```ts import.meta.vitest
 * import { Number, Result } from "effect"
 *
 * Number.divideUnsafe(6, 3) // => 2
 *
 * const failure = Result.try({
 *   try: () => Number.divideUnsafe(6, 0),
 *   catch: (error) => (error as Error).message
 * })
 * Result.merge(failure) // => "Division by zero"
 * ```
 *
 * @see {@link divide} for division that returns `Option.none` when the divisor is zero
 *
 * @category math
 * @since 4.0.0
 */
export const divideUnsafe: {
  (that: number): (self: number) => number
  (self: number, that: number): number
} = dual(
  2,
  (self: number, that: number): number =>
    Option.getOrThrowWith(divide(self, that), () => new RangeError("Division by zero"))
)

/**
 * Returns the result of adding `1` to a given number.
 *
 * **When to use**
 *
 * Use to increment a numeric counter by one.
 *
 * **Example** (Incrementing a number)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.increment(2) // => 3
 * ```
 *
 * @category math
 * @since 2.0.0
 */
export const increment = (n: number): number => n + 1

/**
 * Decrements a number by `1`.
 *
 * **When to use**
 *
 * Use to decrement a numeric counter by one.
 *
 * **Example** (Decrementing a number)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.decrement(3) // => 2
 * ```
 *
 * @category math
 * @since 2.0.0
 */
export const decrement = (n: number): number => n - 1

/**
 * Order instance for `number` values.
 *
 * **When to use**
 *
 * Use when you need to sort or compare numbers through APIs that accept an
 * ordering instance.
 *
 * **Example** (Comparing numbers)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.Order(1, 2) // => -1
 * Number.Order(2, 1) // => 1
 * Number.Order(1, 1) // => 0
 * ```
 *
 * @category instances
 * @since 2.0.0
 */
export const Order: order.Order<number> = order.Number

/**
 * Equivalence instance for numbers where `NaN` is considered equal to `NaN`.
 *
 * **When to use**
 *
 * Use when checking numeric equality through APIs that accept an equivalence
 * relation.
 *
 * **Example** (Comparing numbers for equivalence)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.Equivalence(1, 1) // => true
 * Number.Equivalence(1, 2) // => false
 * Number.Equivalence(NaN, NaN) // => true
 * ```
 *
 * @category instances
 * @since 2.0.0
 */
export const Equivalence: Equ.Equivalence<number> = Equ.Number

/**
 * Returns `true` if the first argument is less than the second, otherwise `false`.
 *
 * **When to use**
 *
 * Use to test whether one number is strictly less than another.
 *
 * **Example** (Checking less-than comparisons)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.isLessThan(2, 3) // => true
 * Number.isLessThan(3, 3) // => false
 * Number.isLessThan(4, 3) // => false
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isLessThan: {
  (that: number): (self: number) => boolean
  (self: number, that: number): boolean
} = order.isLessThan(Order)

/**
 * Returns a function that checks if a given `number` is less than or equal to the provided one.
 *
 * **When to use**
 *
 * Use to test whether one number is less than or equal to another.
 *
 * **Example** (Checking less-than-or-equal comparisons)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.isLessThanOrEqualTo(2, 3) // => true
 * Number.isLessThanOrEqualTo(3, 3) // => true
 * Number.isLessThanOrEqualTo(4, 3) // => false
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isLessThanOrEqualTo: {
  (that: number): (self: number) => boolean
  (self: number, that: number): boolean
} = order.isLessThanOrEqualTo(Order)

/**
 * Returns `true` if the first argument is greater than the second, otherwise `false`.
 *
 * **When to use**
 *
 * Use to test whether one number is strictly greater than another.
 *
 * **Example** (Checking greater-than comparisons)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.isGreaterThan(2, 3) // => false
 * Number.isGreaterThan(3, 3) // => false
 * Number.isGreaterThan(4, 3) // => true
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isGreaterThan: {
  (that: number): (self: number) => boolean
  (self: number, that: number): boolean
} = order.isGreaterThan(Order)

/**
 * Returns a function that checks if a given `number` is greater than or equal to the provided one.
 *
 * **When to use**
 *
 * Use to test whether one number is greater than or equal to another.
 *
 * **Example** (Checking greater-than-or-equal comparisons)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.isGreaterThanOrEqualTo(2, 3) // => false
 * Number.isGreaterThanOrEqualTo(3, 3) // => true
 * Number.isGreaterThanOrEqualTo(4, 3) // => true
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isGreaterThanOrEqualTo: {
  (that: number): (self: number) => boolean
  (self: number, that: number): boolean
} = order.isGreaterThanOrEqualTo(Order)

/**
 * Checks whether a `number` is between a `minimum` and `maximum` value (inclusive).
 *
 * **When to use**
 *
 * Use to test whether a number falls inside an inclusive range.
 *
 * **Example** (Checking inclusive ranges)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * const between = Number.between({ minimum: 0, maximum: 5 })
 *
 * between(3) // => true
 * between(-1) // => false
 * between(6) // => false
 * ```
 *
 * @see {@link clamp} for forcing a number into an inclusive range
 *
 * @category predicates
 * @since 2.0.0
 */
export const between: {
  (options: {
    minimum: number
    maximum: number
  }): (self: number) => boolean
  (self: number, options: {
    minimum: number
    maximum: number
  }): boolean
} = order.isBetween(Order)

/**
 * Restricts the given `number` to be within the range specified by the `minimum` and `maximum` values.
 *
 * **When to use**
 *
 * Use to force a number into an inclusive range.
 *
 * **Details**
 *
 * - If the `number` is less than the `minimum` value, the function returns the `minimum` value.
 * - If the `number` is greater than the `maximum` value, the function returns the `maximum` value.
 * - Otherwise, it returns the original `number`.
 * - `NaN` is ordered below every non-`NaN` number by `Number.Order`, so it is
 *   clamped to `minimum`.
 *
 * **Example** (Clamping to a range)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * const clamp = Number.clamp({ minimum: 1, maximum: 5 })
 *
 * clamp(3) // => 3
 * clamp(0) // => 1
 * clamp(6) // => 5
 * ```
 *
 * @see {@link between} for checking whether a number is already inside a range
 *
 * @category math
 * @since 2.0.0
 */
export const clamp: {
  (options: {
    minimum: number
    maximum: number
  }): (self: number) => number
  (self: number, options: {
    minimum: number
    maximum: number
  }): number
} = order.clamp(Order)

/**
 * Returns the minimum between two `number`s.
 *
 * **When to use**
 *
 * Use to select the smaller of two numbers.
 *
 * **Example** (Finding the minimum)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.min(2, 3) // => 2
 * ```
 *
 * @see {@link max} for selecting the larger value
 *
 * @category math
 * @since 2.0.0
 */
export const min: {
  (that: number): (self: number) => number
  (self: number, that: number): number
} = order.min(Order)

/**
 * Returns the maximum between two `number`s.
 *
 * **When to use**
 *
 * Use to select the larger of two numbers.
 *
 * **Example** (Finding the maximum)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.max(2, 3) // => 3
 * ```
 *
 * @see {@link min} for selecting the smaller value
 *
 * @category math
 * @since 2.0.0
 */
export const max: {
  (that: number): (self: number) => number
  (self: number, that: number): number
} = order.max(Order)

/**
 * Determines the sign of a given `number`.
 *
 * **When to use**
 *
 * Use to classify a number as negative, zero, or positive.
 *
 * **Example** (Determining the sign)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.sign(-5) // => -1
 * Number.sign(0) // => 0
 * Number.sign(5) // => 1
 * ```
 *
 * @category math
 * @since 2.0.0
 */
export const sign = (n: number): Ordering => Order(n, 0)

/**
 * Takes an `Iterable` of `number`s and returns their sum as a single `number`.
 *
 * **When to use**
 *
 * Use to sum all numbers in an iterable.
 *
 * **Example** (Summing an iterable)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.sumAll([2, 3, 4]) // => 9
 * ```
 *
 * @see {@link sum} for adding two numbers
 * @see {@link ReducerSum} for summing through APIs that consume a `Reducer`
 *
 * @category math
 * @since 2.0.0
 */
export const sumAll = (collection: Iterable<number>): number => {
  let out = 0
  for (const n of collection) {
    out += n
  }
  return out
}

/**
 * Takes an `Iterable` of `number`s and returns their multiplication as a single `number`.
 *
 * **When to use**
 *
 * Use to multiply all numbers in an iterable.
 *
 * **Example** (Multiplying an iterable)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.multiplyAll([2, 3, 4]) // => 24
 * ```
 *
 * @see {@link multiply} for multiplying two numbers
 * @see {@link ReducerMultiply} for multiplying through APIs that consume a `Reducer`
 *
 * @category math
 * @since 2.0.0
 */
export const multiplyAll = (collection: Iterable<number>): number => {
  let out = 1
  for (const n of collection) {
    if (n === 0) {
      return 0
    }
    out *= n
  }
  return out
}

/**
 * Returns the remainder left over when one operand is divided by a second operand, always taking the sign of the dividend.
 *
 * **When to use**
 *
 * Use to compute a numeric remainder while preserving decimal precision better
 * than direct JavaScript `%` for decimal operands.
 *
 * **Example** (Calculating remainders)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.remainder(2, 2) // => 0
 * Number.remainder(3, 2) // => 1
 * Number.remainder(-4, 2) // => -0
 * ```
 *
 * @see {@link divide} for quotient calculation with division-by-zero represented as `Option.none`
 *
 * @category math
 * @since 2.0.0
 */
export const remainder: {
  (divisor: number): (self: number) => number
  (self: number, divisor: number): number
} = dual(2, (self: number, divisor: number): number => {
  if (!globalThis.Number.isFinite(self) || !globalThis.Number.isFinite(divisor) || divisor === 0) {
    return NaN
  }
  if (globalThis.Number.isInteger(self) && globalThis.Number.isInteger(divisor)) {
    return self % divisor
  }

  const [selfCoefficient, selfExponent] = toScientificInteger(self)
  const [divisorCoefficient, divisorExponent] = toScientificInteger(divisor)
  const exponent = Math.min(selfExponent, divisorExponent)
  const selfInteger = selfCoefficient * BigInt(10) ** BigInt(selfExponent - exponent)
  const divisorInteger = divisorCoefficient * BigInt(10) ** BigInt(divisorExponent - exponent)
  const out = selfInteger % divisorInteger
  if (out === BigInt(0)) {
    return self < 0 || Object.is(self, -0) ? -0 : 0
  }
  const remainder = globalThis.Number(`${out}e${exponent}`)
  return remainder === 0 ? Math.sign(self) * globalThis.Number.MIN_VALUE : remainder
})

function toScientificInteger(n: number): readonly [coefficient: bigint, exponent: number] {
  if (globalThis.Number.isInteger(n)) {
    return [BigInt(n), 0]
  }
  const scientific = Math.abs(n).toExponential()
  const eIndex = scientific.indexOf("e")
  const digits = scientific.slice(0, eIndex).replace(".", "")
  const coefficient = BigInt(digits) * (n < 0 ? -BigInt(1) : BigInt(1))
  return [coefficient, globalThis.Number(scientific.slice(eIndex + 1)) - digits.length + 1]
}

/**
 * Returns the next power of 2 from the given number.
 *
 * **When to use**
 *
 * Use to round a number up to the next power of two.
 *
 * **Example** (Finding the next power of two)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.nextPow2(5) // => 8
 * Number.nextPow2(17) // => 32
 * ```
 *
 * @category math
 * @since 2.0.0
 */
export const nextPow2 = (n: number): number => {
  const nextPow = Math.ceil(Math.log(n) / Math.log(2))
  return Math.max(Math.pow(2, nextPow), 2)
}

/**
 * Parses a `number` from a `string` safely using the `Number()` function.
 * The following special string values are supported: "NaN", "Infinity", "-Infinity".
 *
 * **When to use**
 *
 * Use to parse numeric text without throwing on invalid input.
 *
 * **Example** (Parsing numbers from strings)
 *
 * ```ts import.meta.vitest
 * import { Number, Option } from "effect"
 *
 * Number.parse("42") // => Option.some(42)
 * Number.parse("3.14") // => Option.some(3.14)
 * Number.parse("NaN") // => Option.some(NaN)
 * Number.parse("Infinity") // => Option.some(Infinity)
 * Number.parse("-Infinity") // => Option.some(-Infinity)
 * Number.parse("not a number") // => Option.none()
 * ```
 *
 * @see {@link Number} for native constructor coercion
 *
 * @category constructors
 * @since 2.0.0
 */
export const parse = (s: string): Option.Option<number> => {
  if (s === "NaN") {
    return Option.some(NaN)
  }
  if (s === "Infinity") {
    return Option.some(Infinity)
  }
  if (s === "-Infinity") {
    return Option.some(-Infinity)
  }
  if (s.trim() === "") {
    return Option.none()
  }
  const n = Number(s)
  return Number.isNaN(n) ? Option.none() : Option.some(n)
}

/**
 * Returns the number rounded with the given precision.
 *
 * **When to use**
 *
 * Use to round a number to a fixed number of decimal places.
 *
 * **Example** (Rounding with precision)
 *
 * ```ts import.meta.vitest
 * import { Number } from "effect"
 *
 * Number.round(1.1234, 2) // => 1.12
 * Number.round(1.567, 2) // => 1.57
 * ```
 *
 * @category math
 * @since 3.8.0
 */
export const round: {
  (precision: number): (self: number) => number
  (self: number, precision: number): number
} = dual(2, (self: number, precision: number): number => {
  const factor = Math.pow(10, precision)
  return Math.round(self * factor) / factor
})

/**
 * Reducer for combining `number`s using addition.
 *
 * **When to use**
 *
 * Use to sum many numbers through APIs that consume a `Reducer`.
 *
 * **Details**
 *
 * The reducer starts from `0`, so `combineAll([])` returns `0`.
 *
 * @see {@link sumAll} for summing an iterable directly
 * @see {@link ReducerMultiply} for multiplying number values
 *
 * @category math
 * @since 4.0.0
 */
export const ReducerSum: Reducer.Reducer<number> = Reducer.make((a, b) => a + b, 0)

/**
 * Reducer for combining `number`s using multiplication.
 *
 * **When to use**
 *
 * Use to multiply many numbers through APIs that consume a `Reducer`.
 *
 * **Details**
 *
 * The reducer starts from `1`, so reducing an empty collection returns `1`.
 *
 * **Gotchas**
 *
 * Reducing an iterable short-circuits when it sees `0`, so later elements are
 * not consumed.
 *
 * @see {@link multiplyAll} for multiplying an iterable directly
 *
 * @category math
 * @since 4.0.0
 */
export const ReducerMultiply: Reducer.Reducer<number> = Reducer.make((a, b) => a * b, 1, (collection) => {
  let acc = 1
  for (const n of collection) {
    if (n === 0) return 0
    acc *= n
  }
  return acc
})

/**
 * Reducer for reducing `number`s by keeping the maximum value.
 *
 * **When to use**
 *
 * Use to keep the largest number through APIs that consume a `Reducer`.
 *
 * **Details**
 *
 * The reducer starts from `-Infinity`, so reducing an empty collection returns
 * `-Infinity`.
 *
 * **Gotchas**
 *
 * `NaN` values propagate through `Math.max`.
 *
 * @see {@link ReducerMin} for keeping the smallest number
 * @see {@link max} for comparing two numbers directly
 *
 * @category math
 * @since 4.0.0
 */
export const ReducerMax: Reducer.Reducer<number> = Reducer.make((a, b) => Math.max(a, b), -Infinity)

/**
 * Reducer for reducing `number`s by keeping the minimum value.
 *
 * **When to use**
 *
 * Use to keep the smallest number through APIs that consume a `Reducer`.
 *
 * **Details**
 *
 * The reducer starts from `Infinity`, so reducing an empty collection returns
 * `Infinity`.
 *
 * **Gotchas**
 *
 * `NaN` values propagate through `Math.min`.
 *
 * @see {@link ReducerMax} for keeping the largest number
 * @see {@link min} for comparing two numbers directly
 *
 * @category math
 * @since 4.0.0
 */
export const ReducerMin: Reducer.Reducer<number> = Reducer.make((a, b) => Math.min(a, b), Infinity)
