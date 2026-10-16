import { assert, describe, it } from "@effect/vitest"
import { Duration, Effect, Fiber, Option, PartitionedSemaphore, Semaphore } from "effect"
import * as Scheduler from "effect/Scheduler"
import { TestClock } from "effect/testing"

describe("Semaphore", () => {
  it.effect("basic single partition operation", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make({ permits: 4 })
      const messages: Array<string> = []

      yield* Effect.forkChild(
        Effect.all(
          [0, 1, 2, 3].map((n) =>
            sem.withPermits("partition-1", 2)(
              Effect.delay(
                Effect.sync(() => messages.push(`process: ${n}`)),
                Duration.seconds(2)
              )
            )
          ),
          { concurrency: "unbounded", discard: true }
        )
      )

      yield* TestClock.adjust(Duration.seconds(3))
      assert.strictEqual(messages.length, 2)

      yield* TestClock.adjust(Duration.seconds(3))
      assert.strictEqual(messages.length, 4)
    }))

  it.effect("multiple partitions share total permits", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make({ permits: 4 })
      const messages: Array<string> = []

      yield* Effect.forkChild(
        Effect.all([
          sem.withPermits("partition-1", 2)(
            Effect.delay(
              Effect.sync(() => messages.push("p1-task1")),
              Duration.seconds(2)
            )
          ),
          sem.withPermits("partition-2", 2)(
            Effect.delay(
              Effect.sync(() => messages.push("p2-task1")),
              Duration.seconds(2)
            )
          ),
          sem.withPermits("partition-1", 2)(
            Effect.delay(
              Effect.sync(() => messages.push("p1-task2")),
              Duration.seconds(2)
            )
          )
        ], { concurrency: "unbounded", discard: true })
      )

      yield* TestClock.adjust(Duration.seconds(3))
      assert.strictEqual(messages.length, 2)

      yield* TestClock.adjust(Duration.seconds(3))
      assert.strictEqual(messages.length, 3)
    }))

  it.effect("round-robin fairness across partitions", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make({ permits: 2 })
      const messages: Array<string> = []

      yield* Effect.forkChild(
        sem.withPermits("partition-1", 2)(
          Effect.delay(
            Effect.sync(() => messages.push("p1-initial")),
            Duration.seconds(2)
          )
        )
      )

      yield* TestClock.adjust(Duration.millis(1))

      yield* Effect.forkChild(
        Effect.all([
          sem.withPermits("partition-1", 1)(Effect.sync(() => messages.push("p1-task1"))),
          sem.withPermits("partition-1", 1)(Effect.sync(() => messages.push("p1-task2"))),
          sem.withPermits("partition-1", 1)(Effect.sync(() => messages.push("p1-task3")))
        ], { concurrency: "unbounded", discard: true })
      )

      yield* TestClock.adjust(Duration.millis(1))

      yield* Effect.forkChild(
        Effect.all([
          sem.withPermits("partition-2", 1)(Effect.sync(() => messages.push("p2-task1"))),
          sem.withPermits("partition-2", 1)(Effect.sync(() => messages.push("p2-task2"))),
          sem.withPermits("partition-2", 1)(Effect.sync(() => messages.push("p2-task3")))
        ], { concurrency: "unbounded", discard: true })
      )

      yield* TestClock.adjust(Duration.seconds(3))

      assert.deepStrictEqual(messages, [
        "p1-initial",
        "p1-task1",
        "p2-task1",
        "p1-task2",
        "p2-task2",
        "p1-task3",
        "p2-task3"
      ])
    }))

  it.effect("requesting more permits than total returns never", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make({ permits: 4 })

      const fiber = yield* Effect.forkChild(
        sem.withPermits("partition-1", 5)(Effect.succeed(42))
      )

      yield* TestClock.adjust(Duration.seconds(10))

      assert.isUndefined(fiber.pollUnsafe())
    }))

  it.effect("single permit operations", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make({ permits: 1 })
      const messages: Array<string> = []

      yield* Effect.forkChild(
        Effect.all(
          [0, 1, 2].map((n) =>
            sem.withPermits("partition-1", 1)(
              Effect.delay(
                Effect.sync(() => messages.push(`task: ${n}`)),
                Duration.seconds(1)
              )
            )
          ),
          { concurrency: "unbounded", discard: true }
        )
      )

      yield* TestClock.adjust(Duration.seconds(1.5))
      assert.strictEqual(messages.length, 1)

      yield* TestClock.adjust(Duration.seconds(1))
      assert.strictEqual(messages.length, 2)

      yield* TestClock.adjust(Duration.seconds(1))
      assert.strictEqual(messages.length, 3)
    }))

  it.effect("different permit sizes on same partition", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make({ permits: 5 })
      const messages: Array<string> = []

      yield* Effect.forkChild(
        Effect.all([
          sem.withPermits("partition-1", 3)(
            Effect.delay(
              Effect.sync(() => messages.push("large")),
              Duration.seconds(2)
            )
          ),
          sem.withPermits("partition-1", 1)(
            Effect.delay(
              Effect.sync(() => messages.push("small-1")),
              Duration.seconds(2)
            )
          ),
          sem.withPermits("partition-1", 1)(
            Effect.delay(
              Effect.sync(() => messages.push("small-2")),
              Duration.seconds(2)
            )
          )
        ], { concurrency: "unbounded", discard: true })
      )

      yield* TestClock.adjust(Duration.seconds(3))
      assert.strictEqual(messages.length, 3)
    }))

  it.effect("interruption releases permits", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make({ permits: 2 })
      const messages: Array<string> = []

      const fiber = yield* Effect.forkChild(
        sem.withPermits("partition-1", 2)(
          Effect.delay(
            Effect.sync(() => messages.push("long-task")),
            Duration.seconds(10)
          )
        )
      )

      yield* TestClock.adjust(Duration.seconds(1))
      yield* Fiber.interrupt(fiber)

      yield* sem.withPermits("partition-1", 2)(
        Effect.sync(() => messages.push("after-interrupt"))
      )

      assert.strictEqual(messages.length, 1)
      assert.strictEqual(messages[0], "after-interrupt")
    }))

  it.effect("interruption with partial permit acquisition releases all taken permits", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make({ permits: 3 })
      const messages: Array<string> = []

      const fiber1 = yield* Effect.forkChild(
        sem.withPermits("partition-1", 2)(
          Effect.delay(
            Effect.sync(() => messages.push("first")),
            Duration.seconds(5)
          )
        )
      )

      yield* TestClock.adjust(Duration.millis(1))

      const fiber2 = yield* Effect.forkChild(
        sem.withPermits("partition-2", 3)(
          Effect.sync(() => messages.push("second"))
        )
      )

      yield* TestClock.adjust(Duration.millis(1))
      yield* Fiber.interrupt(fiber2)

      yield* sem.withPermits("partition-3", 1)(
        Effect.sync(() => messages.push("can-acquire-one"))
      )

      assert.deepStrictEqual(messages, ["can-acquire-one"])

      yield* TestClock.adjust(Duration.seconds(5))
      yield* Fiber.join(fiber1)

      assert.deepStrictEqual(messages, ["can-acquire-one", "first"])

      yield* sem.withPermits("partition-4", 3)(
        Effect.sync(() => messages.push("all-three"))
      )

      assert.deepStrictEqual(messages, ["can-acquire-one", "first", "all-three"])
    }))

  it.effect("take interruption does not leak permits", () =>
    Effect.gen(function*() {
      const tasks: Array<() => void> = []
      let shouldYield = false
      const scheduler: Scheduler.Scheduler = {
        executionMode: "async",
        makeDispatcher() {
          return {
            scheduleTask(task, _priority) {
              tasks.push(task)
            },
            flush() {
            }
          }
        },
        shouldYield: () => {
          if (shouldYield) {
            shouldYield = false
            return true
          }
          return false
        }
      }
      const step = Effect.sync(() => {
        const task = tasks.shift()
        if (task !== undefined) {
          task()
        }
      })

      const sem = yield* Semaphore.make(0)
      const waiter = yield* sem.take(1).pipe(
        Effect.provideService(Scheduler.Scheduler, scheduler),
        Effect.forkChild
      )

      yield* Effect.yieldNow
      yield* sem.release(1).pipe(Effect.provideService(Scheduler.Scheduler, scheduler))
      assert.isUndefined(waiter.pollUnsafe())

      shouldYield = true
      yield* step
      assert.isUndefined(waiter.pollUnsafe())

      yield* Fiber.interrupt(waiter)
      yield* step

      const result = yield* sem.withPermitsIfAvailable(1)(Effect.void)
      assert.isTrue(Option.isSome(result))
    }))

  it.effect("withPermits interruption does not leak permits", () =>
    Effect.gen(function*() {
      const sem = yield* Semaphore.make(1)
      let acquired = false
      const waiter = yield* sem.withPermits(2)(
        Effect.sync(() => {
          acquired = true
        })
      ).pipe(Effect.forkChild)

      yield* Effect.yieldNow
      assert.isUndefined(waiter.pollUnsafe())

      yield* Fiber.interrupt(waiter)
      assert.isFalse(acquired)

      const result = yield* sem.withPermitsIfAvailable(1)(Effect.void)
      assert.isTrue(Option.isSome(result))

      yield* sem.withPermits(1)(
        Effect.sync(() => {
          acquired = true
        })
      )
      assert.isTrue(acquired)
    }))

  it.effect("withPermits interrupted at any operation does not leak permits", () =>
    Effect.gen(function*() {
      let operations = 0
      const counted = new Scheduler.MixedScheduler()
      const baseline = yield* (yield* Semaphore.make(1)).withPermits(1)(Effect.void).pipe(
        Effect.provideService(Scheduler.Scheduler, {
          executionMode: counted.executionMode,
          makeDispatcher: () => counted.makeDispatcher(),
          shouldYield: (fiber) => {
            operations++
            return counted.shouldYield(fiber)
          }
        }),
        Effect.forkChild
      )
      yield* Fiber.await(baseline)

      const recovered: Array<boolean> = []
      let ranUnderPermits = false

      for (let at = 1; at <= operations; at++) {
        const sem = yield* Semaphore.make(1)
        const base = new Scheduler.MixedScheduler()
        let seen = 0
        const scheduler: Scheduler.Scheduler = {
          executionMode: base.executionMode,
          makeDispatcher: () => base.makeDispatcher(),
          shouldYield: (fiber) => {
            if (++seen === at) fiber.interruptUnsafe()
            return base.shouldYield(fiber)
          }
        }

        const holder = yield* sem.withPermits(1)(
          Effect.sync(() => {
            ranUnderPermits = true
          })
        ).pipe(
          Effect.provideService(Scheduler.Scheduler, scheduler),
          Effect.forkChild
        )
        yield* Fiber.await(holder)

        const result = yield* sem.withPermitsIfAvailable(1)(Effect.void)
        recovered.push(Option.isSome(result))
      }

      assert.deepStrictEqual(recovered, Array.from({ length: operations }, () => true))
      assert.isTrue(ranUnderPermits)
    }))

  it.effect("queued withPermits interrupted at any operation does not leak permits", () =>
    Effect.gen(function*() {
      const queuedScheduler = (
        tasks: Array<() => void>,
        onOperation: (fiber: Fiber.Fiber<unknown, unknown>) => void
      ) => {
        const scheduler: Scheduler.Scheduler = {
          executionMode: "async",
          makeDispatcher: () => ({
            scheduleTask(task) {
              tasks.push(task)
            },
            flush() {}
          }),
          shouldYield: (fiber) => {
            onOperation(fiber)
            return false
          }
        }
        return scheduler
      }

      let operations = 0
      const baselineSem = yield* Semaphore.make(1)
      const baselineTasks: Array<() => void> = []
      const baselineHolder = yield* Effect.forkChild(baselineSem.withPermits(1)(Effect.never))
      yield* Effect.yieldNow
      yield* Effect.forkChild(
        baselineSem.withPermits(1)(Effect.void).pipe(
          Effect.provideService(Scheduler.Scheduler, queuedScheduler(baselineTasks, () => operations++))
        ),
        { startImmediately: true }
      )
      yield* Fiber.interrupt(baselineHolder)
      yield* Effect.yieldNow
      while (baselineTasks.length > 0) baselineTasks.shift()!()

      const recovered: Array<boolean> = []
      let ranUnderPermits = false

      for (let at = 1; at <= operations; at++) {
        const sem = yield* Semaphore.make(1)
        const tasks: Array<() => void> = []
        let seen = 0
        const scheduler = queuedScheduler(tasks, (fiber) => {
          if (++seen === at) fiber.interruptUnsafe()
        })

        const holder = yield* Effect.forkChild(sem.withPermits(1)(Effect.never))
        yield* Effect.yieldNow

        yield* Effect.forkChild(
          sem.withPermits(1)(
            Effect.sync(() => {
              ranUnderPermits = true
            })
          ).pipe(Effect.provideService(Scheduler.Scheduler, scheduler)),
          { startImmediately: true }
        )

        yield* Fiber.interrupt(holder)
        yield* Effect.yieldNow
        while (tasks.length > 0) tasks.shift()!()

        const result = yield* sem.withPermitsIfAvailable(1)(Effect.void)
        recovered.push(Option.isSome(result))
      }

      assert.deepStrictEqual(recovered, Array.from({ length: operations }, () => true))
      assert.isTrue(ranUnderPermits)
    }))

  it.effect("takeIfAvailable acquires permits when they are available", () =>
    Effect.gen(function*() {
      const sem = yield* Semaphore.make(2)

      const acquired = yield* Semaphore.takeIfAvailable(sem, 2)
      assert.isTrue(acquired)

      const unavailable = yield* sem.takeIfAvailable(1)
      assert.isFalse(unavailable)

      const released = yield* sem.release(2)
      assert.strictEqual(released, 2)
    }))

  it.effect("takeIfAvailable returns immediately when permits are unavailable", () =>
    Effect.gen(function*() {
      const sem = yield* Semaphore.make(1)

      yield* sem.take(1)

      const acquired = yield* Semaphore.takeIfAvailable(1)(sem)
      assert.isFalse(acquired)

      yield* sem.release(1)
      assert.isTrue(yield* sem.takeIfAvailable(1))
    }))

  it.effect("module-level combinators delegate to the instance api", () =>
    Effect.gen(function*() {
      const sem = yield* Semaphore.make(1)

      const taken = yield* Semaphore.take(sem, 1)
      assert.strictEqual(taken, 1)

      const released = yield* Semaphore.release(sem, 1)
      assert.strictEqual(released, 1)

      yield* Semaphore.resize(sem, 2)

      const value = yield* Semaphore.withPermit(sem, Effect.succeed(1))
      assert.strictEqual(value, 1)

      const value2 = yield* Semaphore.withPermits(sem, 2, Effect.succeed(2))
      assert.strictEqual(value2, 2)

      const available = yield* Semaphore.withPermitsIfAvailable(sem, 1, Effect.succeed("ok"))
      assert.deepStrictEqual(available, Option.some("ok"))

      const piped = yield* Effect.succeed(3).pipe(Semaphore.withPermit(sem))
      assert.strictEqual(piped, 3)

      const piped2 = yield* Effect.succeed(4).pipe(Semaphore.withPermits(sem, 1))
      assert.strictEqual(piped2, 4)

      const pipedAvailable = yield* Effect.succeed("pipe").pipe(Semaphore.withPermitsIfAvailable(sem, 1))
      assert.deepStrictEqual(pipedAvailable, Option.some("pipe"))

      const releasedAll = yield* Semaphore.releaseAll(sem)
      assert.strictEqual(releasedAll, 2)
    }))

  it.effect("exact permit match", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make({ permits: 4 })
      const messages: Array<string> = []

      yield* Effect.forkChild(
        Effect.all([
          sem.withPermits("partition-1", 4)(
            Effect.delay(
              Effect.sync(() => messages.push("exact-match")),
              Duration.seconds(2)
            )
          ),
          sem.withPermits("partition-2", 1)(
            Effect.delay(
              Effect.sync(() => messages.push("waiting")),
              Duration.seconds(2)
            )
          )
        ], { concurrency: "unbounded", discard: true })
      )

      yield* TestClock.adjust(Duration.seconds(3))
      assert.strictEqual(messages.length, 1)
      assert.strictEqual(messages[0], "exact-match")

      yield* TestClock.adjust(Duration.seconds(3))
      assert.strictEqual(messages.length, 2)
    }))

  it.effect("many partitions", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make({ permits: 3 })
      const messages: Array<string> = []

      yield* Effect.forkChild(
        Effect.all(
          Array.from({ length: 10 }, (_, i) =>
            sem.withPermits(`partition-${i % 5}`, 1)(
              Effect.delay(
                Effect.sync(() => messages.push(`p${i % 5}-task`)),
                Duration.seconds(1)
              )
            )),
          { concurrency: "unbounded", discard: true }
        )
      )

      yield* TestClock.adjust(Duration.seconds(1.5))
      assert.strictEqual(messages.length, 3)

      yield* TestClock.adjust(Duration.seconds(1))
      assert.strictEqual(messages.length, 6)

      yield* TestClock.adjust(Duration.seconds(1))
      assert.strictEqual(messages.length, 9)

      yield* TestClock.adjust(Duration.seconds(1))
      assert.strictEqual(messages.length, 10)
    }))

  it.effect("partial permit allocation", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make({ permits: 3 })
      const messages: Array<string> = []

      yield* Effect.forkChild(
        sem.withPermits("partition-1", 2)(
          Effect.delay(
            Effect.sync(() => messages.push("first")),
            Duration.seconds(2)
          )
        )
      )

      yield* TestClock.adjust(Duration.millis(100))

      const fiber = yield* Effect.forkChild(
        sem.withPermits("partition-2", 2)(
          Effect.sync(() => messages.push("second"))
        )
      )

      yield* TestClock.adjust(Duration.millis(100))

      assert.isUndefined(fiber.pollUnsafe())
      assert.strictEqual(messages.length, 0)

      yield* TestClock.adjust(Duration.seconds(3))

      assert.strictEqual(messages.length, 2)
      assert.deepStrictEqual(messages, ["first", "second"])
    }))

  it.effect("zero permits requested", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make({ permits: 2 })
      let executed = false

      yield* sem.withPermits("partition-1", 0)(
        Effect.sync(() => {
          executed = true
        })
      )

      assert.isTrue(executed)
    }))

  it.effect("sequential tasks in same partition", () =>
    Effect.gen(function*() {
      const sem = yield* PartitionedSemaphore.make({ permits: 2 })
      const messages: Array<string> = []

      yield* sem.withPermits("partition-1", 2)(
        Effect.sync(() => messages.push("task-1"))
      )

      yield* sem.withPermits("partition-1", 2)(
        Effect.sync(() => messages.push("task-2"))
      )

      yield* sem.withPermits("partition-1", 2)(
        Effect.sync(() => messages.push("task-3"))
      )

      assert.deepStrictEqual(messages, ["task-1", "task-2", "task-3"])
    }))
})
