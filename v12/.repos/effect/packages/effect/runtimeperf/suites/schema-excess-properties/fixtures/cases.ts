import * as Schema from "effect/Schema"
import { enable } from "effect/schema/SchemaJITCompiler"
import * as SchemaIssue from "effect/SchemaIssue"
import * as SchemaParser from "effect/SchemaParser"
import assert from "node:assert/strict"

const fixture = (kind: "struct" | "extra" | "strings" | "symbols", strict: boolean, jit: boolean) => {
  const schema = kind === "symbols"
    ? Schema.Record(Schema.Symbol, Schema.Number)
    : kind === "strings"
    ? Schema.Record(Schema.String, Schema.Number)
    : Schema.Struct({ name: Schema.String, age: Schema.Number, active: Schema.Boolean })
  const input = kind === "symbols" || kind === "strings"
    ? Object.fromEntries(Array.from({ length: 32 }, (_, i) => [kind === "symbols" ? Symbol(`key${i}`) : `key${i}`, i]))
    : kind === "extra"
    ? { name: "Ada", age: 37, active: true, extra: 1 }
    : { name: "Ada", age: 37, active: true }
  if (jit) enable(schema.ast)
  const decode = SchemaParser.decodeUnknownSync(schema, strict ? { onExcessProperty: "error" } : undefined)
  return {
    run: kind === "extra"
      ? () => {
        try {
          return decode(input)
        } catch (error) {
          return error
        }
      }
      : () => decode(input),
    validate: (result: unknown) => {
      if (kind === "extra") {
        assert.ok(result instanceof Error)
        assert.ok(SchemaIssue.isIssue(result.cause))
        assert.equal(SchemaIssue.defaultFormatter(result.cause), "Expected no excess property\n  at [\"extra\"]")
      } else {
        assert.deepEqual(result, input)
      }
    }
  }
}

export const interpretedStructDefault = () => fixture("struct", false, false)
export const jitStructDefault = () => fixture("struct", false, true)
export const interpretedStructStrict = () => fixture("struct", true, false)
export const jitStructStrict = () => fixture("struct", true, true)
export const interpretedExtraStrict = () => fixture("extra", true, false)
export const jitExtraStrict = () => fixture("extra", true, true)
export const interpretedStringsStrict = () => fixture("strings", true, false)
export const jitStringsStrict = () => fixture("strings", true, true)
export const interpretedSymbolsDefault = () => fixture("symbols", false, false)
export const jitSymbolsDefault = () => fixture("symbols", false, true)
export const interpretedSymbolsStrict = () => fixture("symbols", true, false)
export const jitSymbolsStrict = () => fixture("symbols", true, true)
