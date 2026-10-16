import type { Effect } from "effect"
import { Clock } from "effect"
import { describe, expect, it } from "tstyche"

describe("Clock", () => {
  it("exposes monotonic nanosecond time", () => {
    expect(Clock.monotonicTimeNanos).type.toBe<Effect.Effect<bigint>>()

    const clock = null as unknown as Clock.Clock
    expect(clock.monotonicTimeNanosUnsafe()).type.toBe<bigint>()
    expect(clock.monotonicTimeNanos).type.toBe<Effect.Effect<bigint>>()
  })
})
