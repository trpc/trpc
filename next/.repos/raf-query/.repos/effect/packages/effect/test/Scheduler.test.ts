import { assert, describe, it, vi } from "@effect/vitest"
import { Effect, Exit } from "effect"
import * as Scheduler from "effect/Scheduler"

describe("Scheduler", () => {
  it("runSyncExit does not create a dispatcher for synchronous effects", () => {
    const makeDispatcher = vi.spyOn(Scheduler.MixedScheduler.prototype, "makeDispatcher")
    const exit = Effect.runSyncExit(Effect.sync(() => 1))
    const calls = makeDispatcher.mock.calls.length
    makeDispatcher.mockRestore()

    assert.deepStrictEqual(exit, Exit.succeed(1))
    assert.strictEqual(calls, 0)
  })

  it("runSyncExit flushes dispatcher work after yielding", () => {
    const exit = Effect.runSyncExit(Effect.as(Effect.yieldNow, 1))

    assert.deepStrictEqual(exit, Exit.succeed(1))
  })

  it("runSyncExit does not schedule timers after yielding", () => {
    const setImmediate = vi.spyOn(globalThis, "setImmediate").mockImplementation(() => {
      throw new Error("setImmediate is not supported")
    })
    const setTimeout = vi.spyOn(globalThis, "setTimeout").mockImplementation(() => {
      throw new Error("setTimeout is not supported")
    })

    try {
      const exit = Effect.runSyncExit(Effect.as(Effect.yieldNow, 1))

      assert.deepStrictEqual(exit, Exit.succeed(1))
      assert.strictEqual(setImmediate.mock.calls.length, 0)
      assert.strictEqual(setTimeout.mock.calls.length, 0)
    } finally {
      setImmediate.mockRestore()
      setTimeout.mockRestore()
    }
  })

  it.effect("MixedScheduler orders by priority (sync)", () =>
    Effect.sync(() => {
      const scheduler = new Scheduler.MixedScheduler("sync").makeDispatcher()
      const order: Array<string> = []

      scheduler.scheduleTask(() => order.push("p0-1"), 0)
      scheduler.scheduleTask(() => order.push("p10-1"), 10)
      scheduler.scheduleTask(() => order.push("p-1-1"), -1)
      scheduler.scheduleTask(() => order.push("p10-2"), 10)
      scheduler.scheduleTask(() => order.push("p0-2"), 0)

      assert.deepStrictEqual(order, [])

      scheduler.flush()

      assert.deepStrictEqual(order, [
        "p-1-1",
        "p0-1",
        "p0-2",
        "p10-1",
        "p10-2"
      ])
    }))

  it.effect("MixedScheduler is FIFO within a priority", () =>
    Effect.sync(() => {
      const scheduler = new Scheduler.MixedScheduler("sync").makeDispatcher()
      const order: Array<number> = []

      scheduler.scheduleTask(() => order.push(1), 5)
      scheduler.scheduleTask(() => order.push(2), 5)
      scheduler.scheduleTask(() => order.push(3), 5)

      scheduler.flush()

      assert.deepStrictEqual(order, [1, 2, 3])
    }))

  it.effect("PreventSchedulerYield disables shouldYield checks", () =>
    Effect.gen(function*() {
      let calls = 0
      const scheduler: Scheduler.Scheduler = {
        executionMode: "sync",
        shouldYield: () => {
          calls++
          return false
        },
        makeDispatcher() {
          return {} as any
        }
      }

      yield* Effect.sync(() => undefined).pipe(
        Effect.provideService(Scheduler.Scheduler, scheduler)
      )
      assert.strictEqual(calls > 0, true)

      calls = 0
      yield* Effect.sync(() => undefined).pipe(
        Effect.provideService(Scheduler.Scheduler, scheduler),
        Effect.provideService(Scheduler.PreventSchedulerYield, true)
      )
      assert.strictEqual(calls, 0)
    }))

  it.effect("inlined map steps count against MaxOpsBeforeYield", () =>
    Effect.gen(function*() {
      const order: Array<string> = []
      const chain = (label: string) => {
        let effect = Effect.succeed(0)
        for (let i = 0; i < 100; i++) {
          effect = Effect.map(effect, (n) => {
            order.push(label)
            return n + 1
          })
        }
        return effect
      }
      yield* Effect.all([chain("a"), chain("b")], { concurrency: "unbounded" }).pipe(
        Effect.provideService(Scheduler.MaxOpsBeforeYield, 16)
      )
      assert.notStrictEqual(order.join(""), "a".repeat(100) + "b".repeat(100))
    }))

  it("MixedScheduler falls back to a microtask when timers cannot be set", async () => {
    // Cloudflare Workers throw for timers set in global scope
    const setImmediate = vi.spyOn(globalThis, "setImmediate").mockImplementation(() => {
      throw new Error("Disallowed operation called within global scope")
    })
    try {
      const count = Scheduler.MaxOpsBeforeYield.defaultValue() * 3
      const result = await Effect.runPromise(
        Effect.forEach(Array.from({ length: count }, (_, i) => i), (i) => Effect.succeed(i))
      )
      assert.strictEqual(result.length, count)
      assert.isAbove(setImmediate.mock.calls.length, 0)
    } finally {
      setImmediate.mockRestore()
    }
  })
})
