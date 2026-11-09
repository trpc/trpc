import * as Schema from "effect/Schema"
import { enable } from "effect/schema/SchemaJITCompiler"
import * as SchemaParser from "effect/SchemaParser"
import * as SchemaTransformation from "effect/SchemaTransformation"
import assert from "node:assert/strict"

type Kind = "digits" | "checked" | "unchecked" | "two-passes" | "checked-template" | "unchecked-template"

const fixture = (kind: Kind) => {
  const text = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9]{1,15}$/))
  const digits = Schema.String.check(Schema.isPattern(/^[0-9]{1,6}$/))
  const toNumber = SchemaTransformation.transform({ decode: Number, encode: String })
  const toTemplate = SchemaTransformation.transform({
    decode: (s: string): `x-${string}` => `x-${s}`,
    encode: (s: `x-${string}`) => s.slice(2)
  })
  const template = Schema.TemplateLiteral(["x-", Schema.String])
  const names = Array.from({ length: 11 }, (_, index) => `s${index}`)
  const checkedFields = Object.fromEntries(names.map((name) => [name, text]))
  const uncheckedFields = Object.fromEntries(names.map((name) => [name, Schema.String]))
  const source = kind === "unchecked" || kind === "unchecked-template" ? Schema.String : digits
  const field = kind === "digits" || kind === "two-passes"
    ? digits
    : kind === "checked-template" || kind === "unchecked-template"
    ? source.pipe(Schema.decodeTo(template, toTemplate))
    : source.pipe(Schema.decodeTo(Schema.Number, toNumber))
  const schema = Schema.Array(Schema.Struct({ ...checkedFields, n: field }))
  enable(schema.ast)
  const decode = SchemaParser.decodeUnknownSync(schema)
  const input = Array.from({ length: 1000 }, (_, index) => ({
    ...Object.fromEntries(names.map((name) => [name, `value${index}`])),
    n: String(index + 1)
  }))
  const expected = input.map((row) => ({
    ...row,
    n: kind === "digits"
      ? row.n
      : kind === "checked-template" || kind === "unchecked-template"
      ? `x-${row.n}`
      : Number(row.n)
  }))
  let run = () => decode(input)
  if (kind === "two-passes") {
    const transformations = Schema.Array(Schema.Struct({
      ...uncheckedFields,
      n: Schema.String.pipe(Schema.decodeTo(Schema.Number, toNumber))
    }))
    enable(transformations.ast)
    const transform = SchemaParser.decodeUnknownSync(transformations)
    run = () => transform(decode(input))
  }
  return {
    run,
    validate: (result: unknown) => assert.deepEqual(result, expected)
  }
}

export const digits = () => fixture("digits")
export const checkedSource = () => fixture("checked")
export const uncheckedSource = () => fixture("unchecked")
export const twoPasses = () => fixture("two-passes")
export const checkedTemplateTarget = () => fixture("checked-template")
export const uncheckedTemplateTarget = () => fixture("unchecked-template")
