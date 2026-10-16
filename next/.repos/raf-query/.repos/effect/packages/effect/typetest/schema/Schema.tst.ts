import {
  Brand,
  Context,
  Effect,
  hole,
  Option,
  Predicate,
  Schema,
  type SchemaAST,
  SchemaGetter,
  type SchemaIssue,
  SchemaTransformation,
  Struct,
  Tuple
} from "effect"
import { immerable, produce } from "immer"
import { describe, expect, it } from "tstyche"

type Make<In, Out> = (input: In, options?: Schema.MakeOptions | undefined) => Out
type MakeEffect<In, Out> = (
  input: In,
  options?: Schema.MakeOptions | undefined
) => Effect.Effect<Out, SchemaIssue.Issue>

const revealClass = <Self, S extends Schema.Struct<Schema.Struct.Fields>, Inherited>(
  klass: Schema.Class<Self, S, Inherited>
): Schema.Class<Self, S, Inherited> => klass

describe("Schema", () => {
  it("RedactedFromValue", () => {
    const schema = Schema.RedactedFromValue(Schema.String)
    expect(schema).type.toBe<Schema.RedactedFromValue<Schema.String>>()
    expect(schema.from).type.toBe<Schema.String>()
  })

  describe("variance", () => {
    it("Type", () => {
      const f1 = hole<
        <A extends string, S extends Schema.Codec<A, unknown, unknown>>(schema: S) => S
      >()
      const f2 = hole<
        <S extends Schema.Codec<string, unknown, unknown>>(schema: S) => S
      >()

      const schema = hole<Schema.Codec<"a", number, "ctx">>()

      f1(schema)
      f2(schema)
    })

    it("Encoded", () => {
      const f1 = hole<
        <A extends number, S extends Schema.Codec<unknown, A, unknown>>(schema: S) => S
      >()
      const f2 = hole<
        <S extends Schema.Codec<unknown, number, unknown>>(schema: S) => S
      >()

      const schema = hole<Schema.Codec<string, 1, "ctx">>()

      f1(schema)
      f2(schema)
    })
  })

  describe("type helpers type safety", () => {
    it("Schema", () => {
      function f<S extends Schema.Schema<unknown>>(_s: S) {
        // @ts-expect-error Type 'null' is not assignable to type 'Type<S>'
        const Type: Schema.Schema.Type<S> = null
        return Type
      }
      f(Schema.String)
    })

    it("Codec", () => {
      function f<S extends Schema.Codec<unknown, unknown, unknown, unknown>>(_s: S) {
        // @ts-expect-error Type 'null' is not assignable to type 'Encoded<S>'
        const Encoded: Schema.Codec.Encoded<S> = null
        // @ts-expect-error Type 'null' is not assignable to type 'DecodingServices<S>'
        const DecodingServices: Schema.Codec.DecodingServices<S> = null
        // @ts-expect-error Type 'null' is not assignable to type 'EncodingServices<S>'
        const EncodingServices: Schema.Codec.EncodingServices<S> = null
        return { Encoded, DecodingServices, EncodingServices }
      }
      f(Schema.String)
    })
  })

  describe("makeEffect", () => {
    it("String", () => {
      const schema = Schema.String
      expect(schema.makeEffect).type.toBe<MakeEffect<string, string>>()
    })

    it("refine", () => {
      const schema = Schema.Option(Schema.String).pipe(Schema.refine(Option.isSome))
      expect(schema.makeEffect).type.toBe<MakeEffect<Option.Option<string>, Option.Some<string>>>()
    })

    it("Struct", () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed("default")))
      })
      expect(schema.makeEffect).type.toBe<MakeEffect<{ readonly a?: string }, { readonly a: string }>>()
    })

    it("Class", () => {
      class A extends Schema.Class<A>("A")(Schema.Struct({
        a: Schema.String
      })) {}
      expect(A.makeEffect).type.toBe<MakeEffect<{ readonly a: string }, A>>()
      expect(revealClass(A).makeEffect).type.toBe<MakeEffect<{ readonly a: string }, A>>()
    })
  })

  describe("make", () => {
    it("Never", () => {
      const schema = Schema.Never
      expect(schema.make).type.toBe<Make<never, never>>()
    })

    it("Unknown", () => {
      const schema = Schema.Unknown
      expect(schema.make).type.toBe<Make<unknown, unknown>>()
    })

    it("Any", () => {
      const schema = Schema.Any
      expect(schema.make).type.toBe<Make<any, any>>()
    })

    it("Null", () => {
      const schema = Schema.Null
      expect(schema.make).type.toBe<Make<null, null>>()
    })

    it("Undefined", () => {
      const schema = Schema.Undefined
      expect(schema.make).type.toBe<Make<undefined, undefined>>()
    })

    it("String", () => {
      const schema = Schema.String
      expect(schema.make).type.toBe<Make<string, string>>()
    })

    it("StringForLiteralAutocomplete", () => {
      const schema = Schema.StringForLiteralAutocomplete
      expect(schema).type.toBe<Schema.StringForLiteralAutocomplete>()
      expect(schema.make).type.toBe<Make<string & {}, string & {}>>()
    })

    it("StringForLiteralAutocomplete | Literals", () => {
      const schema = Schema.Union([
        Schema.StringForLiteralAutocomplete,
        Schema.Literals(["GET", "POST"])
      ])
      expect(schema.make).type.toBe<
        Make<"GET" | "POST" | (string & {}), "GET" | "POST" | (string & {})>
      >()
      expect(schema.members[1].literals).type.toBe<readonly ["GET", "POST"]>()
    })

    it("Number", () => {
      const schema = Schema.Number
      expect(schema.make).type.toBe<Make<number, number>>()
    })

    it("check", () => {
      const schema = Schema.String.check(Schema.isMinLength(1))
      expect(schema.make).type.toBe<Make<string, string>>()
    })

    it("brand", () => {
      const schema = Schema.String.pipe(Schema.brand("a"))
      expect(schema.make).type.toBe<Make<string, string & Brand.Brand<"a">>>()
      expect(schema).type.toBe<Schema.brand<Schema.String, "a">>()
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string & Brand.Brand<"a">, string, never, never>>()
    })

    it("refine", () => {
      const schema = Schema.Option(Schema.String).pipe(Schema.refine(Option.isSome))
      expect(schema.make).type.toBe<Make<Option.Option<string>, Option.Some<string>>>()
    })

    describe("Struct", () => {
      it("simple field", () => {
        const schema = Schema.Struct({
          a: Schema.String
        })
        expect(schema.make).type.toBe<Make<{ readonly a: string }, { readonly a: string }>>()
      })

      it("branded field", () => {
        const schema = Schema.Struct({
          a: Schema.String.pipe(Schema.brand("a"))
        })
        expect(schema.make).type.toBe<
          Make<{ readonly a: string & Brand.Brand<"a"> }, { readonly a: string & Brand.Brand<"a"> }>
        >()
      })

      it("refine field", () => {
        const schema = Schema.Struct({
          a: Schema.Option(Schema.String).pipe(Schema.refine(Option.isSome))
        })
        expect(schema.make).type.toBe<
          Make<{ readonly a: Option.Some<string> }, { readonly a: Option.Some<string> }>
        >()
      })

      it("defaulted field", () => {
        const schema = Schema.Struct({
          a: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed("default")))
        })
        expect(schema.make).type.toBe<Make<{ readonly a?: string }, { readonly a: string }>>()
      })

      it("branded defaulted field", () => {
        const schema = Schema.Struct({
          a: Schema.String.pipe(Schema.brand("a"), Schema.withConstructorDefault(Effect.succeed("default")))
        })
        expect(schema.make).type.toBe<
          Make<{ readonly a?: string & Brand.Brand<"a"> }, { readonly a: string & Brand.Brand<"a"> }>
        >()
      })

      it("defaulted branded field", () => {
        const schema = Schema.Struct({
          a: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed("default")), Schema.brand("a"))
        })
        expect(schema.make).type.toBe<
          Make<{ readonly a?: string & Brand.Brand<"a"> }, { readonly a: string & Brand.Brand<"a"> }>
        >()
      })

      it("nested defaulted fields", () => {
        const schema = Schema.Struct({
          a: Schema.Struct({
            b: Schema.Finite.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))
          }).pipe(Schema.withConstructorDefault(Effect.succeed({})))
        })
        expect(schema.make).type.toBe<
          Make<{ readonly a?: { readonly b?: number } }, { readonly a: { readonly b: number } }>
        >()
      })

      it("nested defaulted & branded field", () => {
        const A = Schema.Struct({
          b: Schema.Finite.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))
        }).pipe(Schema.brand("a"))
        const schema = Schema.Struct({
          a: A.pipe(Schema.withConstructorDefault(Effect.succeed(A.make({}))))
        })
        expect(schema.make).type.toBe<
          Make<
            { readonly a?: { readonly b: number } & Brand.Brand<"a"> },
            { readonly a: { readonly b: number } & Brand.Brand<"a"> }
          >
        >()
      })

      it("Class field", () => {
        class A extends Schema.Class<A, { readonly brand: unique symbol }>("A")(Schema.Struct({
          a: Schema.String
        })) {}
        const schema = Schema.Struct({
          a: A
        })
        expect(schema.make).type.toBe<Make<{ readonly a: A }, { readonly a: A }>>()
      })

      it("optional Class field", () => {
        class A extends Schema.Class<A, { readonly brand: unique symbol }>("A")(Schema.Struct({
          a: Schema.String
        })) {}
        const schema = Schema.Struct({
          a: A.pipe(Schema.withConstructorDefault(Effect.succeed(new A({ a: "default" }))))
        })
        expect(schema.make).type.toBe<Make<{ readonly a?: A }, { readonly a: A }>>()
      })
    })

    describe("Tuple", () => {
      it("simple element", () => {
        const schema = Schema.Tuple([Schema.String])
        expect(schema.make).type.toBe<Make<readonly [string], readonly [string]>>()
      })

      it("branded field", () => {
        const schema = Schema.Tuple([Schema.String.pipe(Schema.brand("a"))])
        expect(schema.make).type.toBe<
          Make<readonly [string & Brand.Brand<"a">], readonly [string & Brand.Brand<"a">]>
        >()
      })

      it("defaulted field", () => {
        const schema = Schema.Tuple([
          Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed("default")))
        ])
        expect(schema.make).type.toBe<Make<readonly [string?], readonly [string]>>()
      })

      it("nested defaults (Struct)", () => {
        const schema = Schema.Tuple(
          [
            Schema.Struct({
              b: Schema.FiniteFromString.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))
            }).pipe(Schema.withConstructorDefault(Effect.succeed({})))
          ]
        )
        expect(schema.make).type.toBe<
          Make<readonly [{ readonly b?: number }?], readonly [{ readonly b: number }]>
        >()
      })

      it("nested defaults (Tuple)", () => {
        const schema = Schema.Tuple(
          [
            Schema.Tuple([
              Schema.FiniteFromString.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))
            ]).pipe(Schema.withConstructorDefault(Effect.succeed([] as const)))
          ]
        )
        expect(schema.make).type.toBe<
          Make<readonly [(readonly [number?])?], readonly [readonly [number]]>
        >()
      })
    })

    describe("Class", () => {
      it("make with void input", () => {
        class A extends Schema.Class<A>("A")({}) {}
        expect(A.make).type.toBe<Make<void | {}, A>>()
      })

      it("nested defaulted fields", () => {
        class A extends Schema.Class<A, { readonly brand: unique symbol }>("A")(Schema.Struct({
          a: Schema.Struct({
            b: Schema.Finite.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))
          }).pipe(Schema.withConstructorDefault(Effect.succeed({})))
        })) {}
        expect(A.make).type.toBe<Make<void | { readonly a?: { readonly b?: number } }, A>>()
        const schema = Schema.Struct({
          a: A
        })
        expect(schema.make).type.toBe<Make<{ readonly a: A }, { readonly a: A }>>()
      })
    })

    describe("TaggedClass", () => {
      it("make with void input", () => {
        class A extends Schema.TaggedClass<A>()("A", {}) {}
        expect(A.make).type.toBe<Make<void | { readonly _tag?: "A" }, A>>()
      })
    })

    describe("Error", () => {
      it("make with void input", () => {
        class E extends Schema.Error<E>("E")({}) {}
        expect(E.make).type.toBe<Make<void | {}, E>>()
      })
    })

    describe("TaggedError", () => {
      it("make with void input", () => {
        class E extends Schema.TaggedError<E>()("E", {}) {}
        expect(E.make).type.toBe<Make<void | { readonly _tag?: "E" }, E>>()
      })
    })

    it("toType", () => {
      const schema = Schema.toType(Schema.FiniteFromString)
      expect(schema.make).type.toBe<Make<number, number>>()
    })

    it("toEncoded", () => {
      const schema = Schema.toEncoded(Schema.FiniteFromString)
      expect(schema.make).type.toBe<Make<string, string>>()
    })

    it("flip", () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString
      })
      const flipped = Schema.flip(schema)
      expect(flipped.make).type.toBe<Make<{ readonly a: string }, { readonly a: string }>>()
    })

    it("Array", () => {
      const schema = Schema.Array(Schema.FiniteFromString.pipe(Schema.brand("a")))
      expect(schema.make).type.toBe<
        Make<ReadonlyArray<number & Brand.Brand<"a">>, ReadonlyArray<number & Brand.Brand<"a">>>
      >()
    })

    it("JsonObject", () => {
      const schema = Schema.JsonObject
      expect(schema).type.toBe<Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>>()
    })

    it("NonEmptyArray", () => {
      const schema = Schema.NonEmptyArray(Schema.FiniteFromString.pipe(Schema.brand("a")))
      expect(schema.make).type.toBe<
        Make<
          readonly [number & Brand.Brand<"a">, ...Array<number & Brand.Brand<"a">>],
          readonly [number & Brand.Brand<"a">, ...Array<number & Brand.Brand<"a">>]
        >
      >()
    })

    it("Record", () => {
      const schema = Schema.Record(
        Schema.String.pipe(Schema.brand("k")),
        Schema.FiniteFromString.pipe(Schema.brand("a"))
      )

      expect(schema.make).type.toBe<
        Make<
          { readonly [x: string & Brand.Brand<"k">]: number & Brand.Brand<"a"> },
          { readonly [x: string & Brand.Brand<"k">]: number & Brand.Brand<"a"> }
        >
      >()
    })

    it("StructWithRest", () => {
      const schema = Schema.StructWithRest(
        Schema.Struct({ a: Schema.FiniteFromString.pipe(Schema.brand("a")) }),
        [Schema.Record(Schema.String.pipe(Schema.brand("k")), Schema.FiniteFromString.pipe(Schema.brand("a")))]
      )
      expect(schema.make).type.toBe<
        Make<{
          readonly [x: string & Brand.Brand<"k">]: number & Brand.Brand<"a">
          readonly a: number & Brand.Brand<"a">
        }, {
          readonly [x: string & Brand.Brand<"k">]: number & Brand.Brand<"a">
          readonly a: number & Brand.Brand<"a">
        }>
      >()
    })

    it("TupleWithRest", () => {
      const schema = Schema.TupleWithRest(
        Schema.Tuple([Schema.FiniteFromString.pipe(Schema.brand("a"))]),
        [Schema.FiniteFromString.pipe(Schema.brand("b")), Schema.FiniteFromString.pipe(Schema.brand("c"))]
      )
      expect(schema.make).type.toBe<
        Make<
          readonly [number & Brand.Brand<"a">, ...Array<number & Brand.Brand<"b">>, number & Brand.Brand<"c">],
          readonly [number & Brand.Brand<"a">, ...Array<number & Brand.Brand<"b">>, number & Brand.Brand<"c">]
        >
      >()
    })

    it("Union", () => {
      const schema = Schema.Union([
        Schema.Array(Schema.FiniteFromString.pipe(Schema.brand("a"))),
        Schema.FiniteFromString.pipe(Schema.brand("b"))
      ])
      expect(schema.make).type.toBe<
        Make<
          ReadonlyArray<number & Brand.Brand<"a">> | number & Brand.Brand<"b">,
          ReadonlyArray<number & Brand.Brand<"a">> | number & Brand.Brand<"b">
        >
      >()
    })

    it("Opaque", () => {
      class A extends Schema.Opaque<A>()(
        Schema.Struct({
          b: Schema.FiniteFromString.pipe(Schema.brand("a"), Schema.withConstructorDefault(Effect.succeed(-1)))
        })
      ) {}
      const schema = Schema.Struct({
        a: A
      })

      expect(schema.make).type.toBe<
        Make<{ readonly a: { readonly b?: number & Brand.Brand<"a"> } }, { readonly a: A }>
      >()
    })
  })

  describe("typeCodec", () => {
    it("ast type", () => {
      const schema = Schema.toType(Schema.FiniteFromString)
      expect(schema.ast).type.toBe<SchemaAST.Number>()
    })

    it("revealCodec + annotate", () => {
      const schema = Schema.toType(Schema.FiniteFromString)
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<number, number, never, never>>()
      expect(schema).type.toBe<Schema.toType<Schema.FiniteFromString>>()
      expect(schema.schema).type.toBe<Schema.FiniteFromString>()
      expect(schema.annotate({})).type.toBe<Schema.toType<Schema.FiniteFromString>>()
    })
  })

  describe("encodedCodec", () => {
    it("ast type", () => {
      const schema = Schema.FiniteFromString
      expect(schema.ast).type.toBe<SchemaAST.Number>()
    })

    it("revealCodec + annotate", () => {
      const schema = Schema.toEncoded(Schema.FiniteFromString)
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string, string, never, never>>()
      expect(schema).type.toBe<Schema.toEncoded<Schema.FiniteFromString>>()
      expect(schema.schema).type.toBe<Schema.FiniteFromString>()
      expect(schema.annotate({})).type.toBe<Schema.toEncoded<Schema.FiniteFromString>>()
    })
  })

  describe("toCodecJson", () => {
    it("ast type", () => {
      const schema = Schema.toCodecJson(Schema.FiniteFromString)
      expect(schema.ast).type.toBe<SchemaAST.Number>()
    })

    it("revealCodec + annotate", () => {
      const schema = Schema.toCodecJson(Schema.FiniteFromString)
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<number, Schema.Json, never, never>>()
      expect(schema).type.toBe<Schema.toCodecJson<Schema.FiniteFromString>>()
      expect(schema.schema).type.toBe<Schema.FiniteFromString>()
      expect(schema.annotate({})).type.toBe<Schema.toCodecJson<Schema.FiniteFromString>>()
    })
  })

  describe("toCodecStringTree", () => {
    it("ast type", () => {
      const schema = Schema.toCodecStringTree(Schema.FiniteFromString)
      expect(schema.ast).type.toBe<SchemaAST.Number>()
    })

    it("Array ast type", () => {
      const schema = Schema.toCodecStringTree(Schema.Array(Schema.FiniteFromString))
      expect(schema.ast).type.toBe<SchemaAST.Arrays>()
    })

    it("revealCodec + annotate", () => {
      const schema = Schema.toCodecStringTree(Schema.FiniteFromString)
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<number, Schema.StringTree, never, never>>()
      expect(schema).type.toBe<Schema.toCodecStringTree<Schema.FiniteFromString>>()
      expect(schema.schema).type.toBe<Schema.FiniteFromString>()
      expect(schema.annotate({})).type.toBe<Schema.toCodecStringTree<Schema.FiniteFromString>>()
    })
  })

  describe("toEncoderXml", () => {
    it("returns SchemaIssue.Issue in the error channel", () => {
      const encode = Schema.toEncoderXml(Schema.toCodecStringTree(Schema.FiniteFromString))
      expect(encode).type.toBe<(value: number) => Effect.Effect<string, SchemaIssue.Issue>>()
    })
  })

  describe("toCodecArrayFromSingle", () => {
    it("revealCodec + annotate", () => {
      const stringTree = Schema.toCodecStringTree(Schema.Array(Schema.FiniteFromString))
      const schema = Schema.toCodecArrayFromSingle(stringTree)
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<ReadonlyArray<number>, Schema.StringTree, never, never>
      >()
      expect(schema).type.toBe<Schema.toCodecArrayFromSingle<typeof stringTree>>()
      expect(schema.annotate({})).type.toBe<Schema.toCodecArrayFromSingle<typeof stringTree>>()
    })
  })

  describe("annotateEncoded", () => {
    it("non-transforming schema should return Rebuild", () => {
      const schema = Schema.String.pipe(
        Schema.annotateEncoded({ title: "encoded" })
      )
      expect(schema).type.toBe<Schema.String>()
    })

    it("transforming schema should return Rebuild", () => {
      const schema = Schema.NumberFromString.pipe(
        Schema.annotateEncoded({ title: "encoded" })
      )
      expect(schema).type.toBe<Schema.NumberFromString>()
    })

    it("should constrain annotations to the Encoded type", () => {
      // NumberFromString has Encoded = string, so string annotations are valid
      expect(Schema.annotateEncoded<Schema.NumberFromString>).type.toBeCallableWith(
        { examples: ["a"] }
      )
      // number annotations should not be valid for a string-encoded schema
      expect(Schema.annotateEncoded<Schema.NumberFromString>).type.not.toBeCallableWith(
        { examples: [1] }
      )
    })
  })

  it("annotateKey", () => {
    expect(Schema.String.annotateKey).type.toBeCallableWith(
      { examples: ["a"] }
    )
    expect(Schema.String.annotateKey).type.not.toBeCallableWith(
      { examples: [1] }
    )
    expect(Schema.String.annotateKey).type.toBeCallableWith(
      { default: "a" }
    )
    expect(Schema.String.annotateKey).type.not.toBeCallableWith(
      { default: 1 }
    )
  })

  describe("Never", () => {
    const schema = Schema.Never

    it("ast type", () => {
      expect(schema.ast).type.toBe<SchemaAST.Never>()
    })

    it("revealCodec + annotate", () => {
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<never>>()
      expect(schema).type.toBe<Schema.Never>()
      expect(schema.annotate({})).type.toBe<Schema.Never>()
    })
  })

  describe("Unknown", () => {
    const schema = Schema.Unknown

    it("ast type", () => {
      expect(schema.ast).type.toBe<SchemaAST.Unknown>()
    })

    it("revealCodec + annotate", () => {
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<unknown>>()
      expect(schema).type.toBe<Schema.Unknown>()
      expect(schema.annotate({})).type.toBe<Schema.Unknown>()
    })
  })

  describe("Null", () => {
    const schema = Schema.Null

    it("ast type", () => {
      expect(schema.ast).type.toBe<SchemaAST.Null>()
    })

    it("revealCodec + annotate", () => {
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<null>>()
      expect(schema).type.toBe<Schema.Null>()
      expect(schema.annotate({})).type.toBe<Schema.Null>()
    })
  })

  describe("Undefined", () => {
    const schema = Schema.Undefined

    it("ast type", () => {
      expect(schema.ast).type.toBe<SchemaAST.Undefined>()
    })

    it("revealCodec + annotate", () => {
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<undefined>>()
      expect(schema).type.toBe<Schema.Undefined>()
      expect(schema.annotate({})).type.toBe<Schema.Undefined>()
    })
  })

  describe("String", () => {
    const schema = Schema.String

    it("ast type", () => {
      expect(schema.ast).type.toBe<SchemaAST.String>()
    })

    it("revealCodec + annotate", () => {
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string>>()
      expect(schema).type.toBe<Schema.String>()
      expect(schema.annotate({})).type.toBe<Schema.String>()
    })
  })

  describe("StringForLiteralAutocomplete", () => {
    const schema = Schema.StringForLiteralAutocomplete

    it("ast type", () => {
      expect(schema.ast).type.toBe<SchemaAST.String>()
    })

    it("revealCodec + annotate", () => {
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string & {}>>()
      expect(schema).type.toBe<Schema.StringForLiteralAutocomplete>()
      expect(schema.annotate({})).type.toBe<Schema.StringForLiteralAutocomplete>()
    })

    it("union with Literals", () => {
      const method = Schema.Union([
        Schema.StringForLiteralAutocomplete,
        Schema.Literals(["GET", "POST"])
      ])
      expect(Schema.revealCodec(method)).type.toBe<Schema.Codec<"GET" | "POST" | (string & {})>>()
      expect(method).type.toBe<
        Schema.Union<readonly [Schema.StringForLiteralAutocomplete, Schema.Literals<readonly ["GET", "POST"]>]>
      >()
      expect(method.annotate({})).type.toBe<
        Schema.Union<readonly [Schema.StringForLiteralAutocomplete, Schema.Literals<readonly ["GET", "POST"]>]>
      >()
      expect(method.members[1].literals).type.toBe<readonly ["GET", "POST"]>()
    })
  })

  describe("Number", () => {
    const schema = Schema.Number

    it("ast type", () => {
      expect(schema.ast).type.toBe<SchemaAST.Number>()
    })

    it("revealCodec + annotate", () => {
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<number>>()
      expect(schema).type.toBe<Schema.Number>()
      expect(schema.annotate({})).type.toBe<Schema.Number>()
    })
  })

  describe("Literal", () => {
    it("ast type", () => {
      const schema = Schema.Literal("a")
      expect(schema.ast).type.toBe<SchemaAST.Literal>()
    })

    it("revealCodec + annotate", () => {
      const schema = Schema.Literal("a")
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<"a">>()
      expect(schema).type.toBe<Schema.Literal<"a">>()
      expect(schema.annotate({})).type.toBe<Schema.Literal<"a">>()
    })

    it("transform", () => {
      const schema = Schema.Literal(0).transform("a")
      expect(schema).type.toBe<Schema.decodeTo<Schema.Literal<"a">, Schema.Literal<0>>>()
    })
  })

  it("TemplateLiteral", () => {
    expect(Schema.TemplateLiteral).type.not.toBeCallableWith([Schema.Null])
    expect(Schema.TemplateLiteral).type.not.toBeCallableWith([Schema.Undefined])
    expect(Schema.TemplateLiteral).type.not.toBeCallableWith([Schema.Boolean])
    expect(Schema.TemplateLiteral).type.not.toBeCallableWith([Schema.Date])

    expect(Schema.TemplateLiteral(["a"])["Encoded"])
      .type.toBe<`a`>()
    expect(Schema.TemplateLiteral([Schema.Literal("a")])["Encoded"])
      .type.toBe<`a`>()
    expect(Schema.TemplateLiteral([1])["Encoded"])
      .type.toBe<`1`>()
    expect(Schema.TemplateLiteral([Schema.Literal(1)])["Encoded"])
      .type.toBe<`1`>()
    expect(Schema.TemplateLiteral([Schema.String])["Encoded"])
      .type.toBe<`${string}`>()
    expect(Schema.TemplateLiteral([Schema.Number])["Encoded"])
      .type.toBe<`${number}`>()
    expect(Schema.TemplateLiteral(["a", "b"])["Encoded"])
      .type.toBe<`ab`>()
    expect(Schema.TemplateLiteral([Schema.Literal("a"), Schema.Literal("b")])["Encoded"])
      .type.toBe<`ab`>()
    expect(Schema.TemplateLiteral(["a", Schema.String])["Encoded"])
      .type.toBe<`a${string}`>()
    expect(Schema.TemplateLiteral([Schema.Literal("a"), Schema.String])["Encoded"])
      .type.toBe<`a${string}`>()
    expect(Schema.TemplateLiteral(["a", Schema.Number])["Encoded"])
      .type.toBe<`a${number}`>()
    expect(Schema.TemplateLiteral([Schema.Literal("a"), Schema.Number])["Encoded"])
      .type.toBe<`a${number}`>()
    expect(Schema.TemplateLiteral([Schema.String, "a"])["Encoded"])
      .type.toBe<`${string}a`>()
    expect(Schema.TemplateLiteral([Schema.String, Schema.Literal("a")])["Encoded"])
      .type.toBe<`${string}a`>()
    expect(Schema.TemplateLiteral([Schema.Number, "a"])["Encoded"])
      .type.toBe<`${number}a`>()
    expect(Schema.TemplateLiteral([Schema.Number, Schema.Literal("a")])["Encoded"])
      .type.toBe<`${number}a`>()
    expect(Schema.TemplateLiteral([Schema.String, 0])["Encoded"])
      .type.toBe<`${string}0`>()
    expect(Schema.TemplateLiteral([Schema.String, 1n])["Encoded"])
      .type.toBe<`${string}1`>()
    expect(Schema.TemplateLiteral([Schema.String, Schema.Literals(["a", 0])])["Encoded"])
      .type.toBe<`${string}a` | `${string}0`>()
    expect(Schema.TemplateLiteral([Schema.String, Schema.Literal("/"), Schema.Number])["Encoded"])
      .type.toBe<`${string}/${number}`>()
    const EmailLocaleIDs = Schema.Literals(["welcome_email", "email_heading"])
    const FooterLocaleIDs = Schema.Literals(["footer_title", "footer_sendoff"])
    expect(
      Schema.revealCodec(Schema.TemplateLiteral([
        Schema.Union([EmailLocaleIDs, FooterLocaleIDs]),
        Schema.Literal("_id")
      ]))
    )
      .type.toBe<
      Schema.Codec<
        "welcome_email_id" | "email_heading_id" | "footer_title_id" | "footer_sendoff_id",
        "welcome_email_id" | "email_heading_id" | "footer_title_id" | "footer_sendoff_id",
        never
      >
    >()
    expect(Schema.TemplateLiteral([Schema.Union([EmailLocaleIDs, FooterLocaleIDs]), Schema.Literal("_id")])["Encoded"])
      .type.toBe<
      "welcome_email_id" | "email_heading_id" | "footer_title_id" | "footer_sendoff_id"
    >()
    expect(Schema.TemplateLiteral(["a", Schema.Union([Schema.Number, Schema.String])])["Encoded"])
      .type.toBe<`a${string}` | `a${number}`>()
    expect(Schema.TemplateLiteral(["a", Schema.FiniteFromString])["Encoded"])
      .type.toBe<`a${string}`>()
  })

  it("TemplateLiteralParser", () => {
    expect(Schema.revealCodec(Schema.TemplateLiteralParser(["a"])))
      .type.toBe<Schema.Codec<readonly ["a"], "a">>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.Literal("a")])))
      .type.toBe<Schema.Codec<readonly ["a"], "a">>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([1])))
      .type.toBe<Schema.Codec<readonly [1], "1">>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.Literal(1)])))
      .type.toBe<Schema.Codec<readonly [1], "1">>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.String])))
      .type.toBe<Schema.Codec<readonly [string], string>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.Number])))
      .type.toBe<Schema.Codec<readonly [number], `${number}`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser(["a", "b"])))
      .type.toBe<Schema.Codec<readonly ["a", "b"], "ab">>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.Literal("a"), Schema.Literal("b")])))
      .type.toBe<Schema.Codec<readonly ["a", "b"], "ab">>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser(["a", Schema.String])))
      .type.toBe<Schema.Codec<readonly ["a", string], `a${string}`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.Literal("a"), Schema.String])))
      .type.toBe<Schema.Codec<readonly ["a", string], `a${string}`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser(["a", Schema.Number])))
      .type.toBe<Schema.Codec<readonly ["a", number], `a${number}`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.Literal("a"), Schema.Number])))
      .type.toBe<Schema.Codec<readonly ["a", number], `a${number}`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.String, "a"])))
      .type.toBe<Schema.Codec<readonly [string, "a"], `${string}a`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.String, Schema.Literal("a")])))
      .type.toBe<Schema.Codec<readonly [string, "a"], `${string}a`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.Number, "a"])))
      .type.toBe<Schema.Codec<readonly [number, "a"], `${number}a`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.Number, Schema.Literal("a")])))
      .type.toBe<Schema.Codec<readonly [number, "a"], `${number}a`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.String, 0])))
      .type.toBe<Schema.Codec<readonly [string, 0], `${string}0`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.String, "true"])))
      .type.toBe<Schema.Codec<readonly [string, "true"], `${string}true`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.String, "null"])))
      .type.toBe<Schema.Codec<readonly [string, "null"], `${string}null`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.String, 1n])))
      .type.toBe<Schema.Codec<readonly [string, 1n], `${string}1`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.String, Schema.Literals(["a", 0])])))
      .type.toBe<Schema.Codec<readonly [string, 0 | "a"], `${string}a` | `${string}0`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.String, Schema.Literal("/"), Schema.Number])))
      .type.toBe<Schema.Codec<readonly [string, "/", number], `${string}/${number}`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.String, "/", Schema.Number])))
      .type.toBe<Schema.Codec<readonly [string, "/", number], `${string}/${number}`>>()
    const EmailLocaleIDs = Schema.Literals(["welcome_email", "email_heading"])
    const FooterLocaleIDs = Schema.Literals(["footer_title", "footer_sendoff"])
    expect(
      Schema.revealCodec(
        Schema.TemplateLiteralParser([Schema.Union([EmailLocaleIDs, FooterLocaleIDs]), Schema.Literal("_id")])
      )
    )
      .type.toBe<
      Schema.Codec<
        readonly ["welcome_email" | "email_heading" | "footer_title" | "footer_sendoff", "_id"],
        "welcome_email_id" | "email_heading_id" | "footer_title_id" | "footer_sendoff_id",
        never
      >
    >()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.Union([EmailLocaleIDs, FooterLocaleIDs]), "_id"])))
      .type.toBe<
      Schema.Codec<
        readonly ["welcome_email" | "email_heading" | "footer_title" | "footer_sendoff", "_id"],
        "welcome_email_id" | "email_heading_id" | "footer_title_id" | "footer_sendoff_id",
        never
      >
    >()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.String.pipe(Schema.brand("MyBrand"))])))
      .type.toBe<Schema.Codec<readonly [string & Brand.Brand<"MyBrand">], string>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser([Schema.Number.pipe(Schema.brand("MyBrand"))])))
      .type.toBe<Schema.Codec<readonly [number & Brand.Brand<"MyBrand">], `${number}`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser(["a", Schema.String.pipe(Schema.brand("MyBrand"))])))
      .type.toBe<Schema.Codec<readonly ["a", string & Brand.Brand<"MyBrand">], `a${string}`>>()
    expect(
      Schema.revealCodec(
        Schema.TemplateLiteralParser([Schema.Literal("a"), Schema.String.pipe(Schema.brand("MyBrand"))])
      )
    )
      .type.toBe<Schema.Codec<readonly ["a", string & Brand.Brand<"MyBrand">], `a${string}`>>()
    expect(
      Schema.revealCodec(
        Schema.TemplateLiteralParser([
          Schema.Literal("a").pipe(Schema.brand("L")),
          Schema.String.pipe(Schema.brand("MyBrand"))
        ])
      )
    ).type.toBe<
      Schema.Codec<readonly [("a" & Brand.Brand<"L">), string & Brand.Brand<"MyBrand">], `a${string}`>
    >()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser(["a", Schema.Number.pipe(Schema.brand("MyBrand"))])))
      .type.toBe<Schema.Codec<readonly ["a", number & Brand.Brand<"MyBrand">], `a${number}`>>()
    expect(
      Schema.revealCodec(
        Schema.TemplateLiteralParser([Schema.Literal("a"), Schema.Number.pipe(Schema.brand("MyBrand"))])
      )
    )
      .type.toBe<Schema.Codec<readonly ["a", number & Brand.Brand<"MyBrand">], `a${number}`>>()
    expect(Schema.revealCodec(Schema.TemplateLiteralParser(["a", Schema.Union([Schema.Number, Schema.String])])))
      .type.toBe<Schema.Codec<readonly ["a", string | number], `a${string}` | `a${number}`>>()
  })

  it("TemplateLiteralParser propagates decoding and encoding services separately", () => {
    const first = hole<Schema.Codec<number, string, "DecodeFirst", "EncodeFirst">>()
    const second = hole<Schema.Codec<boolean, 0 | 1, "DecodeSecond", "EncodeSecond">>()
    const schema = Schema.TemplateLiteralParser(["value:", first, ":", second])

    expect(schema.DecodingServices).type.toBe<"DecodeFirst" | "DecodeSecond">()
    expect(schema.EncodingServices).type.toBe<"EncodeFirst" | "EncodeSecond">()
    expect(Schema.decodeEffect(schema)).type.toBe<
      (
        input: `value:${string}:0` | `value:${string}:1`,
        options?: SchemaAST.ParseOptions
      ) => Effect.Effect<readonly ["value:", number, ":", boolean], Schema.SchemaError, "DecodeFirst" | "DecodeSecond">
    >()
    expect(Schema.encodeEffect(schema)(["value:", 1, ":", true])).type.toBe<
      Effect.Effect<`value:${string}:0` | `value:${string}:1`, Schema.SchemaError, "EncodeFirst" | "EncodeSecond">
    >()
  })

  describe("flip", () => {
    it("applying flip twice should return the original schema", () => {
      const schema = Schema.FiniteFromString
      expect(Schema.flip(Schema.flip(schema))).type.toBe<typeof schema>()
    })

    it("decodeTo", () => {
      const schema = Schema.FiniteFromString
      const flipped = Schema.flip(schema)
      expect(flipped).type.toBe<Schema.flip<Schema.decodeTo<Schema.Number, Schema.String>>>()
      expect(flipped.annotate({})).type.toBe<Schema.flip<Schema.decodeTo<Schema.Number, Schema.String>>>()
      expect(Schema.revealCodec(flipped)).type.toBe<Schema.Codec<string, number>>()
      expect(Schema.revealCodec(flipped.annotate({}))).type.toBe<Schema.Codec<string, number>>()
    })

    it("optionalKey", () => {
      const schema = Schema.Struct({
        a: Schema.optionalKey(Schema.FiniteFromString)
      })
      const flipped = Schema.flip(schema)
      expect(Schema.revealCodec(flipped)).type.toBe<Schema.Codec<{ readonly a?: string }, { readonly a?: number }>>()
    })

    it("optional", () => {
      const schema = Schema.Struct({
        a: Schema.optional(Schema.FiniteFromString)
      })
      const flipped = Schema.flip(schema)
      expect(Schema.revealCodec(flipped)).type.toBe<
        Schema.Codec<{ readonly a?: string | undefined }, { readonly a?: number | undefined }>
      >()
    })

    it("Struct & withConstructorDefault", () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed("c")))
      })
      expect(schema.make).type.toBe<
        (input: { readonly a?: string }, options?: Schema.MakeOptions | undefined) => { readonly a: string }
      >()

      const flipped = schema.pipe(Schema.flip)
      expect(flipped.make).type.toBe<
        (input: { readonly a: string }, options?: Schema.MakeOptions | undefined) => { readonly a: string }
      >()
    })
  })

  describe("checks", () => {
    describe("and / annotate", () => {
      it("Filter + Filter", () => {
        const f1 = Schema.isInt()
        const f2 = Schema.isInt()

        expect(f1.and(f2)).type.toBe<SchemaAST.FilterGroup<number>>()
        expect(f1.and(f2).annotate({})).type.toBe<SchemaAST.FilterGroup<number>>()
      })

      it("Filter + FilterGroup", () => {
        const f1 = Schema.isInt()
        const f2 = Schema.isInt32()

        expect(f1.and(f2)).type.toBe<SchemaAST.FilterGroup<number>>()
        expect(f2.and(f1)).type.toBe<SchemaAST.FilterGroup<number>>()
        expect(f1.and(f2).annotate({})).type.toBe<SchemaAST.FilterGroup<number>>()
        expect(f2.and(f1).annotate({})).type.toBe<SchemaAST.FilterGroup<number>>()
      })

      it("FilterGroup + FilterGroup", () => {
        const f1 = Schema.isInt32()
        const f2 = Schema.isInt32()

        expect(f1.and(f2)).type.toBe<SchemaAST.FilterGroup<number>>()
        expect(f2.and(f1)).type.toBe<SchemaAST.FilterGroup<number>>()
        expect(f1.and(f2).annotate({})).type.toBe<SchemaAST.FilterGroup<number>>()
        expect(f2.and(f1).annotate({})).type.toBe<SchemaAST.FilterGroup<number>>()
      })
    })
  })

  describe("refinements", () => {
    describe("refine", () => {
      it("String & isString", () => {
        const schema = Schema.String.pipe(Schema.refine(Predicate.isString))
        expect(Schema.revealCodec(schema)).type.toBe<
          Schema.Codec<string, string, never, never>
        >()
      })

      it("String | Number & isString", () => {
        const schema = Schema.Union([Schema.String, Schema.Number]).pipe(
          Schema.refine(Predicate.isString)
        )
        expect(Schema.revealCodec(schema)).type.toBe<
          Schema.Codec<string, string | number, never, never>
        >()
      })

      it("Option(String) & isSome", () => {
        const schema = Schema.Option(Schema.String).pipe(Schema.refine(Option.isSome))
        expect(Schema.revealCodec(schema)).type.toBe<
          Schema.Codec<Option.Some<string>, Option.Option<string>, never, never>
        >()
        expect(schema).type.toBe<Schema.refine<Option.Some<string>, Schema.Option<Schema.String>>>()
        expect(schema.annotate({})).type.toBe<
          Schema.refine<Option.Some<string>, Schema.Option<Schema.String>>
        >()
      })
    })

    describe("brand", () => {
      it("single brand", () => {
        const schema = Schema.String.pipe(Schema.brand("a"))
        expect(Schema.revealCodec(schema)).type.toBe<
          Schema.Codec<string & Brand.Brand<"a">, string, never, never>
        >()
      })

      it("double brand", () => {
        const schema = Schema.String.pipe(Schema.brand("a"), Schema.brand("b"))

        expect(Schema.revealCodec(schema)).type.toBe<
          Schema.Codec<string & Brand.Brand<"a"> & Brand.Brand<"b">, string, never, never>
        >()
      })
    })
  })

  it("instanceOf", () => {
    class MyError extends Error {
      constructor(message?: string) {
        super(message)
        this.name = "MyError"
        Object.setPrototypeOf(this, MyError.prototype)
      }
    }

    const schema = Schema.instanceOf(MyError)

    expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<MyError, MyError, never, never>>()
    expect(schema).type.toBe<Schema.instanceOf<MyError>>()
    expect(schema.annotate({})).type.toBe<Schema.instanceOf<MyError>>()
    expect(schema.ast).type.toBe<SchemaAST.Declaration>()
    expect(schema.make).type.toBe<
      (input: MyError, options?: Schema.MakeOptions | undefined) => MyError
    >()
  })

  describe("decodeTo", () => {
    it("should allow partial application", () => {
      const f = Schema.decodeTo(Schema.String)
      expect(f).type.toBe<
        <From extends Schema.Constraint>(from: From) => Schema.compose<Schema.String, From>
      >()

      expect(f(Schema.Number)).type.toBe<Schema.compose<Schema.String, Schema.Number>>()
    })
  })

  describe("passthrough", () => {
    it("E = T", () => {
      Schema.String.pipe(
        Schema.decodeTo(
          Schema.NonEmptyString,
          SchemaTransformation.passthrough()
        )
      )
    })

    it("E != T", () => {
      Schema.String.pipe(Schema.decodeTo(
        Schema.Number,
        // @ts-expect-error Argument of type 'Transformation<never, never, never, never>' is not assignable
        SchemaTransformation.passthrough()
      ))

      Schema.String.pipe(
        Schema.decodeTo(
          Schema.Number,
          SchemaTransformation.passthrough({ strict: false })
        )
      )
    })

    it("E extends T", () => {
      Schema.String.pipe(
        Schema.decodeTo(
          Schema.UndefinedOr(Schema.String),
          SchemaTransformation.passthroughSubtype()
        )
      )
    })

    it("T extends E", () => {
      Schema.UndefinedOr(Schema.String).pipe(
        Schema.decodeTo(
          Schema.String,
          SchemaTransformation.passthroughSupertype()
        )
      )
    })
  })

  it("optionalKey", () => {
    {
      const schema = Schema.optionalKey(Schema.String)
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string, string, never>>()
      expect(schema).type.toBe<Schema.optionalKey<Schema.String>>()
      expect(schema.schema).type.toBe<Schema.String>()
      expect(schema.annotate({})).type.toBe<Schema.optionalKey<Schema.String>>()
    }

    {
      const schema = Schema.String.pipe(Schema.optionalKey)
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string, string, never>>()
    }
  })

  it("optional", () => {
    {
      const schema = Schema.optional(Schema.String)
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string | undefined, string | undefined, never>>()
      expect(schema).type.toBe<Schema.optional<Schema.String>>()
      expect(schema.schema).type.toBe<Schema.UndefinedOr<Schema.String>>()
      expect(schema.annotate({})).type.toBe<Schema.optional<Schema.String>>()
    }

    {
      const schema = Schema.String.pipe(Schema.optional)
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string | undefined, string | undefined, never>>()
    }
  })

  it("mutableKey", () => {
    {
      const schema = Schema.mutableKey(Schema.String)
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string, string, never>>()
      expect(schema).type.toBe<Schema.mutableKey<Schema.String>>()
      expect(schema.schema).type.toBe<Schema.String>()
      expect(schema.annotate({})).type.toBe<Schema.mutableKey<Schema.String>>()
    }

    {
      const schema = Schema.String.pipe(Schema.mutableKey)
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string, string, never>>()
    }
  })

  describe("readonlyKey", () => {
    it("should not be callable with a schema without Schema.mutableKey{Key,}", () => {
      expect(Schema.readonlyKey).type.not.toBeCallableWith(Schema.String)
    })

    it("should be callable with a schema with Schema.mutableKey", () => {
      const schema = Schema.readonlyKey(Schema.mutableKey(Schema.String))
      expect(schema).type.toBe<Schema.String>()
    })

    it("top level call", () => {
      {
        const schema = Schema.readonlyKey(Schema.mutableKey(Schema.String))
        expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string, string, never>>()
        expect(schema).type.toBe<Schema.String>()
      }

      {
        const schema = Schema.mutableKey(Schema.String).pipe(Schema.readonlyKey)
        expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string, string, never>>()
        expect(schema).type.toBe<Schema.String>()
      }
    })

    it("mapFields should throw an error if there is a field with no Schema.mutableKey", () => {
      expect(
        Schema.Struct({
          a: Schema.String
        }).mapFields
      ).type.not.toBeCallableWith(Struct.map(Schema.readonlyKey))
    })
  })

  describe("mutable", () => {
    it("should not be callable with a non-array schema", () => {
      expect(Schema.mutable).type.not.toBeCallableWith(Schema.Struct({ a: Schema.Number }))
      expect(Schema.mutable).type.not.toBeCallableWith(Schema.Record(Schema.String, Schema.Number))
    })

    it("mapFields should throw an error if there is a field that is not an array or tuple", () => {
      expect(
        Schema.Struct({
          a: Schema.String
        }).mapFields
      ).type.not.toBeCallableWith(Struct.map(Schema.mutable))
    })
  })

  describe("requiredKey", () => {
    it("should not be callable with a schema without Schema.optional{Key,}", () => {
      expect(Schema.requiredKey).type.not.toBeCallableWith(Schema.String)
    })

    it("should be callable with a schema with Schema.optionalKey", () => {
      const schema = Schema.requiredKey(Schema.optionalKey(Schema.String))
      expect(schema).type.toBe<Schema.String>()
    })

    it("should be callable with a schema with Schema.optional", () => {
      const schema = Schema.requiredKey(Schema.optional(Schema.String))
      expect(schema).type.toBe<Schema.UndefinedOr<Schema.String>>()
    })

    it("top level call", () => {
      {
        const schema = Schema.requiredKey(Schema.optionalKey(Schema.String))
        expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string, string, never>>()
        expect(schema).type.toBe<Schema.String>()
      }

      {
        const schema = Schema.optionalKey(Schema.String).pipe(Schema.requiredKey)
        expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string, string, never>>()
        expect(schema).type.toBe<Schema.String>()
      }
    })

    it("mapFields should throw an error if there is a field with no Schema.optionalKey", () => {
      expect(
        Schema.Struct({
          a: Schema.String
        }).mapFields
      ).type.not.toBeCallableWith(Struct.map(Schema.requiredKey))
    })
  })

  describe("required", () => {
    it("should not be callable with a schema without Schema.optional", () => {
      expect(Schema.required).type.not.toBeCallableWith(Schema.String)
      expect(Schema.required).type.not.toBeCallableWith(Schema.optionalKey(Schema.String))
    })

    it("should be callable with a schema with Schema.optional", () => {
      const schema = Schema.required(Schema.optional(Schema.String))
      expect(schema).type.toBe<Schema.String>()
    })

    it("top level call", () => {
      {
        const schema = Schema.required(Schema.optional(Schema.String))
        expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string, string, never>>()
        expect(schema).type.toBe<Schema.String>()
      }

      {
        const schema = Schema.optional(Schema.String).pipe(Schema.required)
        expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string, string, never>>()
        expect(schema).type.toBe<Schema.String>()
      }
    })

    it("mapFields should throw an error if there is a field with no Schema.optional", () => {
      expect(
        Schema.Struct({
          a: Schema.String
        }).mapFields
      ).type.not.toBeCallableWith(Struct.map(Schema.required))
    })
  })

  describe("Class APIs", () => {
    describe("Class", () => {
      it("Fields argument", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.String
        }) {}

        expect(new A({ a: "a" })).type.toBe<A>()
        expect(A.make({ a: "a" })).type.toBe<A>()
        expect(Schema.revealCodec(A)).type.toBe<Schema.Codec<A, { readonly a: string }>>()
        expect(revealClass(A)).type.toBe<
          Schema.Class<A, Schema.Struct<{ readonly a: Schema.String }>, A>
        >()
        expect(A.fields).type.toBe<{ readonly a: Schema.String }>()
        expect(A.annotate({})).type.toBe<
          Schema.decodeTo<
            Schema.declareConstructor<
              A,
              { readonly a: string },
              readonly [Schema.Struct<{ readonly a: Schema.String }>],
              { readonly a: string }
            >,
            Schema.Struct<{ readonly a: Schema.String }>
          >
        >()
      })

      it("Struct argument", () => {
        class A extends Schema.Class<A>("A")(Schema.Struct({
          a: Schema.String
        })) {}

        expect(new A({ a: "a" })).type.toBe<A>()
        expect(A.make({ a: "a" })).type.toBe<A>()
        expect(Schema.revealCodec(A)).type.toBe<Schema.Codec<A, { readonly a: string }>>()
        expect(revealClass(A)).type.toBe<
          Schema.Class<A, Schema.Struct<{ readonly a: Schema.String }>, A>
        >()
        expect(A.fields).type.toBe<{ readonly a: Schema.String }>()
      })

      it("mapFields", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.String
        }) {}
        const schema = A.mapFields((fields) => ({ ...fields, b: Schema.Number }))
        expect(schema).type.toBe<Schema.Struct<{ readonly a: Schema.String; readonly b: Schema.Number }>>()
      })

      it("should reject non existing props", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.String
        }) {}

        expect(A).type.not.toBeConstructableWith({ a: "a", b: "b" })
        expect(A.make).type.not.toBeCallableWith({ a: "a", b: "b" })
      })

      it("should be compatible with `immer`", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.Struct({ b: Schema.FiniteFromString }).pipe(Schema.optional)
        }) {
          [immerable] = true
        }

        const a = new A({ a: { b: 1 } })

        const modified = produce(a, (draft) => {
          if (draft.a) {
            draft.a.b = 2
          }
        })

        expect(modified).type.toBe<A>()
      })

      it("mutable field", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.String.pipe(Schema.mutableKey)
        }) {}

        expect(Schema.revealCodec(A)).type.toBe<Schema.Codec<A, { a: string }>>()
      })

      it("branded (unique symbol)", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.String
        }) {}
        class B extends Schema.Class<B>("B")({
          a: Schema.String
        }) {}

        const f = (a: A) => a

        f(A.make({ a: "a" }))
        f(B.make({ a: "a" }))

        class ABranded extends Schema.Class<ABranded, { readonly brand: unique symbol }>("ABranded")({
          a: Schema.String
        }) {}
        class BBranded extends Schema.Class<BBranded, { readonly brand: unique symbol }>("BBranded")({
          a: Schema.String
        }) {}

        const fABranded = (a: ABranded) => a

        fABranded(ABranded.make({ a: "a" }))
        expect(fABranded).type.not.toBeCallableWith(BBranded.make({ a: "a" }))

        const fBBranded = (a: BBranded) => a

        fBBranded(BBranded.make({ a: "a" }))
        expect(fBBranded).type.not.toBeCallableWith(ABranded.make({ a: "a" }))
      })

      it("branded (Brand module)", () => {
        class ABranded extends Schema.Class<ABranded, Brand.Brand<"A">>("ABranded")({
          a: Schema.String
        }) {}
        class BBranded extends Schema.Class<BBranded, Brand.Brand<"B">>("BBranded")({
          a: Schema.String
        }) {}

        const fABranded = (a: ABranded) => a

        fABranded(ABranded.make({ a: "a" }))
        expect(fABranded).type.not.toBeCallableWith(BBranded.make({ a: "a" }))

        const fBBranded = (a: BBranded) => a

        fBBranded(BBranded.make({ a: "a" }))
        expect(fBBranded).type.not.toBeCallableWith(ABranded.make({ a: "a" }))
      })

      it("extend & static members", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.String
        }) {
          static readonly aStatic = "value"
        }
        class B extends A.extend<B, typeof A>("B")({
          b: Schema.Number
        }) {}
        expect(B.aStatic).type.toBe<"value">()
      })

      it("extend Struct argument", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.String
        }) {}
        const Extension = Schema.Struct({
          b: Schema.Number
        }).check(Schema.makeFilter((input) => {
          expect(input).type.toBe<{ readonly b: number }>()
          return input.b > 0
        }))
        class B extends A.extend<B>("B")(Extension) {}

        expect(new B({ a: "a", b: 1 })).type.toBe<B>()
        expect(B.make({ a: "a", b: 1 })).type.toBe<B>()
        expect(Schema.revealCodec(B)).type.toBe<Schema.Codec<B, { readonly a: string; readonly b: number }>>()
        expect(B.fields).type.toBe<{ readonly a: Schema.String; readonly b: Schema.Number }>()
      })

      it("extend & branded (unique symbol)", () => {
        class Common extends Schema.Class<Common>("Common")({
          a: Schema.String
        }) {}
        class E1 extends Common.extend<E1, {}, { readonly brand: unique symbol }>("E1")({
          b: Schema.String
        }) {}
        class E2 extends Common.extend<E2, {}, { readonly brand: unique symbol }>("E2")({
          b: Schema.String
        }) {}

        const f1 = (e1: E1) => e1

        f1(E1.make({ a: "a", b: "b" }))
        expect(f1).type.not.toBeCallableWith(E2.make({ a: "a", b: "b" }))

        const f2 = (e2: E2) => e2

        f2(E2.make({ a: "a", b: "b" }))
        expect(f2).type.not.toBeCallableWith(E1.make({ a: "a", b: "b" }))
      })
    })

    describe("TaggedClass", () => {
      it("Fields argument", () => {
        class A extends Schema.TaggedClass<A>()("A", {
          a: Schema.String
        }) {}

        expect(Schema.revealCodec(A)).type.toBe<Schema.Codec<A, { readonly _tag: "A"; readonly a: string }>>()
        expect(revealClass(A)).type.toBe<
          Schema.Class<A, Schema.TaggedStruct<"A", { readonly a: Schema.String }>, A>
        >()
        expect(A.fields).type.toBe<{ readonly _tag: Schema.tag<"A">; readonly a: Schema.String }>()
      })

      it("Struct argument", () => {
        class A extends Schema.TaggedClass<A>()(
          "A",
          Schema.Struct({
            a: Schema.String
          })
        ) {}

        expect(Schema.revealCodec(A)).type.toBe<Schema.Codec<A, { readonly _tag: "A"; readonly a: string }>>()
        expect(revealClass(A)).type.toBe<
          Schema.Class<A, Schema.Struct<{ readonly _tag: Schema.tag<"A">; readonly a: Schema.String }>, A>
        >()
        expect(A.fields).type.toBe<{ readonly _tag: Schema.tag<"A">; readonly a: Schema.String }>()
      })
    })

    describe("Error", () => {
      it("extend Fields", () => {
        class E extends Schema.Error<E>("E")({
          a: Schema.String
        }) {}

        expect(new E({ a: "a" })).type.toBe<E>()
        expect(E.make({ a: "a" })).type.toBe<E>()
        expect(Schema.revealCodec(E)).type.toBe<Schema.Codec<E, { readonly a: string }>>()

        expect(Effect.gen(function*() {
          return yield* new E({ a: "a" })
        })).type.toBe<Effect.Effect<never, E>>()
      })

      it("extend Struct", () => {
        class E extends Schema.Error<E>("E")(Schema.Struct({
          a: Schema.String
        })) {}

        expect(new E({ a: "a" })).type.toBe<E>()
        expect(E.make({ a: "a" })).type.toBe<E>()
        expect(Schema.revealCodec(E)).type.toBe<Schema.Codec<E, { readonly a: string }>>()

        expect(Effect.gen(function*() {
          return yield* new E({ a: "a" })
        })).type.toBe<Effect.Effect<never, E>>()
      })

      it("should reject non existing props", () => {
        class E extends Schema.Error<E>("E")({
          a: Schema.String
        }) {}

        expect(E).type.not.toBeConstructableWith({ a: "a", b: "b" })
        expect(E.make).type.not.toBeCallableWith({ a: "a", b: "b" })
      })

      it("mutable field", () => {
        class E extends Schema.Error<E>("E")({
          a: Schema.String.pipe(Schema.mutableKey)
        }) {}

        expect(Schema.revealCodec(E)).type.toBe<Schema.Codec<E, { a: string }>>()
      })
    })

    describe("MissingSelfGeneric", () => {
      it("Class", () => {
        expect(Schema.Class("A")({})).type.toBe(
          "Missing `Self` generic - use `class Self extends Schema.Class<Self>(...)`"
        )
      })

      it("Base.extend", () => {
        class Base extends Schema.Class<Base>("Base")({}) {}
        expect(Base.extend("A")({})).type.toBe(
          "Missing `Self` generic - use `class Self extends Base.extend<Self>(...)`"
        )
      })

      it("TaggedClass", () => {
        expect(Schema.TaggedClass("A")("A", {})).type.toBe(
          "Missing `Self` generic - use `class Self extends Schema.TaggedClass<Self>(...)`"
        )
      })

      it("Error", () => {
        expect(Schema.Error("A")({})).type.toBe(
          "Missing `Self` generic - use `class Self extends Schema.Error<Self>(...)`"
        )
      })

      it("TaggedError", () => {
        expect(Schema.TaggedError("A")("A", {})).type.toBe(
          "Missing `Self` generic - use `class Self extends Schema.TaggedError<Self>(...)`"
        )
      })
    })
  })

  describe("brand", () => {
    it("brand", () => {
      const schema = Schema.Number.pipe(Schema.brand("MyBrand"))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<number & Brand.Brand<"MyBrand">, number, never, never>
      >()
      expect(schema).type.toBe<Schema.brand<Schema.Number, "MyBrand">>()
      expect(schema.annotate({})).type.toBe<Schema.brand<Schema.Number, "MyBrand">>()
    })

    it("double brand", () => {
      const schema = Schema.Number.pipe(Schema.brand("MyBrand"), Schema.brand("MyBrand2"))
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<number & Brand.Brand<"MyBrand"> & Brand.Brand<"MyBrand2">, number, never, never>
      >()
      expect(schema).type.toBe<
        Schema.brand<Schema.brand<Schema.Number, "MyBrand">, "MyBrand2">
      >()
      expect(schema.annotate({})).type.toBe<
        Schema.brand<Schema.brand<Schema.Number, "MyBrand">, "MyBrand2">
      >()
    })

    it("should require a single concrete identifier", () => {
      const identifier: string = "MyBrand"
      const union = "MyBrand" as "MyBrand" | "OtherBrand"
      const pattern = "brand:MyBrand" as `brand:${string}`

      expect(Schema.brand).type.not.toBeCallableWith(identifier)
      expect(Schema.brand).type.not.toBeCallableWith(union)
      expect(Schema.brand).type.not.toBeCallableWith(pattern)
      expect(Schema.brand<"MyBrand" | "OtherBrand">).type.not.toBeCallableWith("MyBrand")

      const empty = Schema.String.pipe(Schema.brand(""))
      expect(empty).type.toBe<Schema.brand<Schema.String, "">>()

      const flag = Schema.Boolean.pipe(Schema.brand("Flag"))
      expect(Schema.revealCodec(flag)).type.toBe<
        Schema.Codec<boolean & Brand.Brand<"Flag">, boolean, never, never>
      >()
    })
  })

  it("decodeTo as composition", () => {
    const From = Schema.Struct({
      a: Schema.String,
      b: Schema.FiniteFromString
    })

    const To = Schema.Struct({
      a: Schema.FiniteFromString,
      b: Schema.UndefinedOr(Schema.Number)
    })

    const schema = From.pipe(Schema.decodeTo(To))

    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<
        { readonly a: number; readonly b: number | undefined },
        { readonly a: string; readonly b: string },
        never,
        never
      >
    >()
    expect(schema).type.toBe<
      Schema.compose<
        Schema.Struct<
          { readonly a: Schema.FiniteFromString; readonly b: Schema.Union<readonly [Schema.Number, Schema.Undefined]> }
        >,
        Schema.Struct<{ readonly a: Schema.String; readonly b: Schema.FiniteFromString }>
      >
    >()
    expect(schema.annotate({})).type.toBe<
      Schema.compose<
        Schema.Struct<
          { readonly a: Schema.FiniteFromString; readonly b: Schema.Union<readonly [Schema.Number, Schema.Undefined]> }
        >,
        Schema.Struct<{ readonly a: Schema.String; readonly b: Schema.FiniteFromString }>
      >
    >()
  })

  it("encodeTo as composition", () => {
    const From = Schema.Struct({
      a: Schema.String,
      b: Schema.FiniteFromString
    })

    const To = Schema.Struct({
      a: Schema.FiniteFromString,
      b: Schema.UndefinedOr(Schema.Number)
    })

    const schema = To.pipe(Schema.encodeTo(From))

    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<
        { readonly a: number; readonly b: number | undefined },
        { readonly a: string; readonly b: string },
        never,
        never
      >
    >()
    expect(schema).type.toBe<
      Schema.compose<
        Schema.Struct<
          { readonly a: Schema.FiniteFromString; readonly b: Schema.Union<readonly [Schema.Number, Schema.Undefined]> }
        >,
        Schema.Struct<{ readonly a: Schema.String; readonly b: Schema.FiniteFromString }>
      >
    >()
    expect(schema.annotate({})).type.toBe<
      Schema.compose<
        Schema.Struct<
          { readonly a: Schema.FiniteFromString; readonly b: Schema.Union<readonly [Schema.Number, Schema.Undefined]> }
        >,
        Schema.Struct<{ readonly a: Schema.String; readonly b: Schema.FiniteFromString }>
      >
    >()
  })

  describe("withConstructorDefault", () => {
    it("should be possible to access the original schema", () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed("a")))
      })

      expect(schema.fields.a.schema).type.toBe<Schema.String>()
    })

    it("effectful", () => {
      const service = hole<Context.Service<"Tag", "-">>()

      const schema = Schema.String.pipe(Schema.withConstructorDefault(
        Effect.gen(function*() {
          yield* Effect.serviceOption(service)
          return "some-result"
        })
      ))

      expect(schema.make).type.toBe<(input: string, options?: Schema.MakeOptions | undefined) => string>()

      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<string, string, never, never>>()
    })
  })

  describe("encodeKeys", () => {
    it("should rename keys in the encoded form", () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString,
        b: Schema.String
      }).pipe(Schema.encodeKeys({ a: "c" }))

      expect(schema).type.toBe<
        Schema.decodeTo<
          Schema.Struct<{
            readonly a: Schema.FiniteFromString
            readonly b: Schema.String
          }>,
          Schema.Struct<{
            readonly c: Schema.toEncoded<Schema.FiniteFromString>
            readonly b: Schema.toEncoded<Schema.String>
          }>
        >
      >()
    })

    it("should ignore encoded key mappings for missing decoded fields", () => {
      const schema = Schema.Struct({
        a: Schema.String
      }).pipe(Schema.encodeKeys({ a: "c", b: "d" }))

      expect(schema).type.toBe<
        Schema.decodeTo<
          Schema.Struct<{
            readonly a: Schema.String
          }>,
          Schema.Struct<{
            readonly c: Schema.toEncoded<Schema.String>
          }>
        >
      >()
    })

    it("should support symbol keys", () => {
      const decoded = Symbol.for("decoded")
      const encoded = Symbol.for("encoded")

      const source = Schema.Struct({
        [decoded]: Schema.String
      }).pipe(Schema.encodeKeys({ [decoded]: "decoded" }))

      expect(source).type.toBe<
        Schema.decodeTo<
          Schema.Struct<{
            readonly [decoded]: Schema.String
          }>,
          Schema.Struct<{
            readonly decoded: Schema.toEncoded<Schema.String>
          }>
        >
      >()

      const destination = Schema.Struct({
        decoded: Schema.String
      }).pipe(Schema.encodeKeys({ decoded: encoded }))

      expect(destination).type.toBe<
        Schema.decodeTo<
          Schema.Struct<{
            readonly decoded: Schema.String
          }>,
          Schema.Struct<{
            readonly [encoded]: Schema.toEncoded<Schema.String>
          }>
        >
      >()
    })
  })

  it("tag", () => {
    const schema = Schema.tag("A")
    expect(schema).type.toBe<Schema.tag<"A">>()
    expect(schema.schema).type.toBe<Schema.Literal<"A">>()
    expect(schema.schema.literal).type.toBe<"A">()
  })

  it("withDecodingDefaultKey", () => {
    const schema = Schema.Struct({
      a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultKey(Effect.succeed("1")))
    })

    expect(schema).type.toBe<Schema.Struct<{ readonly a: Schema.withDecodingDefaultKey<Schema.FiniteFromString> }>>()
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<{ readonly a: number }, { readonly a?: string }, never, never>
    >()
  })

  it("withDecodingDefault", () => {
    const schema = Schema.Struct({
      a: Schema.FiniteFromString.pipe(Schema.withDecodingDefault(Effect.succeed("1")))
    })

    expect(schema).type.toBe<Schema.Struct<{ readonly a: Schema.withDecodingDefault<Schema.FiniteFromString> }>>()
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<{ readonly a: number }, { readonly a?: string | undefined }, never, never>
    >()
  })

  it("withDecodingDefaultTypeKey", () => {
    const schema = Schema.Struct({
      a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(1)))
    })

    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<{ readonly a: number }, { readonly a?: string }, never, never>
    >()
  })

  it("withDecodingDefaultType", () => {
    const schema = Schema.Struct({
      a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultType(Effect.succeed(1)))
    })

    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<{ readonly a: number }, { readonly a?: string | undefined }, never, never>
    >()
  })

  it("asStandardSchemaV1 should not be callable with a schema with DecodingServices", () => {
    class MagicNumber extends Context.Service<MagicNumber, number>()("MagicNumber") {}
    const DepString = Schema.Number.pipe(Schema.decode({
      decode: SchemaGetter.transformEffect((n) =>
        Effect.gen(function*() {
          const magicNumber = yield* MagicNumber
          return n * magicNumber
        })
      ),
      encode: SchemaGetter.passthrough()
    }))
    expect(Schema.toStandardSchemaV1).type.not.toBeCallableWith(DepString)
  })

  describe("fromBrand", () => {
    it("should not be callable with a schema with wrong type", () => {
      type Int = number & Brand.Brand<"Int">
      const Int = Brand.check<Int>(Schema.isInt())
      expect(Schema.String.pipe).type.not.toBeCallableWith(Schema.fromBrand("Int", Int))
    })

    it("single brand", () => {
      type Int = number & Brand.Brand<"Int">
      const Int = Brand.check<Int>(Schema.isInt())
      const schema = Schema.Number.pipe(Schema.fromBrand("Int", Int))
      expect(schema).type.toBe<Schema.brand<Schema.Number, "Int">>()
    })

    it("should support an explicit type argument", () => {
      type Int = number & Brand.Brand<"Int">
      const Int = Brand.check<Int>(Schema.isInt())
      const schema = Schema.Number.pipe(Schema.fromBrand<Int>("Int", Int))
      expect(schema).type.toBe<Schema.brand<Schema.Number, "Int">>()
    })

    it("should preserve the constructor's enum brand key", () => {
      enum Key {
        X = "X",
        Y = "Y"
      }
      type X = string & Brand.Brand<Key.X>
      const X = Brand.nominal<X>()
      const schema = Schema.String.pipe(Schema.fromBrand(Key.X, X))
      expect(schema).type.toBe<Schema.brand<Schema.String, Key.X>>()
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<X, string>>()
      expect(Schema.fromBrand).type.not.toBeCallableWith("X", X)

      const literal = Schema.String.pipe(Schema.fromBrand(Key.X, Brand.nominal<string & Brand.Brand<"X">>()))
      expect(literal).type.toBe<Schema.brand<Schema.String, "X">>()
    })

    it("should reject multiple brand keys", () => {
      type Int = number & Brand.Brand<"Int">
      const Int = Brand.check<Int>(Schema.isInt())

      type Positive = number & Brand.Brand<"Positive">
      const Positive = Brand.check<Positive>(Schema.isGreaterThan(0))

      const PositiveInt = Brand.all(Int, Positive)

      expect(Schema.fromBrand).type.not.toBeCallableWith("PositiveInt", PositiveInt)
      expect(Schema.fromBrand).type.not.toBeCallableWith("Int", PositiveInt)
    })

    it("should require the constructor brand identifier", () => {
      type Int = number & Brand.Brand<"Int">
      const Int = Brand.check<Int>(Schema.isInt())
      const identifier: string = "Int"
      const union = "Int" as "Int" | "Integer"
      const pattern = "brand:Int" as `brand:${string}`

      expect(Schema.fromBrand).type.not.toBeCallableWith("Integer", Int)
      expect(Schema.fromBrand).type.not.toBeCallableWith(identifier, Int)
      expect(Schema.fromBrand).type.not.toBeCallableWith(union, Int)
      expect(Schema.fromBrand).type.not.toBeCallableWith(pattern, Int)
    })

    it("should reject different brand keys across union members", () => {
      type Input = string & Brand.Brand<"MIDIPortId"> & Brand.Brand<"input">
      type Output = string & Brand.Brand<"MIDIPortId"> & Brand.Brand<"output">
      const InputOrOutput = Brand.nominal<Input | Output>()

      expect(Schema.fromBrand).type.not.toBeCallableWith("MIDIPortId", InputOrOutput)
    })

    it("should require the brand key in every union member", () => {
      type Id = string & Brand.Brand<"Id">
      type Unbranded = number & Brand.Brand<never>
      const IdOrUnbranded = Brand.nominal<Id | Unbranded>()

      expect(Schema.fromBrand).type.not.toBeCallableWith("Id", IdOrUnbranded)
    })

    it("should reject non-concrete constructor brand keys", () => {
      const dynamic = Brand.nominal<string & Brand.Brand<string>>()
      const pattern = Brand.nominal<string & Brand.Brand<`brand:${string}`>>()
      const empty = Brand.nominal<string & Brand.Brand<never>>()
      const impossible = Brand.nominal<never>()
      const unsafe = Brand.nominal<any>()

      expect(Schema.fromBrand).type.not.toBeCallableWith("MyBrand", dynamic)
      expect(Schema.fromBrand).type.not.toBeCallableWith("brand:MyBrand", pattern)
      expect(Schema.fromBrand).type.not.toBeCallableWith("MyBrand", empty)
      expect(Schema.fromBrand).type.not.toBeCallableWith("MyBrand", impossible)
      expect(Schema.fromBrand).type.not.toBeCallableWith("MyBrand", unsafe)
    })

    it("should support a union base with one brand key", () => {
      type Flag = boolean & Brand.Brand<"Flag">
      const Flag = Brand.nominal<Flag>()
      const flag = Schema.Boolean.pipe(Schema.fromBrand("Flag", Flag))
      expect(Schema.revealCodec(flag)).type.toBe<Schema.Codec<Flag, boolean>>()

      type Id = (string | number) & Brand.Brand<"Id">
      const Id = Brand.nominal<Id>()
      const id = Schema.Union([Schema.String, Schema.Number]).pipe(Schema.fromBrand("Id", Id))
      expect(Schema.revealCodec(id)).type.toBe<Schema.Codec<Id, string | number>>()
    })

    it("should compose brands explicitly", () => {
      type Int = number & Brand.Brand<"Int">
      const Int = Brand.check<Int>(Schema.isInt())

      type Positive = number & Brand.Brand<"Positive">
      const Positive = Brand.check<Positive>(Schema.isGreaterThan(0))

      const schema = Schema.Number.pipe(
        Schema.fromBrand("Int", Int),
        Schema.fromBrand("Positive", Positive)
      )
      expect(schema).type.toBe<
        Schema.brand<Schema.brand<Schema.Number, "Int">, "Positive">
      >()
      expect(Schema.revealCodec(schema)).type.toBe<
        Schema.Codec<number & Brand.Brand<"Int"> & Brand.Brand<"Positive">, number>
      >()
    })

    it("should support multiple constructors for the same brand key", () => {
      type Name = string & Brand.Brand<"Name">
      const Name = Brand.all(
        Brand.check<Name>(Schema.isMinLength(1)),
        Brand.check<Name>(Schema.isMaxLength(20))
      )
      const schema = Schema.String.pipe(Schema.fromBrand("Name", Name))
      expect(Schema.revealCodec(schema)).type.toBe<Schema.Codec<Name, string>>()

      const inline = Schema.String.pipe(Schema.fromBrand(
        "Name",
        Brand.all(
          Brand.check<Name>(Schema.isMinLength(1)),
          Brand.check<Name>(Schema.isMaxLength(20))
        )
      ))
      expect(Schema.revealCodec(inline)).type.toBe<Schema.Codec<Name, string>>()
    })
  })

  describe("fieldsAssign", () => {
    it("Struct", () => {
      const schema = Schema.Union([
        Schema.Struct({
          a: Schema.String
        }),
        Schema.Struct({
          b: Schema.Number
        })
      ]).mapMembers(Tuple.map(Schema.fieldsAssign({ c: Schema.Number })))

      expect(schema).type.toBe<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly a: Schema.String
              readonly c: Schema.Number
            }>,
            Schema.Struct<{
              readonly b: Schema.Number
              readonly c: Schema.Number
            }>
          ]
        >
      >()
    })

    it("should throw an error if there is a field that is not a struct", () => {
      expect(
        Schema.Union([
          Schema.String,
          Schema.Number
        ]).mapMembers
      ).type.not.toBeCallableWith(Tuple.map(Schema.fieldsAssign({ c: Schema.Number })))
    })
  })

  describe("class extension", () => {
    it("keeps protocol bases constructor-free", () => {
      const bottomWithoutNew: Schema.BottomWithoutNew<
        string,
        string,
        never,
        never,
        (typeof Schema.String)["ast"],
        Schema.String
      > = Schema.String
      expect(bottomWithoutNew).type.not.toBeAssignableTo<
        abstract new(...args: Array<any>) => unknown
      >()

      const struct = Schema.Struct({ name: Schema.String })
      const bottomLazyWithoutNew: Schema.BottomLazyWithoutNew<
        (typeof struct)["ast"],
        (typeof struct)["Rebuild"]
      > = struct
      expect(bottomLazyWithoutNew).type.not.toBeAssignableTo<
        abstract new(...args: Array<any>) => unknown
      >()
    })

    it("keeps class-compatible bases extendable", () => {
      const bottom: Schema.Bottom<
        string,
        string,
        never,
        never,
        (typeof Schema.String)["ast"],
        Schema.String
      > = Schema.String
      class A extends bottom {}

      const struct = Schema.Struct({ name: Schema.String })
      const bottomLazy: Schema.BottomLazy<
        (typeof struct)["ast"],
        (typeof struct)["Rebuild"]
      > = struct
      class B extends bottomLazy {}

      expect(Schema.revealCodec(A)).type.toBe<Schema.Codec<string>>()
      expect(B).type.toBeAssignableTo<Schema.Top>()
    })

    it("keeps Opaque assignable to Top", () => {
      class A extends Schema.Opaque<A>()(Schema.Struct({ name: Schema.String })) {}

      expect(A).type.toBeAssignableTo<Schema.Top>()
    })

    it("keeps Schema.Class assignable to Top", () => {
      class A extends Schema.Class<A>("A")({ name: Schema.String }) {}

      expect(A).type.toBeAssignableTo<Schema.Top>()
    })

    it("preserves codec parameters", () => {
      interface DecodingService {
        readonly DecodingService: unique symbol
      }
      interface EncodingService {
        readonly EncodingService: unique symbol
      }

      const schema = Schema.FiniteFromString.pipe(
        Schema.middlewareDecoding((effect) =>
          Effect.andThen(
            Effect.context<DecodingService>(),
            effect
          )
        ),
        Schema.middlewareEncoding((effect) =>
          Effect.andThen(
            Effect.context<EncodingService>(),
            effect
          )
        )
      )

      class A extends schema {}

      expect(Schema.revealCodec(A)).type.toBe<
        Schema.Codec<number, string, DecodingService, EncodingService>
      >()
    })

    it("preserves Struct fields", () => {
      class B extends Schema.Struct({ name: Schema.String }) {}

      expect(B.fields).type.toBe<{ readonly name: Schema.String }>()
    })

    it("cannot be constructed", () => {
      class A extends Schema.String {}

      expect(A).type.not.toBeConstructableWith()
      expect(A).type.not.toBeConstructableWith("a")
    })

    it("annotate returns the original schema type", () => {
      class A extends Schema.String {}

      expect(A.annotate({})).type.toBe<Schema.String>()
    })

    it("should support static methods", () => {
      class A extends Schema.FiniteFromString {
        static readonly decodeUnknownSync = Schema.decodeUnknownSync(this)
        static get encodeSync() {
          return Schema.encodeSync(this)
        }
      }

      expect(A.decodeUnknownSync("1")).type.toBe<number>()
      expect(A.encodeSync(1)).type.toBe<string>()
    })
  })

  describe("OptionFrom", () => {
    it("preserves concrete wrapper types", () => {
      const nullOr = Schema.OptionFromNullOr(Schema.FiniteFromString)
      expect(nullOr).type.toBe<Schema.OptionFromNullOr<typeof Schema.FiniteFromString>>()
      expect(nullOr.annotate({})).type.toBe<Schema.OptionFromNullOr<typeof Schema.FiniteFromString>>()

      const undefinedOr = Schema.OptionFromUndefinedOr(Schema.FiniteFromString)
      expect(undefinedOr).type.toBe<Schema.OptionFromUndefinedOr<typeof Schema.FiniteFromString>>()
      expect(undefinedOr.annotate({})).type.toBe<Schema.OptionFromUndefinedOr<typeof Schema.FiniteFromString>>()

      const nullishOr = Schema.OptionFromNullishOr(Schema.FiniteFromString)
      expect(nullishOr).type.toBe<Schema.OptionFromNullishOr<typeof Schema.FiniteFromString>>()
      expect(nullishOr.annotate({})).type.toBe<Schema.OptionFromNullishOr<typeof Schema.FiniteFromString>>()

      const optionalKey = Schema.OptionFromOptionalKey(Schema.FiniteFromString)
      expect(optionalKey).type.toBe<Schema.OptionFromOptionalKey<typeof Schema.FiniteFromString>>()
      expect(optionalKey.annotate({})).type.toBe<Schema.OptionFromOptionalKey<typeof Schema.FiniteFromString>>()

      const optional = Schema.OptionFromOptional(Schema.FiniteFromString)
      expect(optional).type.toBe<Schema.OptionFromOptional<typeof Schema.FiniteFromString>>()
      expect(optional.annotate({})).type.toBe<Schema.OptionFromOptional<typeof Schema.FiniteFromString>>()

      const optionalNullOr = Schema.OptionFromOptionalNullOr(Schema.FiniteFromString)
      expect(optionalNullOr).type.toBe<Schema.OptionFromOptionalNullOr<typeof Schema.FiniteFromString>>()
      expect(optionalNullOr.annotate({})).type.toBe<Schema.OptionFromOptionalNullOr<typeof Schema.FiniteFromString>>()
    })
  })

  describe("Annotations", () => {
    describe("resolveAnnotations", () => {
      it("String", () => {
        const schema = Schema.String
        expect(Schema.resolveAnnotations(schema)).type.toBe<
          Schema.Annotations.Bottom<string, readonly []> | undefined
        >()
      })

      it("URL", () => {
        const schema = Schema.URL
        expect(Schema.resolveAnnotations(schema)).type.toBe<Schema.Annotations.Bottom<URL, readonly []> | undefined>()
      })

      it("Option(string)", () => {
        const schema = Schema.Option(Schema.String)
        expect(Schema.resolveAnnotations(schema)).type.toBe<
          Schema.Annotations.Bottom<Option.Option<string>, readonly [Schema.String]> | undefined
        >()
      })
    })

    describe("resolveAnnotationsKey", () => {
      it("String", () => {
        const schema = Schema.String
        expect(Schema.resolveAnnotationsKey(schema)).type.toBe<Schema.Annotations.Key<string> | undefined>()
      })
    })

    it("URL", () => {
      const schema = Schema.URL
      expect(Schema.resolveAnnotationsKey(schema)).type.toBe<Schema.Annotations.Key<URL> | undefined>()
    })

    it("Option(string)", () => {
      const schema = Schema.Option(Schema.String)
      expect(Schema.resolveAnnotationsKey(schema)).type.toBe<
        Schema.Annotations.Key<Option.Option<string>> | undefined
      >()
    })
  })
})
