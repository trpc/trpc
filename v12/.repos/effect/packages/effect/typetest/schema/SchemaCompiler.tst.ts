import { Effect, Schema } from "effect"
import { SchemaCompiler, SchemaJITCompiler } from "effect/schema"
import { describe, expect, it } from "tstyche"

describe("SchemaCompiler", () => {
  it("set", () => {
    const decoder = {
      is: (input, _options) => typeof input === "string",
      decode: (input, _options) => typeof input === "string" ? input : SchemaCompiler.invalid,
      make: (input, _options) => typeof input === "string" ? input : SchemaCompiler.invalid,
      decodeEffect: (input, _options) => Effect.succeed(input),
      makeEffect: (input, _options) => Effect.succeed(input)
    } satisfies SchemaCompiler.CompiledDecoder

    expect(SchemaCompiler.set(Schema.String.ast, decoder)).type.toBe<void>()
    expect(SchemaCompiler.set).type.toBeCallableWith(Schema.String.ast, { decodeEffect: Effect.succeed })
    expect(SchemaCompiler.set).type.not.toBeCallableWith(Schema.String.ast, { makeEffect: Effect.succeed })
  })

  it("enable", () => {
    expect(SchemaJITCompiler.enable(Schema.String.ast)).type.toBe<void>()
    expect(SchemaJITCompiler.enable).type.not.toBeCallableWith(Schema.String)
  })
})
