import { assert, describe, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Logger, References, Result, Scope, Stream } from "effect"
import { CircuitBreaker } from "effect/persistence"
import { TestClock } from "effect/testing"
import * as CircuitBreakerTest from "./CircuitBreakerTest.ts"

CircuitBreakerTest.suite("memory", CircuitBreaker.layerStoreMemory, TestClock.adjust)

const storeError = new CircuitBreaker.CircuitBreakerError({
  reason: new CircuitBreaker.CircuitBreakerStoreError({ message: "store unavailable" })
})

const memoryStoreWith = (override: Partial<CircuitBreaker.CircuitBreakerStore["Service"]>) =>
  Layer.effect(
    CircuitBreaker.CircuitBreakerStore,
    Effect.gen(function*() {
      const store = yield* CircuitBreaker.CircuitBreakerStore
      return { ...store, ...override }
    })
  ).pipe(Layer.provide(CircuitBreaker.layerStoreMemory()))

const captureLogs = () => {
  const reports: Array<{ readonly logLevel: string; readonly cause: Cause.Cause<unknown> }> = []
  const logger = Logger.make<unknown, void>((options) => {
    if (options.logLevel === "Warn" || options.logLevel === "Error") {
      reports.push({ logLevel: options.logLevel, cause: options.cause })
    }
  })
  return { reports, layer: Logger.layer([logger]) } as const
}

const causeOf = <A, E>(exit: Exit.Exit<A, E>) => Exit.isFailure(exit) ? exit.cause : assert.fail("Expected failure")

