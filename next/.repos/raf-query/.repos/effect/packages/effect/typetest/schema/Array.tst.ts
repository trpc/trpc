import { Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

describe("Array", () => {
  it("Array<FiniteFromString> exposes .value", () => {
    const schema = Schema.Array(Schema.FiniteFromString)
    expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<ReadonlyArray<number>, ReadonlyArray<string>>>()
    expect(schema).type.toBe<Schema.$Array<typeof Schema.FiniteFromString>>()
    expect(schema.annotate({})).type.toBe<Schema.$Array<typeof Schema.FiniteFromString>>()

    expect(schema.value).type.toBe<typeof Schema.FiniteFromString>()
  })

  it("mutable Array<FiniteFromString> exposes .value", () => {
    const schema = Schema.mutable(Schema.Array(Schema.FiniteFromString))
    expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<Array<number>, Array<string>>>()
    expect(schema).type.toBe<Schema.mutable<Schema.$Array<typeof Schema.FiniteFromString>>>()
    expect(schema.annotate({})).type.toBe<Schema.mutable<Schema.$Array<typeof Schema.FiniteFromString>>>()

    expect(schema.schema.value).type.toBe<typeof Schema.FiniteFromString>()
  })

  it("withDecodingDefaultType after mutable preserves the mutable type", () => {
    const schema = Schema.Struct({
      value: Schema.Array(Schema.FiniteFromString).pipe(
        Schema.mutable,
        Schema.withDecodingDefaultType(Effect.succeed([1]))
      )
    })

    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<{ readonly value: Array<number> }, { readonly value?: Array<string> | undefined }>
    >()
    expect(schema.fields.value).type.toBe<
      Schema.withDecodingDefaultType<Schema.mutable<Schema.$Array<typeof Schema.FiniteFromString>>>
    >()
  })
})

describe("NonEmptyArray", () => {
  it("NonEmptyArray<FiniteFromString> exposes .value", () => {
    const schema = Schema.NonEmptyArray(Schema.FiniteFromString)
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<readonly [number, ...Array<number>], readonly [string, ...Array<string>]>
    >()
    expect(schema).type.toBe<Schema.NonEmptyArray<typeof Schema.FiniteFromString>>()
    expect(schema.annotate({})).type.toBe<Schema.NonEmptyArray<typeof Schema.FiniteFromString>>()

    expect(schema.value).type.toBe<typeof Schema.FiniteFromString>()
  })

  it("mutable NonEmptyArray<FiniteFromString> exposes .value", () => {
    const schema = Schema.mutable(Schema.NonEmptyArray(Schema.FiniteFromString))
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<[number, ...Array<number>], [string, ...Array<string>]>
    >()
    expect(schema).type.toBe<Schema.mutable<Schema.NonEmptyArray<typeof Schema.FiniteFromString>>>()
    expect(schema.annotate({})).type.toBe<Schema.mutable<Schema.NonEmptyArray<typeof Schema.FiniteFromString>>>()

    expect(schema.schema.value).type.toBe<typeof Schema.FiniteFromString>()
  })
})

describe("ArrayEnsure", () => {
  it("ArrayEnsure<FiniteFromString>", () => {
    const schema = Schema.ArrayEnsure(Schema.FiniteFromString)
    expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<ReadonlyArray<number>, string | ReadonlyArray<string>>>()
    expect(schema).type.toBe<Schema.ArrayEnsure<typeof Schema.FiniteFromString>>()
    expect(schema.annotate({})).type.toBe<Schema.ArrayEnsure<typeof Schema.FiniteFromString>>()
  })
})

describe("UniqueArray", () => {
  it("UniqueArray<FiniteFromString>", () => {
    const schema = Schema.UniqueArray(Schema.FiniteFromString)
    expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<ReadonlyArray<number>, ReadonlyArray<string>>>()
    expect(schema).type.toBe<Schema.UniqueArray<typeof Schema.FiniteFromString>>()
    expect(schema.annotate({})).type.toBe<Schema.UniqueArray<typeof Schema.FiniteFromString>>()
  })
})
