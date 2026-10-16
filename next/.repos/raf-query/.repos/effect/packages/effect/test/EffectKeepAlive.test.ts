import { assert, describe, it, vitest } from "@effect/vitest"

describe("Effect keepAlive", { concurrent: false }, () => {
  it("makeRunMain keeps process alive until completion", async () => {
    const originalSetInterval = globalThis.setInterval
    const originalClearInterval = globalThis.clearInterval
    const running = {} as ReturnType<typeof globalThis.setInterval>
    let started = 0
    let stopped = 0
    let stoppedHandle: ReturnType<typeof globalThis.setInterval> | undefined
    ;(globalThis as any).setInterval = () => {
      started++
      return running
    }
    ;(globalThis as any).clearInterval = (interval: ReturnType<typeof globalThis.setInterval>) => {
      stopped++
      stoppedHandle = interval
    }

    try {
      vitest.resetModules()
      const { Effect, Runtime } = await import("effect")
      await new Promise<void>((resolve) => {
        const runMain = Runtime.makeRunMain(({ fiber, teardown }) => {
          fiber.addObserver((exit) => {
            teardown(exit, () => resolve())
          })
        })
        runMain(Effect.void)
      })
      assert.strictEqual(started, 1)
      assert.strictEqual(stopped, 1)
      assert.strictEqual(stoppedHandle, running)
    } finally {
      ;(globalThis as any).setInterval = originalSetInterval
      ;(globalThis as any).clearInterval = originalClearInterval
      vitest.resetModules()
    }
  })

  it("makeRunMain when setInterval is blocked", async () => {
    const originalSetInterval = globalThis.setInterval
    const originalClearInterval = globalThis.clearInterval
    let attempts = 0
    ;(globalThis as any).setInterval = () => {
      attempts++
      throw new Error("blocked")
    }
    ;(globalThis as any).clearInterval = () => {
      throw new Error("blocked")
    }

    try {
      vitest.resetModules()
      const { Effect, Runtime } = await import("effect")
      await new Promise<void>((resolve) => {
        const runMain = Runtime.makeRunMain(({ fiber, teardown }) => {
          fiber.addObserver((exit) => {
            teardown(exit, () => resolve())
          })
        })
        runMain(Effect.void)
      })
      assert.strictEqual(attempts, 1)
    } finally {
      ;(globalThis as any).setInterval = originalSetInterval
      ;(globalThis as any).clearInterval = originalClearInterval
      vitest.resetModules()
    }
  })
})
