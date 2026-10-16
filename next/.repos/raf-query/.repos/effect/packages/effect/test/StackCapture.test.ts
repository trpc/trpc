import { assert, describe, it } from "@effect/vitest"
import { Effect, References } from "effect"

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
