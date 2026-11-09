import { Cause, Equal, Option, Predicate, Result, SchemaIssue } from "effect"
import * as Exit from "effect/Exit"
import * as assert from "node:assert"
import { assert as vassert } from "vitest"

// ----------------------------
// Primitives
// ----------------------------

/**
 * Throws an `AssertionError` with the provided error message.
 */
export function fail(message: string) {
  assert.fail(message)
}

export function deepStrictEqual<A>(actual: A, expected: A, message?: string, ..._: Array<never>) {
  if (message === undefined) {
    assert.deepStrictEqual(actual, expected)
  } else {
    assert.deepStrictEqual(actual, expected, message)
  }
}

export function notDeepStrictEqual<A>(actual: A, expected: A, message?: string, ..._: Array<never>) {
  if (message !== undefined) {
    assert.notDeepStrictEqual(actual, expected, message)
  } else {
    assert.notDeepStrictEqual(actual, expected)
  }
}

export function strictEqual<A>(actual: A, expected: A, message?: string, ..._: Array<never>) {
  if (message !== undefined) {
    assert.strictEqual(actual, expected, message)
  } else {
    assert.strictEqual(actual, expected)
  }
}

/**
 * Asserts that `actual` is equal to `expected` using the `Equal.equals` trait.
 */
export function assertEquals<A>(actual: A, expected: A, message?: string, ..._: Array<never>) {
  if (!Equal.equals(actual, expected)) {
    deepStrictEqual(actual, expected, message) // show diff
    fail(message ?? "Expected values to be Equal.equals")
  }
}

export function doesNotThrow(thunk: () => void, message?: string, ..._: Array<never>) {
  assert.doesNotThrow(thunk, message)
}

// ----------------------------
// Derived
// ----------------------------

/**
 * Asserts that `value` is an instance of `constructor`.
 */
export function assertInstanceOf<C extends new(...args: any) => any>(
  value: unknown,
  constructor: C,
  message?: string,
  ..._: Array<never>
): asserts value is InstanceType<C> {
  vassert.instanceOf(value, constructor, message)
}

export function assertTrue(self: unknown, message?: string, ..._: Array<never>): asserts self {
  strictEqual(self, true, message)
}

export function assertFalse(self: boolean, message?: string, ..._: Array<never>) {
  strictEqual(self, false, message)
}

export function assertSchemaIssueError(
  self: unknown,
  expectedIssueMessage: string,
  ..._: Array<never>
): asserts self is Error & { readonly cause: SchemaIssue.Issue } {
  assertInstanceOf(self, Error)
  strictEqual(self.message, "Schema validation failed")
  assertTrue(SchemaIssue.isIssue(self.cause))
  strictEqual(SchemaIssue.defaultFormatter(self.cause), expectedIssueMessage)
}

export function assertInclude(actual: string | undefined, expected: string, ..._: Array<never>) {
  if (Predicate.isString(expected)) {
    if (!actual?.includes(expected)) {
      fail(`Expected\n\n${actual}\n\nto include\n\n${expected}`)
    }
  }
}

export function assertMatch(actual: string, regExp: RegExp, ..._: Array<never>) {
  if (!regExp.test(actual)) {
    fail(`Expected\n\n${actual}\n\nto match\n\n${regExp}`)
  }
}

export function throws(thunk: () => void, error?: string | Error | ((u: unknown) => undefined), ..._: Array<never>) {
  try {
    thunk()
  } catch (e) {
    if (error !== undefined) {
      if (Predicate.isString(error)) {
        assertInstanceOf(e, Error)
        strictEqual(e.message, error)
      } else if (Predicate.isError(error)) {
        deepStrictEqual(e, error)
      } else {
        error(e)
      }
    }
    return
  }
  fail("Expected to throw an error")
}

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

export function assertNone<A>(option: Option.Option<A>, ..._: Array<never>): asserts option is Option.None<never> {
  deepStrictEqual(option, Option.none())
}

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

export function assertFailure<A, E>(
  result: Result.Result<A, E>,
  expected: E,
  ..._: Array<never>
): asserts result is Result.Failure<never, E> {
  deepStrictEqual(result, Result.fail(expected))
}

export function assertSuccess<A, E>(
  result: Result.Result<A, E>,
  expected: A,
  ..._: Array<never>
): asserts result is Result.Success<A, never> {
  deepStrictEqual(result, Result.succeed(expected))
}

// ----------------------------
// Exit
// ----------------------------

export function assertExitFailure<A, E>(
  exit: Exit.Exit<A, E>,
  expected: Cause.Cause<E>,
  ..._: Array<never>
): asserts exit is Exit.Failure<never, E> {
  deepStrictEqual(exit, Exit.failCause(expected))
}

export function assertExitSuccess<A, E>(
  exit: Exit.Exit<A, E>,
  expected: A,
  ..._: Array<never>
): asserts exit is Exit.Success<A, never> {
  deepStrictEqual(exit, Exit.succeed(expected))
}

export function assertCauseFail<E>(
  cause: Cause.Cause<E>,
  expected: E,
  ..._: Array<never>
) {
  deepStrictEqual(cause, Cause.fail(expected))
}
