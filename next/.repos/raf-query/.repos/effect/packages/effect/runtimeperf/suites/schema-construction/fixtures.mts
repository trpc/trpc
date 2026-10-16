import assert from "node:assert/strict"
import * as Schema from "../../../src/Schema.ts"
import * as SchemaTransformation from "../../../src/SchemaTransformation.ts"

export const caseNames = [
  "literal",
  "struct-2",
  "struct-32",
  "struct-256",
  "nested",
  "composed",
  "encoded",
  "union-8",
  "struct-ready-32",
  "struct-ready-256"
]

export function fixture(name: string) {
  if (name === "literal") {
    return {
      build: (index: number) => Schema.Literal(index),
      input: (index: number) => index,
      output: (index: number) => index,
      invalid: null
    }
  }
  if (name.startsWith("struct-")) {
    const ready = name.startsWith("struct-ready-")
    const size = Number(name.slice(ready ? "struct-ready-".length : "struct-".length))
    assert.ok([2, 32, 256].includes(size))
    const keys = Array.from({ length: size }, (_, index) => `field${index}`)
    const value = Object.fromEntries(keys.map((key) => [key, "value"]))
    if (ready) {
      const fields = Object.fromEntries(keys.map((key) => [key, Schema.String]))
      return {
        build: () => Schema.Struct(fields),
        input: () => value,
        output: () => value,
        invalid: {}
      }
    }
    return {
      build: () => Schema.Struct(Object.fromEntries(keys.map((key) => [key, Schema.String]))),
      input: () => value,
      output: () => value,
      invalid: {}
    }
  }
  if (name === "nested") {
    const value = (index: number) => ({
      endpoint: index,
      payload: { name: "Ada", count: 1, location: { country: "IT", city: "Rome" } }
    })
    return {
      build: (index: number) =>
        Schema.Struct({
          endpoint: Schema.Literal(index),
          payload: Schema.Struct({
            name: Schema.String,
            count: Schema.Number,
            location: Schema.Struct({ country: Schema.Literal("IT"), city: Schema.String })
          })
        }),
      input: value,
      output: value,
      invalid: {}
    }
  }
  if (name === "composed") {
    const value = (index: number) => ({
      endpoint: index,
      name: "Ada",
      items: [{ sku: "A", quantity: 1 }],
      status: "open"
    })
    return {
      build: (index: number) =>
        Schema.Struct({
          endpoint: Schema.Literal(index),
          name: Schema.String.check(Schema.isMinLength(1)),
          items: Schema.Array(Schema.Struct({
            sku: Schema.String.check(Schema.isMinLength(1)),
            quantity: Schema.Number.check(Schema.isGreaterThanOrEqualTo(1))
          })),
          note: Schema.optionalKey(Schema.String),
          status: Schema.Literals(["open", "closed"])
        }),
      input: value,
      output: value,
      invalid: { endpoint: 0, name: "", items: [{ sku: "", quantity: 0 }], status: "unknown" }
    }
  }
  if (name === "encoded") {
    return {
      build: (index: number) => {
        const amount = Schema.String.pipe(Schema.decodeTo(
          Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
          SchemaTransformation.numberFromString
        ))
        return Schema.Struct({
          endpoint: Schema.Literal(index),
          amount,
          values: Schema.Array(amount),
          note: Schema.optionalKey(Schema.String)
        })
      },
      input: (index: number) => ({ endpoint: index, amount: "1", values: ["2"] }),
      output: (index: number) => ({ endpoint: index, amount: 1, values: [2] }),
      invalid: { endpoint: 0, amount: "-1", values: ["-2"] }
    }
  }
  if (name === "union-8") {
    const value = (index: number) => ({ kind: index * 8 + 7, value: "Ada" })
    return {
      build: (index: number) =>
        Schema.Union(Array.from({ length: 8 }, (_, member) =>
          Schema.Struct({
            kind: Schema.Literal(index * 8 + member),
            value: Schema.String
          }))),
      input: value,
      output: value,
      invalid: { kind: -1, value: "Ada" }
    }
  }
  throw new Error(`Unknown fixture: ${name}`)
}

export function validate(name: string) {
  const { build, input, output, invalid } = fixture(name)
  for (const index of [0, 1, 999]) {
    const schema = build(index)
    assert.deepEqual(Schema.decodeUnknownSync(schema)(input(index)), output(index))
    assert.deepEqual(schema.make(output(index) as never), output(index))
    assert.throws(() => Schema.decodeUnknownSync(schema)(invalid))
  }
}
