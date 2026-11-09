import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Runner, RunnerAddress, RunnerStorage, ShardId } from "effect/cluster"

describe("RunnerStorage", () => {
  it.effect("tracks runner health in memory", () =>
    Effect.gen(function*() {
      const storage = yield* RunnerStorage.makeMemory
      const address = RunnerAddress.make("localhost", 41001)
      yield* storage.register(Runner.make({ address, groups: ["default"], weight: 1 }), false)
      assert.strictEqual((yield* storage.getRunners)[0][1], false)
      yield* storage.setRunnerHealth(address, true)
      assert.strictEqual((yield* storage.getRunners)[0][1], true)
    }))

  it.effect("memory acquire accepts a one-shot iterable", () =>
    Effect.gen(function*() {
      const storage = yield* RunnerStorage.makeMemory
      const address = RunnerAddress.make("localhost", 1234)
      const shards = [ShardId.make("default", 1), ShardId.make("default", 2)]
      const acquired = yield* storage.acquire(
        address,
        (function*() {
          yield* shards
        })()
      )

      assert.deepStrictEqual(acquired, shards)
      assert.deepStrictEqual(yield* storage.refresh(address, []), shards)
    }))
})
