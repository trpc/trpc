import type { Brand, Cause, Exit, Optic, Option } from "effect"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Value extends Schema.Class<Value, { readonly brand: unique symbol }>("Value")({
  a: Schema.Date
}) {}

describe("toIso", () => {
  it("Class", () => {
    const schema = Value
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<Optic.Iso<Value, { readonly a: Date }>>()
  })

  it("typeCodec(Class)", () => {
    const schema = Schema.toType(Value)
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<Optic.Iso<Value, { readonly a: Date }>>()
  })

  it("encodedCodec(Class)", () => {
    const schema = Schema.toEncoded(Value)
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<Optic.Iso<{ readonly a: Date }, { readonly a: Date }>>()
  })

  describe("brand", () => {
    it("Number & positive", () => {
      const schema = Schema.Number.check(Schema.isGreaterThan(0)).pipe(Schema.brand("positive"))
      const optic = Schema.toIso(schema)

      expect(optic).type.toBe<Optic.Iso<number & Brand.Brand<"positive">, number & Brand.Brand<"positive">>>()
    })
  })

  it("Tuple", () => {
    const schema = Schema.Tuple([Value, Schema.optionalKey(Value)])
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<
      Optic.Iso<
        readonly [Value, Value?],
        readonly [{ readonly a: Date }, { readonly a: Date }?]
      >
    >()
  })

  it("Array", () => {
    const schema = Schema.Array(Value)
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<Optic.Iso<ReadonlyArray<Value>, ReadonlyArray<{ readonly a: Date }>>>()
  })

  it("NonEmptyArray", () => {
    const schema = Schema.NonEmptyArray(Value)
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<
      Optic.Iso<
        readonly [Value, ...Array<Value>],
        readonly [{ readonly a: Date }, ...Array<{ readonly a: Date }>]
      >
    >()
  })

  it("TupleWithRest", () => {
    const schema = Schema.TupleWithRest(Schema.Tuple([Value]), [Value, Value])
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<
      Optic.Iso<
        readonly [Value, ...Array<Value>, Value],
        readonly [{ readonly a: Date }, ...Array<{ readonly a: Date }>, { readonly a: Date }]
      >
    >()
  })

  it("Struct", () => {
    const schema = Schema.Struct({
      a: Value,
      b: Schema.mutableKey(Value),
      c: Schema.optionalKey(Value),
      d: Schema.mutableKey(Schema.optionalKey(Value))
    })
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<
      Optic.Iso<{
        b: Value
        readonly a: Value
        readonly c?: Value
        d?: Value
      }, {
        b: { readonly a: Date }
        readonly a: { readonly a: Date }
        readonly c?: { readonly a: Date }
        d?: { readonly a: Date }
      }>
    >()
  })

  it("Record", () => {
    const schema = Schema.Record(Schema.String, Value)
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<
      Optic.Iso<{ readonly [x: string]: Value }, { readonly [x: string]: { readonly a: Date } }>
    >()
  })

  it("StructWithRest", () => {
    const schema = Schema.StructWithRest(
      Schema.Struct({ a: Value }),
      [Schema.Record(Schema.String, Value)]
    )
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<
      Optic.Iso<
        { readonly a: Value; readonly [x: string]: Value },
        { readonly a: { readonly a: Date }; readonly [x: string]: { readonly a: Date } }
      >
    >()
  })

  it("Union", () => {
    const schema = Schema.Union([Schema.String, Value])
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<Optic.Iso<string | Value, string | { readonly a: Date }>>()
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

    expect(optic).type.toBe<
      Optic.Iso<{
        readonly a: Value
        readonly as: ReadonlyArray<A>
      }, {
        readonly a: {
          readonly a: Date
        }
        readonly as: ReadonlyArray<AIso>
      }>
    >()
  })

  it("flip(schema)", () => {
    const schema = Schema.flip(Value)
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<Optic.Iso<{ readonly a: Date }, { readonly a: Date }>>()
  })

  it("flip(flip(schema))", () => {
    const schema = Schema.flip(Schema.flip(Value))
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<Optic.Iso<Value, { readonly a: Date }>>()
  })

  it("Opaque", () => {
    class Value extends Schema.Opaque<Value>()(Schema.Struct({ a: Schema.Date })) {}
    const schema = Value
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<Optic.Iso<Value, { readonly a: Date }>>()
  })

  it("Option", () => {
    const schema = Schema.Option(Value)
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<
      Optic.Iso<
        Option.Option<Value>,
        {
          readonly _tag: "None"
        } | {
          readonly _tag: "Some"
          readonly value: {
            readonly a: Date
          }
        }
      >
    >()
  })

  it("CauseReason", () => {
    const schema = Schema.CauseReason(Value, Value)
    const optic = Schema.toIso(schema)

    expect(optic).type.toBe<
      Optic.Iso<
        Cause.Reason<Value>,
        {
          readonly _tag: "Fail"
          readonly error: {
            readonly a: Date
          }
        } | {
          readonly _tag: "Die"
          readonly error: {
            readonly a: Date
          }
        } | {
          readonly _tag: "Interrupt"
          readonly fiberId: number | undefined
        }
      >
    >()
  })
})

it("Cause", () => {
  const schema = Schema.Cause(Value, Value)
  const optic = Schema.toIso(schema)

  expect(optic).type.toBe<
    Optic.Iso<Cause.Cause<Value>, ReadonlyArray<Schema.CauseReasonIso<typeof Value, typeof Value>>>
  >()
})

it("ErrorInstance", () => {
  const schema = Schema.ErrorInstance()
  const optic = Schema.toIso(schema)

  expect(optic).type.toBe<Optic.Iso<Error, Error>>()
})

it("Exit", () => {
  const schema = Schema.Exit(Value, Schema.ErrorInstance(), Schema.Defect())
  const optic = Schema.toIso(schema)

  expect(optic).type.toBe<
    Optic.Iso<Exit.Exit<Value, Error>, Schema.ExitIso<typeof Value, Schema.ErrorInstance, Schema.Defect>>
  >()
})

it("ReadonlyMap", () => {
  const schema = Schema.ReadonlyMap(Schema.String, Value)
  const optic = Schema.toIso(schema)

  expect(optic).type.toBe<
    Optic.Iso<ReadonlyMap<string, Value>, ReadonlyArray<readonly [string, { readonly a: Date }]>>
  >()
})
