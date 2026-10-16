import { assert, describe, it } from "@effect/vitest"
import { Schema, type SchemaRepresentation } from "effect"

describe("Schema.toJsonSchemaDocument", () => {
  it("uses the encoded side for representations and JSON Schema", () => {
    const representation = Schema.toRepresentation(Schema.FiniteFromString)
    assert.strictEqual(representation.representation._tag, "String")

    const typeRepresentation = Schema.toRepresentation(Schema.toType(Schema.FiniteFromString))
    assert.strictEqual(typeRepresentation.representation._tag, "Number")

    assert.deepStrictEqual(Schema.toJsonSchemaDocument(Schema.FiniteFromString), {
      dialect: "draft-2020-12",
      schema: { type: "string" },
      definitions: {}
    })
  })

  it("inlines repeated anonymous schemas by default", () => {
    const shared = Schema.Struct({ value: Schema.String })

    assert.deepStrictEqual(
      Schema.toJsonSchemaDocument(Schema.Struct({ first: shared, second: shared })),
      {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            first: {
              type: "object",
              properties: { value: { type: "string" } },
              required: ["value"],
              additionalProperties: true
            },
            second: {
              type: "object",
              properties: { value: { type: "string" } },
              required: ["value"],
              additionalProperties: true
            }
          },
          required: ["first", "second"],
          additionalProperties: true
        },
        definitions: {}
      }
    )
  })

  it("forwards the reference policy to representation and JSON Schema generation", () => {
    const shared = Schema.String.annotate({ identifier: "Shared" })
    const options = { referencePolicy: () => undefined }

    assert.deepStrictEqual(Schema.toRepresentation(shared, options).references, {})
    assert.deepStrictEqual(Schema.toJsonSchemaDocument(shared, options), {
      dialect: "draft-2020-12",
      schema: { type: "string" },
      definitions: {}
    })

    const inputs: Array<SchemaRepresentation.ReferencePolicyInput> = []
    Schema.toJsonSchemaDocument(Schema.Date.annotate({ identifier: "Date" }), {
      referencePolicy: (input) => {
        inputs.push(input)
        return undefined
      }
    })
    assert.strictEqual(inputs[0].ast._tag, "String")
    assert.strictEqual(inputs[0].identifier, "DateEncoded")
  })

  it("projects encoded tuple elements for JSON Schema", () => {
    assert.deepStrictEqual(Schema.toJsonSchemaDocument(Schema.Tuple([Schema.NumberFromString])).schema, {
      type: "array",
      prefixItems: [{ type: "string" }],
      minItems: 1,
      maxItems: 1
    })
  })

  it("does not project checks through an artificial JSON encoding", () => {
    assert.deepStrictEqual(
      Schema.toJsonSchemaDocument(Schema.Number.check(Schema.isGreaterThan(0))),
      {
        dialect: "draft-2020-12",
        schema: {
          anyOf: [
            { type: "number" },
            {
              type: "string",
              enum: ["Infinity", "-Infinity", "NaN"]
            }
          ]
        },
        definitions: {}
      }
    )
  })

  it("preserves checks when no artificial JSON encoding is needed", () => {
    assert.deepStrictEqual(
      Schema.toJsonSchemaDocument(Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0))),
      {
        dialect: "draft-2020-12",
        schema: {
          type: "number",
          exclusiveMinimum: 0
        },
        definitions: {}
      }
    )
  })

  it("does not project annotations through an artificial JSON encoding", () => {
    const schema = Schema.Number.annotate({ description: "source description" })
    const expected = {
      dialect: "draft-2020-12" as const,
      schema: {
        anyOf: [
          { type: "number" },
          { type: "string", enum: ["Infinity", "-Infinity", "NaN"] }
        ]
      },
      definitions: {}
    }

    assert.deepStrictEqual(Schema.toJsonSchemaDocument(schema), expected)
    assert.deepStrictEqual(Schema.toJsonSchemaDocument(Schema.toCodecJson(schema)), expected)
  })

  it("preserves output, references and generation options", () => {
    const shared = Schema.String.check(Schema.isMinLength(2)).annotate({
      identifier: "Shared",
      description: "shared text",
      "x-consumer": "kept"
    })
    const schema = Schema.Struct({
      first: shared,
      second: shared,
      count: Schema.FiniteFromString
    }).annotate({ description: "root" })
    const options: Schema.ToJsonSchemaOptions = {
      onExcessProperty: "ignore",
      generateDescriptions: true,
      includeAnnotationKey: (key) => key === "x-consumer"
    }

    assert.deepStrictEqual(Schema.toJsonSchemaDocument(schema, options), {
      dialect: "draft-2020-12",
      schema: {
        type: "object",
        properties: {
          first: { $ref: "#/$defs/Shared" },
          second: { $ref: "#/$defs/Shared" },
          count: {
            type: "string",
            description: "a string that will be decoded as a finite number"
          }
        },
        required: ["first", "second", "count"],
        additionalProperties: true,
        description: "root"
      },
      definitions: {
        Shared: {
          type: "string",
          allOf: [{
            minLength: 1,
            description: "shared text",
            "x-consumer": "kept"
          }]
        }
      }
    })
  })

  it("uses custom compiler annotations without a central built-in switch", () => {
    const custom = Schema.String.check(Schema.makeFilter<string>((value) => value.length >= 2, {
      representation: {
        id: "test/schema/minTwoCharacters",
        payload: null
      },
      toJsonSchema: () => ({ minLength: 2 })
    }))

    assert.deepStrictEqual(Schema.toJsonSchemaDocument(custom), {
      dialect: "draft-2020-12",
      schema: {
        type: "string",
        minLength: 2
      },
      definitions: {}
    })
  })

  it("emits JSON content media types after encoded projection", () => {
    const schema = Schema.fromJsonString(Schema.Struct({
      value: Schema.FiniteFromString
    }))

    assert.deepStrictEqual(Schema.toJsonSchemaDocument(schema).schema, {
      type: "string",
      contentMediaType: "application/json"
    })
  })

  it("approximates declarations without a JSON codec", () => {
    const schema = Schema.declare((input): input is string => typeof input === "string", {
      representation: {
        id: "test/schema/opaqueString",
        payload: null
      }
    })

    assert.deepStrictEqual(Schema.toJsonSchemaDocument(schema), {
      dialect: "draft-2020-12",
      schema: {},
      definitions: {}
    })
  })
})
