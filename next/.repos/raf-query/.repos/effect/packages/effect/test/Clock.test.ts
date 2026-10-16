import { assert, describe, it, vi } from "@effect/vitest"
import { Clock, Effect } from "effect"

describe("Clock", { concurrent: false }, () => {
  it.live("keeps wall time aligned while exposing the monotonic source", () => {
    let wallMillis = 1_000_000
    let monotonicNanos = 5_000_000_000n
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => wallMillis)
    const hrtime = vi.spyOn(process.hrtime, "bigint").mockImplementation(() => monotonicNanos)
    return Effect.gen(function*() {
      const clock = yield* Clock.Clock
      const nanosPerMilli = 1_000_000n

      assert.strictEqual(clock.currentTimeNanosUnsafe(), BigInt(wallMillis) * nanosPerMilli)
      assert.strictEqual(clock.monotonicTimeNanosUnsafe(), monotonicNanos)

      wallMillis += 250
      monotonicNanos += 250_000_000n
      assert.strictEqual(clock.currentTimeNanosUnsafe(), BigInt(wallMillis) * nanosPerMilli)

      wallMillis += 5_000
      const beforeSuspend = clock.monotonicTimeNanosUnsafe()
      assert.strictEqual(clock.currentTimeNanosUnsafe(), BigInt(wallMillis) * nanosPerMilli)
      assert.strictEqual(clock.monotonicTimeNanosUnsafe(), beforeSuspend)

      wallMillis -= 3_000
      monotonicNanos += 100_000_000n
      assert.strictEqual(clock.currentTimeNanosUnsafe(), BigInt(wallMillis) * nanosPerMilli)
      assert.isTrue(clock.monotonicTimeNanosUnsafe() > beforeSuspend)
    }).pipe(
      Effect.ensuring(Effect.sync(() => {
        dateNow.mockRestore()
        hrtime.mockRestore()
      }))
    )
  })
})
