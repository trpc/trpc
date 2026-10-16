/**
 * Provides assertion helpers used by `@effect/vitest` tests.
 *
 * This module defines small assertion functions built on Node's `assert`,
 * Vitest's instance checks, and Effect's equality support. The helpers cover
 * basic equality, thrown errors, defined and undefined values, strings, regular
 * expressions, class instances, `Option`, `Result`, and `Exit`. Most helpers are
 * synchronous; `throwsAsync` handles rejected promises.
 *
 * @since 4.0.0
 */
import type * as Cause from "effect/Cause"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Result from "effect/Result"
import * as assert from "node:assert"
import { assert as vassert } from "vitest"

// ----------------------------
// Primitives
// ----------------------------

/**
 * Fails the current test with the provided error message.
 *
 * @category testing
 * @since 4.0.0
 */
export function fail(message: string) {
  assert.fail(message)
}

/**
 * Asserts that `actual` is deeply strictly equal to `expected` using Node's `assert.deepStrictEqual`.
 *
 * @category testing
 * @since 4.0.0
 */
export function deepStrictEqual<A>(actual: A, expected: A, message?: string, ..._: Array<never>) {
  if (message !== undefined) {
    assert.deepStrictEqual(actual, expected, message)
  } else {
    assert.deepStrictEqual(actual, expected)
  }
}

/**
 * Asserts that `actual` is not deeply strictly equal to `expected` using Node's `assert.notDeepStrictEqual`.
 *
 * @category testing
 * @since 4.0.0
 */
export function notDeepStrictEqual<A>(actual: A, expected: A, message?: string, ..._: Array<never>) {
  if (message !== undefined) {
    assert.notDeepStrictEqual(actual, expected, message)
  } else {
    assert.notDeepStrictEqual(actual, expected)
  }
}

/**
 * Asserts that `actual` is strictly equal to `expected` using Node's `assert.strictEqual`.
 *
 * @category testing
 * @since 4.0.0
 */
export function strictEqual<A>(actual: A, expected: A, message?: string, ..._: Array<never>) {
  if (message !== undefined) {
    assert.strictEqual(actual, expected, message)
  } else {
    assert.strictEqual(actual, expected)
  }
}

/**
 * Asserts that `actual` is equal to `expected` using the `Equal.equals` trait.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertEquals<A>(actual: A, expected: A, message?: string, ..._: Array<never>) {
  if (!Equal.equals(actual, expected)) {
    deepStrictEqual(actual, expected, message) // show diff
    fail(message ?? "Expected values to be Equal.equals")
  }
}

/**
 * Asserts that `thunk` does not throw an error.
 *
 * @category testing
 * @since 4.0.0
 */
export function doesNotThrow(thunk: () => void, message?: string, ..._: Array<never>) {
  assert.doesNotThrow(thunk, message)
}

// ----------------------------
// Derived
// ----------------------------

/**
 * Asserts that `value` is an instance of `constructor`.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertInstanceOf<C extends abstract new(...args: any) => any>(
  value: unknown,
  constructor: C,
  message?: string,
  ..._: Array<never>
): asserts value is InstanceType<C> {
  vassert.instanceOf(value, constructor as any, message)
}

/**
 * Asserts that `self` is `true`.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertTrue(self: unknown, message?: string, ..._: Array<never>): asserts self {
  strictEqual(self, true, message)
}

/**
 * Asserts that `self` is `false`.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertFalse(self: boolean, message?: string, ..._: Array<never>) {
  strictEqual(self, false, message)
}

/**
 * Asserts that `actual` includes `expected`.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertInclude(actual: string | undefined, expected: string, ..._: Array<never>) {
  if (typeof expected === "string") {
    if (!actual?.includes(expected)) {
      fail(`Expected\n\n${actual}\n\nto include\n\n${expected}`)
    }
  }
}

/**
 * Asserts that `actual` matches `regExp`.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertMatch(actual: string, regExp: RegExp, ..._: Array<never>) {
  if (!regExp.test(actual)) {
    fail(`Expected\n\n${actual}\n\nto match\n\n${regExp}`)
  }
}

/**
 * Asserts that `thunk` throws, optionally checking the thrown value against an expected `Error` or validation function.
 *
 * @category testing
 * @since 4.0.0
 */
export function throws(thunk: () => void, error?: Error | ((u: unknown) => undefined), ..._: Array<never>) {
  try {
    thunk()
  } catch (e) {
    if (error !== undefined) {
      if (Predicate.isFunction(error)) {
        error(e)
      } else if (error) {
        deepStrictEqual(e, error)
      } else {
        throw e
      }
    }
    return
  }
  fail("Expected to throw an error")
}

/**
 * Asserts that `thunk` throws or returns a rejected promise, optionally checking the failure value against an expected `Error` or validation function.
 *
 * @category testing
 * @since 4.0.0
 */
export async function throwsAsync(
  thunk: () => Promise<void>,
  error?: Error | ((u: unknown) => undefined),
  ..._: Array<never>
) {
  try {
    await thunk()
  } catch (e) {
    if (error !== undefined) {
      if (Predicate.isFunction(error)) {
        error(e)
      } else {
        deepStrictEqual(e, error)
      }
    }
    return
  }
  fail("Expected to throw an error")
}

// ----------------------------
// Option
// ----------------------------

/**
 * Asserts that `option` is `None`.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertNone<A>(option: Option.Option<A>, ..._: Array<never>): asserts option is Option.None<never> {
  deepStrictEqual(option, Option.none())
}

/**
 * Asserts that `a` is not `undefined`.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertDefined<A>(
  a: A | undefined,
  ..._: Array<never>
): asserts a is Exclude<A, undefined> {
  if (a === undefined) {
    fail("Expected value to be defined")
  }
}

/**
 * Asserts that `a` is `undefined`.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertUndefined<A>(
  a: A | undefined,
  ..._: Array<never>
): asserts a is undefined {
  if (a !== undefined) {
    fail("Expected value to be undefined")
  }
}

/**
 * Asserts that `option` is `Some` and contains a value equal to `expected`.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertSome<A>(
  option: Option.Option<A>,
  expected: A,
  ..._: Array<never>
): asserts option is Option.Some<A> {
  deepStrictEqual(option, Option.some(expected))
}

// ----------------------------
// Result
// ----------------------------

/**
 * Asserts that `result` is `Success` and contains a value equal to `expected`.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertSuccess<A, E>(
  result: Result.Result<A, E>,
  expected: A,
  ..._: Array<never>
): asserts result is Result.Success<A, never> {
  deepStrictEqual(result, Result.succeed(expected))
}

/**
 * Asserts that `result` is `Failure` and contains an error equal to `expected`.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertFailure<A, E>(
  result: Result.Result<A, E>,
  expected: E,
  ..._: Array<never>
): asserts result is Result.Failure<never, E> {
  deepStrictEqual(result, Result.fail(expected))
}

// ----------------------------
// Exit
// ----------------------------

/**
 * Asserts that `exit` is a failure with a cause equal to `expected`.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertExitFailure<A, E>(
  exit: Exit.Exit<A, E>,
  expected: Cause.Cause<E>,
  ..._: Array<never>
): asserts exit is Exit.Failure<never, E> {
  deepStrictEqual(exit, Exit.failCause(expected))
}

/**
 * Asserts that `exit` is a success with a value equal to `expected`.
 *
 * @category testing
 * @since 4.0.0
 */
export function assertExitSuccess<A, E>(
  exit: Exit.Exit<A, E>,
  expected: A,
  ..._: Array<never>
): asserts exit is Exit.Success<A, never> {
  deepStrictEqual(exit, Exit.succeed(expected))
}
