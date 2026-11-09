/**
 * @since 4.0.0
 */

import * as Equal from "effect/Equal"
import * as assert from "node:assert"
import { test as vitest } from "vitest"

/**
 * Asserts that two values are equal using Effect's equality semantics.
 *
 * @category testing
 * @since 4.0.0
 */
export const assertEquals = <A>(actual: A, expected: A): void => {
  if (!Equal.equals(actual, expected)) {
    assert.deepStrictEqual(actual, expected)
    assert.fail("Expected values to be Equal.equals")
  }
}

/**
 * Registers a documentation snippet as a test.
 *
 * @category testing
 * @since 4.0.0
 */
export const test = (
  name: string,
  run: () => unknown | PromiseLike<unknown>
): void => {
  vitest(name, run)
}
