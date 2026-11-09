import { Effect, Schema, Tuple } from "effect"
import { describe, expect, it } from "tstyche"

describe("Tuple", () => {
  it("empty", () => {
    const schema = Schema.Tuple([])
    expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<readonly [], readonly []>>()
    expect(schema).type.toBe<Schema.Tuple<readonly []>>()
    expect(schema.annotate({})).type.toBe<Schema.Tuple<readonly []>>()

    expect(schema.elements).type.toBe<readonly []>()
  })

  it("defaulted element", () => {
    const schema = Schema.Tuple([Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed("default")))])
    expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<readonly [string], readonly [string]>>()
    expect(schema).type.toBe<Schema.Tuple<readonly [Schema.withConstructorDefault<Schema.String>]>>()
    expect(schema.annotate({})).type.toBe<Schema.Tuple<readonly [Schema.withConstructorDefault<Schema.String>]>>()

    expect(schema.elements).type.toBe<readonly [Schema.withConstructorDefault<Schema.String>]>()
  })

  it("readonly [String, Number?]", () => {
    const schema = Schema.Tuple([Schema.String, Schema.optionalKey(Schema.Number)])
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<readonly [string, number?], readonly [string, number?]>
    >()
    expect(schema).type.toBe<Schema.Tuple<readonly [Schema.String, Schema.optionalKey<Schema.Number>]>>()
    expect(schema.annotate({})).type.toBe<
      Schema.Tuple<readonly [Schema.String, Schema.optionalKey<Schema.Number>]>
    >()

    expect(schema.elements).type.toBe<readonly [Schema.String, Schema.optionalKey<Schema.Number>]>()
  })

  it("mutable", () => {
    const schema = Schema.mutable(Schema.Tuple([Schema.String, Schema.FiniteFromString]))
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<[string, number], [string, string], never, never>
    >()
    expect(schema).type.toBe<
      Schema.mutable<Schema.Tuple<readonly [Schema.String, Schema.FiniteFromString]>>
    >()
    expect(schema.annotate({})).type.toBe<
      Schema.mutable<Schema.Tuple<readonly [Schema.String, Schema.FiniteFromString]>>
    >()
    expect(schema.make).type.toBe<
      (input: readonly [string, number], options?: Schema.MakeOptions | undefined) => [string, number]
    >()
  })

  describe("mapElements", () => {
    it("appendElement", () => {
      const schema = Schema.Tuple([Schema.String]).mapElements(Tuple.appendElement(Schema.Number))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<readonly [string, number], readonly [string, number], never, never>
      >()
      expect(schema).type.toBe<Schema.Tuple<readonly [Schema.String, Schema.Number]>>()
    })

    it("appendElements", () => {
      const schema = Schema.Tuple([Schema.String]).mapElements(Tuple.appendElements([Schema.Number, Schema.Boolean]))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<readonly [string, number, boolean], readonly [string, number, boolean], never, never>
      >()
      expect(schema).type.toBe<Schema.Tuple<readonly [Schema.String, Schema.Number, Schema.Boolean]>>()
    })

    it("pick", () => {
      const schema = Schema.Tuple([Schema.String, Schema.Number, Schema.Boolean]).mapElements(Tuple.pick([0, 2]))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<readonly [string, boolean], readonly [string, boolean], never, never>
      >()
      expect(schema).type.toBe<Schema.Tuple<readonly [Schema.String, Schema.Boolean]>>()
    })

    it("omit", () => {
      const schema = Schema.Tuple([Schema.String, Schema.Number, Schema.Boolean]).mapElements(Tuple.omit([1]))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<readonly [string, boolean], readonly [string, boolean], never, never>
      >()
      expect(schema).type.toBe<Schema.Tuple<readonly [Schema.String, Schema.Boolean]>>()
    })

    describe("evolve", () => {
      it("readonly [string] -> readonly [string?]", () => {
        const schema = Schema.Tuple([Schema.String]).mapElements(Tuple.evolve([(v) => Schema.optionalKey(v)]))
        expect(Schema.revealCodec(schema)).type.toBe<
          Schema.Codec<readonly [string?], readonly [string?], never, never>
        >()
        expect(schema).type.toBe<Schema.Tuple<readonly [Schema.optionalKey<Schema.String>]>>()
      })

      it("readonly [string, number] -> readonly [string, number?]", () => {
        const schema = Schema.Tuple([Schema.String, Schema.Number]).mapElements(
          Tuple.evolve([undefined, (v) => Schema.optionalKey(v)])
        )
        expect(Schema.revealCodec(schema)).type.toBe<
          Schema.Codec<readonly [string, number?], readonly [string, number?], never, never>
        >()
        expect(schema).type.toBe<
          Schema.Tuple<readonly [Schema.String, Schema.optionalKey<Schema.Number>]>
        >()
      })
    })

    describe("renameIndices", () => {
      it("partial index mapping", () => {
        const schema = Schema.Tuple([Schema.String, Schema.Number, Schema.Boolean]).mapElements(
          Tuple.renameIndices(["1", "0"])
        )
        expect(Schema.revealCodec(schema)).type.toBe<
          Schema.Codec<readonly [number, string, boolean], readonly [number, string, boolean], never, never>
        >()
        expect(schema).type.toBe<Schema.Tuple<readonly [Schema.Number, Schema.String, Schema.Boolean]>>()
      })

      it("full index mapping", () => {
        const schema = Schema.Tuple([Schema.String, Schema.Number, Schema.Boolean]).mapElements(
          Tuple.renameIndices(["2", "1", "0"])
        )
        expect(Schema.revealCodec(schema)).type.toBe<
          Schema.Codec<readonly [boolean, number, string], readonly [boolean, number, string], never, never>
        >()
        expect(schema).type.toBe<Schema.Tuple<readonly [Schema.Boolean, Schema.Number, Schema.String]>>()
      })
    })

    it("optionalKey", () => {
      const schema = Schema.Tuple([Schema.String, Schema.Number]).mapElements(Tuple.map(Schema.optionalKey))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<readonly [string?, number?], readonly [string?, number?], never, never>
      >()
      expect(schema).type.toBe<
        Schema.Tuple<readonly [Schema.optionalKey<Schema.String>, Schema.optionalKey<Schema.Number>]>
      >()
    })

    it("NullOr", () => {
      const schema = Schema.Tuple([Schema.String, Schema.Number]).mapElements(Tuple.map(Schema.NullOr))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<readonly [string | null, number | null], readonly [string | null, number | null], never, never>
      >()
      expect(schema).type.toBe<
        Schema.Tuple<readonly [Schema.NullOr<Schema.String>, Schema.NullOr<Schema.Number>]>
      >()
    })

    it("mapPick", () => {
      const schema = Schema.Tuple([Schema.String, Schema.Number, Schema.Boolean]).mapElements(
        Tuple.mapPick([0, 2], Schema.NullOr)
      )
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          readonly [string | null, number, boolean | null],
          readonly [string | null, number, boolean | null],
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Tuple<readonly [Schema.NullOr<Schema.String>, Schema.Number, Schema.NullOr<Schema.Boolean>]>
      >()
    })
  })
})

describe("TupleWithRest", () => {
  it("Tuple([FiniteFromString, String]) + [Boolean, String]", () => {
    const schema = Schema.TupleWithRest(
      Schema.Tuple([Schema.FiniteFromString, Schema.String]),
      [Schema.Boolean, Schema.String]
    )

    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<
        readonly [number, string, ...Array<boolean>, string],
        readonly [string, string, ...Array<boolean>, string],
        never,
        never
      >
    >()
  })

  it("mutable", () => {
    const schema = Schema.mutable(Schema.TupleWithRest(
      Schema.Tuple([Schema.FiniteFromString, Schema.String]),
      [Schema.Boolean, Schema.String]
    ))
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<
        [number, string, ...Array<boolean>, string],
        [string, string, ...Array<boolean>, string],
        never,
        never
      >
    >()
  })
})
