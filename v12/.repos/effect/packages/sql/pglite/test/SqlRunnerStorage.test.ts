import { PgliteClient } from "@effect/sql-pglite"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Runner, RunnerAddress, RunnerStorage, ShardId, ShardingConfig, SqlRunnerStorage } from "effect/cluster"
import { SqlClient } from "effect/sql"

describe("SqlRunnerStorage", () => {
  for (const shardLockDisableAdvisory of [false, true]) {
    it.live(
      `does not starve the shared PGlite connection (shardLockDisableAdvisory: ${shardLockDisableAdvisory})`,
      () =>
        Effect.gen(function*() {
          const sql = yield* SqlClient.SqlClient
          const storage = yield* RunnerStorage.RunnerStorage
          const address = RunnerAddress.make("localhost", 1234)
          const runner = Runner.make({ address, groups: ["default"], weight: 1 })
          const shards = [ShardId.make("default", 1)]

          assert.deepStrictEqual(yield* storage.getRunners, [])
          yield* storage.register(runner, true)
          assert.deepStrictEqual(yield* storage.getRunners, [[runner, true]])
          assert.deepStrictEqual(yield* storage.acquire(address, shards), shards)
          assert.deepStrictEqual(yield* storage.refresh(address, shards), shards)
          assert.deepStrictEqual(yield* sql`SELECT 2 AS n`, [{ n: 2 }])
        }).pipe(
          Effect.timeout("5 seconds"),
          Effect.provide(SqlRunnerStorage.layer.pipe(
            Layer.provideMerge(PgliteClient.layer()),
            Layer.provide(ShardingConfig.layer({ shardLockDisableAdvisory }))
          ))
        ),
      { timeout: 30_000 }
    )
  }
})
