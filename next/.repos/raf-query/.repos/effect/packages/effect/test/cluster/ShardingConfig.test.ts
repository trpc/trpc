import { assert, describe, it } from "@effect/vitest"
import { ConfigProvider, Effect, Option } from "effect"
import { RunnerAddress, ShardingConfig } from "effect/cluster"

describe("ShardingConfig", () => {
  it.effect("bounds runner residency and storage reads by default", () =>
    Effect.gen(function*() {
      assert.strictEqual(ShardingConfig.defaults.maxResidentEntities, 10_000)
      assert.strictEqual(ShardingConfig.defaults.unprocessedMessageBatchSize, 1024)

      const defaults = yield* ShardingConfig.config.parse(ConfigProvider.fromUnknown({}))
      assert.strictEqual(defaults.maxResidentEntities, 10_000)
      assert.strictEqual(defaults.unprocessedMessageBatchSize, 1024)

      // environment values are integers only
      const fromEnv = yield* ShardingConfig.config.parse(
        ConfigProvider.fromUnknown({ maxResidentEntities: "500", unprocessedMessageBatchSize: "128" })
      )
      assert.strictEqual(fromEnv.maxResidentEntities, 500)
      assert.strictEqual(fromEnv.unprocessedMessageBatchSize, 128)

      const invalid = yield* ShardingConfig.config.parse(
        ConfigProvider.fromUnknown({ maxResidentEntities: "unbounded" })
      ).pipe(Effect.flip)
      assert.strictEqual(invalid._tag, "ConfigError")

      // "unbounded" is only available programmatically
      const layer = ShardingConfig.layer({ maxResidentEntities: "unbounded" })
      const config = yield* Effect.provide(ShardingConfig.ShardingConfig, layer)
      assert.strictEqual(config.maxResidentEntities, "unbounded")
    }))

  it.effect("omits the optional listen address when its host is absent", () =>
    Effect.gen(function*() {
      const defaults = yield* ShardingConfig.config.parse(ConfigProvider.fromUnknown({}))
      assert.ok(Option.isNone(defaults.runnerListenAddress))

      const withHost = yield* ShardingConfig.config.parse(
        ConfigProvider.fromUnknown({ listenHost: "0.0.0.0" })
      )
      assert.deepStrictEqual(
        Option.getOrThrow(withHost.runnerListenAddress),
        RunnerAddress.make("0.0.0.0", 34431)
      )

      const missingHost = yield* ShardingConfig.config.parse(
        ConfigProvider.fromUnknown({ listenPort: "8080" })
      )
      assert.deepStrictEqual(missingHost.runnerListenAddress, Option.none())

      const invalidPort = yield* ShardingConfig.config.parse(
        ConfigProvider.fromUnknown({ listenHost: "0.0.0.0", listenPort: "invalid" })
      ).pipe(Effect.flip)
      assert.strictEqual(
        invalidPort.cause.message,
        `Expected a string representing a finite number
  at ["listenPort"]`
      )
    }))

  it.effect("rejects non-positive residency and batch limits", () =>
    Effect.gen(function*() {
      for (
        const values of [
          { maxResidentEntities: "0" },
          { maxResidentEntities: "-1" },
          { unprocessedMessageBatchSize: "0" },
          { unprocessedMessageBatchSize: "-1" }
        ]
      ) {
        const error = yield* ShardingConfig.config.parse(ConfigProvider.fromUnknown(values)).pipe(Effect.flip)
        assert.strictEqual(error._tag, "ConfigError")
      }
    }))
})
