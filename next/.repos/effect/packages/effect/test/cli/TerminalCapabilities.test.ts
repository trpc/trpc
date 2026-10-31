import { assert, describe, it } from "@effect/vitest"
import { ConfigProvider, Effect, Stdio } from "effect"
import { TerminalCapabilities } from "effect/cli"

const detect = (
  env: Record<string, string>,
  tty: { readonly stdin?: boolean; readonly stdout?: boolean } = {}
) =>
  Effect.gen(function*() {
    return yield* TerminalCapabilities.TerminalCapabilities
  }).pipe(
    Effect.provide(TerminalCapabilities.layer),
    Effect.provide(Stdio.layerTest({
      stdinIsTerminal: Effect.succeed(tty.stdin ?? false),
      stdoutIsTerminal: Effect.succeed(tty.stdout ?? false)
    })),
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env }))
  )

describe("TerminalCapabilities", () => {
  it.effect("has a default when nothing is provided", () =>
    Effect.gen(function*() {
      const capabilities = yield* TerminalCapabilities.TerminalCapabilities
      assert.isBoolean(capabilities.canColor)
      assert.isBoolean(capabilities.canAnimate)
      assert.isBoolean(capabilities.canPrompt)
    }))

  describe("layer", () => {
    it.effect("follows the terminals when no overrides are set", () =>
      Effect.gen(function*() {
        assert.deepStrictEqual(yield* detect({}, { stdin: true, stdout: true }), {
          canColor: true,
          canAnimate: true,
          canPrompt: true
        })
        assert.deepStrictEqual(yield* detect({}, { stdin: true }), {
          canColor: false,
          canAnimate: false,
          canPrompt: false
        })
      }))

    it.effect("forces color with FORCE_COLOR unless it is empty, 0 or false", () =>
      Effect.gen(function*() {
        assert.isTrue((yield* detect({ FORCE_COLOR: "1" })).canColor)
        assert.isFalse((yield* detect({ FORCE_COLOR: "" })).canColor)
        assert.isFalse((yield* detect({ FORCE_COLOR: "0" })).canColor)
        assert.isFalse((yield* detect({ FORCE_COLOR: "false" })).canColor)
        assert.isTrue((yield* detect({ FORCE_COLOR: "0" }, { stdout: true })).canColor)
        assert.isTrue((yield* detect({ FORCE_COLOR: "false" }, { stdout: true })).canColor)
      }))

    it.effect("lets NO_COLOR win over FORCE_COLOR unless it is empty", () =>
      Effect.gen(function*() {
        assert.isFalse((yield* detect({ NO_COLOR: "1", FORCE_COLOR: "1" }, { stdout: true })).canColor)
        assert.isTrue((yield* detect({ NO_COLOR: "", FORCE_COLOR: "1" })).canColor)
      }))

    it.effect("clears every flag when TERM is dumb", () =>
      Effect.gen(function*() {
        assert.deepStrictEqual(
          yield* detect({ TERM: "dumb", FORCE_COLOR: "1" }, { stdin: true, stdout: true }),
          { canColor: false, canAnimate: false, canPrompt: false }
        )
      }))
  })
})
