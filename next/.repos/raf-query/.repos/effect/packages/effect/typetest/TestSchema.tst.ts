import type { SchemaIssue } from "effect"
import { Context, Effect, Schema, SchemaGetter } from "effect"
import { TestSchema } from "effect/testing"
import { describe, expect, it } from "tstyche"

describe("TestSchema", () => {
  it("types Encoding.encodeUnknownEffect with the encoded output", () => {
    const encoding = new TestSchema.Asserts(Schema.NumberFromString).encoding()

    expect(encoding.encodeUnknownEffect(1)).type.toBe<Effect.Effect<string, SchemaIssue.Issue>>()
  })

  it("uses native Arbitrary check options", () => {
    const asserts = new TestSchema.Asserts(Schema.String)

    expect(asserts.verifyRoundTrip({ runs: 20, seed: "lossless" })).type.toBe<Promise<void>>()
    expect(asserts.verifyRoundTripEffect({ runs: 20, seed: "lossless" }))
      .type.toBe<Effect.Effect<void>>()
    expect(asserts.arbitrary().verifyGeneration({ runs: 20, maxDiscards: 100, seed: "generation" }))
      .type.toBe<void>()
  })

  it("preserves directional services and removes provided services", () => {
    class Decoding extends Context.Service<Decoding, string>()("Decoding") {}
    class Encoding extends Context.Service<Encoding, string>()("Encoding") {}
    const schema = Schema.NumberFromString.pipe(Schema.decode({
      decode: SchemaGetter.checkEffect(() => Effect.as(Decoding, true)),
      encode: SchemaGetter.checkEffect(() => Effect.as(Encoding, true))
    }))
    const asserts = new TestSchema.Asserts(schema)
    const decoding = asserts.decoding()
    const encoding = asserts.encoding()

    expect(decoding.succeedEffect("1")).type.toBe<Effect.Effect<void, never, Decoding>>()
    expect(decoding.succeedEffect("1", 1)).type.toBe<Effect.Effect<void, never, Decoding>>()
    expect(decoding.failEffect(null, "Expected string")).type.toBe<Effect.Effect<void, never, Decoding>>()
    expect(encoding.succeedEffect(1)).type.toBe<Effect.Effect<void, never, Encoding>>()
    expect(encoding.succeedEffect(1, "1")).type.toBe<Effect.Effect<void, never, Encoding>>()
    expect(encoding.failEffect(null, "Expected number")).type.toBe<Effect.Effect<void, never, Encoding>>()
    expect(asserts.verifyRoundTripEffect()).type.toBe<Effect.Effect<void, never, Decoding | Encoding>>()
    expect(asserts.make().succeedEffect(1)).type.toBe<Effect.Effect<void>>()
    expect(asserts.make().failEffect(null, "Expected number")).type.toBe<Effect.Effect<void>>()

    const providedDecoding = decoding.provide(Decoding, "decode")
    const providedEncoding = encoding.provide(Encoding, "encode")
    expect(providedDecoding.succeedEffect("1", 1)).type.toBe<Effect.Effect<void>>()
    expect(providedDecoding.failEffect(null, "Expected string")).type.toBe<Effect.Effect<void>>()
    expect(providedEncoding.succeedEffect(1, "1")).type.toBe<Effect.Effect<void>>()
    expect(providedEncoding.failEffect(null, "Expected number")).type.toBe<Effect.Effect<void>>()
    expect(providedDecoding.succeed("1", 1)).type.toBe<Promise<void>>()
    expect(providedEncoding.succeed(1, "1")).type.toBe<Promise<void>>()

    // Promise assertions still require their services to be provided.
    // @ts-expect-error is not assignable
    decoding.succeed("1", 1)
    // @ts-expect-error is not assignable
    decoding.fail(null, "Expected string")
    // @ts-expect-error is not assignable
    encoding.succeed(1, "1")
    // @ts-expect-error is not assignable
    encoding.fail(null, "Expected number")
    // @ts-expect-error is not assignable
    asserts.verifyRoundTrip()
  })

  it("checks expected values and constructor input overloads", () => {
    const asserts = new TestSchema.Asserts(Schema.NumberFromString)
    expect(asserts.decoding().succeedEffect).type.not.toBeCallableWith("1", "1")
    expect(asserts.encoding().succeedEffect).type.not.toBeCallableWith(1, 1)

    const schema = Schema.Struct({
      name: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed("default")))
    })
    const make = new TestSchema.Asserts(schema).make()
    expect(make.succeedEffect({ name: "value" })).type.toBe<Effect.Effect<void>>()
    expect(make.succeedEffect({}, { name: "default" })).type.toBe<Effect.Effect<void>>()
    expect(make.succeedEffect).type.not.toBeCallableWith({})
    expect(make.succeedEffect).type.not.toBeCallableWith({}, {})
    expect(make.succeed({ name: "value" })).type.toBe<Promise<void>>()
    expect(make.succeed({}, { name: "default" })).type.toBe<Promise<void>>()
    expect(make.succeed).type.not.toBeCallableWith({})

    const unknown = new TestSchema.Asserts(Schema.Unknown)
    expect(unknown.decoding().succeedEffect("value", undefined)).type.toBe<Effect.Effect<void>>()
    expect(unknown.encoding().succeedEffect("value", undefined)).type.toBe<Effect.Effect<void>>()
    expect(unknown.make().succeedEffect("value", undefined)).type.toBe<Effect.Effect<void>>()
  })
})
