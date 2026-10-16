import {
  BigDecimal,
  DateTime,
  Duration,
  Equivalence,
  HashMap,
  Option,
  Redacted,
  Result,
  Schema,
  SchemaGetter
} from "effect"
import { describe, it } from "vitest"
import { assertFalse, assertTrue, strictEqual } from "../utils/assert.ts"

const Modulo2 = Schema.Number.annotate({
  toEquivalence: (): Equivalence.Equivalence<number> => Equivalence.make((a, b) => a % 2 === b % 2)
})

const Modulo3 = Schema.Number.annotate({
  toEquivalence: (): Equivalence.Equivalence<number> => Equivalence.make((a, b) => a % 3 === b % 3)
})

describe("toEquivalence", () => {
  it("Never", () => {
    const equivalence = Schema.toEquivalence(Schema.Never)
    const value = {} as never

    assertTrue(equivalence(value, value))
    assertFalse(equivalence({} as never, {} as never))
  })

  it("String", () => {
    const schema = Schema.String
    const equivalence = Schema.toEquivalence(schema)
    assertTrue(equivalence("a", "a"))
    assertFalse(equivalence("a", "b"))
  })

  describe("Tuple", () => {
    it("should fail on non-array inputs", () => {
      const schema = Schema.Tuple([Schema.String, Schema.Number])
      const equivalence = Schema.toEquivalence(schema)
      assertFalse(equivalence(["a", 1], null as never))
    })

    it("empty", () => {
      const schema = Schema.Tuple([])
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(equivalence([], []))
    })

    it("required elements", () => {
      const schema = Schema.Tuple([Schema.String, Schema.Number])
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(equivalence(["a", 1], ["a", 1]))
      assertFalse(equivalence(["a", 1], ["b", 1]))
    })

    it("optionalKey elements", () => {
      const schema = Schema.Tuple([Schema.String, Schema.optionalKey(Schema.Number)])
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(equivalence(["a", 1], ["a", 1]))
      assertTrue(equivalence(["a"], ["a"]))
      assertFalse(equivalence(["a", 1], ["b", 1]))
      assertFalse(equivalence(["a"], ["b"]))
    })

    it("optional elements", () => {
      const schema = Schema.Tuple([Schema.String, Schema.optional(Schema.Number)])
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(equivalence(["a", 1], ["a", 1]))
      assertTrue(equivalence(["a"], ["a"]))
      assertTrue(equivalence(["a", undefined], ["a", undefined]))
      assertFalse(equivalence(["a", 1], ["b", 1]))
      assertFalse(equivalence(["a"], ["b"]))
      assertFalse(equivalence(["a", undefined], ["b", undefined]))
    })
  })

  it("Array", () => {
    const schema = Schema.Array(Schema.String)
    const equivalence = Schema.toEquivalence(schema)
    assertTrue(equivalence(["a", "b", "c"], ["a", "b", "c"]))
    assertFalse(equivalence(["a", "b", "c"], ["a", "b", "d"]))
    assertFalse(equivalence(["a", "b", "c"], ["a", "b"]))
    assertFalse(equivalence(["a", "b", "c"], ["a", "b", "c", "d"]))
  })

  it("TupleWithRest", () => {
    const schema = Schema.TupleWithRest(Schema.Tuple([Schema.String, Schema.Number]), [Schema.String, Schema.Number])
    const equivalence = Schema.toEquivalence(schema)
    assertTrue(equivalence(["a", 1, 2], ["a", 1, 2]))
    assertTrue(equivalence(["a", 1, "b", 2], ["a", 1, "b", 2]))

    assertFalse(equivalence(["a", 1, 2], ["a", 2, 2]))
    assertFalse(equivalence(["a", 1, 2], ["a", 1, 3]))
    assertFalse(equivalence(["a", 1, "b", 2], ["c", 1, "b", 2]))
    assertFalse(equivalence(["a", 1, "b", 2], ["a", 1, "c", 2]))
    assertFalse(equivalence(["a", 1, "b", 2], ["a", 2, "b", 2]))
    assertFalse(equivalence(["a", 1, "b", 2], ["a", 1, "b", 3]))
  })

  it("TupleWithRest with multiple post-rest elements", () => {
    const schema = Schema.TupleWithRest(Schema.Tuple([Schema.String]), [
      Schema.String,
      Schema.Number,
      Schema.Boolean,
      Schema.String
    ])
    const equivalence = Schema.toEquivalence(schema)
    assertTrue(equivalence(["head", "tail", 1, true, "last"], ["head", "tail", 1, true, "last"]))
    assertFalse(equivalence(["head", "tail", 1, true, "A"], ["head", "tail", 1, true, "B"]))
  })

  describe("rest elements", () => {
    // Pairwise distinct, so a rest element read at the wrong index is observable.
    const Mod = (n: number) =>
      Schema.Number.annotate({
        toEquivalence: (): Equivalence.Equivalence<number> => Equivalence.make((a, b) => a % n === b % n)
      })

    it("one trailing element after the rest element", () => {
      const schema = Schema.TupleWithRest(Schema.Tuple([Mod(2)]), [Mod(3), Mod(5)])
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(equivalence([2, 5], [4, 10]))
      assertFalse(equivalence([2, 5], [4, 7]))
      assertTrue(equivalence([2, 3, 5], [4, 6, 10]))
      assertFalse(equivalence([2, 3, 5], [4, 7, 10]))
      assertFalse(equivalence([2, 3, 5], [4, 6, 7]))
      assertTrue(equivalence([2, 3, 6, 5], [4, 6, 9, 10]))
      assertFalse(equivalence([2, 3, 6, 5], [4, 6, 10, 10]))
    })

    it("multiple trailing elements after the rest element", () => {
      const equivalence = Schema.toEquivalence(
        Schema.TupleWithRest(Schema.Tuple([Mod(2)]), [Mod(3), Mod(5), Mod(7)])
      )
      assertTrue(equivalence([2, 5, 7], [4, 10, 14]))
      assertFalse(equivalence([2, 5, 7], [4, 7, 14]))
      assertFalse(equivalence([2, 5, 7], [4, 10, 9]))
      assertTrue(equivalence([2, 3, 5, 7], [4, 6, 10, 14]))
      assertFalse(equivalence([2, 3, 5, 7], [4, 7, 10, 14]))
    })
  })

  describe("Struct", () => {
    it("should fail on non-record inputs", () => {
      const schema = Schema.Struct({ a: Schema.String })
      const equivalence = Schema.toEquivalence(schema)
      assertFalse(equivalence({ a: "a" }, 1 as never))
    })

    it("empty", () => {
      const schema = Schema.Struct({})
      const equivalence = Schema.toEquivalence(schema)
      const a = {}
      assertTrue(equivalence(a, a))
      assertTrue(equivalence({}, {})) // Now supports structural equality
    })

    it("required fields", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      })
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(equivalence({ a: "a", b: 1 }, { a: "a", b: 1 }))
      assertFalse(equivalence({ a: "a", b: 1 }, { a: "b", b: 1 }))
      assertFalse(equivalence({ a: "a", b: 1 }, { a: "a", b: 2 }))
    })

    it("symbol keys", () => {
      const a = Symbol.for("a")
      const b = Symbol.for("b")
      const schema = Schema.Struct({
        [a]: Schema.String,
        [b]: Schema.Number
      })
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(
        equivalence({ [a]: "a", [b]: 1 }, { [a]: "a", [b]: 1 })
      )
      assertFalse(
        equivalence({ [a]: "a", [b]: 1 }, { [a]: "b", [b]: 1 })
      )
      assertFalse(
        equivalence({ [a]: "a", [b]: 1 }, { [a]: "a", [b]: 2 })
      )
    })

    it("optionalKey fields", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.optionalKey(Schema.Number)
      })
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(equivalence({ a: "a", b: 1 }, { a: "a", b: 1 }))
      assertTrue(equivalence({ a: "a" }, { a: "a" }))
      assertFalse(equivalence({ a: "a" }, { a: "b" }))
      assertFalse(equivalence({ a: "a", b: 1 }, { a: "b", b: 1 }))
      assertFalse(equivalence({ a: "a", b: 1 }, { a: "a", b: 2 }))
    })

    it("optional fields", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.optional(Schema.Number)
      })
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(equivalence({ a: "a", b: 1 }, { a: "a", b: 1 }))
      assertTrue(equivalence({ a: "a" }, { a: "a" }))
      assertTrue(equivalence({ a: "a", b: undefined }, { a: "a", b: undefined }))
      assertFalse(equivalence({ a: "a", b: 1 }, { a: "b", b: 1 }))
      assertFalse(equivalence({ a: "a", b: 1 }, { a: "a", b: 2 }))
      assertFalse(equivalence({ a: "a", b: 1 }, { a: "a", b: undefined }))
      assertFalse(equivalence({ a: "a", b: undefined }, { a: "a", b: 1 }))
    })
  })

  it("Class", () => {
    class A extends Schema.Class<A>("A")({
      value: Schema.String
    }) {}

    const equivalence = Schema.toEquivalence(A)
    const a = new A({ value: "a" })
    const b = new A({ value: "a" })
    ;(b as A & { metadata?: number }).metadata = 1

    assertTrue(equivalence(a, b))
    assertFalse(equivalence(a, new A({ value: "b" })))
  })

  describe("Record", () => {
    it("Record(String, Number)", () => {
      const schema = Schema.Record(Schema.String, Schema.Number)
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(equivalence({ a: 1, b: 2 }, { a: 1, b: 2 }))
      assertFalse(equivalence({ a: 1, b: 2 }, { a: 1, b: 3 }))
      assertFalse(equivalence({ a: 1, b: 2 }, { a: 2, b: 2 }))
      assertFalse(equivalence({ a: 1, b: 2 }, { a: 1, b: 2, c: 3 }))
      assertFalse(equivalence({ a: 1, b: 2, c: 3 }, { a: 1, b: 2 }))
    })

    it("Record(String, UndefinedOr(Number))", () => {
      const schema = Schema.Record(Schema.String, Schema.UndefinedOr(Schema.Number))
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(equivalence({ a: 1, b: undefined }, { a: 1, b: undefined }))
      assertFalse(equivalence({ a: 1, b: undefined }, { a: 1 }))
      assertFalse(equivalence({ a: 1 }, { a: 1, b: undefined }))
    })

    it("Record(String.check, Number) should use the key checks to select keys", () => {
      const schema = Schema.Record(Schema.String.check(Schema.isPattern(/^a/)), Schema.Number)
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(equivalence({ a: 1, b: 1 }, { a: 1, b: 2 }))
      assertFalse(equivalence({ a: 1 }, { a: 2 }))
    })

    it("Record(Symbol, Number)", () => {
      const a = Symbol.for("a")
      const b = Symbol.for("b")
      const c = Symbol.for("c")
      const schema = Schema.Record(Schema.Symbol, Schema.Number)
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(
        equivalence({ [a]: 1, [b]: 2 }, { [a]: 1, [b]: 2 })
      )
      assertFalse(
        equivalence({ [a]: 1, [b]: 2 }, { [a]: 1, [b]: 3 })
      )
      assertFalse(
        equivalence({ [a]: 1, [b]: 2 }, { [a]: 2, [b]: 2 })
      )
      assertFalse(
        equivalence({ [a]: 1, [b]: 2 }, {
          [a]: 1,
          [b]: 2,
          [c]: 3
        })
      )
      assertFalse(
        equivalence({ [a]: 1, [b]: 2, [c]: 3 }, {
          [a]: 1,
          [b]: 2
        })
      )
    })
  })

  describe("suspend", () => {
    it("reuses the compiled recursive body for deeper values", () => {
      interface Tree {
        readonly value: number
        readonly children: ReadonlyArray<Tree>
      }
      let derivations = 0
      const value = Schema.Number.annotate({
        toEquivalence: () => {
          derivations++
          return Equivalence.strictEqual<number>()
        }
      })
      const schema = Schema.Struct({
        value,
        children: Schema.Array(Schema.suspend((): Schema.Codec<Tree> => schema))
      })
      const make = (depth: number, leafValue = 0): Tree => ({
        value: depth === 0 ? leafValue : depth,
        children: depth === 0 ? [] : [make(depth - 1, leafValue)]
      })
      const equivalence = Schema.toEquivalence(schema)

      strictEqual(derivations, 1)
      for (const depth of [1, 8, 32]) {
        assertTrue(equivalence(make(depth), make(depth)))
        assertFalse(equivalence(make(depth), make(depth, -1)))
        strictEqual(derivations, 1)
      }
    })

    it("recursive schema", () => {
      interface A {
        readonly a: string
        readonly as: ReadonlyArray<A>
      }
      const schema = Schema.Struct({
        a: Schema.String,
        as: Schema.Array(Schema.suspend((): Schema.Codec<A> => schema))
      })
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(equivalence({ a: "a", as: [] }, { a: "a", as: [] }))
      assertFalse(equivalence({ a: "a", as: [] }, { a: "b", as: [] }))
      assertFalse(equivalence({ a: "a", as: [{ a: "a", as: [] }] }, { a: "a", as: [] }))
      assertFalse(equivalence({ a: "a", as: [] }, { a: "a", as: [{ a: "a", as: [] }] }))
    })

    it("mutually recursive schemas", () => {
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

      const schema = Operation
      const equivalence = Schema.toEquivalence(schema)
      assertTrue(
        equivalence({
          type: "operation",
          operator: "+",
          left: { type: "expression", value: 1 },
          right: { type: "expression", value: 2 }
        }, {
          type: "operation",
          operator: "+",
          left: { type: "expression", value: 1 },
          right: { type: "expression", value: 2 }
        })
      )
      assertFalse(
        equivalence({
          type: "operation",
          operator: "+",
          left: { type: "expression", value: 1 },
          right: { type: "expression", value: 2 }
        }, {
          type: "operation",
          operator: "+",
          left: { type: "expression", value: 1 },
          right: { type: "expression", value: 3 }
        })
      )
      assertFalse(
        equivalence({
          type: "operation",
          operator: "+",
          left: { type: "expression", value: 1 },
          right: { type: "expression", value: 2 }
        }, {
          type: "operation",
          operator: "-",
          left: { type: "expression", value: 1 },
          right: { type: "expression", value: 2 }
        })
      )
      assertFalse(
        equivalence({
          type: "operation",
          operator: "+",
          left: { type: "expression", value: 1 },
          right: { type: "expression", value: 2 }
        }, {
          type: "operation",
          operator: "+",
          left: { type: "expression", value: 2 },
          right: { type: "expression", value: 2 }
        })
      )
    })
  })

  it("precompiles Union members", () => {
    let derivations = 0
    const member = Schema.Struct({
      tag: Schema.Literal("a"),
      value: Schema.String
    }).pipe(
      Schema.overrideToEquivalence(() => {
        derivations++
        return Equivalence.make((a, b) => a.value === b.value)
      })
    )
    const equivalence = Schema.toEquivalence(Schema.Union([member, Schema.Never]))

    strictEqual(derivations, 1)
    assertTrue(equivalence({ tag: "a", value: "a" }, { tag: "a", value: "a" }))
    assertFalse(equivalence({ tag: "a", value: "a" }, { tag: "a", value: "b" }))
    strictEqual(derivations, 1)
  })

  it("selects transformed Union members on the Type side", () => {
    const Target = Schema.Struct({ value: Schema.String }).pipe(
      Schema.overrideToEquivalence(() => Equivalence.make((a, b) => a.value === b.value))
    )
    const Transformed = Schema.String.pipe(
      Schema.decodeTo(Target, {
        decode: SchemaGetter.transform((s) => ({ value: s })),
        encode: SchemaGetter.transform((a) => a.value)
      })
    )
    const equivalence = Schema.toEquivalence(Schema.Union([Transformed, Schema.Boolean]))

    assertTrue(equivalence({ value: "a" }, { value: "a" }))
    assertFalse(equivalence({ value: "a" }, { value: "b" }))
  })

  it("preserves Union member equivalence annotations", () => {
    const member = Schema.String.pipe(
      Schema.flip,
      Schema.check(Schema.makeFilter(() => true)),
      Schema.flip,
      Schema.overrideToEquivalence(() => Equivalence.make((a, b) => a[0] === b[0]))
    )
    const equivalence = Schema.toEquivalence(Schema.Union([member, Schema.Number]))

    assertTrue(equivalence("ab", "ac"))
    assertFalse(equivalence("ab", "bc"))
  })

  it("Date", () => {
    const schema = Schema.Date
    const equivalence = Schema.toEquivalence(schema)
    assertTrue(equivalence(new Date(0), new Date(0)))
    assertFalse(equivalence(new Date(0), new Date(1)))
  })

  it("URL", () => {
    const schema = Schema.URL
    const equivalence = Schema.toEquivalence(schema)
    assertTrue(equivalence(new URL("https://example.com"), new URL("https://example.com")))
    assertFalse(equivalence(new URL("https://example.com"), new URL("https://example.org")))
  })

  it("RegExp", () => {
    const schema = Schema.RegExp
    const equivalence = Schema.toEquivalence(schema)
    assertTrue(equivalence(new RegExp("a"), new RegExp("a")))
    assertTrue(equivalence(new RegExp("a", "i"), new RegExp("a", "i")))
    assertFalse(equivalence(new RegExp("a"), new RegExp("b")))
    assertFalse(equivalence(new RegExp("a", "i"), new RegExp("a", "g")))
  })

  it("Redacted(String)", () => {
    const schema = Schema.Redacted(Schema.String)
    const equivalence = Schema.toEquivalence(schema)
    assertTrue(equivalence(Redacted.make("a"), Redacted.make("a")))
    assertFalse(equivalence(Redacted.make("a"), Redacted.make("b")))
  })

  it("Option(Modulo2)", () => {
    const schema = Schema.Option(Modulo2)
    const equivalence = Schema.toEquivalence(schema)

    assertTrue(equivalence(Option.none(), Option.none()))
    assertTrue(equivalence(Option.some(0), Option.some(2)))
    assertTrue(equivalence(Option.some(1), Option.some(3)))

    assertFalse(equivalence(Option.none(), Option.some(0)))
    assertFalse(equivalence(Option.some(0), Option.none()))
    assertFalse(equivalence(Option.some(0), Option.some(1)))
  })

  it("Result(Modulo2, Modulo3)", () => {
    const schema = Schema.Result(Modulo2, Modulo3)
    const equivalence = Schema.toEquivalence(schema)

    assertTrue(equivalence(Result.succeed(0), Result.succeed(2)))
    assertTrue(equivalence(Result.succeed(1), Result.succeed(3)))
    assertTrue(equivalence(Result.fail(0), Result.fail(3)))
    assertTrue(equivalence(Result.fail(1), Result.fail(4)))
    assertTrue(equivalence(Result.fail(2), Result.fail(5)))

    assertFalse(equivalence(Result.succeed(0), Result.fail(2)))
    assertFalse(equivalence(Result.fail(0), Result.succeed(3)))
  })

  it("ReadonlySet(Modulo2)", () => {
    const schema = Schema.ReadonlySet(Modulo2)
    const equivalence = Schema.toEquivalence(schema)

    assertTrue(equivalence(new Set(), new Set()))
    assertTrue(equivalence(new Set([0]), new Set([0])))
    assertTrue(equivalence(new Set([0]), new Set([2])))
    assertTrue(equivalence(new Set([0, 1]), new Set([1, 0])))
    assertTrue(equivalence(new Set([0, 1]), new Set([2, 3])))

    assertFalse(equivalence(new Set([0]), new Set([1])))
    assertFalse(equivalence(new Set([0, 1]), new Set([2, 2])))
  })

  it("ReadonlyMap(Modulo2, Modulo3)", () => {
    const schema = Schema.ReadonlyMap(Modulo2, Modulo3)
    const equivalence = Schema.toEquivalence(schema)

    assertTrue(equivalence(new Map(), new Map()))
    assertTrue(equivalence(new Map([[0, 1]]), new Map([[0, 1]])))
    assertTrue(equivalence(new Map([[0, 1]]), new Map([[2, 4]])))
    assertTrue(equivalence(new Map([[0, 1], [1, 2]]), new Map([[0, 1], [1, 2]])))
    assertTrue(equivalence(new Map([[0, 1], [1, 2]]), new Map([[1, 2], [0, 1]])))

    assertFalse(equivalence(new Map([[0, 1]]), new Map([[1, 1]])))
    assertFalse(equivalence(new Map([[0, 1]]), new Map([[0, 2]])))
    assertFalse(equivalence(new Map([[0, 1], [1, 2]]), new Map([[0, 1], [1, 3]])))
    assertFalse(equivalence(new Map([[0, 1], [1, 2]]), new Map([[0, 1], [2, 2]])))
  })

  it("HashMap(Modulo2, Modulo3)", () => {
    const schema = Schema.HashMap(Modulo2, Modulo3)
    const equivalence = Schema.toEquivalence(schema)

    assertTrue(equivalence(HashMap.empty(), HashMap.empty()))
    assertTrue(equivalence(HashMap.make([0, 1]), HashMap.make([0, 1])))
    assertTrue(equivalence(HashMap.make([0, 1]), HashMap.make([2, 4])))
    assertTrue(equivalence(HashMap.make([0, 1], [1, 2]), HashMap.make([0, 1], [1, 2])))
    assertTrue(equivalence(HashMap.make([0, 1], [1, 2]), HashMap.make([1, 2], [0, 1])))

    assertFalse(equivalence(HashMap.make([0, 1]), HashMap.make([1, 1])))
    assertFalse(equivalence(HashMap.make([0, 1]), HashMap.make([0, 2])))
    assertFalse(equivalence(HashMap.make([0, 1], [1, 2]), HashMap.make([0, 1], [1, 3])))
    assertFalse(equivalence(HashMap.make([0, 1], [1, 2]), HashMap.make([0, 1], [2, 2])))
  })

  it("Duration", () => {
    const schema = Schema.Duration
    const equivalence = Schema.toEquivalence(schema)
    assertTrue(equivalence(Duration.millis(1), Duration.millis(1)))
    assertFalse(equivalence(Duration.millis(1), Duration.millis(2)))
    assertTrue(equivalence(Duration.nanos(1n), Duration.nanos(1n)))
    assertTrue(equivalence(Duration.millis(1), Duration.nanos(1_000_000n)))
    assertFalse(equivalence(Duration.nanos(1n), Duration.nanos(2n)))
    assertTrue(equivalence(Duration.infinity, Duration.infinity))
    assertFalse(equivalence(Duration.infinity, Duration.millis(1)))
    assertTrue(equivalence(Duration.negativeInfinity, Duration.negativeInfinity))
    assertFalse(equivalence(Duration.negativeInfinity, Duration.infinity))
  })

  it("BigDecimal", () => {
    const schema = Schema.BigDecimal
    const equivalence = Schema.toEquivalence(schema)
    assertTrue(equivalence(BigDecimal.fromStringUnsafe("1.5"), BigDecimal.fromStringUnsafe("1.50")))
    assertFalse(equivalence(BigDecimal.fromStringUnsafe("1.5"), BigDecimal.fromStringUnsafe("2")))
    assertTrue(equivalence(BigDecimal.fromStringUnsafe("0"), BigDecimal.fromStringUnsafe("0")))
  })

  it("DateTimeUtc", () => {
    const schema = Schema.DateTimeUtc
    const equivalence = Schema.toEquivalence(schema)
    assertTrue(
      equivalence(DateTime.makeUnsafe("2021-01-01T00:00:00.000Z"), DateTime.makeUnsafe("2021-01-01T00:00:00.000Z"))
    )
    assertFalse(
      equivalence(DateTime.makeUnsafe("2021-01-01T00:00:00.000Z"), DateTime.makeUnsafe("2021-01-01T00:00:00.001Z"))
    )
  })

  it("TimeZoneOffset", () => {
    const equivalence = Schema.toEquivalence(Schema.TimeZoneOffset)
    assertTrue(
      equivalence(DateTime.zoneMakeOffset(3 * 60 * 60 * 1000), DateTime.zoneMakeOffset(3 * 60 * 60 * 1000))
    )
    assertFalse(
      equivalence(DateTime.zoneMakeOffset(3 * 60 * 60 * 1000), DateTime.zoneMakeOffset(4 * 60 * 60 * 1000))
    )
  })

  it("TimeZoneNamed", () => {
    const equivalence = Schema.toEquivalence(Schema.TimeZoneNamed)
    assertTrue(
      equivalence(DateTime.zoneMakeNamedUnsafe("Europe/London"), DateTime.zoneMakeNamedUnsafe("Europe/London"))
    )
    assertFalse(
      equivalence(DateTime.zoneMakeNamedUnsafe("Europe/London"), DateTime.zoneMakeNamedUnsafe("America/New_York"))
    )
  })

  it("TimeZone", () => {
    const equivalence = Schema.toEquivalence(Schema.TimeZone)
    assertTrue(
      equivalence(DateTime.zoneMakeOffset(0), DateTime.zoneMakeOffset(0))
    )
    assertFalse(
      equivalence(DateTime.zoneMakeOffset(0), DateTime.zoneMakeOffset(3 * 60 * 60 * 1000))
    )
  })

  it("DateTimeZoned", () => {
    const equivalence = Schema.toEquivalence(Schema.DateTimeZoned)
    const z1 = DateTime.makeZonedUnsafe("2024-01-01T00:00:00.000Z", { timeZone: "Europe/London" })
    const sameInstant = DateTime.makeZonedUnsafe("2024-01-01T00:00:00.000Z", { timeZone: "America/New_York" })
    const z2 = DateTime.makeZonedUnsafe("2024-01-02T00:00:00.000Z", { timeZone: "Europe/London" })
    assertTrue(equivalence(z1, z1))
    assertTrue(equivalence(z1, sameInstant))
    assertFalse(equivalence(z1, z2))
  })

  describe("Annotations", () => {
    describe("overrideToEquivalence", () => {
      it("String", () => {
        const schema = Schema.String.pipe(
          Schema.overrideToEquivalence(() => Equivalence.make((a, b) => a.substring(0, 1) === b.substring(0, 1)))
        )
        const equivalence = Schema.toEquivalence(schema)
        assertTrue(equivalence("ab", "ac"))
      })

      it("String & isMinLength(1)", () => {
        const schema = Schema.String.check(Schema.isMinLength(1)).pipe(
          Schema.overrideToEquivalence(() => Equivalence.make((a, b) => a.substring(0, 1) === b.substring(0, 1)))
        )
        const equivalence = Schema.toEquivalence(schema)
        assertTrue(equivalence("ab", "ac"))
      })

      it("overrides a compiler-owned Declaration", () => {
        const schema = Schema.Option(Schema.Number).pipe(
          Schema.overrideToEquivalence(() => () => true)
        )
        const equivalence = Schema.toEquivalence(schema)
        assertTrue(equivalence(Option.none(), Option.some(1)))
      })
    })
  })
})
