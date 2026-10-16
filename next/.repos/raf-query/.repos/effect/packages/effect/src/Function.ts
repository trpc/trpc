/**
 * Provides small helpers for defining and reusing TypeScript functions.
 *
 * The main helpers are `pipe` and `flow` for left-to-right composition and
 * `dual` for APIs that support both direct and pipe-friendly call styles. The
 * module also contains small identity, constant, tuple, type-level, and
 * memoization helpers used across the library.
 *
 * @since 2.0.0
 */
import type { TypeLambda } from "./HKT.ts"
import { pipeArguments } from "./Pipeable.ts"

/**
 * Type lambda for function types, used for higher-kinded type operations.
 *
 * **When to use**
 *
 * Use when defining higher-kinded abstractions that must accept function types
 * as one of their type-lambda inputs.
 *
 * **Example** (Creating a function type with a type lambda)
 *
 * ```ts import.meta.vitest
 * import type { Function, HKT } from "effect"
 *
 * // Create a function type using the type lambda
 * type StringToNumber = HKT.Kind<Function.FunctionTypeLambda, string, never, never, number>
 * // Equivalent to: (a: string) => number
 * ```
 *
 * @category utility types
 * @since 2.0.0
 */
export interface FunctionTypeLambda extends TypeLambda {
  readonly type: (a: this["In"]) => this["Target"]
}

/**
 * Creates a function that can be called in data-first style or data-last
 * (`pipe`-friendly) style.
 *
 * **When to use**
 *
 * Use to expose one implementation through both direct and `pipe`-friendly
 * call styles.
 *
 * **Details**
 *
 * Pass either the arity of the uncurried function or a predicate that decides
 * whether the current call is data-first. Arity is the common case. Use a
 * predicate when optional arguments make arity ambiguous.
 *
 * **Example** (Selecting data-first or data-last style by arity)
 *
 * ```ts import.meta.vitest
 * import { Function, pipe } from "effect"
 *
 * const sum = Function.dual<
 *   (that: number) => (self: number) => number,
 *   (self: number, that: number) => number
 * >(2, (self, that) => self + that)
 *
 * sum(2, 3) // => 5
 * pipe(2, sum(3)) // => 5
 * ```
 *
 * **Example** (Defining overloads with call signatures)
 *
 * ```ts import.meta.vitest
 * import { Function, pipe } from "effect"
 *
 * const sum: {
 *   (that: number): (self: number) => number
 *   (self: number, that: number): number
 * } = Function.dual(2, (self: number, that: number): number => self + that)
 *
 * sum(2, 3) // => 5
 * pipe(2, sum(3)) // => 5
 * ```
 *
 * **Example** (Selecting data-first or data-last style with a predicate)
 *
 * ```ts import.meta.vitest
 * import { Function, pipe } from "effect"
 *
 * const sum = Function.dual<
 *   (that: number) => (self: number) => number,
 *   (self: number, that: number) => number
 * >(
 *   (args) => args.length === 2,
 *   (self, that) => self + that
 * )
 *
 * sum(2, 3) // => 5
 * pipe(2, sum(3)) // => 5
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const dual: {
  <DataLast extends (...args: Array<any>) => any, DataFirst extends (...args: Array<any>) => any>(
    arity: Parameters<DataFirst>["length"],
    body: DataFirst
  ): DataLast & DataFirst
  <DataLast extends (...args: Array<any>) => any, DataFirst extends (...args: Array<any>) => any>(
    isDataFirst: (args: IArguments) => boolean,
    body: DataFirst
  ): DataLast & DataFirst
} = function(arity, body) {
  if (typeof arity === "function") {
    return function(this: any) {
      return arity(arguments)
        ? body.apply(this, arguments as any)
        : ((self: any) => body(self, ...arguments)) as any
    }
  }

  switch (arity) {
    case 0:
    case 1:
      throw new RangeError(`Invalid arity ${arity}`)

    case 2:
      return function(a, b) {
        if (arguments.length >= 2) {
          return body(a, b)
        }
        return function(self: any) {
          return body(self, a)
        }
      }

    case 3:
      return function(a, b, c) {
        if (arguments.length >= 3) {
          return body(a, b, c)
        }
        return function(self: any) {
          return body(self, a, b)
        }
      }

    default:
      return function() {
        if (arguments.length >= arity) {
          // @ts-expect-error
          return body.apply(this, arguments)
        }
        const args = arguments
        return function(self: any) {
          return body(self, ...args)
        }
      }
  }
}
/**
 * Applies a function to a given value.
 *
 * **When to use**
 *
 * Use to pass a fixed value into a unary function, especially when the function
 * is the value flowing through `pipe`.
 *
 * **Details**
 *
 * `apply(a)(f)` is equivalent to `f(a)`.
 *
 * **Example** (Applying an argument to a function)
 *
 * ```ts import.meta.vitest
 * import { Function, pipe, String } from "effect"
 *
 * pipe(String.length, Function.apply("hello")) // => 5
 * ```
 *
 * @see {@link pipe} for building left-to-right pipelines
 *
 * @category combinators
 * @since 2.0.0
 */
