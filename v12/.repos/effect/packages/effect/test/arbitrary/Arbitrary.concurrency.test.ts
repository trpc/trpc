import { assert, describe, it } from "@effect/vitest"
import { Arbitrary, Cause, Deferred, Effect, Exit, Fiber, Queue, Random, Schema, SchemaTransformation } from "effect"
import { TestClock } from "effect/testing"

const sequence = () => {
  let next = 0
  return Arbitrary.map(Arbitrary.Constant(0), () => next++)
}

const fromGeneration = (generate: () => Effect.Effect<number>, shrink?: (value: number) => ReadonlyArray<number>) =>
  Arbitrary.schema(
    Schema.declare<number>((input): input is number => typeof input === "number", {
      toCodecArbitrary: () =>
        Schema.link<number>()(
          Schema.Literal(0),
          SchemaTransformation.transformEffect<number, 0>({ decode: generate, encode: () => Effect.succeed(0) })
        )
    }),
    { shrink }
  )

describe("Arbitrary concurrency", () => {
  it.effect("bounds active evaluations and buffered results while advancing an ordered window", () =>
    Effect.gen(function*() {
      const gates = yield* Effect.forEach([0, 1, 2, 3, 4, 5], () => Deferred.make<void>())
      const started = yield* Queue.make<number>()
      const finished = yield* Queue.make<number>()
      let active = 0
      let maximum = 0
      let generated = 0
      const arbitrary = Arbitrary.map(sequence(), (value) => {
        generated++
        return value
      })
      const fiber = yield* Effect.forkChild(Arbitrary.checkEffect(arbitrary, (value) =>
        Effect.gen(function*() {
          maximum = Math.max(maximum, ++active)
          yield* Queue.offer(started, value)
          yield* Deferred.await(gates[value])
          return true
        }).pipe(Effect.ensuring(Effect.gen(function*() {
          active--
          yield* Queue.offer(finished, value)
        }))), { runs: 6, concurrency: 3 }))

      assert.deepStrictEqual(yield* Queue.takeN(started, 3), [0, 1, 2])
      yield* Deferred.succeed(gates[2], undefined)
      assert.strictEqual(yield* Queue.take(finished), 2)
      assert.strictEqual(generated, 3)
      assert.strictEqual(active, 2)

      yield* Deferred.succeed(gates[0], undefined)
      assert.strictEqual(yield* Queue.take(started), 3)
      assert.strictEqual(generated, 4)
      yield* Effect.forEach(gates, (gate) => Deferred.succeed(gate, undefined))
      assert.deepStrictEqual(yield* Fiber.join(fiber), { _tag: "Passed", runs: 6, discards: 0 })
      assert.strictEqual(maximum, 3)
      assert.strictEqual(active, 0)
      assert.strictEqual(generated, 6)
    }))

  for (const mode of ["pass", "false", "error", "exhaust"] as const) {
    it.effect(`preserves sequential ${mode} results across seeds and concurrency limits`, () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.filter(
          Arbitrary.all({
            number: Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: -20, maximum: 20 }))),
            values: Arbitrary.array(Arbitrary.Constant(true))
          }),
          ({ number }) => number % 3 !== 0
        )
        const property = Effect.fnUntraced(function*(
          { number, values }: { number: number; values: Array<boolean> }
        ) {
          for (let index = 0; index < Math.abs(number % 4); index++) yield* Effect.yieldNow
          if (mode === "pass" || mode === "exhaust" || number < 5 || values.length < 2) return true
          return mode === "error" ? yield* Effect.fail(number) : false
        })
        for (let seed = 0; seed < 8; seed++) {
          const options = { seed, runs: 30, size: 8, maxDiscards: mode === "exhaust" ? 0 : 100 }
          const sequential = yield* Arbitrary.checkEffect(arbitrary, property, options)
          for (const concurrency of [2, 5, 32]) {
            const concurrent = yield* Arbitrary.checkEffect(arbitrary, property, { ...options, concurrency })
            assert.deepStrictEqual(concurrent, sequential, `seed ${seed}, concurrency ${concurrency}`)
            if (concurrent._tag === "Falsified") {
              const replayed = yield* Arbitrary.checkEffect(arbitrary, property, {
                replay: concurrent.replay,
                concurrency: 0
              })
              assert.deepStrictEqual(replayed, { ...concurrent, runs: 1, discards: 0 })
            }
          }
        }
      }))
  }

  it.effect("preserves generated inputs and size progression despite property randomness", () =>
    Effect.gen(function*() {
      const arbitrary = Arbitrary.filter(
        Arbitrary.array(Arbitrary.schema(Schema.Int)),
        (values) => values.length % 2 === 0
      )
      const options = { runs: 40, size: 20, seed: "concurrent-inputs" }
      const expected: Array<Array<number>> = []
      const sequential = yield* Arbitrary.checkEffect(arbitrary, (value) => {
        expected.push(value)
        return true
      }, options)
      for (const concurrency of [2, 5, 40]) {
        const actual: Array<Array<number>> = []
        const result = yield* Arbitrary.checkEffect(arbitrary, (value) =>
          Effect.gen(function*() {
            actual.push(value)
            yield* Random.next
            yield* Effect.yieldNow
            yield* Random.next
            return true
          }), { ...options, concurrency })
        assert.deepStrictEqual(actual, expected)
        assert.deepStrictEqual(result, sequential)
      }
    }))

  it.effect("selects the earliest failure despite later failures and synchronous defects", () =>
    Effect.gen(function*() {
      const later = yield* Deferred.make<void>()
      const result = yield* Arbitrary.checkEffect(sequence(), (value) => {
        if (value === 0) return Deferred.await(later).pipe(Effect.as(false))
        if (value === 1) return Deferred.succeed(later, undefined).pipe(Effect.as(false))
        throw new Error("speculative property defect")
      }, { runs: 3, concurrency: 3 })
      assert.strictEqual(result._tag, "Falsified")
      if (result._tag === "Falsified") {
        assert.strictEqual(result.initialInput, 0)
        assert.strictEqual(result.runs, 1)
      }
    }))

  it.effect("reports an earlier failure while later generation is suspended", () =>
    Effect.gen(function*() {
      const generating = yield* Deferred.make<void>()
      let generated = 0
      let finalized = false
      const arbitrary = fromGeneration(() =>
        ++generated === 1
          ? Effect.succeed(0)
          : Deferred.succeed(generating, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Effect.sync(() => {
              finalized = true
            }))
          )
      )
      const result = yield* Arbitrary.checkEffect(arbitrary, () => Deferred.await(generating).pipe(Effect.as(false)), {
        runs: 3,
        concurrency: 3,
        maxShrinks: 0
      })
      assert.strictEqual(result._tag, "Falsified")
      assert.isTrue(finalized)
    }))

  it.effect("completes mutually coordinated generator and evaluation cleanup", () =>
    Effect.gen(function*() {
      const generating = yield* Deferred.make<void>()
      const evaluating = yield* Deferred.make<void>()
      const generationFinalizing = yield* Deferred.make<void>()
      const evaluationFinalizing = yield* Deferred.make<void>()
      let generated = 0
      let generationFinalized = false
      let evaluationFinalized = false
      const arbitrary = fromGeneration(() => {
        const value = generated++
        if (value < 2) return Effect.succeed(value)
        return Deferred.succeed(generating, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(Effect.gen(function*() {
            yield* Deferred.succeed(generationFinalizing, undefined)
            yield* Deferred.await(evaluationFinalizing)
            generationFinalized = true
          }))
        )
      })

      yield* Effect.gen(function*() {
        const check = yield* Effect.forkChild(Arbitrary.checkEffect(arbitrary, (value) =>
          value === 0
            ? Deferred.await(generating).pipe(
              Effect.andThen(Deferred.await(evaluating)),
              Effect.andThen(Effect.sleep("1 millis")),
              Effect.as(false)
            )
            : Deferred.succeed(evaluating, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(Effect.gen(function*() {
                yield* Deferred.succeed(evaluationFinalizing, undefined)
                yield* Deferred.await(generationFinalizing)
                evaluationFinalized = true
              }))
            ), { runs: 3, concurrency: 3, maxShrinks: 0 }))
        const completion = yield* Effect.forkChild(Fiber.join(check).pipe(Effect.timeoutOption("1 second")))
        yield* Deferred.await(generating)
        yield* Deferred.await(evaluating)
        yield* TestClock.adjust("1 second")
        const result = yield* Fiber.join(completion)
        assert.strictEqual(result._tag, "Some", "check must finish after interrupting both cleanup participants")
        if (result._tag === "Some") {
          assert.strictEqual(result.value._tag, "Falsified")
          if (result.value._tag === "Falsified") assert.strictEqual(result.value.initialInput, 0)
        }
        assert.isTrue(generationFinalized)
        assert.isTrue(evaluationFinalized)
      }).pipe(Effect.ensuring(Effect.gen(function*() {
        // Unblock both finalizers if the regression assertion fails, so the test itself can terminate.
        yield* Deferred.succeed(generationFinalizing, undefined)
        yield* Deferred.succeed(evaluationFinalizing, undefined)
      })))
    }))

  for (const passes of [false, true]) {
    it.effect(`orders generation defects after earlier ${passes ? "passes" : "failures"}`, () =>
      Effect.gen(function*() {
        const defect = new Error("generation defect")
        const arbitrary = Arbitrary.map(sequence(), (value) => {
          if (value > 0) throw defect
          return value
        })
        const exit = yield* Effect.exit(Arbitrary.checkEffect(
          arbitrary,
          () => Effect.yieldNow.pipe(Effect.as(passes)),
          { runs: 3, concurrency: 3 }
        ))
        if (passes) {
          assert.deepStrictEqual(exit, Exit.die(defect))
        } else {
          assert.isTrue(Exit.isSuccess(exit))
          if (Exit.isSuccess(exit)) assert.strictEqual(exit.value._tag, "Falsified")
        }
      }))

    it.effect(`orders exhaustion after earlier ${passes ? "passes" : "failures"}`, () =>
      Effect.gen(function*() {
        const result = yield* Arbitrary.checkEffect(
          Arbitrary.filter(sequence(), (value) => value === 0),
          () => Effect.yieldNow.pipe(Effect.as(passes)),
          { runs: 3, concurrency: 3, maxDiscards: 0, seed: 0 }
        )
        if (passes) {
          assert.deepStrictEqual(result, { _tag: "Exhausted", runs: 1, discards: 1, seed: 0 })
        } else {
          assert.strictEqual(result._tag, "Falsified")
          if (result._tag === "Falsified") assert.strictEqual(result.discards, 0)
        }
      }))
  }

  it.effect("awaits speculative evaluation finalizers before sequential shrinking", () =>
    Effect.gen(function*() {
      const ready = yield* Deferred.make<void>()
      let evaluations = 0
      let active = 0
      let finalized = 0
      let shrinks = 0
      const arbitrary = fromGeneration(() => Effect.succeed(10), (value) => value > 0 ? [0] : [])
      const result = yield* Arbitrary.checkEffect(arbitrary, (value) =>
        Effect.gen(function*() {
          if (value === 0) {
            assert.strictEqual(active, 0)
            assert.strictEqual(finalized, 3)
            shrinks++
            return false
          }
          const index = evaluations++
          active++
          return yield* Effect.gen(function*() {
            if (evaluations === 3) yield* Deferred.succeed(ready, undefined)
            if (index > 0) return yield* Effect.never
            yield* Deferred.await(ready)
            return false
          }).pipe(Effect.ensuring(Effect.gen(function*() {
            yield* Effect.yieldNow
            active--
            finalized++
          })))
        }), { runs: 10, concurrency: 3 })
      assert.strictEqual(result._tag, "Falsified")
      if (result._tag === "Falsified") assert.strictEqual(result.shrunkInput, 0)
      assert.strictEqual(evaluations, 3)
      assert.strictEqual(shrinks, 1)
    }))

  it.effect("interrupts and awaits every evaluation when the caller is interrupted", () =>
    Effect.gen(function*() {
      const started = yield* Queue.make<void>()
      let finalized = 0
      const fiber = yield* Effect.forkChild(Arbitrary.checkEffect(Arbitrary.Constant(0), () =>
        Queue.offer(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(Effect.gen(function*() {
            yield* Effect.yieldNow
            finalized++
          }))
        ), { runs: 10, concurrency: 3 }))
      yield* Queue.takeN(started, 3)
      yield* Fiber.interrupt(fiber)
      assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(fiber)))
      assert.strictEqual(finalized, 3)
    }))

  for (const cause of [Cause.die("property defect"), Cause.interrupt(123)]) {
    it.effect(`propagates ${cause.reasons[0]._tag} after stopping speculative evaluations`, () =>
      Effect.gen(function*() {
        const ready = yield* Deferred.make<void>()
        let finalized = false
        const exit = yield* Effect.exit(Arbitrary.checkEffect(sequence(), (value) =>
          value === 0
            ? Deferred.await(ready).pipe(Effect.andThen(Effect.failCause(cause)))
            : Deferred.succeed(ready, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(Effect.sync(() => {
                finalized = true
              }))
            ), { runs: 2, concurrency: 2 }))
        assert.deepStrictEqual(exit, Exit.failCause(cause))
        assert.isTrue(finalized)
      }))
  }

  it.effect("inherits the caller's scope without changing fixture lifetime", () =>
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      const result = yield* Arbitrary.checkEffect(
        Arbitrary.Constant(0),
        () => Effect.map(Effect.scope, (current) => current === scope),
        { runs: 5, concurrency: 3 }
      )
      assert.deepStrictEqual(result, { _tag: "Passed", runs: 5, discards: 0 })
    }))

  it.effect("rejects invalid concurrency before generation", () =>
    Effect.gen(function*() {
      let generated = false
      const arbitrary = Arbitrary.map(Arbitrary.Constant(0), () => {
        generated = true
        return 0
      })
      for (const concurrency of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        const exit = yield* Effect.exit(Arbitrary.checkEffect(arbitrary, () => true, { concurrency }))
        assert.isTrue(Exit.hasDies(exit))
      }
      assert.isFalse(generated)
    }))
})
