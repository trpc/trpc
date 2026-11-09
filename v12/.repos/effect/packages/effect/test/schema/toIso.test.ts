import { Cause, Exit, HashMap, Option, Predicate, Record, Result, Schema, SchemaTransformation } from "effect"
import { describe, it } from "vitest"
import {
  assertNone,
  assertSchemaIssueError,
  assertSome,
  deepStrictEqual,
  strictEqual,
  throws
} from "../utils/assert.ts"

class Value extends Schema.Class<Value, { readonly brand: unique symbol }>("Value")({
  a: Schema.Date
}) {}

function addOne(date: Date): Date {
  const time = date.getTime()
  if (time === -1) {
    return new Date("")
  }
  return new Date(time + 1)
}

function addTwo(date: Date): Date {
  const time = date.getTime()
  return new Date(time + 2)
}

describe("Optic generation", () => {
  it("overrideToCodecIso", () => {
    const schema = Schema.URL.pipe(Schema.overrideToCodecIso(Schema.String, SchemaTransformation.urlFromString))
    const optic = Schema.toIso(schema)
    const modify = optic.modify((s) => s + "test")
    deepStrictEqual(modify(new URL("https://example.com")), new URL("https://example.com/test"))
  })

  describe("toIso", () => {
    describe("Class", () => {
      it("Class", () => {
        class A extends Schema.Class<A>("A")({ value: Value }) {}
        class B extends Schema.Class<B>("B")({ a: A }) {}

        const schema = B
        const optic = Schema.toIso(schema).key("a").key("value").key("a")
        const modify = optic.modify(addOne)

        deepStrictEqual(
          modify(B.make({ a: A.make({ value: Value.make({ a: new Date(0) }) }) })),
          B.make({ a: A.make({ value: Value.make({ a: new Date(1) }) }) })
        )
      })
    })

    it("toType(Class)", () => {
      const schema = Schema.toType(Value)
      const optic = Schema.toIso(schema).key("a")
      const modify = optic.modify(addOne)

      deepStrictEqual(modify(Value.make({ a: new Date(0) })), Value.make({ a: new Date(1) }))
    })

    it("toEncoded(Class)", () => {
      const schema = Schema.toEncoded(Value)
      const optic = Schema.toIso(schema).key("a")
      const modify = optic.modify(addOne)

      deepStrictEqual(modify({ a: new Date(0) }), { a: new Date(1) })
    })

    describe("brand", () => {
      it("Number & isPositive", () => {
        const schema = Schema.Number.check(Schema.isGreaterThan(0)).pipe(Schema.brand("isPositive"))
        const optic = Schema.toIso(schema)
        const modify = optic.modify((n) => schema.make(n - 1))

        strictEqual(modify(schema.make(2)), 1)
        throws(() => modify(schema.make(1)), (error) => {
          assertSchemaIssueError(error, "Expected a value greater than 0")
        })
      })
    })

    it("Tuple", () => {
      const schema = Schema.Tuple([Value, Schema.optionalKey(Value)])
      const optic = Schema.toIso(schema).key("0").key("a")
      const modify = optic.modify(addOne)

      deepStrictEqual(
        modify([Value.make({ a: new Date(0) })]),
        [Value.make({ a: new Date(1) })]
      )
    })

    it("Array", () => {
      const schema = Schema.Array(Value)
      const optic = Schema.toIso(schema)
      const item = Schema.toIsoFocus(Value).key("a")
      const modify = optic.modify((as) => as.map(item.modify(addOne)))

      deepStrictEqual(modify([Value.make({ a: new Date(0) })]), [Value.make({ a: new Date(1) })])
    })

    it("NonEmptyArray", () => {
      const schema = Schema.NonEmptyArray(Value)
      const optic = Schema.toIso(schema)
      const item = Schema.toIsoFocus(Value).key("a")
      const modify = optic.modify(([a, ...rest]) => [item.modify(addOne)(a), ...rest.map(item.modify(addTwo))])

      deepStrictEqual(
        modify([
          Value.make({ a: new Date(0) }),
          Value.make({ a: new Date(1) }),
          Value.make({ a: new Date(2) })
        ]),
        [
          Value.make({ a: new Date(1) }),
          Value.make({ a: new Date(3) }),
          Value.make({ a: new Date(4) })
        ]
      )
    })

    it("TupleWithRest", () => {
      const schema = Schema.TupleWithRest(Schema.Tuple([Value]), [Value])
      const optic = Schema.toIso(schema)
      const item = Schema.toIsoFocus(Value).key("a")
      const modify = optic.modify((
        [value, ...rest]
      ) => [item.modify(addOne)(value), ...rest.map((r) => item.modify(addTwo)(r))])

      deepStrictEqual(
        modify([
          Value.make({ a: new Date(0) }),
          Value.make({ a: new Date(1) }),
          Value.make({ a: new Date(2) })
        ]),
        [
          Value.make({ a: new Date(1) }),
          Value.make({ a: new Date(3) }),
          Value.make({ a: new Date(4) })
        ]
      )
    })

    it("Struct", () => {
      const schema = Schema.Struct({
        value: Value,
        optionalValue: Schema.optionalKey(Value)
      })
      const optic = Schema.toIso(schema).key("value").key("a")
      const modify = optic.modify(addOne)

      deepStrictEqual(
        modify({
          value: Value.make({ a: new Date(0) })
        }),
        {
          value: Value.make({ a: new Date(1) })
        }
      )
      deepStrictEqual(
        modify({
          value: Value.make({ a: new Date(0) }),
          optionalValue: Value.make({ a: new Date(2) })
        }),
        {
          value: Value.make({ a: new Date(1) }),
          optionalValue: Value.make({ a: new Date(2) })
        }
      )
    })

    it("Record", () => {
      const schema = Schema.Record(Schema.String, Value)
      const optic = Schema.toIso(schema)
      const item = Schema.toIsoFocus(Value).key("a")
      const modify = optic.modify((rec) => Record.map(rec, item.modify(addOne)))

      deepStrictEqual(
        modify({
          a: Value.make({ a: new Date(0) }),
          b: Value.make({ a: new Date(1) })
        }),
        {
          a: Value.make({ a: new Date(1) }),
          b: Value.make({ a: new Date(2) })
        }
      )
    })

    it("StructWithRest", () => {
      const schema = Schema.StructWithRest(
        Schema.Struct({ a: Value }),
        [Schema.Record(Schema.String, Value)]
      )
      const optic = Schema.toIso(schema)
      const item = Schema.toIsoFocus(Value).key("a")
      const modify = optic.modify(({ a, ...rest }) => ({
        a: item.modify(addOne)(a),
        ...Record.map(rest, item.modify(addTwo))
      }))

      deepStrictEqual(
        modify({ a: Value.make({ a: new Date(0) }), b: Value.make({ a: new Date(1) }) }),
        { a: Value.make({ a: new Date(1) }), b: Value.make({ a: new Date(3) }) }
      )
    })

    it("Union", () => {
      const schema = Schema.Union([Schema.String, Value])
      const optic = Schema.toIso(schema)
      const item = Schema.toIsoFocus(Value).key("a")
      const modify = optic.modify((x) => Predicate.isString(x) ? x : item.modify(addOne)(x))

      deepStrictEqual(modify("a"), "a")
      deepStrictEqual(modify(Value.make({ a: new Date(0) })), Value.make({ a: new Date(1) }))
    })

    it("suspend", () => {
      interface A {
        readonly a: Value
        readonly as: ReadonlyArray<A>
      }
      interface AIso {
        readonly a: typeof Value["Iso"]
        readonly as: ReadonlyArray<AIso>
      }
      const schema = Schema.Struct({
        a: Value,
        as: Schema.Array(Schema.suspend((): Schema.Optic<A, AIso> => schema))
      })
      const optic = Schema.toIso(schema)
      const item = Schema.toIsoFocus(Value).key("a")
      const f = ({ a, as }: AIso): AIso => ({
        a: item.modify(addOne)(a),
        as: as.map(f)
      })
      const modify = optic.modify(f)

      deepStrictEqual(
        modify({ a: Value.make({ a: new Date(0) }), as: [{ a: Value.make({ a: new Date(1) }), as: [] }] }),
        {
          a: Value.make({ a: new Date(1) }),
          as: [{ a: Value.make({ a: new Date(2) }), as: [] }]
        }
      )
    })

    it("flip(schema)", () => {
      const schema = Schema.flip(Value)
      const optic = Schema.toIso(schema).key("a")
      const modify = optic.modify(addOne)

      deepStrictEqual(modify(Value.make({ a: new Date(0) })), { a: new Date(1) })
    })

    it("flip(flip(schema))", () => {
      const schema = Schema.flip(Schema.flip(Value))
      const optic = Schema.toIso(schema).key("a")
      const modify = optic.modify(addOne)

      deepStrictEqual(modify(Value.make({ a: new Date(0) })), Value.make({ a: new Date(1) }))
    })

    it("Opaque", () => {
      class S extends Schema.Opaque<S>()(Schema.Struct({ a: Schema.Date })) {}
      const schema = S
      const optic = Schema.toIso(schema).key("a")
      const modify = optic.modify(addOne)

      deepStrictEqual(modify({ a: new Date(0) }), { a: new Date(1) })
    })

    it("Option", () => {
      const schema = Schema.Option(Value)
      const optic = Schema.toIso(schema).tag("Some").key("value").key("a")
      const modify = optic.modify(addOne)

      assertSome(
        modify(Option.some(Value.make({ a: new Date(0) }))),
        Value.make({ a: new Date(1) })
      )
      assertNone(modify(Option.none()))
    })

    it("Result", () => {
      const schema = Schema.Result(Value, Value)
      const optic = Schema.toIso(schema).tag("Success").key("success").key("a")
      const modify = optic.modify(addOne)

      deepStrictEqual(
        modify(Result.succeed(Value.make({ a: new Date(0) }))),
        Result.succeed(Value.make({ a: new Date(1) }))
      )
    })

    it("CauseReason", () => {
      const schema = Schema.CauseReason(Value, Schema.Defect())
      const optic = Schema.toIso(schema).tag("Fail").key("error").key("a")
      const modify = optic.modify(addOne)

      deepStrictEqual(
        modify(Cause.makeFailReason(Value.make({ a: new Date(0) }))),
        Cause.makeFailReason(Value.make({ a: new Date(1) }))
      )
    })

    it("Cause", () => {
      const schema = Schema.Cause(Value, Value)
      const optic = Schema.toIso(schema)
      const failure = Schema.toIsoFocus(Schema.CauseReason(Value, Value)).tag("Fail").key("error").key("a")
      const modify = optic.modify((failures) => failures.map(failure.modify(addOne)))

      deepStrictEqual(
        modify(Cause.fail(Value.make({ a: new Date(0) }))),
        Cause.fail(Value.make({ a: new Date(1) }))
      )
    })

    it("Error", () => {
      const schema = Schema.ErrorInstance()
      const optic = Schema.toIso(schema)
      const modify = optic.modify((e) => new Error(e.message + "!"))

      deepStrictEqual(modify(new Error("a")), new Error("a!"))
    })

    it("Exit", () => {
      const schema = Schema.Exit(Value, Schema.ErrorInstance(), Schema.Defect())
      const optic = Schema.toIso(schema).tag("Success").key("value").key("a")
      const modify = optic.modify(addOne)

      deepStrictEqual(
        modify(Exit.succeed(Value.make({ a: new Date(0) }))),
        Exit.succeed(Value.make({ a: new Date(1) }))
      )
    })

    it("ReadonlySet", () => {
      const schema = Schema.ReadonlySet(Value)
      const optic = Schema.toIso(schema)
      const item = Schema.toIsoFocus(Value).key("a")
      const modify = optic.modify((as) => as.map(item.modify(addOne)))

      deepStrictEqual(
        modify(new Set([Value.make({ a: new Date(0) })])),
        new Set([Value.make({ a: new Date(1) })])
      )
    })

    it("ReadonlyMap", () => {
      const schema = Schema.ReadonlyMap(Schema.String, Value)
      const optic = Schema.toIso(schema)
      const entry = Schema.toIsoFocus(Schema.Tuple([Schema.String, Value])).key("1").key("a")
      const modify = optic.modify((entries) => entries.map(([key, value]) => entry.modify(addOne)([key, value])))

      deepStrictEqual(
        modify(new Map([["a", Value.make({ a: new Date(0) })]])),
        new Map([["a", Value.make({ a: new Date(1) })]])
      )
    })

    it("HashMap", () => {
      const schema = Schema.HashMap(Schema.String, Value)
      const optic = Schema.toIso(schema)
      const entry = Schema.toIsoFocus(Schema.Tuple([Schema.String, Value])).key("1").key("a")
      const modify = optic.modify((entries) => entries.map(([key, value]) => entry.modify(addOne)([key, value])))

      deepStrictEqual(
        HashMap.toEntries(modify(HashMap.make(["a", Value.make({ a: new Date(0) })]))),
        HashMap.toEntries(HashMap.make(["a", Value.make({ a: new Date(1) })]))
      )
    })
  })
})