export const apply = <A>(a: A) => <B>(self: (a: A) => B): B => self(a)

/**
 * A zero-argument function that produces a value when invoked.
 *
 * **When to use**
 *
 * Use to type a lazy value provider that should not run until called.
 *
 * **Example** (Creating a lazy argument)
 *
 * ```ts import.meta.vitest
 * import { Function } from "effect"
 *
 * const constNull: Function.LazyArg<null> = Function.constant(null)
 * constNull() // => null
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export type LazyArg<A> = () => A

/**
 * Represents a function with multiple arguments.
 *
 * **When to use**
 *
 * Use to describe a function whose argument list is represented as a tuple
 * type.
 *
 * **Example** (Typing a variadic function)
 *
 * ```ts import.meta.vitest
 * import type { Function } from "effect"
 *
 * const sum: Function.FunctionN<[number, number], number> = (a, b) => a + b
 * sum(2, 3) // => 5
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export type FunctionN<A extends ReadonlyArray<unknown>, B> = (...args: A) => B

/**
 * Returns its input argument unchanged.
 *
 * **When to use**
 *
 * Use to return a value unchanged where a function is required.
 *
 * **Example** (Returning the same value)
 *
 * ```ts import.meta.vitest
 * import { identity } from "effect"
 *
 * identity(5) // => 5
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const identity = <A>(a: A): A => a

/**
 * Ensures that the type of an expression matches some type,
 * without changing the resulting type of that expression.
 *
 * **When to use**
 *
 * Use to check assignability while preserving the expression's precise inferred
 * type.
 *
 * **Example** (Checking an expression against a type)
 *
 * ```ts import.meta.vitest
 * import { Function } from "effect"
 *
 * const test1 = Function.satisfies<number>()(5 as const) // => 5
 * // ^? const test: 5
 * // @ts-expect-error
 * const test2 = Function.satisfies<string>()(5)
 * // ^? Argument of type 'number' is not assignable to parameter of type 'string'
 * ```
 *
 * @see {@link cast} for changing only the static TypeScript type
 *
 * @category utility types
 * @since 2.0.0
 */
export const satisfies = <A>() => <B extends A>(b: B) => b

/**
 * Returns the input value with a different static type.
 *
 * **When to use**
 *
 * Use when you need an explicit type-level cast and accept that the value is
 * returned unchanged at runtime.
 *
 * **Gotchas**
 *
 * This is a type-level cast only; it performs no runtime validation or
 * conversion.
 *
 * @see {@link satisfies} for checking assignability without changing the resulting type
 *
 * @category utility types
 * @since 4.0.0
 */
export const cast: <A, B>(a: A) => B = identity as any

/**
 * Creates a zero-argument function that always returns the provided value.
 *
 * **When to use**
 *
 * Use when you need a thunk or callback that returns the same value on every
 * invocation.
 *
 * **Example** (Creating a constant thunk)
 *
 * ```ts import.meta.vitest
 * import { Function } from "effect"
 *
 * const constNull = Function.constant(null)
 *
 * constNull() // => null
 * constNull() // => null
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const constant = <A>(value: A): LazyArg<A> => () => value

/**
 * Returns `true` when called.
 *
 * **When to use**
 *
 * Use when you need a thunk that returns `true` on every invocation.
 *
 * **Example** (Returning true from a thunk)
 *
 * ```ts import.meta.vitest
 * import { Function } from "effect"
 *
 * Function.constTrue() // => true
 * ```
 *
 * @category constants
 * @since 2.0.0
 */
export const constTrue: LazyArg<boolean> = constant(true)

