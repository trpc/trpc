import { Schema, SchemaParser } from "effect"
import type { SchemaAST, SchemaRepresentation, Types } from "effect"
import { describe, expect, it } from "tstyche"

describe("runtime and structural options", () => {
  it("supports product concurrency without order or unvalidated preservation", () => {
    expect<SchemaAST.ParseOptions["onExcessProperty"]>().type.toBe<"ignore" | "error" | undefined>()
    expect<Extract<SchemaAST.ParseOptions["onExcessProperty"], "preserve">>().type.toBe<never>()
    expect<SchemaAST.ParseOptions["concurrency"]>().type.toBe<Types.Concurrency | undefined>()
    expect<Extract<keyof SchemaAST.ParseOptions, "propertyOrder">>().type.toBe<never>()
    expect<Schema.Annotations.Bottom<string, readonly []>["parseOptions"]>().type.toBe<unknown>()

    const schema = Schema.Struct({ a: Schema.String })
    expect(SchemaParser.decodeUnknownSync(schema, { onExcessProperty: "error" })({ a: "a" }))
      .type.toBe<{ readonly a: string }>()
    expect(SchemaParser.is).type.not.toBeCallableWith(schema, { onExcessProperty: "error" })
  })

  it("stores options only on Union", () => {
    expect<Extract<keyof SchemaAST.Arrays, "options">>().type.toBe<never>()
    expect<Extract<keyof SchemaAST.Objects, "options">>().type.toBe<never>()
    expect<SchemaAST.Union["options"]>().type.toBe<SchemaAST.UnionOptions | undefined>()
    expect<Extract<keyof SchemaAST.Union, "mode">>().type.toBe<never>()
    expect<Extract<keyof SchemaRepresentation.Arrays, "options">>().type.toBe<never>()
    expect<Extract<keyof SchemaRepresentation.Objects, "options">>().type.toBe<never>()
    expect<SchemaRepresentation.Union["options"]>().type.toBe<SchemaAST.UnionOptions | undefined>()
  })

  it("keeps the public Union call and inference", () => {
    const schema = Schema.Union([Schema.String, Schema.Number], { mode: "oneOf" })
    expect(schema).type.toBe<Schema.Union<readonly [Schema.String, Schema.Number]>>()
    expect(Schema.revealCodec(schema)).type.toBe<
      Schema.Codec<string | number, string | number, never, never>
    >()
  })
})
