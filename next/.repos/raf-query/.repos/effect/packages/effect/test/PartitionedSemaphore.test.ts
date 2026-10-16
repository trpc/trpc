import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Option, PartitionedSemaphore, Scheduler } from "effect"

describe("PartitionedSemaphore", () => {
  it.effect("module-level combinators delegate to the instance api", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make<string>({ permits: 2 })

      assert.strictEqual(PartitionedSemaphore.capacity(sem), 2)
      assert.strictEqual(yield* PartitionedSemaphore.available(sem), 2)

      yield* PartitionedSemaphore.take(sem, "a", 1)
      assert.strictEqual(yield* PartitionedSemaphore.available(sem), 1)

      const value = yield* PartitionedSemaphore.withPermit(sem, "a", Effect.succeed(1))
      assert.strictEqual(value, 1)

      const released = yield* PartitionedSemaphore.release(sem, 1)
      assert.strictEqual(released, 2)

      const value2 = yield* PartitionedSemaphore.withPermits(sem, "b", 2, Effect.succeed(2))
      assert.strictEqual(value2, 2)

      const available = yield* PartitionedSemaphore.withPermitsIfAvailable(sem, 1, Effect.succeed("ok"))
      assert.deepStrictEqual(available, Option.some("ok"))

      const piped = yield* Effect.succeed(3).pipe(PartitionedSemaphore.withPermit(sem, "c"))
      assert.strictEqual(piped, 3)

      const piped2 = yield* Effect.succeed(4).pipe(PartitionedSemaphore.withPermits(sem, "c", 1))
      assert.strictEqual(piped2, 4)

      const pipedAvailable = yield* Effect.succeed("pipe").pipe(PartitionedSemaphore.withPermitsIfAvailable(sem, 1))
      assert.deepStrictEqual(pipedAvailable, Option.some("pipe"))
    }))

  it.effect("zero permits run immediately", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make<string>({ permits: 1 })
      let executed = false

      yield* PartitionedSemaphore.withPermits(
        sem,
        "a",
        0,
        Effect.sync(() => {
          executed = true
        })
      )

      assert.isTrue(executed)
      assert.strictEqual(yield* PartitionedSemaphore.available(sem), 1)
    }))

  it.effect("withPermitsIfAvailable does not block or run when unavailable", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make<string>({ permits: 1 })
      let executed = false

      yield* PartitionedSemaphore.take(sem, "a", 1)

      const result = yield* PartitionedSemaphore.withPermitsIfAvailable(
        sem,
        1,
        Effect.sync(() => {
          executed = true
          return "ok"
        })
      )

      assert.deepStrictEqual(result, Option.none())
      assert.isFalse(executed)
    }))

  it.effect("interrupting a partially satisfied waiter releases all acquired permits", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make<string>({ permits: 4 })

      yield* PartitionedSemaphore.take(sem, "a", 3)
      const waiter = yield* PartitionedSemaphore.take(sem, "b", 3).pipe(Effect.forkChild)
      yield* Effect.yieldNow

      yield* PartitionedSemaphore.release(sem, 1)
      assert.strictEqual(yield* PartitionedSemaphore.available(sem), 0)
      yield* Fiber.interrupt(waiter)
      assert.strictEqual(yield* PartitionedSemaphore.available(sem), 2)
      yield* PartitionedSemaphore.release(sem, 2)

      assert.strictEqual(yield* PartitionedSemaphore.available(sem), 4)
      yield* PartitionedSemaphore.take(sem, "c", 4)
    }))

  it.effect("interrupting an immediately satisfied take before completion restores permits", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make<string>({ permits: 1 })
      const tasks: Array<() => void> = []
      let paused = false
      const scheduler: Scheduler.Scheduler = {
        executionMode: "async",
        makeDispatcher: () => ({
          scheduleTask: (task) => {
            tasks.push(task)
          },
          flush() {}
        }),
        shouldYield: () => !paused && (paused = Effect.runSync(sem.available) === 0)
      }

      const taker = yield* sem.take("a", 1).pipe(
        Effect.provideService(Scheduler.Scheduler, scheduler),
        Effect.forkChild({ startImmediately: true })
      )
      assert.isTrue(paused)
      taker.interruptUnsafe()
      while (tasks.length > 0) tasks.shift()!()
      const exit = yield* Fiber.await(taker)

      assert.isTrue(Exit.isFailure(exit))
      assert.strictEqual(yield* sem.available, 1)
    }))

  it.effect("competing takes cannot acquire the same permit across scheduler yields", () =>
    Effect.gen(function*() {
      for (let yieldPoint = 0; yieldPoint < 20; yieldPoint++) {
        const sem = yield* PartitionedSemaphore.make<string>({ permits: 1 })
        const tasks: Array<() => void> = []
        let checks = 0
        const scheduler: Scheduler.Scheduler = {
          executionMode: "async",
          makeDispatcher: () => ({
            scheduleTask: (task) => {
              tasks.push(task)
            },
            flush() {}
          }),
          shouldYield: () => ++checks === yieldPoint
        }

        const first = yield* sem.take("first", 1).pipe(
          Effect.provideService(Scheduler.Scheduler, scheduler),
          Effect.forkChild({ startImmediately: true })
        )
        const second = yield* sem.take("second", 1).pipe(Effect.forkChild({ startImmediately: true }))
        assert.isAtLeast(yield* sem.available, 0)
        while (tasks.length > 0) tasks.shift()!()

        const firstExit = first.pollUnsafe()
        const secondExit = second.pollUnsafe()
        const firstSucceeded = firstExit !== undefined && Exit.isSuccess(firstExit)
        const secondSucceeded = secondExit !== undefined && Exit.isSuccess(secondExit)
        assert.isFalse(firstSucceeded && secondSucceeded, "yield point " + yieldPoint)
        assert.isAtLeast(yield* sem.available, 0, "yield point " + yieldPoint)

        yield* Fiber.interrupt(first)
        yield* Fiber.interrupt(second)
        yield* sem.release(Number(firstSucceeded) + Number(secondSucceeded))
        assert.strictEqual(yield* sem.available, 1, "yield point " + yieldPoint)
      }
    }))

  it.effect("interrupting withPermitsIfAvailable before cleanup is installed restores permits", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make<string>({ permits: 1 })
      const tasks: Array<() => void> = []
      let paused = false
      let ran = false
      const scheduler: Scheduler.Scheduler = {
        executionMode: "async",
        makeDispatcher: () => ({
          scheduleTask: (task) => {
            tasks.push(task)
          },
          flush() {}
        }),
        shouldYield: () => !paused && (paused = Effect.runSync(sem.available) === 0)
      }

      const user = Effect.sync(() => {
        ran = true
      })
      const fiber = yield* sem.withPermitsIfAvailable(1)(user).pipe(
        Effect.provideService(Scheduler.Scheduler, scheduler),
        Effect.forkChild({ startImmediately: true })
      )
      assert.isTrue(paused)
      fiber.interruptUnsafe()
      while (tasks.length > 0) tasks.shift()!()
      const exit = yield* Fiber.await(fiber)

      assert.isTrue(Exit.isFailure(exit))
      assert.isFalse(ran)
      assert.strictEqual(yield* sem.available, 1)
    }))

  for (const key of ["other", "same"]) {
    it.effect(`interrupting a resumed waiter preserves the next ${key}-key waiter`, () =>
      Effect.gen(function*() {
        const tasks: Array<() => void> = []
        let shouldYield = false
        const scheduler: Scheduler.Scheduler = {
          executionMode: "async",
          makeDispatcher() {
            return {
              scheduleTask(task) {
                tasks.push(task)
              },
              flush() {}
            }
          },
          shouldYield: () => {
            if (!shouldYield) return false
            shouldYield = false
            return true
          }
        }

        const sem = yield* PartitionedSemaphore.make<string>({ permits: 1 })
        yield* sem.take("holder", 1)
        const first = yield* sem.take("same", 1).pipe(
          Effect.provideService(Scheduler.Scheduler, scheduler),
          Effect.forkChild({ startImmediately: true })
        )

        // Pause the selected waiter before its take effect finishes.
        shouldYield = true
        yield* sem.release(1)
        const next = yield* sem.take(key, 1).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Fiber.interrupt(first)
        while (tasks.length > 0) tasks.shift()!()

        const exit = next.pollUnsafe()
        yield* Fiber.interrupt(next)

        assert.deepStrictEqual(exit, Exit.void)
      }))
  }
})
