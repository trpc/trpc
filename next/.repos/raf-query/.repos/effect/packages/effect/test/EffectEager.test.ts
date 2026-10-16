import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Fiber } from "effect"
import { TestClock } from "effect/testing"

describe("Effect Eager Operations", () => {
  describe("fnUntracedEager", () => {
    describe("eager computation", () => {
      it("computes sync effects immediately", () => {
        let execCount = 0
        const fn = Effect.fnUntracedEager(function*() {
          execCount++
          yield* Effect.succeed(1)
          yield* Effect.succeed(2)
          return execCount
        })

        const effect = fn()

        assert.strictEqual(execCount, 1)
        assert.strictEqual((effect as any)._tag, "Success")
        assert.strictEqual((effect as any).value, 1)
      })

      it("computes failures immediately", () => {
        const fn = Effect.fnUntracedEager(function*() {
          yield* Effect.succeed(1)
          // @effect-diagnostics-next-line missingReturnYieldStar:off
          yield* Effect.fail("error")
          return "unreachable"
        })

        const effect = fn()
        assert.strictEqual((effect as any)._tag, "Failure")
      })

      it("stops at first async effect", () => {
        let syncSteps = 0
        let asyncReached = false

        const fn = Effect.fnUntracedEager(function*() {
          syncSteps++
          yield* Effect.succeed(1)
          syncSteps++
          yield* Effect.promise(() => {
            asyncReached = true
            return Promise.resolve(2)
          })
          syncSteps++
          return "done"
        })

        const effect = fn()

        assert.strictEqual(syncSteps, 2)
        assert.strictEqual(asyncReached, false)
        assert.notStrictEqual((effect as any)._tag, "Success")
      })

      it("handles exceptions", () => {
        const fn = Effect.fnUntracedEager(function*() {
          yield* Effect.succeed(1)
          throw new Error("sync error")
        })

        const effect = fn()
        assert.strictEqual((effect as any)._tag, "Failure")
      })
    })

    it.effect("executes sync generators", () =>
      Effect.gen(function*() {
        const fn = Effect.fnUntracedEager(function*() {
          yield* Effect.succeed(1)
          yield* Effect.succeed(2)
          return "done"
        })

        const result = yield* fn()
        assert.strictEqual(result, "done")
      }))

    it.effect("handles mixed sync/async effects", () =>
      Effect.gen(function*() {
        const fn = Effect.fnUntracedEager(function*() {
          const a = yield* Effect.succeed(1)
          const b = yield* Effect.promise(() => Promise.resolve(2))
          return a + b
        })

        const result = yield* fn()
        assert.strictEqual(result, 3)
      }))

    it.effect("handles failures", () =>
      Effect.gen(function*() {
        const fn = Effect.fnUntracedEager(function*() {
          // @effect-diagnostics-next-line missingReturnYieldStar:off
          yield* Effect.fail("error")
          return "unreachable"
        })

        const exit = yield* Effect.exit(fn())
        assert.isTrue(Exit.isFailure(exit))
      }))

    it.effect("works with arguments and this context", () =>
      Effect.gen(function*() {
        const obj = {
          value: 10,
          fn: Effect.fnUntracedEager(function*(this: { value: number }, x: number) {
            const a = yield* Effect.succeed(x)
            return a + this.value
          })
        }

        const result = yield* obj.fn(5)
        assert.strictEqual(result, 15)
      }))

    it.effect("works with pipeable operators", () =>
      Effect.gen(function*() {
        const fn = Effect.fnUntracedEager(
          function*() {
            yield* Effect.succeed(1)
            return 10
          },
          Effect.map((x: number) => x * 2)
        )

        const result = yield* fn()
        assert.strictEqual(result, 20)
      }))

    it.effect("forwards arguments to pipeable operators", () =>
      Effect.gen(function*() {
        const fn = Effect.fnUntracedEager(
          function*(value: string) {
            return value.length
          },
          (effect, value) => Effect.map(effect, (length) => `${value}:${length}`)
        )

        const result = yield* fn("hello")
        assert.strictEqual(result, "hello:5")
      }))

    it("proxies body length", () => {
      const fn = Effect.fnUntracedEager(function*(a: string, b: number, c: boolean) {
        return c ? a.length + b : b
      })

      assert.strictEqual(fn.length, 3)
    })

    it.effect("re-execution creates fresh iterators", () =>
      Effect.gen(function*() {
        let execCount = 0
        const fn = Effect.fnUntracedEager(function*() {
          execCount++
          yield* Effect.succeed(1)
          yield* Effect.promise(() => Promise.resolve(2))
          return execCount
        })

        const effect = fn()

        const result1 = yield* effect
        assert.strictEqual(result1, 1)

        const result2 = yield* effect
        assert.strictEqual(result2, 2)
        assert.strictEqual(execCount, 2)
      }))

    it.effect("handles long sync chains efficiently", () =>
      Effect.gen(function*() {
        const fn = Effect.fnUntracedEager(function*() {
          let sum = 0
          for (let i = 0; i < 100; i++) {
            const val = yield* Effect.succeed(i)
            sum += val
          }
          return sum
        })

        const result = yield* fn()
        assert.strictEqual(result, 4950) // sum of 0 to 99
      }))
  })

  describe("mapEager", () => {
    it.effect("successful effect", () =>
      Effect.gen(function*() {
        const result = yield* Effect.mapEager(Effect.succeed(5), (n) => n * 2)
        assert.strictEqual(result, 10)
      }))

    it.effect("failed effect preserves failure", () =>
      Effect.gen(function*() {
        const effect = Effect.fail("error")
        const mapped = Effect.mapEager(effect, (n) => n * 2)
        const exit = yield* Effect.exit(mapped)

        assert.strictEqual(exit._tag, "Failure", "Expected effect to fail")
        assert.ok(exit._tag === "Failure", "Type guard for exit failure")

        const failure = exit.cause.reasons.find((failure: any) => failure._tag === "Fail")
        assert.ok(failure, "Expected to find a Fail cause")
        assert.strictEqual(failure._tag, "Fail", "Expected failure to be a Fail type")
        assert.strictEqual((failure as any).error, "error", "Expected error to be preserved")
      }))

    it.effect("complex effect falls back to regular map", () =>
      Effect.gen(function*() {
        const effect = Effect.mapEager(Effect.delay(Effect.succeed(10), 1), (n) => n + 5)
        const fiber = yield* Effect.forkChild(effect)
        yield* TestClock.adjust(1)
        const result = yield* Fiber.join(fiber)
        assert.strictEqual(result, 15)
      }))
  })

  describe("flatMapEager", () => {
    it.effect("applies transformation eagerly for success effects", () =>
      Effect.gen(function*() {
        let executions = 0
        const effect = Effect.succeed(5)
        const flatMapped = Effect.flatMapEager(effect, (n) => {
          executions++
          return Effect.succeed(n * 2)
        })
        assert.strictEqual(yield* flatMapped, 10)
        assert.strictEqual(yield* flatMapped, 10)
        assert.strictEqual(yield* flatMapped, 10)
        assert.strictEqual(executions, 1)
      }))

    it.effect("preserves failure for failed effects", () =>
      Effect.gen(function*() {
        const error = new Error("test error")
        const effect = Effect.fail(error)
        const flatMapped = Effect.flatMapEager(effect, (n) => Effect.succeed(n * 2))
        const exit = yield* Effect.exit(flatMapped)

        assert.strictEqual(exit._tag, "Failure", "Expected effect to fail")
        assert.ok(exit._tag === "Failure", "Type guard for exit failure")

        const failure = exit.cause.reasons.find((failure: any) => failure._tag === "Fail")
        assert.ok(failure, "Expected to find a Fail cause")
        assert.strictEqual(failure._tag, "Fail", "Expected failure to be a Fail type")
        assert.strictEqual((failure as any).error, error, "Expected error to be preserved")
      }))

    it.effect("fallback to regular flatMap for complex effects", () =>
      Effect.gen(function*() {
        const effect = Effect.delay(Effect.succeed(10), "1 millis")
        const flatMapped = Effect.flatMapEager(effect, (n) => Effect.succeed(n * 2))

        const fiber = yield* Effect.forkChild(flatMapped)
        yield* TestClock.adjust("1 millis")
        const result = yield* Fiber.join(fiber)

        assert.strictEqual(result, 20)
      }))
  })

  describe("mapErrorEager", () => {
    it.effect("preserves success for successful effects", () =>
      Effect.gen(function*() {
        const effect = Effect.succeed(5)
        const mapped = Effect.mapErrorEager(effect, (err) => `mapped: ${err}`)
        const result = yield* mapped
        assert.strictEqual(result, 5)
      }))

    it.effect("applies transformation eagerly for failure effects", () =>
      Effect.gen(function*() {
        const effect = Effect.fail("original error")
        const mapped = Effect.mapErrorEager(effect, (err) => `mapped: ${err}`)
        const exit = yield* Effect.exit(mapped)

        assert.strictEqual(exit._tag, "Failure", "Expected effect to fail")
        assert.ok(exit._tag === "Failure", "Type guard for exit failure")

        const failure = exit.cause.reasons.find((failure: any) => failure._tag === "Fail")
        assert.ok(failure, "Expected to find a Fail cause")
        assert.strictEqual(failure._tag, "Fail", "Expected failure to be a Fail type")
        assert.strictEqual((failure as any).error, "mapped: original error", "Expected error to be transformed")
      }))

    it.effect("fallback to regular mapError for complex effects", () =>
      Effect.gen(function*() {
        const effect = Effect.delay(Effect.fail("error"), "1 millis")
        const mapped = Effect.mapErrorEager(effect, (err) => `mapped: ${err}`)

        const fiber = yield* Effect.forkChild(mapped)
        yield* TestClock.adjust("1 millis")
        const exit = yield* Fiber.await(fiber)

        assert.strictEqual(exit._tag, "Failure", "Expected effect to fail")
        assert.ok(exit._tag === "Failure", "Type guard for exit failure")

        const failure = exit.cause.reasons.find((failure: any) => failure._tag === "Fail")
        assert.ok(failure, "Expected to find a Fail cause")
        assert.strictEqual(failure._tag, "Fail", "Expected failure to be a Fail type")
        assert.strictEqual((failure as any).error, "mapped: error", "Expected error to be transformed")
      }))
  })

  describe("mapBothEager", () => {
    it.effect("applies onSuccess eagerly for success effects", () =>
      Effect.gen(function*() {
        const effect = Effect.succeed(5)
        const mapped = Effect.mapBothEager(effect, {
          onFailure: (err) => `Failed: ${err}`,
          onSuccess: (n) => n * 2
        })
        const result = yield* mapped
        assert.strictEqual(result, 10)
      }))

    it.effect("applies onFailure eagerly for failure effects", () =>
      Effect.gen(function*() {
        const effect = Effect.fail("original error")
        const mapped = Effect.mapBothEager(effect, {
          onFailure: (err) => `Failed: ${err}`,
          onSuccess: (n) => n * 2
        })
        const exit = yield* Effect.exit(mapped)

        assert.strictEqual(exit._tag, "Failure", "Expected effect to fail")
        assert.ok(exit._tag === "Failure", "Type guard for exit failure")

        const failure = exit.cause.reasons.find((failure: any) => failure._tag === "Fail")
        assert.ok(failure, "Expected to find a Fail cause")
        assert.strictEqual(failure._tag, "Fail", "Expected failure to be a Fail type")
        assert.strictEqual((failure as any).error, "Failed: original error", "Expected error to be transformed")
      }))

    it.effect("fallback to regular mapBoth for complex effects", () =>
      Effect.gen(function*() {
        const effect = Effect.delay(Effect.succeed(10), "1 millis")
        const mapped = Effect.mapBothEager(effect, {
          onFailure: (err) => `Failed: ${err}`,
          onSuccess: (n) => n * 2
        })

        const fiber = yield* Effect.forkChild(mapped)
        yield* TestClock.adjust("1 millis")
        const result = yield* Fiber.join(fiber)

        assert.strictEqual(result, 20)
      }))
  })

  describe("catchEager", () => {
    it.effect("preserves success effects without applying catch", () =>
      Effect.gen(function*() {
        const effect = Effect.succeed(42)
        const caught = Effect.catchEager(effect, (err) => Effect.succeed(`recovered: ${err}`))
        const result = yield* caught
        assert.strictEqual(result, 42)
      }))

    it.effect("applies catch function eagerly for failure effects", () =>
      Effect.gen(function*() {
        const effect = Effect.fail("original error")
        const caught = Effect.catchEager(effect, (err) => Effect.succeed(`recovered: ${err}`))
        const result = yield* caught
        assert.strictEqual(result, "recovered: original error")
      }))

    it.effect("fallback to regular catch for complex effects", () =>
      Effect.gen(function*() {
        const effect = Effect.delay(Effect.fail("error"), "1 millis")
        const caught = Effect.catchEager(effect, (err) => Effect.succeed(`recovered: ${err}`))

        const fiber = yield* Effect.forkChild(caught)
        yield* TestClock.adjust("1 millis")
        const result = yield* Fiber.join(fiber)

        assert.strictEqual(result, "recovered: error")
      }))
  })

  describe("matchEager", () => {
    it.effect("applies onSuccess eagerly for success effects", () =>
      Effect.gen(function*() {
        const effect = Effect.succeed(42)
        const matched = Effect.matchEager(effect, {
          onFailure: (err) => `Failed: ${err}`,
          onSuccess: (n) => `Success: ${n}`
        })
        const result = yield* matched
        assert.strictEqual(result, "Success: 42")
      }))

    it.effect("applies onFailure eagerly for failure effects", () =>
      Effect.gen(function*() {
        const effect = Effect.fail("original error")
        const matched = Effect.matchEager(effect, {
          onFailure: (err) => `Failed: ${err}`,
          onSuccess: (n) => `Success: ${n}`
        })
        const result = yield* matched
        assert.strictEqual(result, "Failed: original error")
      }))

    it.effect("fallback to regular match for complex effects", () =>
      Effect.gen(function*() {
        const effect = Effect.delay(Effect.succeed(10), "1 millis")
        const matched = Effect.matchEager(effect, {
          onFailure: (err) => `Failed: ${err}`,
          onSuccess: (n) => `Success: ${n}`
        })

        const fiber = yield* Effect.forkChild(matched)
        yield* TestClock.adjust("1 millis")
        const result = yield* Fiber.join(fiber)

        assert.strictEqual(result, "Success: 10")
      }))

    it.effect("eagerly handles complex failure scenarios", () =>
      Effect.gen(function*() {
        const effect = Effect.fail(new Error("test error"))
        const matched = Effect.matchEager(effect, {
          onFailure: (err) => `Recovered from: ${err.message}`,
          onSuccess: (n) => `Success: ${n}`
        })
        const result = yield* matched
        assert.strictEqual(result, "Recovered from: test error")
      }))

    it.effect("supports curried usage", () =>
      Effect.gen(function*() {
        const matcher = Effect.matchEager({
          onFailure: (err: string) => `Failed: ${err}`,
          onSuccess: (n: number) => `Success: ${n}`
        })

        const successResult = yield* matcher(Effect.succeed(100))
        assert.strictEqual(successResult, "Success: 100")

        const failureResult = yield* matcher(Effect.fail("error"))
        assert.strictEqual(failureResult, "Failed: error")
      }))

    it.effect("never fails - always produces a result", () =>
      Effect.gen(function*() {
        const effect = Effect.fail("test error")
        const matched = Effect.matchEager(effect, {
          onFailure: (err) => `Handled: ${err}`,
          onSuccess: (n) => `Value: ${n}`
        })

        // Should not throw, should produce a result
        const result = yield* matched
        assert.strictEqual(result, "Handled: test error")

        // Test with success case
        const successEffect = Effect.succeed(42)
        const successMatched = Effect.matchEager(successEffect, {
          onFailure: (err) => `Handled: ${err}`,
          onSuccess: (n) => `Value: ${n}`
        })

        const successResult = yield* successMatched
        assert.strictEqual(successResult, "Value: 42")
      }))

    it.effect("performance: applies transformations immediately for resolved effects", () =>
      Effect.gen(function*() {
        let onSuccessCount = 0
        let onFailureCount = 0

        const successEffect = Effect.succeed(10)
        const failureEffect = Effect.fail("error")

        const matcher = {
          onSuccess: (n: number) => {
            onSuccessCount++
            return n * 2
          },
          onFailure: (err: string) => {
            onFailureCount++
            return err.toUpperCase()
          }
        }

        // Multiple invocations of the same resolved effect should be efficient
        const successMatched = Effect.matchEager(successEffect, matcher)
        const failureMatched = Effect.matchEager(failureEffect, matcher)

        const result1 = yield* successMatched
        const result2 = yield* successMatched
        const result3 = yield* failureMatched
        const result4 = yield* failureMatched

        assert.strictEqual(result1, 20)
        assert.strictEqual(result2, 20)
        assert.strictEqual(result3, "ERROR")
        assert.strictEqual(result4, "ERROR")

        // Handlers should be called only once per effect execution due to eager evaluation
        assert.strictEqual(onSuccessCount, 1)
        assert.strictEqual(onFailureCount, 1)
      }))
  })

  describe("matchCauseEager", () => {
    it("eagerly matches success effects", () => {
      let onSuccessCount = 0
      let onFailureCount = 0

      const successEffect = Effect.succeed(42)
      const matcher = {
        onSuccess: (value: number) => {
          onSuccessCount++
          return value * 2
        },
        onFailure: (_cause: any) => {
          onFailureCount++
          return "ERROR"
        }
      }

      const result = Effect.matchCauseEager(successEffect, matcher)

      // Should be resolved immediately
      assert.strictEqual((result as any)._tag, "Success")
      assert.strictEqual((result as any).value, 84)
      assert.strictEqual(onSuccessCount, 1)
      assert.strictEqual(onFailureCount, 0)
    })

    it("eagerly matches failure effects", () => {
      let onSuccessCount = 0
      let onFailureCount = 0

      const failureEffect = Effect.fail("test error")
      const matcher = {
        onSuccess: (value: any) => {
          onSuccessCount++
          return value * 2
        },
        onFailure: (_cause: any) => {
          onFailureCount++
          return "HANDLED"
        }
      }

      const result = Effect.matchCauseEager(failureEffect, matcher)

      // Should be resolved immediately
      assert.strictEqual((result as any)._tag, "Success")
      assert.strictEqual((result as any).value, "HANDLED")
      assert.strictEqual(onSuccessCount, 0)
      assert.strictEqual(onFailureCount, 1)
    })

    it.effect("falls back to regular matchCause for complex effects", () =>
      Effect.gen(function*() {
        let onSuccessCount = 0
        let onFailureCount = 0

        const delayedEffect = Effect.delay(Effect.succeed(10), "10 millis")
        const matcher = {
          onSuccess: (value: number) => {
            onSuccessCount++
            return value * 2
          },
          onFailure: (_cause: any) => {
            onFailureCount++
            return "ERROR"
          }
        }

        const result = Effect.matchCauseEager(delayedEffect, matcher)

        // Should not be resolved immediately - should be a complex effect
        assert.notStrictEqual((result as any)._tag, "Success")
        assert.notStrictEqual((result as any)._tag, "Failure")

        // Verify handlers haven't been called yet
        assert.strictEqual(onSuccessCount, 0)
        assert.strictEqual(onFailureCount, 0)

        // Fork the effect and advance time
        const fiber = yield* Effect.forkChild(result)
        yield* TestClock.adjust("10 millis")
        const finalResult = yield* Fiber.join(fiber)

        // Now handlers should have been called
        assert.strictEqual(finalResult, 20)
        assert.strictEqual(onSuccessCount, 1)
        assert.strictEqual(onFailureCount, 0)
      }))

    it.effect("falls back to regular matchCause for delayed failure effects", () =>
      Effect.gen(function*() {
        let onSuccessCount = 0
        let onFailureCount = 0

        const delayedFailure = Effect.delay(Effect.fail("delayed error"), "5 millis")
        const matcher = {
          onSuccess: (value: any) => {
            onSuccessCount++
            return value * 2
          },
          onFailure: (_cause: any) => {
            onFailureCount++
            return "HANDLED_DELAYED"
          }
        }

        const result = Effect.matchCauseEager(delayedFailure, matcher)

        // Should not be resolved immediately
        assert.notStrictEqual((result as any)._tag, "Success")
        assert.notStrictEqual((result as any)._tag, "Failure")

        // Verify handlers haven't been called yet
        assert.strictEqual(onSuccessCount, 0)
        assert.strictEqual(onFailureCount, 0)

        // Fork the effect and advance time
        const fiber = yield* Effect.forkChild(result)
        yield* TestClock.adjust("5 millis")
        const finalResult = yield* Fiber.join(fiber)

        // Now handlers should have been called
        assert.strictEqual(finalResult, "HANDLED_DELAYED")
        assert.strictEqual(onSuccessCount, 0)
        assert.strictEqual(onFailureCount, 1)
      }))

    it("handles cause information correctly", () => {
      let capturedCause: any = null

      const failureEffect = Effect.fail("test error")
      const matcher = {
        onSuccess: (value: any) => value,
        onFailure: (cause: any) => {
          capturedCause = cause
          return "handled"
        }
      }

      const result = Effect.matchCauseEager(failureEffect, matcher)

      // Should be resolved immediately
      assert.strictEqual((result as any)._tag, "Success")
      assert.strictEqual((result as any).value, "handled")
      assert.isNotNull(capturedCause)
    })

    it.effect("preserves effect execution behavior for non-eager paths", () =>
      Effect.gen(function*() {
        let executionCount = 0

        const complexEffect = Effect.flatMap(
          Effect.delay(Effect.succeed(42), "1 millis"),
          (value) => {
            executionCount++
            return Effect.succeed(value * 2)
          }
        )

        const matcher = {
          onSuccess: (value: number) => value + 100,
          onFailure: (_cause: any) => "ERROR"
        }

        const result = Effect.matchCauseEager(complexEffect, matcher)

        // Should not be resolved immediately
        assert.notStrictEqual((result as any)._tag, "Success")
        assert.strictEqual(executionCount, 0)

        // Fork the effect and advance time
        const fiber = yield* Effect.forkChild(result)
        yield* TestClock.adjust("1 millis")
        const finalResult = yield* Fiber.join(fiber)

        // Should have executed the effect chain properly
        assert.strictEqual(finalResult, 184) // (42 * 2) + 100
        assert.strictEqual(executionCount, 1)
      }))
  })
})
