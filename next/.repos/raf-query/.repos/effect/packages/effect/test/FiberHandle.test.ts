import { assert, describe, it } from "@effect/vitest"
import { assertFalse, assertTrue, strictEqual } from "@effect/vitest/utils"
import { Deferred, Effect, Exit, Fiber, FiberHandle, Option, pipe, Ref } from "effect"
import { TestClock } from "effect/testing"

const makeWorker = Effect.gen(function*() {
  const ready = yield* Deferred.make<void>()
  const cleanups = yield* Ref.make(0)
  const fiber = yield* Effect.forkScoped(
    Deferred.succeed(ready, undefined).pipe(
      Effect.andThen(Effect.never),
      Effect.ensuring(Ref.update(cleanups, (n) => n + 1))
    ),
    { startImmediately: true }
  )
  yield* Deferred.await(ready)
  return { fiber, cleanups }
})

describe("FiberHandle", () => {
  it.effect("run defers startup", () =>
    Effect.gen(function*() {
      const container = yield* FiberHandle.make()
      let started = false
      const fiber = yield* FiberHandle.run(
        container,
        Effect.sync(() => {
          started = true
        }),
        { startImmediately: false }
      )
      assert.isFalse(started)
      yield* Fiber.join(fiber)
      assert.isTrue(started)
    }))

  it.effect("interrupts the current fiber when the scope closes", () =>
    Effect.gen(function*() {
      const ref = yield* (Ref.make(0))
      yield* pipe(
        Effect.gen(function*() {
          const handle = yield* FiberHandle.make()
          yield* FiberHandle.run(handle, Effect.onInterrupt(Effect.never, () => Ref.update(ref, (n) => n + 1)))
          yield* Effect.yieldNow
        }),
        Effect.scoped
      )

      strictEqual(yield* (Ref.get(ref)), 1)
    }))

  it.effect("runtime", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make(0)
      yield* pipe(
        Effect.gen(function*() {
          const handle = yield* FiberHandle.make()
          const run = yield* FiberHandle.runtime(handle)<never>()
          run(Effect.onInterrupt(Effect.never, () => Ref.update(ref, (n) => n + 1)))
          yield* Effect.yieldNow
          run(Effect.onInterrupt(Effect.never, () => Ref.update(ref, (n) => n + 1)))
          yield* Effect.yieldNow
          run(Effect.onInterrupt(Effect.never, () => Ref.update(ref, (n) => n + 1)), {
            onlyIfMissing: true
          })
          yield* Effect.yieldNow
          strictEqual(yield* Ref.get(ref), 1)
        }),
        Effect.scoped
      )

      strictEqual(yield* Ref.get(ref), 2)
    }))

  it.effect("get and getUnsafe", () =>
    Effect.gen(function*() {
      const handle = yield* FiberHandle.make<string>()

      assert.deepStrictEqual(FiberHandle.getUnsafe(handle), Option.none())
      assert.deepStrictEqual(yield* FiberHandle.get(handle), Option.none())

      const fiber = yield* FiberHandle.run(handle, Effect.never)

      const unsafeFiber = FiberHandle.getUnsafe(handle)
      if (Option.isNone(unsafeFiber)) {
        assert.fail("expected Option.some from getUnsafe")
        return
      }
      strictEqual(unsafeFiber.value, fiber)

      const safeFiber = yield* FiberHandle.get(handle)
      if (Option.isNone(safeFiber)) {
        assert.fail("expected Option.some from get")
        return
      }
      strictEqual(safeFiber.value, fiber)
    }))

  it.effect("join ignores managed replacement interruptions and fails with child errors", () =>
    Effect.gen(function*() {
      const handle = yield* FiberHandle.make()
      FiberHandle.setUnsafe(handle, Effect.runFork(Effect.void))
      FiberHandle.setUnsafe(handle, Effect.runFork(Effect.fail("fail")))
      const result = yield* Effect.flip(FiberHandle.join(handle))
      strictEqual(result, "fail")
    }))

  it.effect("onlyIfMissing keeps the current fiber and interrupts rejected starts", () =>
    Effect.gen(function*() {
      const handle = yield* FiberHandle.make()
      const fiberA = yield* FiberHandle.run(handle, Effect.never)
      const fiberB = yield* FiberHandle.run(handle, Effect.never, { onlyIfMissing: true })
      const fiberC = yield* FiberHandle.run(handle, Effect.never, { onlyIfMissing: true })
      yield* Effect.yieldNow
      assertTrue(Exit.hasInterrupts(yield* Fiber.await(fiberB)))
      assertTrue(Exit.hasInterrupts(yield* Fiber.await(fiberC)))
      strictEqual(fiberA.pollUnsafe(), undefined)
    }))

  it.effect("onlyIfMissing keeps the same registered fiber", () =>
    Effect.gen(function*() {
      const handle = yield* FiberHandle.make()
      const worker = yield* makeWorker
      FiberHandle.setUnsafe(handle, worker.fiber)
      FiberHandle.setUnsafe(handle, worker.fiber, { onlyIfMissing: true })

      strictEqual(Option.getOrUndefined(FiberHandle.getUnsafe(handle)), worker.fiber)
      strictEqual(worker.fiber.pollUnsafe(), undefined)
      strictEqual(yield* Ref.get(worker.cleanups), 0)
    }))

  for (const propagateInterruption of [false, true]) {
    it.effect(`same-fiber registration preserves propagateInterruption: ${propagateInterruption}`, () =>
      Effect.gen(function*() {
        const handle = yield* FiberHandle.make()
        const worker = yield* makeWorker
        FiberHandle.setUnsafe(handle, worker.fiber, { propagateInterruption })
        FiberHandle.setUnsafe(handle, worker.fiber, {
          onlyIfMissing: true,
          propagateInterruption: !propagateInterruption
        })

        yield* Fiber.interrupt(worker.fiber)
        strictEqual(yield* Deferred.isDone(handle.deferred), propagateInterruption)
      }))
  }

  it.effect("clear does not remove a newer fiber installed while interrupting the previous one", () =>
    Effect.gen(function*() {
      const handle = yield* FiberHandle.make()
      yield* FiberHandle.run(handle, Effect.uninterruptible(Effect.sleep(200)))

      const clearFiber = yield* Effect.forkChild(FiberHandle.clear(handle), { startImmediately: true })
      yield* TestClock.adjust(50)
      const nextFiber = yield* FiberHandle.run(handle, Effect.never)
      yield* TestClock.adjust(200)
      yield* Fiber.join(clearFiber)

      const current = FiberHandle.getUnsafe(handle)
      if (Option.isNone(current)) {
        assert.fail("expected FiberHandle.clear to preserve the newer fiber")
        return
      }
      strictEqual(current.value, nextFiber)
      strictEqual(nextFiber.pollUnsafe(), undefined)
    }))

  it.effect("runtime onlyIfMissing", () =>
    Effect.gen(function*() {
      const run = yield* FiberHandle.makeRuntime<never>()
      const fiberA = run(Effect.never)
      const fiberB = run(Effect.never, { onlyIfMissing: true })
      const fiberC = run(Effect.never, { onlyIfMissing: true })
      yield* Effect.yieldNow
      assertTrue(Exit.hasInterrupts(yield* Fiber.await(fiberB)))
      assertTrue(Exit.hasInterrupts(yield* Fiber.await(fiberC)))
      strictEqual(fiberA.pollUnsafe(), undefined)
    }))

  it.effect("propagateInterruption: false", () =>
    Effect.gen(function*() {
      const handle = yield* FiberHandle.make()
      const fiber = yield* FiberHandle.run(handle, Effect.never, {
        propagateInterruption: false
      })
      yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)
      assertFalse(yield* Deferred.isDone(handle.deferred))
    }))

  it.effect("propagateInterruption: true", () =>
    Effect.gen(function*() {
      const handle = yield* FiberHandle.make()
      const fiber = yield* FiberHandle.run(handle, Effect.never, {
        propagateInterruption: true
      })
      yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)
      assertTrue(Exit.hasInterrupts(
        yield* FiberHandle.join(handle).pipe(
          Effect.exit
        )
      ))
    }))

  it.effect("awaitEmpty", () =>
    Effect.gen(function*() {
      const handle = yield* FiberHandle.make()
      yield* FiberHandle.run(handle, Effect.sleep(1000))

      const fiber = yield* Effect.forkChild(FiberHandle.awaitEmpty(handle))
      yield* TestClock.adjust(500)
      assert.isUndefined(fiber.pollUnsafe())
      yield* TestClock.adjust(500)
      assert.isDefined(fiber.pollUnsafe())
    }))

  it.effect("makeRuntimePromise", () =>
    Effect.gen(function*() {
      const run = yield* FiberHandle.makeRuntimePromise()
      const result = yield* Effect.promise(() => run(Effect.succeed("done")))
      strictEqual(result, "done")
    }))
})
