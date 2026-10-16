import { flow, Schema, String as Str, Struct } from "effect"
import type { Brand, SchemaAST } from "effect"
import { describe, expect, it } from "tstyche"

describe("Struct", () => {
  it("ast type", () => {
    const schema = Schema.Struct({ a: Schema.String })
    expect(schema.ast).type.toBe<SchemaAST.Objects>()
  })

  it("Never should be usable as a field", () => {
    const schema = Schema.Struct({ a: Schema.Never })
    expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<{ readonly a: never }>>()
    expect(schema).type.toBe<Schema.Struct<{ readonly a: Schema.Never }>>()
    expect(schema.annotate({})).type.toBe<Schema.Struct<{ readonly a: Schema.Never }>>()
  })

  it("branded field", () => {
    const schema = Schema.Struct({
      a: Schema.String.pipe(Schema.brand("a"))
    })
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<{ readonly a: string & Brand.Brand<"a"> }, { readonly a: string }>
    >()
    expect(schema).type.toBe<
      Schema.Struct<{ readonly a: Schema.brand<Schema.String, "a"> }>
    >()
    expect(schema.annotate({})).type.toBe<
      Schema.Struct<{ readonly a: Schema.brand<Schema.String, "a"> }>
    >()
  })

  describe("field mutability and optionality", () => {
    it("readonly & required (default)", () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString
      })
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<{ readonly a: number }, { readonly a: string }>
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly a: Schema.decodeTo<Schema.Number, Schema.String> }>
      >()
      expect(schema.annotate({})).type.toBe<
        Schema.Struct<{ readonly a: Schema.decodeTo<Schema.Number, Schema.String> }>
      >()
    })

    it("simplifies readonly & required views", () => {
      const schema = Schema.Union([
        Schema.Struct({ name: Schema.Literal("a"), a: Schema.String }),
        Schema.Struct({ name: Schema.Literal("b"), b: Schema.Finite })
      ])

      // @ts-expect-error Type '{ readonly name: "a"; readonly a: string; } | { readonly name: "b"; readonly b: number; }'
      const type: never = null as unknown as typeof schema.Type
      // @ts-expect-error Type '{ readonly name: "a"; readonly a: string; } | { readonly name: "b"; readonly b: number; }'
      const encoded: never = null as unknown as typeof schema.Encoded
      // @ts-expect-error Type '{ readonly name: "a"; readonly a: string; } | { readonly name: "b"; readonly b: number; }'
      const iso: never = null as unknown as typeof schema.Iso

      void [type, encoded, iso]
    })

    it("simplifies readonly & required make input", () => {
      const schema = Schema.Struct({ a: Schema.String, b: Schema.Number })

      // @ts-expect-error Type '{ readonly a: string; readonly b: number; }'
      const makeIn: never = null as unknown as Schema.Struct.MakeIn<typeof schema.fields>

      void makeIn
    })

    it("readonly & optionalKey field", () => {
      const schema = Schema.Struct({
        a: Schema.optionalKey(Schema.String)
      })
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<{ readonly a?: string }>
      >()
      expect(schema).type.toBe<Schema.Struct<{ readonly a: Schema.optionalKey<Schema.String> }>>()
      expect(schema.annotate({})).type.toBe<
        Schema.Struct<{ readonly a: Schema.optionalKey<Schema.String> }>
      >()
    })

    it("mutableKey & required", () => {
      const schema = Schema.Struct({
        a: Schema.mutableKey(Schema.String)
      })
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<{ a: string }>
      >()
      expect(schema).type.toBe<Schema.Struct<{ readonly a: Schema.mutableKey<Schema.String> }>>()
      expect(schema.annotate({})).type.toBe<
        Schema.Struct<{ readonly a: Schema.mutableKey<Schema.String> }>
      >()
    })

    it("mutableKey & optionalKey", () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(Schema.mutableKey, Schema.optionalKey)
      })
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<{ a?: string }>
      >()
      expect(schema).type.toBe<Schema.Struct<{ readonly a: Schema.optionalKey<Schema.mutableKey<Schema.String>> }>>()
      expect(schema.annotate({})).type.toBe<
        Schema.Struct<{ readonly a: Schema.optionalKey<Schema.mutableKey<Schema.String>> }>
      >()
    })

    it("optionalKey & mutableKey", () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(Schema.optionalKey, Schema.mutableKey)
      })
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<{ a?: string }>
      >()
      expect(schema).type.toBe<Schema.Struct<{ readonly a: Schema.mutableKey<Schema.optionalKey<Schema.String>> }>>()
      expect(schema.annotate({})).type.toBe<
        Schema.Struct<{ readonly a: Schema.mutableKey<Schema.optionalKey<Schema.String>> }>
      >()
    })

    it("mapOmit & requiredKey", () => {
      const schema = Schema.Struct({
        a: Schema.optionalKey(Schema.String),
        b: Schema.optional(Schema.Number),
        c: Schema.Boolean
      }).mapFields(Struct.mapOmit(["c"], Schema.requiredKey))
      expect(schema).type.toBe<
        Schema.Struct<
          { readonly a: Schema.String; readonly b: Schema.UndefinedOr<Schema.Number>; readonly c: Schema.Boolean }
        >
      >()
    })

    it("mapPick & required", () => {
      const schema = Schema.Struct({
        a: Schema.optionalKey(Schema.String),
        b: Schema.optional(Schema.Number),
        c: Schema.Boolean
      }).mapFields(Struct.mapPick(["b"], Schema.required))
      expect(schema).type.toBe<
        Schema.Struct<
          { readonly a: Schema.optionalKey<Schema.String>; readonly b: Schema.Number; readonly c: Schema.Boolean }
        >
      >()
    })
  })

  it("programming with generics", () => {
    const f = <F extends { readonly a: Schema.String }>(schema: Schema.Struct<F>) => {
      const out = Schema.Struct({
        ...schema.fields,
        b: schema.fields.a
      })
      expect(out.fields.a).type.toBe<Schema.String>()
      return out
    }

    const schema = f(Schema.Struct({ a: Schema.String, c: Schema.String }))
    expect(schema.make).type.toBe<
      (
        input: { readonly a: string; readonly c: string; readonly b: string },
        options?: Schema.MakeOptions | undefined
      ) => { readonly a: string; readonly c: string; readonly b: string }
    >()
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<{ readonly a: string; readonly c: string; readonly b: string }>
    >()
    expect(schema).type.toBe<
      Schema.Struct<{ readonly a: Schema.String; readonly b: Schema.String; readonly c: Schema.String }>
    >()
  })

  it("schema views remain precise", () => {
    const schema = Schema.Struct({
      a: Schema.FiniteFromString
    })
    const asSchema = <T>(schema: Schema.Schema<T>) => schema
    const asCodec = <T, E, RD, RE>(schema: Schema.Codec<T, E, RD, RE>) => schema

    expect(schema).type.toBeAssignableTo<Schema.Schema<{ readonly a: number }>>()
    expect(schema).type.toBeAssignableTo<Schema.Codec<{ readonly a: number }, { readonly a: string }, never, never>>()

    const schemaView = asSchema(schema)
    expect(schemaView.Type).type.toBe<{ readonly a: number }>()

    const codecView = asCodec(schema)
    expect(codecView.Type).type.toBe<{ readonly a: number }>()
    expect(codecView.Encoded).type.toBe<{ readonly a: string }>()
    expect(codecView.DecodingServices).type.toBe<never>()
    expect(codecView.EncodingServices).type.toBe<never>()
  })

  describe("mapFields", () => {
    describe("assign", () => {
      it("non-overlapping fields", () => {
        const schema = Schema.Struct({ a: Schema.String }).mapFields(Struct.assign({ b: Schema.String }))
        expect(schema).type.toBe<Schema.Struct<{ readonly a: Schema.String; readonly b: Schema.String }>>()
      })

      it("overlapping fields", () => {
        const schema = Schema.Struct({ a: Schema.String, b: Schema.String }).mapFields(
          Struct.assign({ b: Schema.Number, c: Schema.Number })
        )
        expect(schema).type.toBe<
          Schema.Struct<{ readonly a: Schema.String; readonly b: Schema.Number; readonly c: Schema.Number }>
        >()
      })
    })

    it("evolve", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.evolve({ a: (v) => Schema.optionalKey(v) }))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly b: number; readonly a?: string },
          { readonly b: number; readonly a?: string },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly a: Schema.optionalKey<Schema.String>; readonly b: Schema.Number }>
      >()
    })

    it("evolveKeys", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.evolveKeys({ a: (k) => Str.toUpperCase(k) }))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly b: number; readonly A: string },
          { readonly b: number; readonly A: string },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly A: Schema.String; readonly b: Schema.Number }>
      >()
    })

    it("renameKeys", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number,
        c: Schema.Boolean
      }).mapFields(Struct.renameKeys({ a: "A", b: "B" }))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly B: number; readonly A: string; readonly c: boolean },
          { readonly B: number; readonly A: string; readonly c: boolean },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly A: Schema.String; readonly B: Schema.Number; readonly c: Schema.Boolean }>
      >()
    })

    it("evolveEntries", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.evolveEntries({ a: (k, v) => [Str.toUpperCase(k), Schema.optionalKey(v)] }))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly b: number; readonly A?: string },
          { readonly b: number; readonly A?: string },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly A: Schema.optionalKey<Schema.String>; readonly b: Schema.Number }>
      >()
    })

    it("typeCodec", () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.toType))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly a: number; readonly b: number },
          { readonly a: number; readonly b: number },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<
          { readonly a: Schema.toType<Schema.FiniteFromString>; readonly b: Schema.toType<Schema.Number> }
        >
      >()
    })

    it("encodedCodec", () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.toEncoded))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly a: string; readonly b: number },
          { readonly a: string; readonly b: number },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<
          { readonly a: Schema.toEncoded<Schema.FiniteFromString>; readonly b: Schema.toEncoded<Schema.Number> }
        >
      >()
    })

    it("optionalKey", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.optionalKey))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly b?: number; readonly a?: string },
          { readonly b?: number; readonly a?: string },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly a: Schema.optionalKey<Schema.String>; readonly b: Schema.optionalKey<Schema.Number> }>
      >()
    })

    it("mapPick", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.mapPick(["a"], Schema.optionalKey))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly b: number; readonly a?: string },
          { readonly b: number; readonly a?: string },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly a: Schema.optionalKey<Schema.String>; readonly b: Schema.Number }>
      >()
    })

    it("mapOmit", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.mapOmit(["b"], Schema.optionalKey))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly b: number; readonly a?: string },
          { readonly b: number; readonly a?: string },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly a: Schema.optionalKey<Schema.String>; readonly b: Schema.Number }>
      >()
    })

    it("optional", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.optional))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly b?: number | undefined; readonly a?: string | undefined },
          { readonly b?: number | undefined; readonly a?: string | undefined },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly a: Schema.optional<Schema.String>; readonly b: Schema.optional<Schema.Number> }>
      >()
    })

    it("mutableKey", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.mutableKey))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<{ a: string; b: number }, { a: string; b: number }, never, never>
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly a: Schema.mutableKey<Schema.String>; readonly b: Schema.mutableKey<Schema.Number> }>
      >()
    })

    it("mutable", () => {
      const schema = Schema.Struct({
        a: Schema.Array(Schema.String),
        b: Schema.Tuple([Schema.Number])
      }).mapFields(Struct.map(Schema.mutable))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly a: Array<string>; readonly b: [number] },
          { readonly a: Array<string>; readonly b: [number] },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<
          {
            readonly a: Schema.mutable<Schema.$Array<Schema.String>>
            readonly b: Schema.mutable<Schema.Tuple<readonly [Schema.Number]>>
          }
        >
      >()
    })

    it("NullOr", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.NullOr))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly b: number | null; readonly a: string | null },
          { readonly b: number | null; readonly a: string | null },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly a: Schema.NullOr<Schema.String>; readonly b: Schema.NullOr<Schema.Number> }>
      >()
    })

    it("UndefinedOr", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.UndefinedOr))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly b: number | undefined; readonly a: string | undefined },
          { readonly b: number | undefined; readonly a: string | undefined },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly a: Schema.UndefinedOr<Schema.String>; readonly b: Schema.UndefinedOr<Schema.Number> }>
      >()
    })

    it("NullishOr", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.NullishOr))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly b: number | null | undefined; readonly a: string | null | undefined },
          { readonly b: number | null | undefined; readonly a: string | null | undefined },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly a: Schema.NullishOr<Schema.String>; readonly b: Schema.NullishOr<Schema.Number> }>
      >()
    })

    it("Array", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.Array))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly a: ReadonlyArray<string>; readonly b: ReadonlyArray<number> },
          { readonly a: ReadonlyArray<string>; readonly b: ReadonlyArray<number> },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly a: Schema.$Array<Schema.String>; readonly b: Schema.$Array<Schema.Number> }>
      >()
    })

    it("should work with opaque structs", () => {
      class A extends Schema.Opaque<A>()(Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      })) {}

      const schema = A.mapFields(Struct.map(Schema.Array))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly a: ReadonlyArray<string>; readonly b: ReadonlyArray<number> },
          { readonly a: ReadonlyArray<string>; readonly b: ReadonlyArray<number> },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<{ readonly a: Schema.$Array<Schema.String>; readonly b: Schema.$Array<Schema.Number> }>
      >()
    })

    it("should work with flow", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.FiniteFromString,
        c: Schema.Boolean
      }).mapFields(flow(
        Struct.map(Schema.NullOr),
        Struct.mapPick(["a", "c"], Schema.mutableKey)
      ))

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          { readonly b: number | null; a: string | null; c: boolean | null },
          { readonly b: string | null; a: string | null; c: boolean | null },
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Struct<
          {
            readonly a: Schema.mutableKey<Schema.NullOr<Schema.String>>
            readonly b: Schema.NullOr<Schema.FiniteFromString>
            readonly c: Schema.mutableKey<Schema.NullOr<Schema.Boolean>>
          }
        >
      >()
    })
  })

  describe("Opaque", () => {
    it("Struct drop in", () => {
      const f = <Fields extends Schema.Struct.Fields>(struct: Schema.Struct<Fields>) => struct

      class Person extends Schema.Opaque<Person>()(
        Schema.Struct({
          name: Schema.String
        })
      ) {}

      const y = f(Person)
      expect(y).type.toBe<Schema.Struct<{ readonly name: Schema.String }>>()
    })

    it("Struct", () => {
      class A extends Schema.Opaque<A>()(Schema.Struct({ a: Schema.FiniteFromString })) {}
      const schema = A

      expect<typeof A["Type"]>().type.toBe<A>()
      expect<typeof A["Encoded"]>().type.toBe<{ readonly a: string }>()

      expect(A.make({ a: 1 })).type.toBe<A>()

      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<A, { readonly a: string }>>()
      expect(schema).type.toBe<typeof A>()
      expect(schema.annotate({})).type.toBe<
        Schema.Struct<{ readonly a: Schema.decodeTo<Schema.Number, Schema.String> }>
      >()
      expect(schema.ast).type.toBe<SchemaAST.Objects>()
      expect(schema.make).type.toBe<
        (input: { readonly a: number }, options?: Schema.MakeOptions | undefined) => A
      >()
      expect(schema.fields).type.toBe<{ readonly a: Schema.decodeTo<Schema.Number, Schema.String> }>()

      expect(A).type.not.toHaveProperty("a")
    })

    it("Nested Struct", () => {
      class A extends Schema.Opaque<A>()(Schema.Struct({ a: Schema.String })) {}
      const schema = Schema.Struct({ a: A })

      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<{ readonly a: A }, { readonly a: { readonly a: string } }, never>
      >()
      expect(schema).type.toBe<Schema.Struct<{ readonly a: typeof A }>>()
      expect(schema.annotate({})).type.toBe<Schema.Struct<{ readonly a: typeof A }>>()
    })

    it("branded (unique symbol)", () => {
      class A extends Schema.Opaque<A>()(Schema.Struct({
        a: Schema.String
      })) {}
      class B extends Schema.Opaque<B>()(Schema.Struct({
        a: Schema.String
      })) {}

      const f = (a: A) => a

      f(A.make({ a: "a" }))
      f(B.make({ a: "a" }))

      class ABranded extends Schema.Opaque<ABranded, { readonly brand: unique symbol }>()(Schema.Struct({
        a: Schema.String
      })) {}
      class BBranded extends Schema.Opaque<BBranded, { readonly brand: unique symbol }>()(Schema.Struct({
        a: Schema.String
      })) {}

      const fABranded = (a: ABranded) => a

      fABranded(ABranded.make({ a: "a" }))
      expect(fABranded).type.not.toBeCallableWith(BBranded.make({ a: "a" }))

      const fBBranded = (a: BBranded) => a

      fBBranded(BBranded.make({ a: "a" }))
      expect(fBBranded).type.not.toBeCallableWith(ABranded.make({ a: "a" }))
    })

    it("branded (Brand module)", () => {
      class ABranded extends Schema.Opaque<ABranded, Brand.Brand<"A">>()(Schema.Struct({
        a: Schema.String
      })) {}
      class BBranded extends Schema.Opaque<BBranded, Brand.Brand<"B">>()(Schema.Struct({
        a: Schema.String
      })) {}

      const fABranded = (a: ABranded) => a

      fABranded(ABranded.make({ a: "a" }))
      expect(fABranded).type.not.toBeCallableWith(BBranded.make({ a: "a" }))

      const fBBranded = (a: BBranded) => a

      fBBranded(BBranded.make({ a: "a" }))
      expect(fBBranded).type.not.toBeCallableWith(ABranded.make({ a: "a" }))
    })
  })

  it("TaggedStruct", () => {
    const schema = Schema.TaggedStruct("A", {
      a: Schema.String
    })

    expect(schema).type.toBe<
      Schema.TaggedStruct<"A", { readonly a: Schema.String }>
    >()
    expect(schema).type.toBe<
      Schema.Struct<{ readonly _tag: Schema.tag<"A">; readonly a: Schema.String }>
    >()
    expect(schema.fields._tag.schema.literal).type.toBe<"A">()
  })
})

