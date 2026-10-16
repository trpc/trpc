import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

describe("Record", () => {
  it("Record(String, Number)", () => {
    const schema = Schema.Record(Schema.String, Schema.Number)
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<{ readonly [x: string]: number }, { readonly [x: string]: number }, never>
    >()
    expect(schema).type.toBe<Schema.$Record<Schema.String, Schema.Number>>()
    expect(schema.annotate({})).type.toBe<Schema.$Record<Schema.String, Schema.Number>>()
  })

  it("Record(Symbol, Number)", () => {
    const schema = Schema.Record(Schema.Symbol, Schema.Number)
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<{ readonly [x: symbol]: number }, { readonly [x: symbol]: number }, never>
    >()
    expect(schema).type.toBe<Schema.$Record<Schema.Symbol, Schema.Number>>()
    expect(schema.annotate({})).type.toBe<Schema.$Record<Schema.Symbol, Schema.Number>>()
  })

  it("Record(String, NumberFromString)", () => {
    const schema = Schema.Record(Schema.String, Schema.NumberFromString)
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<{ readonly [x: string]: number }, { readonly [x: string]: string }, never>
    >()
    expect(schema).type.toBe<Schema.$Record<Schema.String, typeof Schema.NumberFromString>>()
    expect(schema.annotate({})).type.toBe<Schema.$Record<Schema.String, typeof Schema.NumberFromString>>()
  })

  it("Record(`${number}`, NumberFromString)", () => {
    const schema = Schema.Record(Schema.TemplateLiteral([Schema.Number]), Schema.NumberFromString)
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<{ readonly [x: `${number}`]: number }, { readonly [x: `${number}`]: string }, never>
    >()
    expect(schema).type.toBe<
      Schema.$Record<Schema.TemplateLiteral<readonly [Schema.Number]>, typeof Schema.NumberFromString>
    >()
    expect(schema.annotate({})).type.toBe<
      Schema.$Record<Schema.TemplateLiteral<readonly [Schema.Number]>, typeof Schema.NumberFromString>
    >()
  })

  describe("Literals keys", () => {
    it("Record(Literals, Number)", () => {
      const schema = Schema.Record(Schema.Literals(["a", "b"]), Schema.FiniteFromString)
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly "a": number; readonly "b": number },
          { readonly "a": string; readonly "b": string },
          never
        >
      >()
      expect(schema).type.toBe<Schema.$Record<Schema.Literals<readonly ["a", "b"]>, typeof Schema.FiniteFromString>>()
      expect(schema.annotate({})).type.toBe<
        Schema.$Record<Schema.Literals<readonly ["a", "b"]>, typeof Schema.FiniteFromString>
      >()
    })

    it("Record(Literals, optionalKey(Number))", () => {
      const schema = Schema.Record(Schema.Literals(["a", "b"]), Schema.optionalKey(Schema.FiniteFromString))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly "a"?: number; readonly "b"?: number },
          { readonly "a"?: string; readonly "b"?: string },
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.$Record<Schema.Literals<readonly ["a", "b"]>, Schema.optionalKey<typeof Schema.FiniteFromString>>
      >()
      expect(schema.annotate({})).type.toBe<
        Schema.$Record<Schema.Literals<readonly ["a", "b"]>, Schema.optionalKey<typeof Schema.FiniteFromString>>
      >()
    })

    it("Record(Literals, mutableKey(Number))", () => {
      const schema = Schema.Record(Schema.Literals(["a", "b"]), Schema.mutableKey(Schema.FiniteFromString))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<{ "a": number; "b": number }, { "a": string; "b": string }, never>
      >()
      expect(schema).type.toBe<
        Schema.$Record<Schema.Literals<readonly ["a", "b"]>, Schema.mutableKey<typeof Schema.FiniteFromString>>
      >()
      expect(schema.annotate({})).type.toBe<
        Schema.$Record<Schema.Literals<readonly ["a", "b"]>, Schema.mutableKey<typeof Schema.FiniteFromString>>
      >()
    })

    it("Record(Literals, mutableKey(optionalKey(Number)))", () => {
      const schema = Schema.Record(
        Schema.Literals(["a", "b"]),
        Schema.mutableKey(Schema.optionalKey(Schema.FiniteFromString))
      )
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<{ "a"?: number; "b"?: number }, { "a"?: string; "b"?: string }, never>
      >()
      expect(schema).type.toBe<
        Schema.$Record<
          Schema.Literals<readonly ["a", "b"]>,
          Schema.mutableKey<Schema.optionalKey<typeof Schema.FiniteFromString>>
        >
      >()
      expect(schema.annotate({})).type.toBe<
        Schema.$Record<
          Schema.Literals<readonly ["a", "b"]>,
          Schema.mutableKey<Schema.optionalKey<typeof Schema.FiniteFromString>>
        >
      >()
    })
  })

  describe("field mutability and optionality", () => {
    // Note: `Record(String, optional(Number))` throws at runtime

    it("Record(String, optional(Number))", () => {
      const schema = Schema.Record(Schema.String, Schema.optional(Schema.NumberFromString))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<{ readonly [x: string]: number | undefined }, { readonly [x: string]: string | undefined }, never>
      >()
      expect(schema).type.toBe<Schema.$Record<Schema.String, Schema.optional<Schema.NumberFromString>>>()
      expect(schema.annotate({})).type.toBe<Schema.$Record<Schema.String, Schema.optional<Schema.NumberFromString>>>()
    })

    it("Record(String, mutableKey(Number))", () => {
      const schema = Schema.Record(Schema.String, Schema.mutableKey(Schema.NumberFromString))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<{ [x: string]: number }, { [x: string]: string }, never>
      >()
      expect(schema).type.toBe<Schema.$Record<Schema.String, Schema.mutableKey<Schema.NumberFromString>>>()
      expect(schema.annotate({})).type.toBe<Schema.$Record<Schema.String, Schema.mutableKey<Schema.NumberFromString>>>()
    })

    it("recursive schema", () => {
      type T = { [x: string]: T }
      const schema = Schema.Record(Schema.String, Schema.mutableKey(Schema.suspend((): Schema.Codec<T> => schema)))
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<T>>()
      expect(schema).type.toBe<Schema.$Record<Schema.String, Schema.mutableKey<Schema.suspend<Schema.Codec<T>>>>>()
      expect(schema.annotate({})).type.toBe<
        Schema.$Record<Schema.String, Schema.mutableKey<Schema.suspend<Schema.Codec<T>>>>
      >()
    })
  })
})
