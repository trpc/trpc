import { Arbitrary, type Effect, hole, Result, Schema, type SchemaAST } from "effect"
import { describe, expect, it } from "tstyche"

describe("Arbitrary", () => {
  it("identifies Arbitrary values", () => {
    expect(Arbitrary.isArbitrary).type.toBe<(u: unknown) => u is Arbitrary.Arbitrary<unknown>>()
  })

  it("schema preserves the decoded type", () => {
    const schema = Schema.Struct({ value: Schema.String })
    type A = typeof schema.Type

    expect(Arbitrary.schema(schema)).type.toBe<Arbitrary.Arbitrary<A>>()
    expect(Arbitrary.schema(schema, {
      shrink: (value) => {
        expect(value).type.toBe<A>()
        return [value]
      }
    })).type.toBe<Arbitrary.Arbitrary<A>>()
    expect(Arbitrary.sampleEffect(Arbitrary.schema(schema))).type.toBe<
      Effect.Effect<ReadonlyArray<A>, Arbitrary.SampleError>
    >()
  })

  it("checkEffect preserves property errors and requirements", () => {
    const arbitrary = Arbitrary.schema(Schema.String)
    const property = hole<(value: string) => Effect.Effect<boolean, "error", "service">>()

    expect(Arbitrary.checkEffect(arbitrary, property)).type.toBe<
      Effect.Effect<Arbitrary.CheckResult<string, "error">, never, "service">
    >()
  })

  it("composes Arbitraries", () => {
    const strings = Arbitrary.schema(Schema.String)
    const stringOrNumber = Arbitrary.schema(Schema.Union([Schema.String, Schema.Number]))

    expect(Arbitrary.array(strings)).type.toBe<Arbitrary.Arbitrary<Array<string>>>()
    expect(Arbitrary.array(stringOrNumber, { minLength: 1, maxLength: 50 })).type.toBe<
      Arbitrary.Arbitrary<Array<string | number>>
    >()
    const commands = Arbitrary.array(Arbitrary.Constant({ _tag: "Stop" }))
    expect(commands).type.toBe<Arbitrary.Arbitrary<Array<{ readonly _tag: "Stop" }>>>()
    expect(Arbitrary.all([commands, strings])).type.toBe<
      Arbitrary.Arbitrary<[Array<{ readonly _tag: "Stop" }>, string]>
    >()
    expect(Arbitrary.checkEffect(commands, (values) => {
      expect(values).type.toBe<Array<{ readonly _tag: "Stop" }>>()
      return true
    })).type.toBe<Effect.Effect<Arbitrary.CheckResult<Array<{ readonly _tag: "Stop" }>, never>>>()

    expect(Arbitrary.Constant({ _tag: "Constant" })).type.toBe<
      Arbitrary.Arbitrary<{ readonly _tag: "Constant" }>
    >()
    expect(Arbitrary.map(strings, (value) => value.length)).type.toBe<Arbitrary.Arbitrary<number>>()
    expect(Arbitrary.map((value: string) => value.length)(strings)).type.toBe<Arbitrary.Arbitrary<number>>()
    expect(strings.pipe(Arbitrary.map((value) => value.length))).type.toBe<Arbitrary.Arbitrary<number>>()
    expect(Arbitrary.flatMap(strings, (value) => Arbitrary.schema(Schema.Literal(value.length)))).type.toBe<
      Arbitrary.Arbitrary<number>
    >()
    expect(
      Arbitrary.flatMap((value: string) => Arbitrary.schema(Schema.Literal(value.length)))(strings)
    ).type.toBe<Arbitrary.Arbitrary<number>>()
    expect(
      strings.pipe(Arbitrary.flatMap((value) => Arbitrary.schema(Schema.Literal(value.length))))
    ).type.toBe<Arbitrary.Arbitrary<number>>()
    expect(Arbitrary.filter(stringOrNumber, (value): value is string => typeof value === "string")).type.toBe<
      Arbitrary.Arbitrary<string>
    >()
    expect(
      Arbitrary.filter((value: string | number) => typeof value === "string")(stringOrNumber)
    ).type.toBe<Arbitrary.Arbitrary<string>>()
    expect(
      Arbitrary.filterMap(
        strings,
        (value) => value.length === 0 ? Result.fail("empty" as const) : Result.succeed(value.length)
      )
    ).type.toBe<Arbitrary.Arbitrary<number>>()
    expect(
      Arbitrary.all([
        strings,
        Arbitrary.schema(Schema.Number)
      ])
    ).type.toBe<Arbitrary.Arbitrary<[string, number]>>()
    expect(Arbitrary.all({ text: strings, count: Arbitrary.schema(Schema.Number) })).type.toBe<
      Arbitrary.Arbitrary<{ text: string; count: number }>
    >()
    expect(Arbitrary.all(new Set([strings]))).type.toBe<Arbitrary.Arbitrary<Array<string>>>()
    expect(Arbitrary.all([])).type.toBe<Arbitrary.Arbitrary<[]>>()
    expect(Arbitrary.all({})).type.toBe<Arbitrary.Arbitrary<{}>>()
  })

  it("types arbitrary constraints and toCodecArbitrary declaration inputs", () => {
    Schema.String.check(Schema.makeFilter(() => true, {
      arbitraryConstraint: { minLength: 1 }
    }))

    interface Box {
      readonly value: number
    }

    Schema.declareConstructor<Box>()(
      [Schema.NumberFromString],
      hole(),
      {
        toCodecArbitrary: (input) => {
          expect(input.typeParameters).type.toBe<readonly [Schema.Codec<number>]>()
          expect(input.constraint).type.toBe<
            Schema.Annotations.ToArbitrary.GenerationConstraint<Box> | undefined
          >()
          return hole<SchemaAST.Link>()
        }
      }
    )
  })
})