describe("StructWithRest", () => {
  it("Record(String, Number)", async () => {
    const schema = Schema.StructWithRest(
      Schema.Struct({ a: Schema.Number }),
      [Schema.Record(Schema.String, Schema.Number)]
    )

    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<
        { readonly a: number; readonly [x: string]: number },
        { readonly a: number; readonly [x: string]: number },
        never,
        never
      >
    >()
    expect(schema).type.toBe<
      Schema.StructWithRest<
        Schema.Struct<{ readonly a: Schema.Number }>,
        readonly [Schema.$Record<Schema.String, Schema.Number>]
      >
    >()
    expect(schema.annotate({})).type.toBe<
      Schema.StructWithRest<
        Schema.Struct<{ readonly a: Schema.Number }>,
        readonly [Schema.$Record<Schema.String, Schema.Number>]
      >
    >()
  })

  it("reports decoded fields incompatible with string index signatures", () => {
    const schema = Schema.Struct({ count: Schema.NumberFromString })
    const records = [Schema.Record(Schema.String, Schema.String)] as const

    expect(Schema.StructWithRest).type.toBeCallableWith(schema, records)
    expect<Schema.StructWithRest.ValidateRecords<typeof schema, typeof records>>().type.toBe<{
      "incompatible index signatures": "count"
    }>()
  })

  it("reports encoded fields incompatible with string index signatures", () => {
    const schema = Schema.Struct({ count: Schema.NumberFromString })
    const records = [Schema.Record(Schema.String, Schema.Number)] as const

    expect(Schema.StructWithRest).type.toBeCallableWith(schema, records)
    expect<Schema.StructWithRest.ValidateRecords<typeof schema, typeof records>>().type.toBe<{
      "incompatible index signatures": "count"
    }>()
  })

  it("allows optionalKey fields compatible with string index signatures", () => {
    const schema = Schema.Struct({ a: Schema.optionalKey(Schema.String) })
    const records = [Schema.Record(Schema.String, Schema.String)] as const

    expect(Schema.StructWithRest).type.toBeCallableWith(schema, records)
    expect<Schema.StructWithRest.ValidateRecords<typeof schema, typeof records>>().type.toBe<true>()
  })

  it("reports optional fields incompatible with string index signatures", () => {
    const schema = Schema.Struct({ a: Schema.optional(Schema.String) })
    const records = [Schema.Record(Schema.String, Schema.String)] as const

    expect(Schema.StructWithRest).type.toBeCallableWith(schema, records)
    expect<Schema.StructWithRest.ValidateRecords<typeof schema, typeof records>>().type.toBe<{
      "incompatible index signatures": "a"
    }>()
  })

  it("records mutability and optionality", () => {
    const schema = Schema.StructWithRest(
      Schema.Struct({ a: Schema.Number }),
      [
        Schema.Record(Schema.String, Schema.mutableKey(Schema.Number)),
        Schema.Record(Schema.Symbol, Schema.optional(Schema.Number))
      ]
    )
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<
        { readonly a: number; [x: string]: number; readonly [x: symbol]: number | undefined },
        { readonly a: number; [x: string]: number; readonly [x: symbol]: number | undefined },
        never,
        never
      >
    >()
    expect(schema).type.toBe<
      Schema.StructWithRest<
        Schema.Struct<{ readonly a: Schema.Number }>,
        readonly [
          Schema.$Record<Schema.String, Schema.mutableKey<Schema.Number>>,
          Schema.$Record<Schema.Symbol, Schema.optional<Schema.Number>>
        ]
      >
    >()
    expect(schema.annotate({})).type.toBe<
      Schema.StructWithRest<
        Schema.Struct<{ readonly a: Schema.Number }>,
        readonly [
          Schema.$Record<Schema.String, Schema.mutableKey<Schema.Number>>,
          Schema.$Record<Schema.Symbol, Schema.optional<Schema.Number>>
        ]
      >
    >()
  })

  it("Record", () => {
    expect(Struct.Record([], "value" as const)).type.toBe<
      Record<never, "value">
    >()
    expect(Struct.Record(["a", "b"], "value" as const)).type.toBe<
      Record<"a" | "b", "value">
    >()
  })
})
