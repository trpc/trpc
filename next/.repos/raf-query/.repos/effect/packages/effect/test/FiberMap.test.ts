import { assert, describe, it } from "@effect/vitest"
import { assertFalse, assertTrue, strictEqual } from "@effect/vitest/utils"
import { Array, Deferred, Effect, Exit, Fiber, FiberMap, Option, pipe, Ref, Scope } from "effect"
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

describe("FiberMap", () => {
  it.effect("run defers startup", () =>
    Effect.gen(function*() {
      const container = yield* FiberMap.make<string>()
      let started = false
      const fiber = yield* FiberMap.run(
        container,
        "key",
        Effect.sync(() => {
          started = true
        }),
        { startImmediately: false }
      )
      assert.isFalse(started)
      yield* Fiber.join(fiber)
      assert.isTrue(started)
    }))

  it.effect("retains ownership of replacements made by a synchronous finalizer", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const map = yield* FiberMap.make<string>().pipe(Scope.provide(scope))
      const run = yield* FiberMap.runtime(map)()
      const fibers: Array<Fiber.Fiber<unknown, unknown>> = []
      yield* Effect.addFinalizer(() => Fiber.interruptAll(fibers))

      const previous = run(
        "key",
        Effect.never.pipe(
          Effect.ensuring(Effect.sync(() => {
            fibers.push(run("key", Effect.never))
          }))
        )
      )
      const replacement = run("key", Effect.never)
      fibers.push(previous, replacement)
      assert.strictEqual(fibers.length, 3)

      yield* Scope.close(scope, Exit.void)

      for (const fiber of fibers) {
        assert.isDefined(fiber.pollUnsafe())
      }
    }))

  it.effect("removes a synchronously completed replacement", () =>
    Effect.gen(function*() {
      const map = yield* FiberMap.make<string>()
      const previous = yield* FiberMap.run(map, "key", Effect.never)
      const replacement = yield* FiberMap.run(map, "key", Effect.succeed("done"))

      assert.deepStrictEqual(yield* Fiber.join(replacement), "done")
      assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(previous)))
      assert.strictEqual(yield* FiberMap.size(map), 0)
    }))

  it.effect("interrupts fibers", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make(0)
      yield* pipe(
        Effect.gen(function*() {
          const map = yield* FiberMap.make<number>()
          yield* (
            Effect.forEach(Array.range(1, 10), (i) =>
              Effect.onInterrupt(
                Effect.never,
                () => Ref.update(ref, (n) => n + 1)
              ).pipe(
                FiberMap.run(map, i)
              ))
          )
          yield* Effect.yieldNow
        }),
        Effect.scoped
      )

      strictEqual(yield* (Ref.get(ref)), 10)
    }))

  it.effect("runtime", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make(0)
      yield* pipe(
        Effect.gen(function*() {
          const map = yield* FiberMap.make<number>()
          const run = yield* FiberMap.runtime(map)<never>()
          Array.range(1, 10).forEach((i) =>
            run(
              i,
              Effect.onInterrupt(
                Effect.never,
                () => Ref.update(ref, (n) => n + 1)
              )
            )
          )
          yield* Effect.yieldNow
        }),
        Effect.scoped
      )

      strictEqual(yield* (Ref.get(ref)), 10)
    }))

  it.effect("get and getUnsafe", () =>
    Effect.gen(function*() {
      const map = yield* FiberMap.make<string, string>()

      assert.deepStrictEqual(FiberMap.getUnsafe(map, "a"), Option.none())
      assert.deepStrictEqual(yield* FiberMap.get(map, "a"), Option.none())

      const fiber = yield* FiberMap.run(map, "a", Effect.never)

      const unsafeFiber = FiberMap.getUnsafe(map, "a")
      if (Option.isNone(unsafeFiber)) {
        assert.fail("expected Option.some from getUnsafe")
        return
      }
      strictEqual(unsafeFiber.value, fiber)

      const safeFiber = yield* FiberMap.get(map, "a")
      if (Option.isNone(safeFiber)) {
        assert.fail("expected Option.some from get")
        return
      }
      strictEqual(safeFiber.value, fiber)
    }))

  it.effect("join", () =>
    Effect.gen(function*() {
      const map = yield* FiberMap.make<string>()
      FiberMap.setUnsafe(map, "a", Effect.runFork(Effect.void))
      FiberMap.setUnsafe(map, "b", Effect.runFork(Effect.void))
      FiberMap.setUnsafe(map, "c", Effect.runFork(Effect.fail("fail")))
      FiberMap.setUnsafe(map, "d", Effect.runFork(Effect.fail("ignored")))
      const result = yield* pipe(FiberMap.join(map), Effect.flip)
      strictEqual(result, "fail")
    }))

  it.effect("size", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const set = yield* pipe(FiberMap.make<string>(), Scope.provide(scope))
      FiberMap.setUnsafe(set, "a", Effect.runFork(Effect.never))
      FiberMap.setUnsafe(set, "b", Effect.runFork(Effect.never))
      strictEqual(yield* FiberMap.size(set), 2)
      yield* Scope.close(scope, Exit.void)
      strictEqual(yield* FiberMap.size(set), 0)
    }))

  it.effect("onlyIfMissing", () =>
    Effect.gen(function*() {
      const handle = yield* FiberMap.make<string>()
      const fiberA = yield* FiberMap.run(handle, "a", Effect.never)
      const fiberB = yield* FiberMap.run(handle, "a", Effect.never, { onlyIfMissing: true })
      const fiberC = yield* FiberMap.run(handle, "a", Effect.never, { onlyIfMissing: true })
      yield* Effect.yieldNow
      assertTrue(Exit.hasInterrupts(yield* Fiber.await(fiberB)))
      assertTrue(Exit.hasInterrupts(yield* Fiber.await(fiberC)))
      strictEqual(fiberA.pollUnsafe(), undefined)
    }))

  it.effect("onlyIfMissing keeps the same registered fiber", () =>
    Effect.gen(function*() {
      const map = yield* FiberMap.make<string>()
      const worker = yield* makeWorker
      FiberMap.setUnsafe(map, "key", worker.fiber)
      FiberMap.setUnsafe(map, "key", worker.fiber, { onlyIfMissing: true })

      strictEqual(Option.getOrUndefined(FiberMap.getUnsafe(map, "key")), worker.fiber)
      strictEqual(worker.fiber.pollUnsafe(), undefined)
      strictEqual(yield* Ref.get(worker.cleanups), 0)
    }))

  for (const propagateInterruption of [false, true]) {
    it.effect(`same-fiber registration preserves propagateInterruption: ${propagateInterruption}`, () =>
      Effect.gen(function*() {
        const map = yield* FiberMap.make<string>()
        const worker = yield* makeWorker
        FiberMap.setUnsafe(map, "key", worker.fiber, { propagateInterruption })
        FiberMap.setUnsafe(map, "key", worker.fiber, {
          onlyIfMissing: true,
          propagateInterruption: !propagateInterruption
        })

        yield* Fiber.interrupt(worker.fiber)
        strictEqual(yield* Deferred.isDone(map.deferred), propagateInterruption)
      }))
  }

  it.effect("runtime onlyIfMissing", () =>
    Effect.gen(function*() {
      const run = yield* FiberMap.makeRuntime<never, string>()
      const fiberA = run("a", Effect.never)
      const fiberB = run("a", Effect.never, { onlyIfMissing: true })
      const fiberC = run("a", Effect.never, { onlyIfMissing: true })
      yield* Effect.yieldNow
      assertTrue(Exit.hasInterrupts(yield* Fiber.await(fiberB)))
      assertTrue(Exit.hasInterrupts(yield* Fiber.await(fiberC)))
      strictEqual(fiberA.pollUnsafe(), undefined)
    }))

  it.effect("propagateInterruption false", () =>
    Effect.gen(function*() {
      const map = yield* FiberMap.make<string>()
      const fiber = yield* FiberMap.run(map, "a", Effect.never, {
        propagateInterruption: false
      })
      yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)
      assertFalse(yield* Deferred.isDone(map.deferred))
    }))

  it.effect("propagateInterruption true", () =>
    Effect.gen(function*() {
      const map = yield* FiberMap.make<string>()
      const fiber = yield* FiberMap.run(map, "a", Effect.never, {
        propagateInterruption: true
      })
      yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)
      assertTrue(Exit.hasInterrupts(
        yield* FiberMap.join(map).pipe(
          Effect.exit
        )
      ))
    }))

  it.effect("awaitEmpty", () =>
    Effect.gen(function*() {
      const map = yield* FiberMap.make<string>()
      yield* FiberMap.run(map, "a", Effect.sleep(1000))
      yield* FiberMap.run(map, "b", Effect.sleep(1000))
      yield* FiberMap.run(map, "c", Effect.sleep(1000))
      yield* FiberMap.run(map, "d", Effect.sleep(1000))

      const fiber = yield* Effect.forkChild(FiberMap.awaitEmpty(map))
      yield* TestClock.adjust(500)
      assert.isUndefined(fiber.pollUnsafe())
      yield* TestClock.adjust(500)
      assert.isDefined(fiber.pollUnsafe())
    }))

  it.effect("makeRuntimePromise", () =>
    Effect.gen(function*() {
      const run = yield* FiberMap.makeRuntimePromise<never, string>()
      const result = yield* Effect.promise(() => run("a", Effect.succeed("done")))
      strictEqual(result, "done")
    }))
})