describe("CircuitBreaker", () => {
  describe("onStoreError", () => {
    const unavailable = memoryStoreWith({ admit: () => Effect.fail(storeError) })

    it.effect("allow: an admit outage runs the call unrecorded and reports the cause at UnhandledLogLevel", () => {
      const { layer, reports } = captureLogs()
      return Effect.gen(function*() {
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "1 minute"
        })
        const call = Effect.succeed(42).pipe(breaker.execute({ key: "allow" }))
        assert.strictEqual(yield* call, 42)
        assert.strictEqual(yield* call.pipe(Effect.provideService(References.UnhandledLogLevel, undefined)), 42)

        // UnhandledLogLevel defaults to Error, and undefined silences the report.
        assert.strictEqual(reports.length, 1)
        assert.strictEqual(reports[0].logLevel, "Error")
        assert.deepStrictEqual(Cause.findError(reports[0].cause), Result.succeed(storeError))
      }).pipe(Effect.provide(Layer.merge(unavailable, layer)))
    })

    it.effect("fail: an admit outage fails with CircuitBreakerStoreError without running the call", () =>
      Effect.gen(function*() {
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "1 minute",
          onStoreError: "fail"
        })
        let ran = false
        const error = yield* Effect.sync(() => {
          ran = true
        }).pipe(breaker.execute({ key: "fail" }), Effect.flip)

        assert.isFalse(ran)
        assert.strictEqual(error.reason._tag, "CircuitBreakerStoreError")
      }).pipe(Effect.provide(unavailable)))

    it.effect("a failed record never replaces the result", () => {
      const { layer, reports } = captureLogs()
      return Effect.gen(function*() {
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "1 minute",
          onStoreError: "fail"
        })
        const success = yield* Effect.succeed(42).pipe(breaker.execute({ key: "record" }))
        const failure = yield* Effect.fail("boom").pipe(breaker.execute({ key: "record" }), Effect.flip)

        assert.strictEqual(success, 42)
        assert.strictEqual(failure, "boom")
        assert.strictEqual(reports.length, 2)
      }).pipe(Effect.provide(Layer.merge(memoryStoreWith({ record: () => Effect.fail(storeError) }), layer)))
    })

    it.effect("a record defect alongside a store failure still dies, whether or not it is reported", () =>
      Effect.gen(function*() {
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "1 minute"
        })
        const call = Effect.succeed(42).pipe(breaker.execute({ key: "record-defect" }), Effect.exit)
        const reported = yield* call
        const silenced = yield* call.pipe(Effect.provideService(References.UnhandledLogLevel, undefined))

        for (const exit of [reported, silenced]) {
          assert.isTrue(causeOf(exit).reasons.some((reason) => Cause.isDieReason(reason) && reason.defect === "bug"))
        }
      }).pipe(Effect.provide(memoryStoreWith({
        record: () => Effect.failCause(Cause.combine(Cause.fail(storeError), Cause.die("bug")))
      }))))
  })

  describe("onRejection", () => {
    it.effect("allow: a rejection alongside an admit defect still dies without running the call", () =>
      Effect.gen(function*() {
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "1 minute"
        })
        let ran = false
        const exit = yield* Effect.sync(() => {
          ran = true
        }).pipe(breaker.execute({ key: "admit-defect", onRejection: "allow" }), Effect.exit)

        assert.isFalse(ran)
        assert.isTrue(causeOf(exit).reasons.some((reason) => Cause.isDieReason(reason) && reason.defect === "bug"))
      }).pipe(Effect.provide(memoryStoreWith({
        admit: (key) =>
          Effect.failCause(Cause.combine(
            Cause.fail(new CircuitBreaker.CircuitBreakerError({ reason: new CircuitBreaker.CircuitHalfOpen({ key }) })),
            Cause.die("bug")
          ))
      }))))
  })

  describe("classify", () => {
    it.effect("a classifier defect records Ignored and the call dies with the combined cause", () =>
      Effect.gen(function*() {
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "1 minute"
        })
        const thrown = yield* Effect.succeed(1).pipe(
          breaker.execute({
            key: "defect",
            classify: () => {
              throw "thrown"
            }
          }),
          Effect.exit
        )
        const died = yield* Effect.fail("boom").pipe(
          breaker.execute({ key: "defect", classify: () => Effect.die("died") }),
          Effect.exit
        )

        assert.deepStrictEqual(Cause.findDefect(causeOf(thrown)), Result.succeed("thrown"))
        assert.deepStrictEqual(Cause.findError(causeOf(died)), Result.succeed("boom"))
        assert.deepStrictEqual(Cause.findDefect(causeOf(died)), Result.succeed("died"))
        assert.strictEqual((yield* breaker.state("defect"))._tag, "Closed")
      }).pipe(Effect.provide(CircuitBreaker.layerStoreMemory())))

    it.effect("receives the admission's probe flag, so an outcome ignored when closed can reopen a probe", () =>
      Effect.gen(function*() {
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "1 minute"
        })
        const probes: Array<boolean> = []
        const rateLimited = Effect.fail("rate limited").pipe(
          breaker.execute({
            key: "probe",
            classify: (_exit, { probe }) => {
              probes.push(probe)
              return probe ? CircuitBreaker.failure() : CircuitBreaker.ignored
            }
          }),
          Effect.ignore
        )

        yield* rateLimited
        assert.strictEqual((yield* breaker.state("probe"))._tag, "Closed")
        yield* Effect.fail("boom").pipe(breaker.execute({ key: "probe" }), Effect.ignore)
        yield* TestClock.adjust("2 minutes")
        yield* rateLimited

        assert.deepStrictEqual(probes, [false, true])
        assert.strictEqual((yield* breaker.state("probe"))._tag, "Open")
      }).pipe(Effect.provide(CircuitBreaker.layerStoreMemory())))
  })

  it.effect("transitions ends when the breaker's scope closes", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const breaker = yield* CircuitBreaker.make({
        tripPolicy: CircuitBreaker.consecutive(1),
        openDuration: "1 minute"
      }).pipe(Scope.provide(scope))
      const transitions = yield* breaker.transitions.pipe(
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.fail("boom").pipe(breaker.execute({ key: "transitions" }), Effect.ignore)
      yield* Scope.close(scope, Exit.void)

      const collected = yield* Fiber.join(transitions)
      assert.deepStrictEqual(collected.map(({ from, to }) => [from, to]), [["Closed", "Open"]])
    }).pipe(Effect.provide(CircuitBreaker.layerStoreMemory())))

  describe("memory retention", () => {
    it.effect("fences a permit admitted before its key was dropped and recreated", () =>
      Effect.gen(function*() {
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "1 minute"
        })
        const gate = yield* Deferred.make<void>()
        const admitted = yield* Deferred.make<void>()
        const stale = yield* Deferred.succeed(admitted, undefined).pipe(
          Effect.andThen(Deferred.await(gate)),
          Effect.andThen(Effect.fail("boom")),
          breaker.execute({ key: "recreated" }),
          Effect.forkChild
        )
        yield* Deferred.await(admitted)
        yield* TestClock.adjust("2 minutes")
        yield* Effect.void.pipe(breaker.execute({ key: "recreated" }))

        yield* Deferred.succeed(gate, undefined)
        yield* Fiber.await(stale)
        assert.strictEqual((yield* breaker.state("recreated"))._tag, "Closed")
      }).pipe(Effect.provide(CircuitBreaker.layerStoreMemory({ idleTimeToLive: "1 minute" }))))
  })
})
