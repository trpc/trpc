import { assert } from "@effect/vitest"
import { type Schema, type SchemaAST, SchemaRepresentation } from "effect"
import { TestSchema } from "effect/testing"
import { describe, it } from "vitest"
import { deepStrictEqual, throws } from "../../utils/assert.ts"

const makeCode = SchemaRepresentation.makeCode

type Expected = {
  readonly codes: ReadonlyArray<SchemaRepresentation.Code>
  readonly references?: Partial<SchemaRepresentation.CodeDocument["references"]>
}

function assertCode(schemas: readonly [Schema.Top, ...Array<Schema.Top>], expected: Expected) {
  const document = SchemaRepresentation.toRepresentations(
    schemas.map((schema) => schema.ast) as [SchemaAST.AST, ...Array<SchemaAST.AST>]
  )
  deepStrictEqual(SchemaRepresentation.toCodeDocument(document), {
    codes: expected.codes,
    references: {
      nonRecursives: expected.references?.nonRecursives ?? [],
      recursives: expected.references?.recursives ?? {}
    },
    artifacts: []
  })
}

describe("SchemaRepresentation.fromJsonSchemaMultiDocument", () => {
  it("rejects open pattern scopes in roots and shared definitions", () => {
    const open = { type: "object", patternProperties: { "^a": { type: "number" } } } as const
    throws(
      () =>
        SchemaRepresentation.fromJsonSchemaMultiDocument({
          dialect: "draft-2020-12",
          schemas: [{ type: "string" }, { type: "array", items: open }],
          definitions: {}
        }, { patterns: "apply" }),
      `Cannot import open "patternProperties": unmatched keys cannot be typed correctly.\n  at ["schemas"][1]["items"]`
    )
    throws(
      () =>
        SchemaRepresentation.fromJsonSchemaMultiDocument({
          dialect: "draft-2020-12",
          schemas: [{ $ref: "#/$defs/Values" }, { type: "array", items: { $ref: "#/$defs/Values" } }],
          definitions: { Values: open }
        }, { patterns: "apply" }),
      `Cannot import open "patternProperties": unmatched keys cannot be typed correctly.\n  at ["definitions"]["Values"]`
    )
  })

  it("imports closed patterned Records through shared definitions", async () => {
    const schemas = SchemaRepresentation.fromJsonSchemaMultiDocument({
      dialect: "draft-2020-12",
      schemas: [{ $ref: "#/$defs/Values" }, { type: "array", items: { $ref: "#/$defs/Values" } }],
      definitions: {
        Values: {
          type: "object",
          patternProperties: { "^a": { type: "number" } },
          additionalProperties: false
        }
      }
    }, { patterns: "apply" })
    const asserts = new TestSchema.Asserts(schemas[0] as unknown as Schema.ConstraintDecoder<unknown>)
    const decoding = asserts.decoding()
    await decoding.succeed({ a: 1, z: true }, { a: 1 })
    await decoding.fail({ a: "x" }, `Expected number\n  at ["a"]`)
    await asserts.decoding({ parseOptions: { onExcessProperty: "error" } }).fail(
      { z: true },
      `Expected no excess property\n  at ["z"]`
    )
    const arrayDecoding = new TestSchema.Asserts(schemas[1] as unknown as Schema.ConstraintDecoder<unknown>).decoding()
    await arrayDecoding.succeed([{ a: 1 }])
    await arrayDecoding.fail([{ a: "x" }], `Expected number\n  at [0]["a"]`)
  })

  it("imports Never through shared definitions", () => {
    const schemas = SchemaRepresentation.fromJsonSchemaMultiDocument({
      dialect: "draft-2020-12",
      schemas: [
        { type: "object", properties: { value: { $ref: "#/$defs/Impossible" } } },
        { $ref: "#/$defs/Impossible" }
      ],
      definitions: { Impossible: { not: {} } }
    })
    assertCode(schemas, {
      codes: [
        makeCode(
          `Schema.StructWithRest(Schema.Struct({ "value": Schema.optionalKey(Impossible) }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))])`,
          `{ readonly "value"?: Impossible } & { readonly [x: string]: Schema.Json }`
        ),
        makeCode(`Impossible`, `Impossible`)
      ],
      references: {
        nonRecursives: [{
          $ref: "Impossible",
          code: makeCode(`Schema.Never.annotate({ "identifier": "Impossible" })`, `never`)
        }]
      }
    })
  })

  it("keeps resource scope separate for each root", () => {
    const schemas = SchemaRepresentation.fromJsonSchemaMultiDocument({
      dialect: "draft-2020-12",
      schemas: [
        { type: "object", properties: { child: { $id: "child", type: "number" } } },
        { $id: "https://example.com/root", $ref: "#/$defs/X" }
      ],
      definitions: { X: { type: "string" } }
    })
    assertCode(schemas, {
      codes: [
        makeCode(
          `Schema.StructWithRest(Schema.Struct({ "child": Schema.optionalKey(Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" }))) }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))])`,
          `{ readonly "child"?: number } & { readonly [x: string]: Schema.Json }`
        ),
        makeCode(`X`, `X`)
      ],
      references: {
        nonRecursives: [{ $ref: "X", code: makeCode(`Schema.String.annotate({ "identifier": "X" })`, `string`) }]
      }
    })
  })

  it("rejects a reference in a nested resource with its multi-root path", () => {
    throws(
      () =>
        SchemaRepresentation.fromJsonSchemaMultiDocument({
          dialect: "draft-2020-12",
          schemas: [
            { type: "string" },
            { type: "array", items: { $id: "child", $ref: "#/$defs/X" } }
          ],
          definitions: { X: { type: "string" } }
        }),
      `Cannot resolve $ref under a nested "$id". Resolve or flatten it first.\n  at ["schemas"][1]["items"]["$ref"]`
    )
  })

  it("propagates the pattern policy through reachable definitions", () => {
    const document: Parameters<typeof SchemaRepresentation.fromJsonSchemaMultiDocument>[0] = {
      dialect: "draft-2020-12" as const,
      schemas: [{ $ref: "#/$defs/A" }],
      definitions: {
        A: { type: "string", pattern: "^a+$" }
      }
    }

    throws(
      () => SchemaRepresentation.fromJsonSchemaMultiDocument(document),
      `Patterns may block validation and are disabled. Use patterns: "apply" for trusted schemas or "ignore" to discard them.\n  at ["definitions"]["A"]["pattern"]`
    )

    const schemas = SchemaRepresentation.fromJsonSchemaMultiDocument(document, { patterns: "apply" })
    assertCode(schemas, {
      codes: [makeCode(`A`, `A`)],
      references: {
        nonRecursives: [{
          $ref: "A",
          code: makeCode(
            `Schema.String.check(Schema.isPattern(new RegExp("^a+$", "u")).annotate({ "expected": "a string matching the RegExp ^a+$", "identifier": "A" }))`,
            `string`
          )
        }]
      }
    })
  })

  it("preserves an onEnter exception by identity", () => {
    const cause = new Error("boom")

    throws(
      () =>
        SchemaRepresentation.fromJsonSchemaMultiDocument({
          dialect: "draft-2020-12",
          schemas: [{ type: "string" }],
          definitions: {}
        }, {
          onEnter: () => {
            throw cause
          }
        }),
      (error: unknown) => {
        assert.strictEqual(error, cause)
        return undefined
      }
    )
  })

  it("preserves contentSchema as an annotation without traversing it", () => {
    const schemas = SchemaRepresentation.fromJsonSchemaMultiDocument({
      dialect: "draft-2020-12",
      schemas: [{
        type: "string",
        contentMediaType: "application/json",
        contentSchema: { $ref: "#/$defs/Payload" }
      }],
      definitions: {
        Payload: {
          type: "object",
          properties: { value: { type: "number" } },
          required: ["value"],
          additionalProperties: false
        }
      }
    })

    assertCode(schemas, {
      codes: [makeCode(
        `Schema.String.annotate({ "contentMediaType": "application/json", "contentSchema": { "$ref": "#/$defs/Payload" } })`,
        `string`
      )]
    })
  })

  it("does not import unreachable definitions", () => {
    const schemas = SchemaRepresentation.fromJsonSchemaMultiDocument({
      dialect: "draft-2020-12",
      schemas: [{ type: "string" }],
      definitions: {
        Unused: { type: "number", description: "unused" }
      }
    }, {
      onEnter: (schema) => {
        if (schema.description === "unused") throw new Error("unreachable")
        return schema
      }
    })

    assertCode(schemas, { codes: [makeCode(`Schema.String`, `string`)] })
  })

  it("preserves root order and shares definitions", () => {
    const schemas = SchemaRepresentation.fromJsonSchemaMultiDocument({
      dialect: "draft-2020-12",
      schemas: [
        { $ref: "#/$defs/A" },
        { $ref: "#/$defs/A", description: "second" },
        { type: "array", items: { $ref: "#/$defs/A" } },
        { $ref: "#/$defs/A", description: "fourth" }
      ],
      definitions: {
        A: { type: "string", minLength: 1 }
      }
    })

    assertCode(schemas, {
      codes: [
        makeCode(`A`, `A`),
        makeCode(`Schema.suspend((): Schema.Codec<A> => A).annotate({ "description": "second" })`, `A`),
        makeCode(`Schema.Array(A)`, `ReadonlyArray<A>`),
        makeCode(`Schema.suspend((): Schema.Codec<A> => A).annotate({ "description": "fourth" })`, `A`)
      ],
      references: {
        nonRecursives: [{
          $ref: "A",
          code: makeCode(
            `Schema.String.check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1", "identifier": "A" }))`,
            `string`
          )
        }]
      }
    })
  })

  it("resolves alias chains when combining a reference", () => {
    const schemas = SchemaRepresentation.fromJsonSchemaMultiDocument({
      dialect: "draft-2020-12",
      schemas: [{ $ref: "#/$defs/A", description: "root" }],
      definitions: {
        A: { $ref: "#/$defs/B" },
        B: { $ref: "#/$defs/C" },
        C: { type: "number" }
      }
    })

    assertCode(schemas, {
      codes: [makeCode(`Schema.suspend((): Schema.Codec<A> => A).annotate({ "description": "root" })`, `A`)],
      references: {
        nonRecursives: [{
          $ref: "A",
          code: makeCode(
            `Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number", "identifier": "A" }))`,
            `number`
          )
        }]
      }
    })
  })

  it("tracks recursive definitions independently", () => {
    const schemas = SchemaRepresentation.fromJsonSchemaMultiDocument({
      dialect: "draft-2020-12",
      schemas: [{ $ref: "#/$defs/A" }, { $ref: "#/$defs/B" }],
      definitions: {
        A: { $ref: "#/$defs/A" },
        B: { $ref: "#/$defs/B" }
      }
    })

    assertCode(schemas, {
      codes: [makeCode(`A`, `A`), makeCode(`B`, `B`)],
      references: {
        recursives: {
          A: makeCode(`Schema.suspend((): Schema.Codec<A> => A).annotate({ "identifier": "A" })`, `A`),
          B: makeCode(`Schema.suspend((): Schema.Codec<B> => B).annotate({ "identifier": "B" })`, `B`)
        }
      }
    })
  })

  it("throws when a reference that must be resolved is missing", () => {
    throws(
      () =>
        SchemaRepresentation.fromJsonSchemaMultiDocument({
          dialect: "draft-2020-12",
          schemas: [{ $ref: "#/$defs/Missing", description: "resolve" }],
          definitions: {}
        }),
      `Missing definition "Missing" for $ref "#/$defs/Missing".\n  at ["schemas"][0]["$ref"]`
    )
  })

  it("throws when resolving a circular alias chain", () => {
    throws(
      () =>
        SchemaRepresentation.fromJsonSchemaMultiDocument({
          dialect: "draft-2020-12",
          schemas: [{ $ref: "#/$defs/A", description: "resolve" }],
          definitions: {
            A: { $ref: "#/$defs/B" },
            B: { $ref: "#/$defs/A" }
          }
        }),
      `Definition "A" is a circular alias.\n  at ["schemas"][0]["$ref"]`
    )
  })
})
