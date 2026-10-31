import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Snowflake } from "effect/cluster"
import { TestClock } from "effect/testing"

describe("Snowflake", () => {
  it.effect("makeGenerator keeps ids unique after repeated sequence overflow", () =>
    Effect.gen(function*() {
      const now = Snowflake.constEpochMillis + 1000
      yield* TestClock.setTime(now)
      const generator = yield* Snowflake.makeGenerator
      const ids = Array.from({ length: 8193 }, () => generator.nextUnsafe())

      assert.isTrue(ids.every((id, i) => i === 0 || id > ids[i - 1]))
      assert.deepStrictEqual(
        [4095, 4096, 8191, 8192].map((i) => [Snowflake.timestamp(ids[i]), Snowflake.sequence(ids[i])]),
        [[now, 4095], [now + 1, 0], [now + 1, 4095], [now + 2, 0]]
      )
    }))
})
