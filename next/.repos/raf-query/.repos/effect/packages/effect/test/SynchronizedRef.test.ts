import { describe, it } from "@effect/vitest"
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { Deferred, Effect, Exit, Fiber, Option, pipe, SynchronizedRef } from "effect"

const current = "value"
const update = "new value"
const failure = "failure"

type State = Active | Changed | Closed

interface Active {
  readonly _tag: "Active"
}

interface Changed {
  readonly _tag: "Changed"
}

interface Closed {
  readonly _tag: "Closed"
}

export const Active: State = { _tag: "Active" }
export const Changed: State = { _tag: "Changed" }
export const Closed: State = { _tag: "Closed" }

const isActive = (self: State): boolean => self._tag === "Active"
const isChanged = (self: State): boolean => self._tag === "Changed"
const isClosed = (self: State): boolean => self._tag === "Closed"

describe("SynchronizedRef", () => {
  it.effect("get", () =>
    Effect.gen(function*() {
      const result = yield* pipe(SynchronizedRef.make(current), Effect.flatMap(SynchronizedRef.get))
      strictEqual(result, current)
    }))
  it.effect("getAndUpdateEffect - happy path", () =>
    Effect.gen(function*() {
      const ref = yield* SynchronizedRef.make(current)
      const result1 = yield* SynchronizedRef.getAndUpdateEffect(ref, () => Effect.succeed(update))
      const result2 = yield* SynchronizedRef.get(ref)
      strictEqual(result1, current)
      strictEqual(result2, update)
    }))
  it.effect("getAndUpdateEffect - with failure", () =>
    Effect.gen(function*() {
      const ref = yield* SynchronizedRef.make(current)
      const result = yield* pipe(SynchronizedRef.getAndUpdateEffect(ref, (_) => Effect.fail(failure)), Effect.exit)
      deepStrictEqual(result, Exit.fail(failure))
    }))
  it.effect("getAndUpdateSomeEffect - happy path", () =>
    Effect.gen(function*() {
      const ref = yield* SynchronizedRef.make<State>(Active)
      const result1 = yield* (SynchronizedRef.getAndUpdateSomeEffect(ref, (state) =>
        isClosed(state) ?
          Effect.succeedSome(Changed) :
          Effect.succeedNone))
      const result2 = yield* SynchronizedRef.get(ref)
      deepStrictEqual(result1, Active)
      deepStrictEqual(result2, Active)
    }))
  it.effect("getAndUpdateSomeEffect - twice", () =>
    Effect.gen(function*() {
      const ref = yield* SynchronizedRef.make<State>(Active)
      const result1 = yield* SynchronizedRef.getAndUpdateSomeEffect(ref, (state) =>
        isActive(state) ?
          Effect.succeedSome(Changed) :
          Effect.succeedNone)
      const result2 = yield* SynchronizedRef.getAndUpdateSomeEffect(ref, (state) =>
        isClosed(state)
          ? Effect.succeedSome(Active)
          : isChanged(state)
          ? Effect.succeedSome(Closed)
          : Effect.succeedNone)
      const result3 = yield* SynchronizedRef.get(ref)
      deepStrictEqual(result1, Active)
      deepStrictEqual(result2, Changed)
      deepStrictEqual(result3, Closed)
    }))
  it.effect("getAndUpdateSomeEffect - with failure", () =>
    Effect.gen(function*() {
      const ref = yield* SynchronizedRef.make<State>(Active)
      const result = yield* pipe(
        SynchronizedRef.getAndUpdateSomeEffect(ref, (state) =>
          isActive(state) ?
            Effect.fail(failure) :
            Effect.succeedNone),
        Effect.exit
      )
      deepStrictEqual(result, Exit.fail(failure))
    }))
  it.effect("getAndUpdateSomeEffect - interrupt parent fiber and update", () =>
    Effect.gen(function*() {
      const deferred = yield* Deferred.make<SynchronizedRef.SynchronizedRef<State>>()
      const latch = yield* Deferred.make<void>()
      const makeAndWait = Deferred.complete(deferred, SynchronizedRef.make<State>(Active)).pipe(
        Effect.andThen(Deferred.await(latch))
      )
      const fiber = yield* Effect.forkChild(makeAndWait)
      const ref = yield* Deferred.await(deferred)
      yield* Fiber.interrupt(fiber)
      const result = yield* SynchronizedRef.updateAndGetEffect(ref, (_) => Effect.succeed(Closed))
      deepStrictEqual(result, Closed)
    }))
  it.effect("getAndUpdateSome updates the backing ref", () =>
    Effect.gen(function*() {
      const ref = yield* SynchronizedRef.make(1)
      const previous = yield* SynchronizedRef.getAndUpdateSome(ref, (n) => Option.some(n + 1))
      strictEqual(previous, 1)
      strictEqual(yield* SynchronizedRef.get(ref), 2)
    }))
})
