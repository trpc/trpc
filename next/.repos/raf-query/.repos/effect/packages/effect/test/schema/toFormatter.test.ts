import { BigDecimal, DateTime, Duration, HashMap, Option, Redacted, Result, Schema, SchemaGetter } from "effect"
import { describe, it } from "vitest"
import { strictEqual } from "../utils/assert.ts"

describe("toFormatter", () => {
  it("Never", () => {
    const format = Schema.toFormatter(Schema.Never)
    strictEqual(format(1 as never), "never")
  })

  it("Any", () => {
    const format = Schema.toFormatter(Schema.Any)
    strictEqual(format(1), "1")
    strictEqual(format("a"), `"a"`)
    strictEqual(format(true), "true")
    strictEqual(format(false), "false")
    strictEqual(format(null), "null")
    strictEqual(format(undefined), "undefined")
    strictEqual(format({ a: 1 }), `{"a":1}`)
    strictEqual(format([1, 2, 3]), `[1,2,3]`)
  })

  it("Unknown", () => {
    const format = Schema.toFormatter(Schema.Unknown)
    strictEqual(format(1), "1")
    strictEqual(format("a"), `"a"`)
    strictEqual(format(true), "true")
    strictEqual(format(false), "false")
    strictEqual(format(null), "null")
    strictEqual(format(undefined), "undefined")
    strictEqual(format({ a: 1 }), `{"a":1}`)
    strictEqual(format([1, 2, 3]), `[1,2,3]`)
  })

  it("Void", () => {
    const format = Schema.toFormatter(Schema.Void)
    strictEqual(format(undefined), "void")
  })

  it("Null", () => {
    const format = Schema.toFormatter(Schema.Null)
    strictEqual(format(null), "null")
  })

  it("String", () => {
    const format = Schema.toFormatter(Schema.String)
    strictEqual(format("a"), `"a"`)
  })

  it("Number", () => {
    const format = Schema.toFormatter(Schema.Number)
    strictEqual(format(1), "1")
  })

  it("Boolean", () => {
    const format = Schema.toFormatter(Schema.Boolean)
    strictEqual(format(true), "true")
    strictEqual(format(false), "false")
  })

  it("BigInt", () => {
    const format = Schema.toFormatter(Schema.BigInt)
    strictEqual(format(1n), "1n")
  })

  it("Symbol", () => {
    const format = Schema.toFormatter(Schema.Symbol)
    strictEqual(format(Symbol.for("a")), "Symbol(a)")
  })

  it("UniqueSymbol", () => {
    const format = Schema.toFormatter(Schema.UniqueSymbol(Symbol.for("a")))
    strictEqual(format(Symbol.for("a")), "Symbol(a)")
  })

  it("ObjectKeyword", () => {
    const format = Schema.toFormatter(Schema.ObjectKeyword)
    strictEqual(format({}), "{}")
    strictEqual(format({ a: 1 }), `{"a":1}`)
    strictEqual(format([1, 2, 3]), `[1,2,3]`)
  })

  describe("Literal", () => {
    it("string", () => {
      const format = Schema.toFormatter(Schema.Literal("a"))
      strictEqual(format("a"), `"a"`)
    })

    it("number", () => {
      const format = Schema.toFormatter(Schema.Literal(1))
      strictEqual(format(1), "1")
    })

    it("boolean", () => {
      const format = Schema.toFormatter(Schema.Literal(true))
      strictEqual(format(true), "true")
    })

    it("bigint", () => {
      const format = Schema.toFormatter(Schema.Literal(1n))
      strictEqual(format(1n), "1n")
    })
  })

  it("Literals", () => {
    const format = Schema.toFormatter(Schema.Literals(["a", "b", "c"]))
    strictEqual(format("a"), `"a"`)
    strictEqual(format("b"), `"b"`)
    strictEqual(format("c"), `"c"`)
  })

  it("TemplateLiteral", () => {
    const format = Schema.toFormatter(Schema.TemplateLiteral([Schema.Literal("a"), Schema.String]))
    strictEqual(format("a"), `"a"`)
    strictEqual(format("ab"), `"ab"`)
  })

  describe("Enum", () => {
    it("Numeric enum", () => {
      enum Fruits {
        Apple,
        Banana
      }
      const format = Schema.toFormatter(Schema.Enum(Fruits))
      strictEqual(format(Fruits.Apple), "0")
    })

    it("String enum", () => {
      enum Fruits {
        Apple = "apple",
        Banana = "banana",
        Cantaloupe = 0
      }
      const format = Schema.toFormatter(Schema.Enum(Fruits))
      strictEqual(format(Fruits.Apple), `"apple"`)
    })

    it("Const enum", () => {
      const Fruits = {
        Apple: "apple",
        Banana: "banana",
        Cantaloupe: 3
      } as const
      const format = Schema.toFormatter(Schema.Enum(Fruits))
      strictEqual(format(Fruits.Apple), `"apple"`)
    })
  })

  it("Union", () => {
    const format = Schema.toFormatter(Schema.Union([Schema.String, Schema.Number]))
    strictEqual(format("a"), `"a"`)
    strictEqual(format(1), "1")
  })

  it("precompiles Union members", () => {
    let derivations = 0
    const String = Schema.String.pipe(
      Schema.overrideToFormatter(() => {
        derivations++
        return (s) => s.toUpperCase()
      })
    )
    const format = Schema.toFormatter(Schema.Union([String, Schema.Number, Schema.Never]))

    strictEqual(derivations, 1)
    strictEqual(format("a"), "A")
    strictEqual(format("b"), "B")
    strictEqual(derivations, 1)
  })

  it("selects transformed Union members on the Type side", () => {
    const Target = Schema.Struct({ value: Schema.String }).pipe(
      Schema.overrideToFormatter(() => (a) => `formatted:${a.value}`)
    )
    const Transformed = Schema.String.pipe(
      Schema.decodeTo(Target, {
        decode: SchemaGetter.transform((s) => ({ value: s })),
        encode: SchemaGetter.transform((a) => a.value)
      })
    )
    const format = Schema.toFormatter(Schema.Union([Transformed, Schema.Boolean]))

    strictEqual(format({ value: "a" }), "formatted:a")
  })

  it("preserves Union member formatter annotations", () => {
    const member = Schema.String.pipe(
      Schema.flip,
      Schema.check(Schema.makeFilter(() => true)),
      Schema.flip,
      Schema.overrideToFormatter(() => (s) => s.toUpperCase())
    )
    const format = Schema.toFormatter(Schema.Union([member, Schema.Number]))

    strictEqual(format("a"), "A")
  })

  it("preserves Union member encoding metadata for onBefore", () => {
    const member = Schema.String.pipe(
      Schema.decode({
        decode: SchemaGetter.transform((s) => s),
        encode: SchemaGetter.transform((s) => s)
      })
    )
    const format = Schema.toFormatter(Schema.Union([member, Schema.Number]), {
      onBefore: (ast) => ast.encoding ? () => "transformed" : undefined
    })

    strictEqual(format("a"), "transformed")
  })

  describe("Tuple", () => {
    it("empty", () => {
      const format = Schema.toFormatter(Schema.Tuple([]))
      strictEqual(format([]), "[]")
    })

    it("elements", () => {
      const format = Schema.toFormatter(Schema.Tuple([Schema.Option(Schema.String)]))
      strictEqual(format([Option.some("a")]), `[some("a")]`)
      strictEqual(format([Option.none()]), `[none()]`)
    })
  })

  it("Array", () => {
    const format = Schema.toFormatter(Schema.Array(Schema.Option(Schema.String)))
    strictEqual(format([Option.some("a")]), `[some("a")]`)
    strictEqual(format([Option.none()]), `[none()]`)
  })

  it("TupleWithRest", () => {
    const format = Schema.toFormatter(
      Schema.TupleWithRest(Schema.Tuple([Schema.Option(Schema.Boolean)]), [
        Schema.Option(Schema.Number),
        Schema.Option(Schema.String)
      ])
    )
    strictEqual(format([Option.some(true), Option.some(1), Option.some("a")]), `[some(true), some(1), some("a")]`)
    strictEqual(format([Option.none(), Option.none(), Option.some("a")]), `[none(), none(), some("a")]`)
  })

  it("TupleWithRest with multiple post-rest elements", () => {
    const format = Schema.toFormatter(
      Schema.TupleWithRest(Schema.Tuple([Schema.String]), [
        Schema.String,
        Schema.Number,
        Schema.Boolean,
        Schema.String
      ])
    )
    strictEqual(format(["head", "tail", 1, true, "last"]), `["head", "tail", 1, true, "last"]`)
  })

  describe("rest elements", () => {
    // Pairwise distinct, so a rest element read at the wrong index is observable.
    const Tagged = (label: string) =>
      Schema.String.pipe(Schema.overrideToFormatter(() => (s: string) => `${label}:${s}`))
    const A = Tagged("A")
    const B = Tagged("B")
    const C = Tagged("C")

    it("one trailing element after the rest element", () => {
      const format = Schema.toFormatter(Schema.TupleWithRest(Schema.Tuple([A]), [B, C]))
      strictEqual(format(["x", "z"]), `[A:x, C:z]`)
      strictEqual(format(["x", "y", "z"]), `[A:x, B:y, C:z]`)
      strictEqual(format(["x", "y1", "y2", "z"]), `[A:x, B:y1, B:y2, C:z]`)
    })

    it("multiple trailing elements after the rest element", () => {
      const D = Tagged("D")
      const format = Schema.toFormatter(Schema.TupleWithRest(Schema.Tuple([A]), [B, C, D]))
      strictEqual(format(["x", "z", "w"]), `[A:x, C:z, D:w]`)
      strictEqual(format(["x", "y", "z", "w"]), `[A:x, B:y, C:z, D:w]`)
      strictEqual(format(["x", "y1", "y2", "z", "w"]), `[A:x, B:y1, B:y2, C:z, D:w]`)
    })
  })

  describe("Struct", () => {
    it("empty", () => {
      const format = Schema.toFormatter(Schema.Struct({}))
      strictEqual(format({}), "{}")
      strictEqual(format(1), "1")
      strictEqual(format("a"), `"a"`)
      strictEqual(format(true), "true")
      strictEqual(format(false), "false")
      strictEqual(format({ a: 1 }), `{"a":1}`)
      strictEqual(format([1, 2, 3]), `[1,2,3]`)
    })

    it("required fields", () => {
      const format = Schema.toFormatter(Schema.Struct({
        a: Schema.Option(Schema.String)
      }))
      strictEqual(format({ a: Option.some("a") }), `{ "a": some("a") }`)
      strictEqual(format({ a: Option.none() }), `{ "a": none() }`)
    })

    it("required field with undefined", () => {
      const format = Schema.toFormatter(Schema.Struct({
        a: Schema.Option(Schema.UndefinedOr(Schema.String))
      }))
      strictEqual(format({ a: Option.some("a") }), `{ "a": some("a") }`)
      strictEqual(format({ a: Option.some(undefined) }), `{ "a": some(undefined) }`)
      strictEqual(format({ a: Option.none() }), `{ "a": none() }`)
    })

    it("optionalKey field", () => {
      const format = Schema.toFormatter(Schema.Struct({
        a: Schema.optionalKey(Schema.Option(Schema.String))
      }))
      strictEqual(format({ a: Option.some("a") }), `{ "a": some("a") }`)
      strictEqual(format({ a: Option.none() }), `{ "a": none() }`)
      strictEqual(format({}), `{}`)
    })

    it("optional field", () => {
      const format = Schema.toFormatter(Schema.Struct({
        a: Schema.optional(Schema.Option(Schema.String))
      }))
      strictEqual(format({ a: Option.some("a") }), `{ "a": some("a") }`)
      strictEqual(format({ a: Option.none() }), `{ "a": none() }`)
      strictEqual(format({ a: undefined }), `{ "a": undefined }`)
      strictEqual(format({}), `{}`)
    })
  })

  describe("Record", () => {
    it("Record(String, Option(Number))", () => {
      const format = Schema.toFormatter(Schema.Record(Schema.String, Schema.Option(Schema.Number)))
      strictEqual(format({ a: Option.some(1) }), `{ "a": some(1) }`)
      strictEqual(format({ a: Option.none() }), `{ "a": none() }`)
    })

    it("Record(String.check, Option(Number)) should use the key checks to select keys", () => {
      const format = Schema.toFormatter(Schema.Record(
        Schema.String.check(Schema.isPattern(/^a/)),
        Schema.Option(Schema.Number)
      ))
      strictEqual(format({ a: Option.some(1), b: Option.some(2) }), `{ "a": some(1) }`)
    })

    it("Record(Symbol, Option(Number))", () => {
      const format = Schema.toFormatter(Schema.Record(Schema.Symbol, Schema.Option(Schema.Number)))
      strictEqual(format({ [Symbol.for("a")]: Option.some(1) }), `{ Symbol(a): some(1) }`)
      strictEqual(format({ [Symbol.for("a")]: Option.none() }), `{ Symbol(a): none() }`)
    })
  })

  it("StructWithRest", () => {
    const format = Schema.toFormatter(Schema.StructWithRest(
      Schema.Struct({ a: Schema.Number }),
      [Schema.Record(Schema.String, Schema.Number)]
    ))
    strictEqual(format({ a: 1, b: 2 }), `{ "a": 1, "b": 2 }`)
  })

  it("Class", () => {
    class A extends Schema.Class<A>("A")({
      a: Schema.Option(Schema.String)
    }) {}
    const format = Schema.toFormatter(A)
    strictEqual(format({ a: Option.some("a") }), `A({ "a": some("a") })`)
    strictEqual(format({ a: Option.none() }), `A({ "a": none() })`)
  })

  describe("suspend", () => {
    it("compiles a recursive schema once", () => {
      interface Tree {
        readonly a: number
        readonly as: ReadonlyArray<Tree>
      }
      let compiled = 0
      const Tree = Schema.Struct({
        a: Schema.Number.pipe(Schema.overrideToFormatter(() => {
          compiled++
          return String
        })),
        as: Schema.Array(Schema.suspend((): Schema.Codec<Tree> => Tree))
      })
      const format = Schema.toFormatter(Tree)
      strictEqual(
        format({ a: 1, as: [{ a: 2, as: [{ a: 3, as: [] }] }] }),
        `{ "a": 1, "as": [{ "a": 2, "as": [{ "a": 3, "as": [] }] }] }`
      )
      strictEqual(compiled, 1)
    })

    it("Tuple", () => {
      const Rec = Schema.suspend((): Schema.Codec<unknown> => schema)
      const schema = Schema.Tuple([
        Schema.Number,
        Schema.NullOr(Rec)
      ])
      const format = Schema.toFormatter(schema)
      strictEqual(format([1, null]), `[1, null]`)
      strictEqual(format([1, [2, null]]), `[1, [2, null]]`)
    })

    it("Array", () => {
      const Rec = Schema.suspend((): Schema.Codec<unknown> => schema)
      const schema: any = Schema.Array(Schema.Union([Schema.String, Rec]))
      const format = Schema.toFormatter(schema)
      strictEqual(format(["a"]), `["a"]`)
    })

    it("Struct", () => {
      const Rec = Schema.suspend((): Schema.Codec<unknown> => schema)
      const schema = Schema.Struct({
        a: Schema.String,
        as: Schema.Array(Rec)
      })
      const format = Schema.toFormatter(schema)
      strictEqual(
        format({ a: "a", as: [{ a: "b", as: [] }, { a: "c", as: [] }] }),
        `{ "a": "a", "as": [{ "a": "b", "as": [] }, { "a": "c", "as": [] }] }`
      )
    })

    it("Record", () => {
      const Rec = Schema.suspend((): Schema.Codec<unknown> => schema)
      const schema = Schema.Record(Schema.String, Rec)
      const format = Schema.toFormatter(schema)
      strictEqual(format({ a: { a: { a: {} } } }), `{ "a": { "a": { "a": {} } } }`)
    })

    it("optional", () => {
      const Rec = Schema.suspend((): Schema.Codec<unknown> => schema)
      const schema: any = Schema.Struct({
        a: Schema.optional(Rec)
      })
      const format = Schema.toFormatter(schema)
      strictEqual(format({ a: "a" }), `{ "a": "a" }`)
    })

    it("Array + Array", () => {
      const Rec = Schema.suspend((): Schema.Codec<unknown> => schema)
      const schema: any = Schema.Struct({
        a: Schema.Array(Rec),
        b: Schema.Array(Rec)
      })
      const format = Schema.toFormatter(schema)
      strictEqual(
        format({
          a: [{ a: [{ a: [], b: [] }], b: [] }],
          b: [{ a: [], b: [] }]
        }),
        `{ "a": [{ "a": [{ "a": [], "b": [] }], "b": [] }], "b": [{ "a": [], "b": [] }] }`
      )
    })

    it("optional + Array", () => {
      const Rec = Schema.suspend((): Schema.Codec<unknown> => schema)
      const schema: any = Schema.Struct({
        a: Schema.optional(Rec),
        b: Schema.Array(Rec)
      })
      const format = Schema.toFormatter(schema)
      strictEqual(format({ a: "a", b: [{ a: "b", b: [] }] }), `{ "a": "a", "b": [{ "a": "b", "b": [] }] }`)
    })

    it("mutually suspended schemas", () => {
      interface Expression {
        readonly type: "expression"
        readonly value: number | Operation
      }

      interface Operation {
        readonly type: "operation"
        readonly operator: "+" | "-"
        readonly left: Expression
        readonly right: Expression
      }

      const Expression = Schema.Struct({
        type: Schema.Literal("expression"),
        value: Schema.Union([Schema.Finite, Schema.suspend((): Schema.Codec<Operation> => Operation)])
      })

      const Operation = Schema.Struct({
        type: Schema.Literal("operation"),
        operator: Schema.Literals(["+", "-"]),
        left: Expression,
        right: Expression
      })
      const format = Schema.toFormatter(Operation)
      strictEqual(
        format({
          type: "operation",
          operator: "+",
          left: { type: "expression", value: 1 },
          right: { type: "expression", value: 2 }
        }),
        `{ "type": "operation", "operator": "+", "left": { "type": "expression", "value": 1 }, "right": { "type": "expression", "value": 2 } }`
      )
    })

    it("Option", () => {
      const Rec = Schema.suspend((): Schema.Codec<unknown> => schema)
      const schema = Schema.Struct({
        a: Schema.String,
        as: Schema.Option(Rec)
      })
      const format = Schema.toFormatter(schema)
      strictEqual(
        format({ a: "a", as: Option.some({ a: "b", as: Option.none() }) }),
        `{ "a": "a", "as": some({ "a": "b", "as": none() }) }`
      )
    })

    it("ReadonlySet", () => {
      const Rec = Schema.suspend((): Schema.Codec<unknown> => schema)
      const schema = Schema.ReadonlySet(Rec)
      const format = Schema.toFormatter(schema)
      strictEqual(format(new Set()), `ReadonlySet(0) {}`)
      strictEqual(format(new Set([new Set([new Set()])])), `ReadonlySet(1) { ReadonlySet(1) { ReadonlySet(0) {} } }`)
    })

    it("ReadonlyMap", () => {
      const Rec = Schema.suspend((): Schema.Codec<unknown> => schema)
      const schema = Schema.ReadonlyMap(Schema.String, Rec)
      const format = Schema.toFormatter(schema)
      strictEqual(format(new Map()), `ReadonlyMap(0) {}`)
      strictEqual(
        format(new Map([["a", new Map([["b", new Map()]])]])),
        `ReadonlyMap(1) { "a" => ReadonlyMap(1) { "b" => ReadonlyMap(0) {} } }`
      )
    })

    it("HashMap", () => {
      const Rec = Schema.suspend((): Schema.Codec<unknown> => schema)
      const schema = Schema.HashMap(Schema.String, Rec)
      const format = Schema.toFormatter(schema)
      strictEqual(format(HashMap.empty()), `HashMap(0) {}`)
      strictEqual(
        format(HashMap.make(["a", HashMap.make(["b", HashMap.empty()])])),
        `HashMap(1) { "a" => HashMap(1) { "b" => HashMap(0) {} } }`
      )
    })
  })

  it("Date", () => {
    const format = Schema.toFormatter(Schema.Date)
    strictEqual(format(new Date(0)), "1970-01-01T00:00:00.000Z")
  })

  it("URL", () => {
    const format = Schema.toFormatter(Schema.URL)
    strictEqual(format(new URL("https://www.example.com")), "https://www.example.com/")
  })

  it("RegExp", () => {
    const format = Schema.toFormatter(Schema.RegExp)
    strictEqual(format(/a/), `/a/`)
    strictEqual(format(/a/i), `/a/i`)
  })

  it("Option(String)", () => {
    const format = Schema.toFormatter(Schema.Option(Schema.String))
    strictEqual(format(Option.some("a")), `some("a")`)
    strictEqual(format(Option.none()), "none()")
  })

  it("Result(Number, String)", () => {
    const format = Schema.toFormatter(Schema.Result(Schema.Number, Schema.String))
    strictEqual(format(Result.succeed(1)), `success(1)`)
    strictEqual(format(Result.fail("a")), `failure("a")`)
  })

  it("ReadonlyMap(String, Option(Number))", () => {
    const format = Schema.toFormatter(Schema.ReadonlyMap(Schema.String, Schema.Option(Schema.Number)))
    strictEqual(format(new Map([["a", Option.some(1)]])), `ReadonlyMap(1) { "a" => some(1) }`)
    strictEqual(format(new Map([["a", Option.none()]])), `ReadonlyMap(1) { "a" => none() }`)
  })

  it("HashMap(String, Option(Number))", () => {
    const format = Schema.toFormatter(Schema.HashMap(Schema.String, Schema.Option(Schema.Number)))
    strictEqual(format(HashMap.make(["a", Option.some(1)])), `HashMap(1) { "a" => some(1) }`)
    strictEqual(format(HashMap.make(["a", Option.none()])), `HashMap(1) { "a" => none() }`)
  })

  describe("Redacted", () => {
    it("Redacted(String)", () => {
      const format = Schema.toFormatter(Schema.Redacted(Schema.String))
      strictEqual(format(Redacted.make("a")), `<redacted>`)
    })

    it("with label", () => {
      const format = Schema.toFormatter(Schema.Redacted(Schema.String, { label: "password" }))
      strictEqual(format(Redacted.make("a", { label: "password" })), `<redacted:password>`)
    })
  })

  it("Duration", () => {
    const format = Schema.toFormatter(Schema.Duration)
    strictEqual(format(Duration.millis(100)), `100 millis`)
    strictEqual(format(Duration.nanos(1000n)), `1000 nanos`)
    strictEqual(format(Duration.infinity), "Infinity")
    strictEqual(format(Duration.negativeInfinity), "-Infinity")
  })

  it("BigDecimal", () => {
    const format = Schema.toFormatter(Schema.BigDecimal)
    strictEqual(format(BigDecimal.fromStringUnsafe("123.45")), "123.45")
    strictEqual(format(BigDecimal.fromStringUnsafe("-5")), "-5")
    strictEqual(format(BigDecimal.fromStringUnsafe("0")), "0")
  })

  it("DateTimeUtc", () => {
    const format = Schema.toFormatter(Schema.DateTimeUtc)
    strictEqual(format(DateTime.makeUnsafe("2021-01-01T00:00:00.000Z")), "DateTime.Utc(2021-01-01T00:00:00.000Z)")
  })

  it("TimeZoneOffset", () => {
    const format = Schema.toFormatter(Schema.TimeZoneOffset)
    strictEqual(format(DateTime.zoneMakeOffset(3 * 60 * 60 * 1000)), "+03:00")
  })

  it("TimeZoneNamed", () => {
    const format = Schema.toFormatter(Schema.TimeZoneNamed)
    strictEqual(format(DateTime.zoneMakeNamedUnsafe("Europe/London")), "Europe/London")
  })

  it("TimeZone", () => {
    const format = Schema.toFormatter(Schema.TimeZone)
    strictEqual(format(DateTime.zoneMakeOffset(3 * 60 * 60 * 1000)), "+03:00")
    strictEqual(format(DateTime.zoneMakeNamedUnsafe("Europe/London")), "Europe/London")
  })

  it("DateTimeZoned", () => {
    const format = Schema.toFormatter(Schema.DateTimeZoned)
    const zoned = DateTime.makeZonedUnsafe("2024-01-01T00:00:00.000Z", { timeZone: "Europe/London" })
    strictEqual(format(zoned), DateTime.formatIsoZoned(zoned))
  })

  it("custom class", () => {
    class A {
      constructor(readonly a: string) {}
    }
    const schema = Schema.instanceOf(A)
    const format = Schema.toFormatter(schema)
    strictEqual(format(new A("a")), `A({"a":"a"})`)
  })

  it("custom class with a toString() method", () => {
    class A {
      constructor(readonly a: string) {}
      toString() {
        return `A(${this.a})`
      }
    }
    const schema = Schema.instanceOf(A)
    const format = Schema.toFormatter(schema)
    strictEqual(format(new A("a")), `A(a)`)
  })

  describe("Annotations", () => {
    describe("overrideToFormatter", () => {
      it("String", () => {
        const schema = Schema.String.pipe(Schema.overrideToFormatter(() => (s) => s.toUpperCase()))
        const format = Schema.toFormatter(schema)
        strictEqual(format("a"), "A")
      })

      it("String & isMinLength(1)", () => {
        const schema = Schema.String.check(Schema.isMinLength(1)).pipe(
          Schema.overrideToFormatter(() => (s) => s.toUpperCase())
        )
        const format = Schema.toFormatter(schema)
        strictEqual(format("a"), "A")
      })
    })
  })

  it("should allow for ast-level overrides", () => {
    const toFormatter = <S extends Schema.Constraint>(schema: S) =>
      Schema.toFormatter(schema, {
        onBefore: (ast) => {
          if (ast._tag === "Boolean") {
            return (b: boolean) => b ? "True" : "False"
          }
        }
      })
    strictEqual(toFormatter(Schema.Boolean)(true), `True`)
    const schema = Schema.Tuple([Schema.String, Schema.Boolean])
    strictEqual(toFormatter(schema)(["a", true]), `["a", True]`)
  })
})
