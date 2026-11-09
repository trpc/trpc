import { assert, describe, it } from "@effect/vitest"
import { Effect, References } from "effect"
import { vi } from "vitest"

const withCaptureDisabled = <A>(run: () => A): A => {
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = 0
  try {
    return run()
  } finally {
    Error.stackTraceLimit = limit
  }
}

// Even an empty stack costs a capture in workerd, so count Error allocations.
const countErrors = (run: () => void): number => {
  const original = globalThis.Error
  let count = 0
  globalThis.Error = new Proxy(original, {
    construct(target, args, newTarget) {
      count++
      return Reflect.construct(target, args, newTarget)
    }
  })
  try {
    run()
    return count
  } finally {
    globalThis.Error = original
  }
}

describe("stack capture", { concurrent: false }, () => {
  it("module loading bounds probes and restores the stack trace limit", async () => {
    const original = globalThis.Error
    const previous = original.stackTraceLimit
    const limits: Array<number> = []
    vi.resetModules()
    original.stackTraceLimit = 10
    globalThis.Error = new Proxy(original, {
      construct(target, args, newTarget) {
        limits.push(target.stackTraceLimit)
        return Reflect.construct(target, args, newTarget)
      }
    })
    try {
      await import("effect/Utils")
      assert.deepStrictEqual(limits.splice(0), [2])
      assert.strictEqual(original.stackTraceLimit, 10)
      await import("effect/internal/effect")
      assert.deepStrictEqual(limits, [1])
      assert.strictEqual(original.stackTraceLimit, 10)
    } finally {
      globalThis.Error = original
      original.stackTraceLimit = previous
      vi.resetModules()
    }
  })

  it("module loading skips stack formatting at limit zero", async () => {
    const original = globalThis.Error
    const limit = original.stackTraceLimit
    let stackReads = 0
    vi.resetModules()
    original.stackTraceLimit = 0
    globalThis.Error = new Proxy(original, {
      construct(target, args, newTarget) {
        return new Proxy(Reflect.construct(target, args, newTarget), {
          get(target, key, receiver) {
            if (key === "stack") {
              stackReads++
            }
            return Reflect.get(target, key, receiver)
          }
        })
      }
    })
    try {
      // A dynamic import after clearing the cache exercises the load-time probe.
      await import("effect/internal/effect")
    } finally {
      globalThis.Error = original
      original.stackTraceLimit = limit
      vi.resetModules()
    }
    assert.strictEqual(stackReads, 0)
  })

  it("Effect.fn skips definition capture at limit zero", () => {
    const count = withCaptureDisabled(() => countErrors(() => Effect.fn("test")(() => Effect.void)))
    assert.strictEqual(count, 0)
  })

  it("Effect.fn skips invocation capture at limit zero", () => {
    const fn = Effect.fn("test")(() => Effect.void)
    const count = withCaptureDisabled(() => countErrors(() => Effect.runSync(fn())))
    assert.strictEqual(count, 0)
  })

  it("default spans skip capture at limit zero", () => {
    const count = withCaptureDisabled(() => countErrors(() => Effect.runSync(Effect.withSpan(Effect.void, "test"))))
    assert.strictEqual(count, 0)
  })

  it("explicit span capture works at limit zero", () => {
    const frame = withCaptureDisabled(() => {
      const frame = Effect.runSync(Effect.withSpan(References.CurrentStackFrame, "test", { captureStackTrace: true }))
      assert.strictEqual(Error.stackTraceLimit, 0)
      return frame
    })
    assert.match(frame!.stack()!, /StackCapture\.test\.ts:\d+:\d+/)
  })
})
