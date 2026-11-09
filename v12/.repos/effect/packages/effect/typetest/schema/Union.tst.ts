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
    describe("toTaggedUnion", () => {
      it("should accept generic member lists", () => {
        type Tagged = Schema.Constraint & { readonly Type: { readonly _tag: PropertyKey } }

        const pipeForm = <const Members extends ReadonlyArray<Tagged>>(members: Members) =>
          Schema.Union(members).pipe(Schema.toTaggedUnion("_tag"))

        const callForm = <const Members extends ReadonlyArray<Tagged>>(members: Members) =>
          Schema.toTaggedUnion("_tag")(Schema.Union(members))

        const A = Schema.TaggedStruct("A", { a: Schema.String })
        const B = Schema.TaggedStruct("B", { b: Schema.Number })
        const piped = pipeForm([A, B])
        const called = callForm([A, B])

        expect(piped).type.toBe<Schema.toTaggedUnion<"_tag", readonly [typeof A, typeof B]>>()
        expect(called).type.toBe<Schema.toTaggedUnion<"_tag", readonly [typeof A, typeof B]>>()
      })

      it("should not be callable if the tag field is invalid", () => {
        const original = Schema.Union([
          Schema.TaggedStruct("A", { a: Schema.String }),
          Schema.TaggedStruct("C", { c: Schema.Boolean }),
          Schema.TaggedStruct("B", { b: Schema.FiniteFromString })
        ])

        expect(original.pipe).type.toBeCallableWith(Schema.toTaggedUnion("_tag"))
        expect(original.pipe).type.not.toBeCallableWith(Schema.toTaggedUnion("a"))

        const schema = original.pipe(Schema.toTaggedUnion("_tag"))

        expect(schema.tag).type.toBe<"_tag">()
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

      it("should collect discriminants for the selected tag", () => {
        const original = Schema.Union([
          Schema.Struct({ _tag: Schema.tag("A"), kind: Schema.tag("shared") }),
          Schema.Struct({ _tag: Schema.tag("B"), kind: Schema.tag("shared") })
        ])

        const schema = original.pipe(Schema.toTaggedUnion("_tag"))
        expect(schema.discriminants).type.toBe<readonly ["A", "B"]>()
      })

      it("should preserve numeric and string discriminants", () => {
        const schema = Schema.Union([
          Schema.Struct({ event: Schema.Literal(1) }),
          Schema.Struct({ event: Schema.Literal("2") })
        ]).pipe(Schema.toTaggedUnion("event"))
        expect(schema.discriminants).type.toBe<readonly [1, "2"]>()
      })

      it("isAnyOf should narrow custom tags", () => {
        const schema = Schema.Union([
          Schema.Struct({ kind: Schema.tag("a"), a: Schema.Number }),
          Schema.Struct({ kind: Schema.tag("b"), b: Schema.String }),
          Schema.Struct({ kind: Schema.tag("c"), c: Schema.Boolean })
        ]).pipe(Schema.toTaggedUnion("kind"))

        expect(schema.tag).type.toBe<"kind">()

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

    describe("matching", () => {
      const schema = Schema.TaggedUnion({
        A: { a: Schema.String },
        B: { b: Schema.Number },
        C: { c: Schema.Boolean }
      })
      const { A, B, C } = schema.cases
      const augmented = Schema.Union([A, B, C]).pipe(Schema.toTaggedUnion("_tag"))
      type Value = typeof schema.Type
      type Remaining = typeof B.Type | typeof C.Type
      type Result = Effect.Effect<"ok", "a" | "b">
      const value = hole<Value>()
      const effects = {
        A: () => Effect.succeed("ok" as const),
        B: () => Effect.fail("a" as const),
        C: () => Effect.fail("b" as const)
      }

      it("match should infer outputs, narrow inputs, and require every case", () => {
        expect(schema.match).type.toBe<typeof augmented.match>()
        expect(schema.match(value, {
          A: (a) => {
            expect(a).type.toBe<typeof A.Type>()
            return a.a
          },
          B: (b) => {
            expect(b).type.toBe<typeof B.Type>()
            return b.b
          },
          C: (c) => {
            expect(c).type.toBe<typeof C.Type>()
            return c.c
          }
        })).type.toBe<string | number | boolean>()
        expect(schema.match({ A: (a) => a.a, B: (b) => b.b, C: (c) => c.c })).type.toBe<
          (value: Value) => string | number | boolean
        >()
        expect(schema.match(value, effects)).type.toBe<Result>()
        expect(schema.match(effects)).type.toBe<(value: Value) => Result>()
        expect(schema.match).type.not.toBeCallableWith(value, { A: () => 1 })
        expect(schema.match).type.not.toBeCallableWith({ A: () => 1 })
      })

      it("matchOrElse should infer outputs and narrow the fallback", () => {
        expect(schema.matchOrElse).type.toBe<typeof augmented.matchOrElse>()
        expect(schema.matchOrElse(value, { A: () => 1 }, () => "b")).type.toBe<number | string>()
        expect(schema.matchOrElse({ A: () => 1 }, () => "b")).type.toBe<(value: Value) => number | string>()
        expect(augmented.matchOrElse<{ A: () => number }, (value: Remaining) => string>(
          value,
          { A: () => 1 },
          (remaining) => remaining._tag
        )).type.toBe<number | string>()
        expect(augmented.matchOrElse<{ A: () => number }, (value: Remaining) => string>(
          { A: () => 1 },
          (remaining) => remaining._tag
        )).type.toBe<(value: Value) => number | string>()
        const partial = { A: effects.A, B: effects.B }
        expect(schema.matchOrElse(value, partial, effects.C)).type.toBe<Result>()
        expect(schema.matchOrElse(partial, effects.C)).type.toBe<(value: Value) => Result>()
        expect(schema.matchOrElse(value, { A: (a) => a.a }, (remaining) => remaining)).type.toBe<string | Remaining>()
        expect(schema.matchOrElse({ A: (a) => a.a }, (remaining) => remaining)).type.toBe<
          (value: Value) => string | Remaining
        >()
        const optional: { A?: (value: typeof A.Type) => Effect.Effect<string> } = {
          A: (a) => Effect.succeed(a.a)
        }
        expect(augmented.matchOrElse(value, optional, (remaining) => Effect.fail(remaining._tag))).type.toBe<
          Effect.Effect<string, "B" | "C">
        >()
      })

      it("matchOrElse should support empty and complete case maps and reject unknown keys", () => {
        expect(schema.matchOrElse(value, {}, (remaining) => remaining)).type.toBe<Value>()
        expect(schema.matchOrElse({}, (remaining) => remaining)).type.toBe<(value: Value) => Value>()
        expect(schema.matchOrElse(value, effects, (remaining) => remaining)).type.toBe<Result>()
        expect(schema.matchOrElse(effects, (remaining) => remaining)).type.toBe<(value: Value) => Result>()
        const extra = { A: () => 1, D: () => 2 }
        expect(schema.matchOrElse).type.not.toBeCallableWith(value, { D: () => 1 }, () => 0)
        expect(schema.matchOrElse).type.not.toBeCallableWith({ D: () => 1 }, () => 0)
        expect(schema.matchOrElse).type.not.toBeCallableWith(value, extra, () => 0)
        expect(schema.matchOrElse).type.not.toBeCallableWith(extra, () => 0)
      })

      it("match should narrow nested members with custom tags and discriminants", () => {
        const c = Symbol.for("C")
        const schema = Schema.Union([
          Schema.Struct({ kind: Schema.Literal(1), a: Schema.String }),
          Schema.Union([
            Schema.Struct({ kind: Schema.Literal("B"), b: Schema.Number }),
            Schema.Struct({ kind: Schema.UniqueSymbol(c), c: Schema.Boolean })
          ])
        ]).pipe(Schema.toTaggedUnion("kind"))
        const value = hole<typeof schema.Type>()
        expect(schema.match(value, { 1: (a) => a.a, B: (b) => b.b, [c]: (c) => c.c })).type.toBe<
          string | number | boolean
        >()
        expect(schema.match({ 1: (a) => a.a, B: (b) => b.b, [c]: (c) => c.c })).type.toBe<
          (value: typeof schema.Type) => string | number | boolean
        >()
      })

      it("matchOrElse should narrow nested members with symbol tags and numeric or symbol case keys", () => {
        const tag = Symbol.for("tag")
        const c = Symbol.for("C")
        const schema = Schema.Union([
          Schema.Struct({ [tag]: Schema.Literal(1), a: Schema.String }),
          Schema.Union([
            Schema.Struct({ [tag]: Schema.Literal("B"), b: Schema.Number }),
            Schema.Struct({ [tag]: Schema.UniqueSymbol(c), c: Schema.Boolean })
          ])
        ]).pipe(Schema.toTaggedUnion(tag))
        const value = hole<typeof schema.Type>()
        type Result = string | boolean | typeof schema.cases.B.Type
        expect(schema.matchOrElse(value, { 1: (a) => a.a, [c]: (c) => c.c }, (b) => b)).type.toBe<Result>()
        expect(schema.matchOrElse({ 1: (a) => a.a, [c]: (c) => c.c }, (b) => b)).type.toBe<
          (value: typeof schema.Type) => Result
        >()
      })
    })

    describe("TaggedUnion", () => {
      it("should depends on the order of the cases", () => {
        const schema = Schema.TaggedUnion({
          A: { a: Schema.String },
          C: { c: Schema.Boolean },
          B: { b: Schema.FiniteFromString }
        }).annotate({})

        expect(schema.tag).type.toBe<"_tag">()

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
