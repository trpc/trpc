import { describe, it, vi } from "@effect/vitest"
import * as StackTraceLimit from "effect/internal/stackTraceLimit"
import { assertFalse, assertTrue, strictEqual } from "./utils/assert.ts"

const getLimit = (): number | undefined => (Error as { stackTraceLimit?: number | undefined }).stackTraceLimit

describe("stackTraceLimit", () => {
  describe("writable environment", () => {
    it("isStackTraceLimitWritable returns true", () => {
      assertTrue(StackTraceLimit.isStackTraceLimitWritable())
    })

    it("getStackTraceLimit reflects the current value", () => {
      const prev = getLimit()
      StackTraceLimit.setStackTraceLimit(5)
      strictEqual(StackTraceLimit.getStackTraceLimit(), 5)
      StackTraceLimit.setStackTraceLimit(prev)
    })

    it("setStackTraceLimit updates and restores the limit", () => {
      const prev = StackTraceLimit.getStackTraceLimit()
      StackTraceLimit.setStackTraceLimit(7)
      strictEqual(getLimit(), 7)
      StackTraceLimit.setStackTraceLimit(prev)
      strictEqual(getLimit(), prev)
    })
  })

  describe("frozen intrinsics (non-writable Error.stackTraceLimit)", () => {
    // The writability check is cached at module load, so re-import the module
    // after redefining the property to exercise the frozen path.
    it("degrades to a no-op without throwing", async () => {
      const original = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit")
      Object.defineProperty(Error, "stackTraceLimit", {
        value: 10,
        writable: false,
        configurable: true,
        enumerable: original?.enumerable ?? false
      })
      try {
        vi.resetModules()
        const frozen = await import("effect/internal/stackTraceLimit")

        assertFalse(frozen.isStackTraceLimitWritable())

        // reading still works
        strictEqual(frozen.getStackTraceLimit(), 10)

        // setStackTraceLimit is a silent no-op rather than throwing
        frozen.setStackTraceLimit(0)
        strictEqual(getLimit(), 10)
      } finally {
        if (original !== undefined) {
          Object.defineProperty(Error, "stackTraceLimit", original)
        }
        vi.resetModules()
      }
    })
  })
})
