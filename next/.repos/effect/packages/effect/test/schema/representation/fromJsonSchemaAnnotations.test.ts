import { assert } from "@effect/vitest"
import { type JsonSchema, Schema, SchemaRepresentation } from "effect"
import { describe, it } from "vitest"
import { throws } from "../../utils/assert.ts"

const options = { includeAnnotationKey: (key: string) => key.startsWith("x-") }

function fromJsonSchema(schema: JsonSchema.JsonSchema, options?: SchemaRepresentation.FromJsonSchemaOptions) {
  return SchemaRepresentation.fromJsonSchemaDocument({
    dialect: "draft-2020-12",
    schema,
    definitions: {}
  }, options)
}

function roundTrip(schema: JsonSchema.JsonSchema) {
  return Schema.toJsonSchemaDocument(fromJsonSchema(schema, options), options).schema
}

describe("JSON Schema import includeAnnotationKey", () => {
  it("ignores custom annotations by default and leaves standard annotations independent of selection", () => {
    const input = { type: "string", title: "Name", description: "A name", "x-sensitive": true }
    for (const options of [undefined, { includeAnnotationKey: () => false }]) {
      assert.deepStrictEqual(fromJsonSchema(input, options).ast.annotations, {
        title: "Name",
        description: "A name"
      })
    }
  })

  it("retains selected JSON values and skips non-JSON values", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const metadata = {
      "x-string": "private",
      "x-boolean": false,
      "x-number": 0,
      "x-null": null,
      "x-array": [1, "a", false, null],
      "x-object": { enabled: true }
    }
    const input = {
      type: "string",
      ...metadata,
      markdownDescription: "**Private**",
      "x-undefined": undefined,
      "x-function": () => true,
      "x-nan": NaN,
      "x-infinity": Infinity,
      "x-bigint": 1n,
      "x-cycle": cyclic
    }
    assert.deepStrictEqual(fromJsonSchema(input, options).ast.annotations, metadata)
    assert.deepStrictEqual(roundTrip(input), { type: "string", ...metadata })
    assert.deepStrictEqual(
      fromJsonSchema(input, {
        includeAnnotationKey: (key) => key === "markdownDescription"
      }).ast.annotations,
      { markdownDescription: "**Private**" }
    )
  })

  it("excludes schema keywords and Effect capabilities before calling the predicate", () => {
    const keys: Array<string> = []
    const schema = fromJsonSchema({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://example.com/name",
      $anchor: "Name",
      $dynamicAnchor: "Name",
      $vocabulary: {},
      $comment: "comment",
      $defs: {},
      type: "string",
      minLength: 1,
      maxLength: 10,
      allOf: [{ type: "string" }],
      else: {},
      minContains: 1,
      maxContains: 2,
      definitions: {},
      dependencies: {},
      additionalItems: false,
      description: "name",
      identifier: "Untrusted",
      expected: "untrusted",
      message: "untrusted",
      messageMissingKey: "untrusted",
      messageUnexpectedKey: "untrusted",
      representation: { id: "untrusted", payload: null },
      arbitraryConstraint: {},
      toJsonSchema: {},
      toCode: {},
      toEquivalence: {},
      toFormatter: {},
      toCodec: {},
      toCodecJson: {},
      toCodecStringTree: {},
      toCodecIso: {},
      toCodecArbitrary: {},
      "~identifier": "Untrusted",
      "~structural": true,
      "~sentinels": [],
      "~constructor": {},
      "x-sensitive": true
    }, {
      includeAnnotationKey: (key) => {
        keys.push(key)
        return true
      }
    })
    assert.deepStrictEqual(keys, ["x-sensitive"])
    assert.deepStrictEqual(schema.ast.annotations, { description: "name", "x-sensitive": true })
    const is = Schema.is(schema)
    assert.isTrue(is("Alice"))
    assert.isFalse(is(""))
    assert.isFalse(is(1))
  })

  it("handles own __proto__ metadata without changing prototypes and ignores inherited keys", () => {
    const input = {
      type: "string",
      ...JSON.parse("{\"__proto__\":{\"sensitive\":true}}")
    }
    Object.setPrototypeOf(input, { "x-inherited": true })
    const schema = fromJsonSchema(input, { includeAnnotationKey: () => true })
    assert.deepStrictEqual(schema.ast.annotations, JSON.parse("{\"__proto__\":{\"sensitive\":true}}"))
    assert.strictEqual(Object.getPrototypeOf(schema.ast.annotations), Object.prototype)
    const output = Schema.toJsonSchemaDocument(schema, { includeAnnotationKey: () => true }).schema
    assert.deepStrictEqual(output, JSON.parse("{\"type\":\"string\",\"__proto__\":{\"sensitive\":true}}"))
    assert.strictEqual(Object.getPrototypeOf(output), Object.prototype)
  })

  it("selects from the onEnter result and treats metadata values as opaque", () => {
    const visited: Array<unknown> = []
    const metadata = { type: "number", $ref: "#/$defs/Missing", "x-nested": true }
    const schema = fromJsonSchema({ type: "string", "x-before": true }, {
      ...options,
      onEnter: (schema) => {
        visited.push(schema)
        return { type: schema.type, "x-after": metadata }
      }
    })
    assert.strictEqual(visited.length, 1)
    assert.deepStrictEqual(schema.ast.annotations, { "x-after": metadata })
  })

  it("propagates predicate exceptions unchanged", () => {
    const cause = new Error("annotation selection failed")
    throws(() =>
      fromJsonSchema({ type: "string", "x-sensitive": true }, {
        includeAnnotationKey: () => {
          throw cause
        }
      }), (error: unknown) => {
      assert.strictEqual(error, cause)
    })
  })

  it("keeps metadata at nested property, item, and union member locations", () => {
    const input = {
      type: "object",
      properties: {
        emails: {
          type: "array",
          items: {
            anyOf: [
              { type: "string", "x-sensitive": true },
              { type: "null", "x-empty": true }
            ]
          },
          "x-collection": true
        }
      },
      required: ["emails"],
      additionalProperties: false,
      "x-record": true
    }
    assert.deepStrictEqual(roundTrip(input), { ...input, additionalProperties: true })
  })

  it("retains custom metadata when constraints simplify to literals in either order", () => {
    const constraint = { type: "string", minLength: 1, "x-sensitive": true }
    const literal = { const: "hello" }
    for (const allOf of [[constraint, literal], [literal, constraint]]) {
      assert.deepStrictEqual(roundTrip({ type: "string", allOf }), {
        type: "string",
        enum: ["hello"],
        "x-sensitive": true
      })
    }
  })

  it("keeps custom metadata on the value while preserving standard check annotations", () => {
    const schema = fromJsonSchema({
      type: "string",
      "x-source": "outer",
      allOf: [
        { type: "string", minLength: 1, description: "nonempty", "x-source": "inner", "x-sensitive": true }
      ]
    }, options)
    assert.deepStrictEqual(schema.ast.annotations, { "x-source": "inner", "x-sensitive": true })
    assert.strictEqual(schema.ast.checks?.[0].annotations?.description, "nonempty")
    assert.isUndefined(schema.ast.checks?.[0].annotations?.["x-sensitive"])
  })

  it("retains metadata through deduplicated checks and uses the existing merge precedence", () => {
    assert.deepStrictEqual(
      roundTrip({
        type: "number",
        allOf: [
          { type: "integer", minimum: 0, "x-source": "first", "x-first": true },
          { type: "integer", maximum: 10, "x-source": "second", "x-second": true },
          { const: 3 }
        ]
      }),
      { type: "number", enum: [3], "x-source": "second", "x-first": true, "x-second": true }
    )
  })

  it("preserves metadata in schema dependencies of nested check groups", () => {
    assert.deepStrictEqual(
      roundTrip({
        type: "object",
        allOf: [{
          minProperties: 1,
          propertyNames: { minLength: 1, "x-sensitive": true },
          description: "Named object",
          allOf: [{ maxProperties: 2, description: "Small object" }]
        }]
      }),
      {
        type: "object",
        allOf: [{
          allOf: [
            { minProperties: 1 },
            { propertyNames: { type: "string", minLength: 1, "x-sensitive": true } },
            { maxProperties: 2, description: "Small object" }
          ],
          description: "Named object"
        }]
      }
    )
  })

  it("merges metadata on duplicate literal alternatives that survive an intersection", () => {
    assert.deepStrictEqual(
      roundTrip({
        allOf: [
          { enum: ["a", "b"] },
          {
            anyOf: [
              { const: "a", "x-first": true, "x-source": "first" },
              { const: "a", "x-second": true, "x-source": "second" },
              { const: "c", "x-discarded": true }
            ]
          }
        ]
      }),
      { type: "string", enum: ["a"], "x-first": true, "x-second": true, "x-source": "second" }
    )
  })

  it("discards metadata on eliminated alternatives without lifting it to the surviving value", () => {
    assert.deepStrictEqual(
      roundTrip({
        type: "string",
        anyOf: [
          { type: "number", "x-discarded": true },
          { const: "a", "x-surviving": true }
        ]
      }),
      { type: "string", enum: ["a"], "x-surviving": true }
    )
  })

  it("discards metadata on unreachable tuple elements", () => {
    assert.deepStrictEqual(
      roundTrip({
        allOf: [
          { type: "array", prefixItems: [{ type: "string", "x-discarded": true }], items: false },
          { type: "array", items: false, "x-array": true }
        ]
      }),
      { type: "array", items: false, "x-array": true }
    )
  })

  it("skips annotated references on discarded tuple elements", () => {
    const array = {
      type: "array",
      prefixItems: [{ $ref: "#/$defs/Unused", "x-sensitive": true }],
      items: false
    }
    const empty = { type: "array", items: false }
    for (const allOf of [[array, empty], [empty, array]]) {
      for (const importOptions of [undefined, options]) {
        const schema = SchemaRepresentation.fromJsonSchemaDocument({
          dialect: "draft-2020-12",
          schema: { allOf },
          definitions: { Unused: { not: { type: "string" } } }
        }, importOptions)
        assert.deepStrictEqual(Schema.toJsonSchemaDocument(schema, options), {
          dialect: "draft-2020-12",
          schema: empty,
          definitions: {}
        })
      }
    }
  })

  it("does not validate discarded annotations through another use of the same reference", () => {
    const schemas = SchemaRepresentation.fromJsonSchemaMultiDocument({
      dialect: "draft-2020-12",
      schemas: [
        {
          allOf: [
            {
              type: "array",
              prefixItems: [{ $ref: "#/$defs/A", "x-sensitive": true }],
              items: false
            },
            { type: "array", items: false }
          ]
        },
        { $ref: "#/$defs/A" }
      ],
      definitions: { A: { $ref: "#/$defs/A" } }
    }, options)
    assert.deepStrictEqual(Schema.toJsonSchemaDocument(schemas[0], options).schema, {
      type: "array",
      items: false
    })
    assert.strictEqual(schemas[1].ast._tag, "Suspend")
  })

  it("preserves shared definition metadata and keeps reference-local annotations isolated", () => {
    const schemas = SchemaRepresentation.fromJsonSchemaMultiDocument({
      dialect: "draft-2020-12",
      schemas: [
        { $ref: "#/$defs/Name", "x-local": true },
        { $ref: "#/$defs/Name" },
        { type: "array", items: { $ref: "#/$defs/Name" }, "x-array": true }
      ],
      definitions: {
        Name: { type: "string", "x-definition": true },
        Unused: { type: "number", "x-unused": true }
      }
    }, {
      includeAnnotationKey: (key) => {
        assert.notStrictEqual(key, "x-unused")
        return options.includeAnnotationKey(key)
      }
    })
    assert.deepStrictEqual(schemas[0].ast.annotations, { "x-local": true })
    assert.strictEqual(Schema.toJsonSchemaDocument(schemas[0], options).definitions.Name["x-definition"], true)
    assert.deepStrictEqual(schemas[1].ast.annotations, { identifier: "Name", "x-definition": true })
    assert.deepStrictEqual(schemas[2].ast.annotations, { "x-array": true })
    assert.strictEqual(Schema.toJsonSchemaDocument(schemas[2], options).definitions.Name["x-definition"], true)
  })
})
