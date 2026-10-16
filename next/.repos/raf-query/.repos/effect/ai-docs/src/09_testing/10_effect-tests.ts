/**
 * @title Writing Effect tests with @effect/vitest
 *
 * Using `it.effect` for Effect-based tests.
 */
import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"

describe("@effect/vitest basics", () => {
  it.effect("runs Effect code with assert helpers", () =>
    Effect.gen(function*() {
      const upper = ["ada", "lin"].map((name) => name.toUpperCase())
      assert.deepStrictEqual(upper, ["ADA", "LIN"])
      assert.strictEqual(upper.length, 2)
      assert.isTrue(upper.includes("ADA"))
    }))

  it.effect.each([
    { input: " Ada ", expected: "ada" },
    { input: " Lin ", expected: "lin" },
    { input: " Nia ", expected: "nia" }
  ])("parameterized normalization %#", ({ input, expected }) =>
    Effect.gen(function*() {
      assert.strictEqual(input.trim().toLowerCase(), expected)
    }))

  it.effect("controls time with TestClock", () =>
    Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(
        Effect.sleep(60_000).pipe(Effect.as("done" as const))
      )

      // Move virtual time forward to complete sleeping fibers immediately.
      yield* TestClock.adjust(60_000)

      const value = yield* Fiber.join(fiber)
      assert.strictEqual(value, "done")
    }))

  it.live("uses real runtime services", () =>
    Effect.gen(function*() {
      const startedAt = Date.now()
      yield* Effect.sleep(1)
      assert.isTrue(Date.now() >= startedAt)
    }))

  // For property-based testing, use `it.effect.prop` with Schema-based
  // arbitraries
  it.effect.prop("reversing twice is identity", [Schema.String], ([value]) =>
    Effect.gen(function*() {
      const reversedTwice = value.split("").reverse().reverse().join("")
      assert.strictEqual(reversedTwice, value)
    }))
})
