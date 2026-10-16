import { assert, describe, it } from "@effect/vitest"
import { Schema, SchemaParser } from "effect"
import * as Registry from "effect/internal/schema/compilerRegistry"

describe("Schema compiler startup", () => {
  it("allows late global activation without replacing a maker's interpreted entry", async () => {
    const schema = Schema.Struct({ a: Schema.String })
    assert.deepStrictEqual(SchemaParser.make(schema)({ a: "a" }), { a: "a" })
    const before = Registry.resolve(schema.ast)
    assert.strictEqual(before.compiled, undefined)
    const unused = Schema.Struct({ a: Schema.Number })
    const make = SchemaParser.make(unused)
    await import("effect/schema/SchemaJITCompiler/enable")
    assert.strictEqual(Registry.resolve(schema.ast), before)
    assert.deepStrictEqual(SchemaParser.decodeUnknownSync(schema)({ a: "a" }), { a: "a" })
    assert.deepStrictEqual(make({ a: 1 }), { a: 1 })
    assert.strictEqual(Registry.resolve(unused.ast).compiled !== undefined, true)
  })
})
