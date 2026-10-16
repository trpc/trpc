import { Effect, Schema, type Stream } from "effect"
import { type AiError, Tool, Toolkit } from "effect/ai"
import { describe, expect, it } from "tstyche"

describe("Tool", () => {
  it("exposes result encoding failures on the extracted return-mode stream", () => {
    const positive = Tool.make("Positive", {
      failureMode: "return",
      success: Schema.Number.check(Schema.isGreaterThan(0)),
      failure: Schema.String
    })
    const toolkit = Toolkit.make(positive)
    const handled = toolkit.pipe(Effect.provide(toolkit.toLayer({
      Positive: () => Effect.succeed(-1)
    })))

    Effect.map(handled, (handlers) =>
      Effect.map(handlers.handle("Positive", {}), (inner) => {
        expect<[Stream.Error<typeof inner>]>().type.toBe<[AiError.AiError]>()
      }))
  })

  describe("failure results", () => {
    const failure = Schema.NumberFromString
    const errorTool = Tool.make("ErrorMode", { failure })
    const returnTool = Tool.make("ReturnMode", { failure, failureMode: "return" })

    it("includes execution failures in the default error mode", () => {
      expect<Tool.FailureResult<typeof errorTool>>().type.toBe<
        typeof failure.Type | typeof Tool.ExecutionFailure.Type
      >()
      expect<Tool.FailureResultEncoded<typeof errorTool>>().type.toBe<
        typeof failure.Encoded | typeof Tool.ExecutionFailure.Encoded
      >()
    })

    it("includes execution failures alongside AiError in return mode", () => {
      expect<Tool.FailureResult<typeof returnTool>>().type.toBe<
        typeof failure.Type | typeof Tool.ExecutionFailure.Type | AiError.AiError
      >()
      expect<Tool.FailureResultEncoded<typeof returnTool>>().type.toBe<
        typeof failure.Encoded | typeof Tool.ExecutionFailure.Encoded | AiError.AiErrorEncoded
      >()
    })
  })

  describe("make", () => {
    it("omitting parameters defaults to EmptyParams", () => {
      const tool = Tool.make("A")

      expect(tool).type.toBe<
        Tool.Tool<"A", {
          readonly parameters: Tool.EmptyParams
          readonly success: typeof Schema.Void
          readonly failure: typeof Schema.Never
          readonly failureMode: "error"
        }>
      >()
    })

    it("explicit EmptyParams matches omitted parameters", () => {
      const tool = Tool.make("A", { parameters: Tool.EmptyParams })

      expect(tool).type.toBe<
        Tool.Tool<"A", {
          readonly parameters: Tool.EmptyParams
          readonly success: typeof Schema.Void
          readonly failure: typeof Schema.Never
          readonly failureMode: "error"
        }>
      >()
    })
  })
})