/**
 * Returns `false` when called.
 *
 * **When to use**
 *
 * Use when you need a thunk that returns `false` on every invocation.
 *
 * **Example** (Returning false from a thunk)
 *
 * ```ts import.meta.vitest
 * import { Function } from "effect"
 *
 * Function.constFalse() // => false
 * ```
 *
 * @category constants
 * @since 2.0.0
 */
export const constFalse: LazyArg<boolean> = constant(false)

/**
 * Returns `null` when called.
 *
 * **When to use**
 *
 * Use when you need a thunk that returns `null` on every invocation.
 *
 * **Example** (Returning null from a thunk)
 *
 * ```ts import.meta.vitest
 * import { Function } from "effect"
 *
 * Function.constNull() // => null
 * ```
 *
 * @category constants
 * @since 2.0.0
 */
export const constNull: LazyArg<null> = constant(null)

/**
 * Returns `undefined` when called.
 *
 * **When to use**
 *
 * Use when you need a thunk that returns `undefined` on every invocation.
 *
 * **Example** (Returning undefined from a thunk)
 *
 * ```ts import.meta.vitest
 * import { Function } from "effect"
 *
 * Function.constUndefined() // => undefined
 * ```
 *
 * @category constants
 * @since 2.0.0
 */
export const constUndefined: LazyArg<undefined> = constant(undefined)

/**
 * Returns no meaningful value when called.
 *
 * **When to use**
 *
 * Use when you need a thunk that is called only for its effect and has no
 * meaningful return value.
 *
 * **Example** (Returning void from a thunk)
 *
 * ```ts import.meta.vitest
 * import { Function } from "effect"
 *
 * Function.constVoid() // => undefined
 * ```
 *
 * @category constants
 * @since 2.0.0
 */
export const constVoid: LazyArg<void> = constUndefined

/**
 * Reverses the order of arguments for a curried function.
 *
 * **When to use**
 *
 * Use to adapt a curried function when its argument groups need to be supplied
 * in the opposite order.
 *
 * **Example** (Flipping curried arguments)
 *
 * ```ts import.meta.vitest
 * import { Function } from "effect"
 *
 * const f = (a: number) => (b: string) => a - b.length
 *
 * Function.flip(f)("aaa")(2) // => -1
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const flip = <A extends Array<unknown>, B extends Array<unknown>, C>(
  f: (...a: A) => (...b: B) => C
): (...b: B) => (...a: A) => C =>
(...b) =>
(...a) => f(...a)(...b)

/**
 * Composes two functions, `ab` and `bc` into a single function that takes in an argument `a` of type `A` and returns a result of type `C`.
 * The result is obtained by first applying the `ab` function to `a` and then applying the `bc` function to the result of `ab`.
 *
 * **When to use**
 *
 * Use to compose exactly two unary functions into a reusable unary function.
 *
 * **Example** (Composing two functions)
 *
 * ```ts import.meta.vitest
 * import { Function } from "effect"
 *
 * const increment = (n: number) => n + 1
 * const square = (n: number) => n * n
 *
 * Function.compose(increment, square)(2) // => 9
 * ```
 *
 * @see {@link flow} for composing a left-to-right sequence of functions
 * @see {@link pipe} for applying a value through a left-to-right sequence immediately
 *
 * @category combinators
 * @since 2.0.0
 */
export const compose: {
  <B, C>(bc: (b: B) => C): <A>(self: (a: A) => B) => (a: A) => C
  <A, B, C>(self: (a: A) => B, bc: (b: B) => C): (a: A) => C
} = dual(2, <A, B, C>(ab: (a: A) => B, bc: (b: B) => C): (a: A) => C => (a) => bc(ab(a)))

/**
 * Marks an impossible branch by accepting a `never` value and returning any
 * type.
 *
 * **When to use**
 *
 * Use when you need a return value in a branch that exhaustive checks prove
 * cannot be reached.
 *
 * **Gotchas**
 *
 * Calling `absurd` throws, because a value of type `never` should be
 * impossible at runtime.
 *
 * **Example** (Handling impossible values)
 *
 * ```ts import.meta.vitest
 * import { absurd } from "effect"
 *
 * const handleNever = (value: never) => {
 *   return absurd(value) // This will throw an error if called
 * }
 * ```
 *
 * @category utility types
 * @since 2.0.0
 */
export const absurd = <A>(_: never): A => {
  throw new Error("Called `absurd` function which should be uncallable")
}

