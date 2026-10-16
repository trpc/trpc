import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Scope } from "effect"
import { ResourceMap } from "effect/cluster/internal/resourceMap"

describe("ResourceMap", () => {
  it.effect("closes a failed lookup scope", () =>
    Effect.scoped(Effect.gen(function*() {
      let finalized = 0
      const map = yield* ResourceMap.make((_key: string) =>
        Effect.gen(function*() {
          yield* Effect.addFinalizer(() => Effect.sync(() => finalized++))
          return yield* Effect.fail("failed")
        })
      )
      yield* Effect.exit(map.get("key"))
      assert.strictEqual(finalized, 1)
    })))

  it.effect("shares a lookup until every get is interrupted, then starts fresh", () =>
    Effect.scoped(Effect.gen(function*() {
      let lookups = 0
      const started = yield* Deferred.make<void>()
      const finalizing = yield* Deferred.make<void>()
      const finishFinalizer = yield* Deferred.make<void>()
      const map = yield* ResourceMap.make((_key: string) =>
        Effect.suspend(() => {
          if (++lookups > 1) return Effect.succeed(lookups)
          return Deferred.succeed(started, void 0).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() =>
              Deferred.succeed(finalizing, void 0).pipe(Effect.andThen(Deferred.await(finishFinalizer)))
            )
          )
        })
      )

      const first = yield* Effect.forkChild(map.get("key"), { startImmediately: true })
      yield* Deferred.await(started)
      const second = yield* Effect.forkChild(map.get("key"), { startImmediately: true })
      yield* Fiber.interrupt(first)
      assert.isFalse(yield* Deferred.isDone(finalizing))

      // A get made while the abandoned lookup finalizes starts a fresh one.
      const interruptSecond = yield* Effect.forkChild(Fiber.interrupt(second), { startImmediately: true })
      yield* Deferred.await(finalizing)
      const fresh = yield* Effect.forkChild(map.get("key"), { startImmediately: true })
      yield* Deferred.succeed(finishFinalizer, void 0)
      yield* Fiber.join(interruptSecond)
      assert.deepStrictEqual(yield* Fiber.await(fresh), Exit.succeed(2))
    })))

  it.effect("an abandoned lookup does not remove a replacement entry", () =>
    Effect.scoped(Effect.gen(function*() {
      let lookups = 0
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const map = yield* ResourceMap.make((_key: string) =>
        Effect.suspend(() => {
          const lookup = ++lookups
          if (lookup === 1) return Deferred.succeed(started, void 0).pipe(Effect.andThen(Effect.never))
          return Deferred.await(release).pipe(Effect.as(lookup))
        })
      )

      const abandoned = yield* Effect.forkChild(map.get("key"), { startImmediately: true })
      yield* Deferred.await(started)
      yield* map.remove("key")
      const replacement = yield* Effect.forkChild(map.get("key"), { startImmediately: true })
      yield* Fiber.interrupt(abandoned)
      const joiner = yield* Effect.forkChild(map.get("key"), { startImmediately: true })

      yield* Deferred.succeed(release, void 0)
      assert.deepStrictEqual(yield* Fiber.await(replacement), Exit.succeed(2))
      assert.deepStrictEqual(yield* Fiber.await(joiner), Exit.succeed(2))
    })))

  it.effect("closing the map interrupts a pending lookup and closes its scope", () =>
    Effect.gen(function*() {
      let finalized = 0
      const started = yield* Deferred.make<void>()
      const mapScope = yield* Scope.make()
      const map = yield* ResourceMap.make((_key: string) =>
        Effect.gen(function*() {
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              finalized++
            })
          )
          yield* Deferred.succeed(started, void 0)
          return yield* Effect.never
        })
      ).pipe(Scope.provide(mapScope))

      const getter = yield* Effect.forkChild(map.get("key"), { startImmediately: true })
      yield* Deferred.await(started)
      yield* Scope.close(mapScope, Exit.void)

      assert.strictEqual(finalized, 1)
      assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(getter)))
    }))
})
