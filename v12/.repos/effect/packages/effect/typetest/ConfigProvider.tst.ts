import { ConfigProvider, Effect } from "effect"
import { describe, expect, it } from "tstyche"

declare const process: { readonly env: Record<string, string | undefined> }

describe("ConfigProvider", () => {
  it("exposes lookup absence and input transformation", () => {
    const provider = ConfigProvider.make((_path) => Effect.succeed(ConfigProvider.makeValue("value")))

    expect(provider.load([]))
      .type.toBe<Effect.Effect<ConfigProvider.Node | undefined, ConfigProvider.SourceError>>()
    expect(provider.mapInput((path) => path))
      .type.toBe<ConfigProvider.ConfigProvider>()
  })

  it("accepts process.env as an explicit environment record", () => {
    expect(ConfigProvider.fromEnvRecord(process.env))
      .type.toBe<ConfigProvider.ConfigProvider>()
  })
})