/**
 * Creates a tupled version of this function: instead of `n` arguments, it accepts a single tuple argument.
 *
 * **When to use**
 *
 * Use to adapt a multi-argument function so it accepts one tuple argument.
 *
 * **Example** (Converting arguments to a tuple)
 *
 * ```ts import.meta.vitest
 * import { Function } from "effect"
 *
 * const sumTupled = Function.tupled((x: number, y: number): number => x + y)
 *
 * sumTupled([1, 2]) // => 3
 * ```
 *
 * @see {@link untupled} for adapting a tuple-argument function back to multiple arguments
 *
 * @category combinators
 * @since 2.0.0
 */
export const tupled = <A extends ReadonlyArray<unknown>, B>(f: (...a: A) => B): (a: A) => B => (a) => f(...a)

/**
 * Converts a tupled function back to an uncurried function.
 *
 * **When to use**
 *
 * Use to adapt a tuple-argument function so it accepts multiple arguments.
 *
 * **Example** (Converting a tuple to arguments)
 *
 * ```ts import.meta.vitest
 * import { Function } from "effect"
 *
 * const getFirst = Function.untupled(<A, B>(tuple: [A, B]): A => tuple[0])
 *
 * getFirst(1, 2) // => 1
 * ```
 *
 * @see {@link tupled} for adapting a multi-argument function to one tuple argument
 *
 * @category combinators
 * @since 2.0.0
 */
export const untupled = <A extends ReadonlyArray<unknown>, B>(f: (a: A) => B): (...a: A) => B => (...a) => f(a)

/**
 * Pipes the value of an expression through a left-to-right sequence of
 * functions.
 *
 * **When to use**
 *
 * Use when you need to compose data-last functions into readable
 * transformation pipelines instead of method-style chains.
 *
 * **Details**
 *
 * Takes an initial value, passes it to the first function, then passes each
 * result to the next function in order. The final function result is returned.
 *
 * **Gotchas**
 *
 * Each function passed after the initial value must accept a single argument,
 * because `pipe` calls each step with only the previous result.
 *
 * **Example** (Piping values through functions)
 *
 * In this example, `1` is passed to the first function, and each result becomes
 * the input for the next function.
 *
 * ```ts import.meta.vitest
 * import { pipe } from "effect"
 *
 * pipe(
 *   1,
 *   (n) => n + 1,
 *   (n) => n * 2,
 *   (n) => `result: ${n}`
 * ) // => "result: 4"
 * ```
 *
 * **Example** (Rewriting method chains with pipe)
 *
 * The same transformation can be written with data-last functions.
 *
 * ```ts import.meta.vitest
 * import { Array, pipe } from "effect"
 *
 * const numbers = [1, 2, 3, 4]
 * const double = (n: number) => n * 2
 * const greaterThanFour = (n: number) => n > 4
 *
 * pipe(
 *   numbers,
 *   Array.map(double),
 *   Array.filter(greaterThanFour)
 * ) // => [6, 8]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export function pipe<A>(a: A): A
export function pipe<A, B = never>(a: A, ab: (a: A) => B): B
export function pipe<A, B = never, C = never>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C
): C
export function pipe<A, B = never, C = never, D = never>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D
): D
export function pipe<A, B = never, C = never, D = never, E = never>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E
): E
export function pipe<A, B = never, C = never, D = never, E = never, F = never>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F
): F
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G
): G
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H
): H
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I
): I
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (i: I) => J
): J
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (i: I) => J,
  jk: (j: J) => K
): K
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (i: I) => J,
  jk: (j: J) => K,
  kl: (k: K) => L
): L
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (i: I) => J,
  jk: (j: J) => K,
  kl: (k: K) => L,
  lm: (l: L) => M
): M
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never,
  N = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (i: I) => J,
  jk: (j: J) => K,
  kl: (k: K) => L,
  lm: (l: L) => M,
  mn: (m: M) => N
): N
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never,
  N = never,
  O = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (i: I) => J,
  jk: (j: J) => K,
  kl: (k: K) => L,
  lm: (l: L) => M,
  mn: (m: M) => N,
  no: (n: N) => O
): O
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never,
  N = never,
  O = never,
  P = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (i: I) => J,
  jk: (j: J) => K,
  kl: (k: K) => L,
  lm: (l: L) => M,
  mn: (m: M) => N,
  no: (n: N) => O,
  op: (o: O) => P
): P
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never,
  N = never,
  O = never,
  P = never,
  Q = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (i: I) => J,
  jk: (j: J) => K,
  kl: (k: K) => L,
  lm: (l: L) => M,
  mn: (m: M) => N,
  no: (n: N) => O,
  op: (o: O) => P,
  pq: (p: P) => Q
): Q
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never,
  N = never,
  O = never,
  P = never,
  Q = never,
  R = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (i: I) => J,
  jk: (j: J) => K,
  kl: (k: K) => L,
  lm: (l: L) => M,
  mn: (m: M) => N,
  no: (n: N) => O,
  op: (o: O) => P,
  pq: (p: P) => Q,
  qr: (q: Q) => R
): R
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never,
  N = never,
  O = never,
  P = never,
  Q = never,
  R = never,
  S = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (i: I) => J,
  jk: (j: J) => K,
  kl: (k: K) => L,
  lm: (l: L) => M,
  mn: (m: M) => N,
  no: (n: N) => O,
  op: (o: O) => P,
  pq: (p: P) => Q,
  qr: (q: Q) => R,
  rs: (r: R) => S
): S
export function pipe<
  A,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never,
  K = never,
  L = never,
  M = never,
  N = never,
  O = never,
  P = never,
  Q = never,
  R = never,
  S = never,
  T = never
>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (i: I) => J,
  jk: (j: J) => K,
  kl: (k: K) => L,
  lm: (l: L) => M,
  mn: (m: M) => N,
  no: (n: N) => O,
  op: (o: O) => P,
  pq: (p: P) => Q,
  qr: (q: Q) => R,
  rs: (r: R) => S,
  st: (s: S) => T
): T
export function pipe(a: unknown, ...args: Array<any>): unknown {
  return pipeArguments(a, args as any)
}

/**
 * Performs left-to-right function composition.
 *
 * **When to use**
 *
 * Use to build a reusable function from a left-to-right sequence of
 * transformations.
 *
 * **Details**
 *
 * The first function may have any arity. Every following function must be
 * unary.
 *
 * **Example** (Composing functions left to right)
 *
 * ```ts import.meta.vitest
 * import { flow } from "effect"
 *
 * const len = (s: string): number => s.length
 * const double = (n: number): number => n * 2
 *
 * const f = flow(len, double)
 *
 * f("aaa") // => 6
 * ```
 *
 * @see {@link pipe} for applying a value through a left-to-right sequence immediately
 * @see {@link compose} for composing exactly two functions
 *
 * @category combinators
 * @since 2.0.0
 */
