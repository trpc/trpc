import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as LogLevel from "effect/LogLevel"
import * as References from "effect/References"

describe("LogLevel", () => {
  describe("isEnabled", () => {
    it.effect("uses Info as the default minimum log level", () =>
      Effect.gen(function*() {
        assert.isFalse(yield* LogLevel.isEnabled("Debug"))
        assert.isTrue(yield* LogLevel.isEnabled("Info"))
        assert.isTrue(yield* LogLevel.isEnabled("Error"))
      }))

    it.effect("supports All and None sentinel thresholds", () =>
      Effect.gen(function*() {
        const [debugEnabled, warnEnabled, errorEnabled] = yield* Effect.all([
          LogLevel.isEnabled("Debug"),
          LogLevel.isEnabled("Warn"),
          LogLevel.isEnabled("Error")
        ]).pipe(Effect.provideService(References.MinimumLogLevel, "Warn"))

        assert.isFalse(debugEnabled)
        assert.isTrue(warnEnabled)
        assert.isTrue(errorEnabled)
      }))
  })
})
