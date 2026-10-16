import { Effect, hole, Schema, Tuple } from "effect"
import type { Array as Arr } from "effect"
import { describe, expect, it } from "tstyche"

describe("Union", () => {
  it("empty", () => {
    const schema = Schema.Union([])
    expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<never, never, never>>()
    expect(schema).type.toBe<Schema.Union<readonly []>>()
    expect(schema.annotate({})).type.toBe<Schema.Union<readonly []>>()

    expect(schema.members).type.toBe<readonly []>()
  })

  it("string", () => {
    const schema = Schema.Union([Schema.String])
    expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string, string, never>>()
    expect(schema).type.toBe<Schema.Union<readonly [Schema.String]>>()
    expect(schema.annotate({})).type.toBe<Schema.Union<readonly [Schema.String]>>()

    expect(schema.members).type.toBe<readonly [Schema.String]>()
  })

  it("string | number", () => {
    const schema = Schema.Union([Schema.String, Schema.Number])
    expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string | number, string | number, never>>()
    expect(schema).type.toBe<Schema.Union<readonly [Schema.String, Schema.Number]>>()
    expect(schema.annotate({})).type.toBe<Schema.Union<readonly [Schema.String, Schema.Number]>>()

    expect(schema.members).type.toBe<readonly [Schema.String, Schema.Number]>()
  })

  it("schema views remain precise", () => {
    const schema = Schema.Union([Schema.String, Schema.FiniteFromString])
    const asSchema = <T>(schema: Schema.Schema<T>) => schema
    const asCodec = <T, E, RD, RE>(schema: Schema.Codec<T, E, RD, RE>) => schema

    expect(schema).type.toBeAssignableTo<Schema.Schema<string | number>>()
    expect(schema).type.toBeAssignableTo<Schema.Codec<string | number, string, never, never>>()

    const schemaView = asSchema(schema)
    expect(schemaView.Type).type.toBe<string | number>()

    const codecView = asCodec(schema)
    expect(codecView.Type).type.toBe<string | number>()
    expect(codecView.Encoded).type.toBe<string>()
    expect(codecView.DecodingServices).type.toBe<never>()
    expect(codecView.EncodingServices).type.toBe<never>()
  })

  describe("mapMembers", () => {
    it("appendElement", () => {
      const schema = Schema.Union([Schema.String, Schema.Number]).mapMembers(Tuple.appendElement(Schema.Boolean))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<string | number | boolean, string | number | boolean, never, never>
      >()
      expect(schema).type.toBe<Schema.Union<readonly [Schema.String, Schema.Number, Schema.Boolean]>>()
    })

    it("evolve", () => {
      const schema = Schema.Union([Schema.String, Schema.Number, Schema.Boolean]).mapMembers(
        Tuple.evolve([
          (v) => Schema.Array(v),
          undefined,
          (v) => Schema.Array(v)
        ])
      )
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          ReadonlyArray<string> | number | ReadonlyArray<boolean>,
          ReadonlyArray<string> | number | ReadonlyArray<boolean>,
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Union<readonly [Schema.$Array<Schema.String>, Schema.Number, Schema.$Array<Schema.Boolean>]>
      >()
    })

    it("Array", () => {
      const schema = Schema.Union([Schema.String, Schema.Number]).mapMembers(Tuple.map(Schema.Array))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          ReadonlyArray<string> | ReadonlyArray<number>,
          ReadonlyArray<string> | ReadonlyArray<number>,
          never,
          never
        >
      >()
      expect(schema).type.toBe<Schema.Union<readonly [Schema.$Array<Schema.String>, Schema.$Array<Schema.Number>]>>()
    })

    it("NonEmptyArray", () => {
      const schema = Schema.Union([Schema.String, Schema.Number]).mapMembers(Tuple.map(Schema.NonEmptyArray))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<
          Arr.NonEmptyReadonlyArray<string> | Arr.NonEmptyReadonlyArray<number>,
          Arr.NonEmptyReadonlyArray<string> | Arr.NonEmptyReadonlyArray<number>,
          never,
          never
        >
      >()
      expect(schema).type.toBe<
        Schema.Union<readonly [Schema.NonEmptyArray<Schema.String>, Schema.NonEmptyArray<Schema.Number>]>
      >()
    })
  })

  describe("Tagged unions", () => {
    describe("asTaggedUnion", () => {
      it("should not be callable if the tag field is invalid", () => {
        const original = Schema.Union([
          Schema.TaggedStruct("A", { a: Schema.String }),
          Schema.TaggedStruct("C", { c: Schema.Boolean }),
          Schema.TaggedStruct("B", { b: Schema.FiniteFromString })
        ])

        expect(original.pipe).type.toBeCallableWith(Schema.toTaggedUnion("_tag"))
        expect(original.pipe).type.not.toBeCallableWith(Schema.toTaggedUnion("a"))

        const schema = original.pipe(Schema.toTaggedUnion("_tag"))

        expect(schema.discriminants).type.toBe<readonly ["A", "C", "B"]>()

        expect(Schema.revealCodec(schema)).type.toBe<
          Schema.Codec<
            | { readonly _tag: "A"; readonly a: string }
            | { readonly _tag: "B"; readonly b: number }
            | { readonly _tag: "C"; readonly c: boolean },
            | { readonly _tag: "A"; readonly a: string }
            | { readonly _tag: "B"; readonly b: string }
            | { readonly _tag: "C"; readonly c: boolean },
            never,
            never
          >
        >()

        // cases
        const { A, B, C } = schema.cases
        expect(B.fields._tag.schema.literal).type.toBe<"B">()
        expect(A.fields._tag.schema.literal).type.toBe<"A">()
        expect(C.fields._tag.schema.literal).type.toBe<"C">()
        expect(A).type.toBe<Schema.TaggedStruct<"A", { readonly a: Schema.String }>>()
        expect(B).type.toBe<Schema.TaggedStruct<"B", { readonly b: Schema.FiniteFromString }>>()
        expect(C).type.toBe<Schema.TaggedStruct<"C", { readonly c: Schema.Boolean }>>()
      })

      it("isAnyOf should narrow custom tags", () => {
        const schema = Schema.Union([
          Schema.Struct({ kind: Schema.tag("a"), a: Schema.Number }),
          Schema.Struct({ kind: Schema.tag("b"), b: Schema.String }),
          Schema.Struct({ kind: Schema.tag("c"), c: Schema.Boolean })
        ]).pipe(Schema.toTaggedUnion("kind"))

        const value = hole<Schema.Schema.Type<typeof schema>>()

        if (schema.isAnyOf(["a", "b"])(value)) {
          expect(value).type.toBe<
            | { readonly kind: "a"; readonly a: number }
            | { readonly kind: "b"; readonly b: string }
          >()
        }
      })

      it("should flatten discriminants", () => {
        const schema = Schema.Union([
          Schema.Struct({ event: Schema.Literal("A") }),
          Schema.Union([
            Schema.Struct({ event: Schema.Literal("B") }),
            Schema.Struct({ event: Schema.Literal("C") })
          ])
        ]).pipe(Schema.toTaggedUnion("event"))

        expect(schema.discriminants).type.toBe<readonly ["A", "B", "C"]>()
        expect(Schema.Literals(schema.discriminants)).type.toBe<Schema.Literals<readonly ["A", "B", "C"]>>()
      })

      it("should support empty unions", () => {
        const schema = Schema.Union([]).pipe(Schema.toTaggedUnion("event"))

        expect(schema.discriminants).type.toBe<readonly []>()
      })
    })

    describe("match", () => {
      it("should allow distinct Effect branch outputs", () => {
        const schema = Schema.Union([
          Schema.TaggedStruct("A", { a: Schema.String }),
          Schema.TaggedStruct("B", { b: Schema.Number })
        ]).pipe(Schema.toTaggedUnion("_tag"))
        const handler = schema.match({
          A: () => Effect.succeed("ok" as const),
          B: () => Effect.fail("nope" as const)
        })

        expect(handler).type.toBeCallableWith({ _tag: "A", a: "a" })
        expect(handler).type.toBeCallableWith({ _tag: "B", b: 1 })
        expect(handler).type.toBeAssignableTo<
          (value: Schema.Schema.Type<typeof schema>) => Effect.Effect<"ok", "nope", never>
        >()
      })
    })

    describe("matchOrElse", () => {
      it("should preserve toTaggedUnion branch outputs and narrow the fallback", () => {
        const schema = Schema.Union([
          Schema.TaggedStruct("A", { a: Schema.String }),
          Schema.TaggedStruct("B", { b: Schema.Number }),
          Schema.TaggedStruct("C", { c: Schema.Boolean })
        ]).pipe(Schema.toTaggedUnion("_tag"))
        const value = hole<Schema.Schema.Type<typeof schema>>()
        const cases: {
          readonly A?: (value: { readonly _tag: "A"; readonly a: string }) => Effect.Effect<string>
        } = {
          A: (value) => Effect.succeed(value.a)
        }

        const result = schema.matchOrElse(value, cases, (value) => {
          expect(value).type.toBe<
            | { readonly _tag: "B"; readonly b: number }
            | { readonly _tag: "C"; readonly c: boolean }
          >()
          return Effect.fail(value._tag)
        })

        expect(result).type.toBe<Effect.Effect<string, "B" | "C">>()
      })

      it("should type partial cases with a shared output", () => {
        const schema = Schema.TaggedUnion({
          A: { a: Schema.String },
          B: { b: Schema.Number },
          C: { c: Schema.Boolean }
        })
        const value = hole<Schema.Schema.Type<typeof schema>>()

        const result = schema.matchOrElse<string>(value, {
          A: (value) => {
            expect(value).type.toBe<{ readonly _tag: "A"; readonly a: string }>()
            return value.a
          }
        }, (value) => {
          expect(value).type.toBe<
            | { readonly _tag: "A"; readonly a: string }
            | { readonly _tag: "B"; readonly b: number }
            | { readonly _tag: "C"; readonly c: boolean }
          >()
          return value._tag
        })

        expect(result).type.toBe<string>()
        expect(schema.matchOrElse<string>({ A: () => "A" }, (value) => value._tag)).type.toBe<
          (value: Schema.Schema.Type<typeof schema>) => string
        >()
        expect(schema.matchOrElse).type.not.toBeCallableWith({ D: () => "D" }, () => "fallback")
      })
    })

    describe("TaggedUnion", () => {
      it("should depends on the order of the cases", () => {
        const schema = Schema.TaggedUnion({
          A: { a: Schema.String },
          C: { c: Schema.Boolean },
          B: { b: Schema.FiniteFromString }
        }).annotate({})

        expect(Schema.revealCodec(schema)).type.toBe<
          Schema.Codec<
            | { readonly _tag: "A"; readonly a: string }
            | { readonly _tag: "B"; readonly b: number }
            | { readonly _tag: "C"; readonly c: boolean },
            | { readonly _tag: "A"; readonly a: string }
            | { readonly _tag: "B"; readonly b: string }
            | { readonly _tag: "C"; readonly c: boolean },
            never,
            never
          >
        >()

        // cases
        const { A, B, C } = schema.cases
        expect(B.fields._tag.schema.literal).type.toBe<"B">()
        expect(A.fields._tag.schema.literal).type.toBe<"A">()
        expect(C.fields._tag.schema.literal).type.toBe<"C">()
        expect(A).type.toBe<Schema.TaggedStruct<"A", { readonly a: Schema.String }>>()
        expect(B).type.toBe<Schema.TaggedStruct<"B", { readonly b: Schema.FiniteFromString }>>()
        expect(C).type.toBe<Schema.TaggedStruct<"C", { readonly c: Schema.Boolean }>>()
      })
    })
  })
})