export function flow<A extends ReadonlyArray<unknown>, B = never>(
  ab: (...a: A) => B
): (...a: A) => B
export function flow<A extends ReadonlyArray<unknown>, B = never, C = never>(
  ab: (...a: A) => B,
  bc: (b: B) => C
): (...a: A) => C
export function flow<
  A extends ReadonlyArray<unknown>,
  B = never,
  C = never,
  D = never
>(ab: (...a: A) => B, bc: (b: B) => C, cd: (c: C) => D): (...a: A) => D
export function flow<
  A extends ReadonlyArray<unknown>,
  B = never,
  C = never,
  D = never,
  E = never
>(
  ab: (...a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E
): (...a: A) => E
export function flow<
  A extends ReadonlyArray<unknown>,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never
>(
  ab: (...a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F
): (...a: A) => F
export function flow<
  A extends ReadonlyArray<unknown>,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never
>(
  ab: (...a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G
): (...a: A) => G
export function flow<
  A extends ReadonlyArray<unknown>,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never
>(
  ab: (...a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H
): (...a: A) => H
export function flow<
  A extends ReadonlyArray<unknown>,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never
>(
  ab: (...a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I
): (...a: A) => I
export function flow<
  A extends ReadonlyArray<unknown>,
  B = never,
  C = never,
  D = never,
  E = never,
  F = never,
  G = never,
  H = never,
  I = never,
  J = never
>(
  ab: (...a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (i: I) => J
): (...a: A) => J
export function flow(
  ab: Function,
  bc?: Function,
  cd?: Function,
  de?: Function,
  ef?: Function,
  fg?: Function,
  gh?: Function,
  hi?: Function,
  ij?: Function
): unknown {
  switch (arguments.length) {
    case 1:
      return ab
    case 2:
      return function(this: unknown) {
        return bc!(ab.apply(this, arguments))
      }
    case 3:
      return function(this: unknown) {
        return cd!(bc!(ab.apply(this, arguments)))
      }
    case 4:
      return function(this: unknown) {
        return de!(cd!(bc!(ab.apply(this, arguments))))
      }
    case 5:
      return function(this: unknown) {
        return ef!(de!(cd!(bc!(ab.apply(this, arguments)))))
      }
    case 6:
      return function(this: unknown) {
        return fg!(ef!(de!(cd!(bc!(ab.apply(this, arguments))))))
      }
    case 7:
      return function(this: unknown) {
        return gh!(fg!(ef!(de!(cd!(bc!(ab.apply(this, arguments)))))))
      }
    case 8:
      return function(this: unknown) {
        return hi!(gh!(fg!(ef!(de!(cd!(bc!(ab.apply(this, arguments))))))))
      }
    case 9:
      return function(this: unknown) {
        return ij!(hi!(gh!(fg!(ef!(de!(cd!(bc!(ab.apply(this, arguments)))))))))
      }
  }
  return
}

/**
 * Creates a compile-time placeholder for a value of any type.
 *
 * **When to use**
 *
 * Use as a temporary typed placeholder while developing incomplete code.
 *
 * **Gotchas**
 *
 * `hole` is intended for temporary development use. If the placeholder is
 * evaluated at runtime, it throws.
 *
 * **Example** (Creating a development placeholder)
 *
 * ```ts import.meta.vitest
 * import { hole } from "effect"
 *
 * // Intentionally not called: `hole` throws if the placeholder is evaluated.
 * const buildUser = (id: number): { readonly id: number; readonly name: string } => ({
 *   id,
 *   name: hole<string>()
 * })
 *
 * ```
 *
 * @category utility types
 * @since 2.0.0
 */
export const hole: <T>() => T = cast(absurd)

/**
 * Returns the second argument and discards the first. The SK combinator is
 * a fundamental combinator in the lambda calculus and the SKI combinator
 * calculus.
 *
 * **When to use**
 *
 * Use to discard the first argument and return the second argument.
 *
 * **Example** (Discarding the first argument)
 *
 * ```ts import.meta.vitest
 * import { Function } from "effect"
 *
 * Function.SK(0, "hello") // => "hello"
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const SK = <A, B>(_: A, b: B): B => b

/**
 * Creates a memoized function whose input is an object, caching results by
 * object identity.
 *
 * **When to use**
 *
 * Use to reuse the result of a synchronous computation whose output is stable
 * for a given object reference.
 *
 * **Details**
 *
 * Each memoized wrapper owns a private `WeakMap` keyed by object identity.
 *
 * **Gotchas**
 *
 * `undefined` is reserved to represent a cache miss and is therefore not
 * supported as a return value.
 *
 * Structurally equal objects do not share cache entries. If the same object is
 * mutated after its first call, later calls still return the cached result for
 * that reference.
 *
 * @category caching
 * @since 4.0.0
 */
export function memoize<A extends object, O extends {} | null>(f: (a: A) => O): (ast: A) => O {
  const cache = new WeakMap<object, O>()
  return (a) => {
    const cached = cache.get(a)
    if (cached !== undefined) return cached
    const result = f(a)
    cache.set(a, result)
    return result
  }
}

/**
 * Creates a memoized idempotent object transformation that caches both inputs
 * and their outputs by object identity.
 *
 * **When to use**
 *
 * Use when an object transformation is idempotent and its output can be safely
 * reused as a fixed point.
 *
 * **Details**
 *
 * After computing an input, the returned function caches both the input and
 * the output. Calling it with either reference returns the output without
 * invoking the supplied function again.
 *
 * **Gotchas**
 *
 * The returned function treats each computed output as a fixed point. If
 * applying the supplied function to an output would produce an observably
 * different value, this memoization changes that behavior.
 *
 * @see {@link memoize} for memoizing functions without an idempotence requirement
 * @category caching
 * @since 4.0.0
 */
export function memoizeIdempotent<A extends object>(f: (a: A) => A): (a: A) => A {
  const cache = new WeakMap<A, A>()
  return (a) => {
    const cached = cache.get(a)
    if (cached !== undefined) return cached
    const result = f(a)
    cache.set(a, result)
    if (result !== a) {
      cache.set(result, result)
    }
    return result
  }
}
