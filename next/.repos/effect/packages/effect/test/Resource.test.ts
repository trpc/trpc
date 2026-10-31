import { assert, describe, it } from "@effect/vitest"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import { identity, pipe } from "effect/Function"
import * as Ref from "effect/Ref"
import * as Resource from "effect/Resource"
import * as Schedule from "effect/Schedule"
import * as TestClock from "effect/testing/TestClock"

describe("Resource", () => {
  it.effect("isResource", () =>
    Effect.gen(function*() {
      const resource = yield* Resource.manual(Effect.succeed(0))
      assert.isTrue(Resource.isResource(resource))
      assert.isFalse(Resource.isResource(new Set([0])))
    }))

  it.effect("manual refresh updates the cached value", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make(0)
      const resource = yield* Resource.manual(Ref.get(ref))
      const result1 = yield* Resource.get(resource)
      const result2 = yield* pipe(
        Ref.set(ref, 1),
        Effect.andThen(Resource.refresh(resource)),
        Effect.andThen(Resource.get(resource))
      )
      assert.strictEqual(result1, 0)
      assert.strictEqual(result2, 1)
    }))

  it.effect("manual refresh releases the previous scoped acquisition", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make(0)
      const resource = yield* Resource.auto(Ref.get(ref), Schedule.spaced(Duration.millis(4)))
      const result1 = yield* Resource.get(resource)
      const result2 = yield* pipe(
        Ref.set(ref, 1),
        Effect.andThen(TestClock.adjust(Duration.millis(5))),
        Effect.andThen(Resource.get(resource))
      )
      assert.strictEqual(result1, 0)
      assert.strictEqual(result2, 1)
    }))

  it.effect("automatic refresh waits for the first scheduled delay", () =>
    Effect.gen(function*() {
      const acquisitions = yield* Ref.make(0)
      const resource = yield* Resource.auto(
        Ref.updateAndGet(acquisitions, (n) => n + 1),
        Schedule.spaced(Duration.hours(1))
      )
      assert.strictEqual(yield* Ref.get(acquisitions), 1)
      assert.strictEqual(yield* Resource.get(resource), 1)
      yield* TestClock.adjust(Duration.minutes(30))
      assert.strictEqual(yield* Ref.get(acquisitions), 1)
      assert.strictEqual(yield* Resource.get(resource), 1)
      yield* TestClock.adjust(Duration.minutes(31))
      assert.strictEqual(yield* Ref.get(acquisitions), 2)
      assert.strictEqual(yield* Resource.get(resource), 2)
    }))

  it.effect("a finite schedule acquires once initially and once per recurrence", () =>
    Effect.gen(function*() {
      const acquisitions = yield* Ref.make(0)
      const resource = yield* Resource.auto(
        Ref.updateAndGet(acquisitions, (n) => n + 1),
        Schedule.recurs(2)
      )
      yield* TestClock.adjust(Duration.seconds(1))
      assert.strictEqual(yield* Ref.get(acquisitions), 3)
      assert.strictEqual(yield* Resource.get(resource), 3)
    }))

  it.effect("scheduled refresh continues after a failed refresh", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make<Effect.Effect<number, string>>(Effect.succeed(0))
      const resource = yield* Resource.auto(Effect.flatMap(Ref.get(ref), identity), Schedule.spaced(Duration.millis(4)))
      yield* Ref.set(ref, Effect.succeed(1))
      yield* TestClock.adjust(Duration.millis(5))
      assert.strictEqual(yield* Resource.get(resource), 1)
      yield* Ref.set(ref, Effect.fail("Uh oh!"))
      yield* TestClock.adjust(Duration.millis(5))
      assert.strictEqual(yield* Resource.get(resource), 1)
      yield* Ref.set(ref, Effect.succeed(2))
      yield* TestClock.adjust(Duration.millis(40))
      assert.strictEqual(yield* Resource.get(resource), 2)
    }))

  it.effect("failed refresh doesn't affect cached value", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make<Effect.Effect<number, string>>(Effect.succeed(0))
      const resource = yield* Resource.auto(Effect.flatMap(Ref.get(ref), identity), Schedule.spaced(Duration.millis(4)))
      const result1 = yield* Resource.get(resource)
      const result2 = yield* pipe(
        Ref.set(ref, Effect.fail("Uh oh!")),
        Effect.andThen(TestClock.adjust(Duration.millis(5))),
        Effect.andThen(Resource.get(resource))
      )
      assert.strictEqual(result1, 0)
      assert.strictEqual(result2, 0)
    }))
})
