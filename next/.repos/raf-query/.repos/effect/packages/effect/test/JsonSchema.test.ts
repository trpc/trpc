import { assert, describe, it } from "@effect/vitest"
import { deepStrictEqual } from "@effect/vitest/utils"
import * as JsonSchema from "effect/JsonSchema"
import * as Schema from "effect/Schema"

// oxlint-disable-next-line @typescript-eslint/no-require-imports
const AjvDraft07 = require("ajv")
// oxlint-disable-next-line @typescript-eslint/no-require-imports
const AjvDraft2020 = require("ajv/dist/2020")
// oxlint-disable-next-line @typescript-eslint/no-require-imports
const AjvDraft04 = require("ajv-draft-04")

const ajvDraft07 = new AjvDraft07.default({ allErrors: true, strict: false })
const ajvDraft2020 = new AjvDraft2020.default({ allErrors: true, strict: false })
const ajvDraft04 = new AjvDraft04.default({ allErrors: true, strict: false })

function makeSchema(document: JsonSchema.Document<"draft-04" | "draft-07">): JsonSchema.JsonSchema {
  return {
    $schema: document.dialect === "draft-04"
      ? JsonSchema.META_SCHEMA_URI_DRAFT_04
      : JsonSchema.META_SCHEMA_URI_DRAFT_07,
    ...document.schema,
    ...(Object.keys(document.definitions).length > 0 ? { definitions: document.definitions } : {})
  }
}

function makeCanonicalSchema(document: JsonSchema.Document<"draft-2020-12">): JsonSchema.JsonSchema {
  return {
    $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12,
    ...document.schema,
    ...(Object.keys(document.definitions).length > 0 ? { $defs: document.definitions } : {})
  }
}

function assertDoesNotMutate<A>(input: A, f: (input: A) => unknown): void {
  const before = structuredClone(input)
  f(input)
  deepStrictEqual(input, before)
}

describe("JsonSchema", () => {
  describe("meta-schema URIs", () => {
    it("exports the URI for every supported dialect", () => {
      deepStrictEqual(JsonSchema.META_SCHEMA_URI_DRAFT_04, "http://json-schema.org/draft-04/schema#")
      deepStrictEqual(JsonSchema.META_SCHEMA_URI_DRAFT_07, "http://json-schema.org/draft-07/schema#")
      deepStrictEqual(JsonSchema.META_SCHEMA_URI_DRAFT_2020_12, "https://json-schema.org/draft/2020-12/schema")
    })
  })

  describe("sanitizeOpenApiComponentsSchemasKey", () => {
    const sanitizeOpenApiComponentsKey = JsonSchema.sanitizeOpenApiComponentsSchemasKey

    it("returns '_' for empty input", () => {
      deepStrictEqual(sanitizeOpenApiComponentsKey(""), "_")
    })

    it("returns input when already valid", () => {
      deepStrictEqual(sanitizeOpenApiComponentsKey("Simple"), "Simple")
      deepStrictEqual(sanitizeOpenApiComponentsKey("with-dash"), "with-dash")
      deepStrictEqual(sanitizeOpenApiComponentsKey("with_underscore"), "with_underscore")
      deepStrictEqual(sanitizeOpenApiComponentsKey("with.dot"), "with.dot")
      deepStrictEqual(sanitizeOpenApiComponentsKey("A1.B2-_"), "A1.B2-_")
    })

    it("replaces invalid characters with '_'", () => {
      const cases: ReadonlyArray<readonly [string, string]> = [
        ["a b", "a_b"],
        ["a/b", "a_b"],
        ["a:b", "a_b"],
        ["a@b", "a_b"],
        ["a#b", "a_b"],
        ["a?b", "a_b"],
        ["a+b", "a_b"],
        ["a*b", "a_b"],
        ["a,b", "a_b"],
        ["a;b", "a_b"],
        ["a|b", "a_b"],
        ["a=b", "a_b"]
      ]
      for (const [input, expected] of cases) {
        deepStrictEqual(sanitizeOpenApiComponentsKey(input), expected)
      }
    })

    it("preserves length when only replacements are needed", () => {
      deepStrictEqual(sanitizeOpenApiComponentsKey("a b").length, "a b".length)
      deepStrictEqual(sanitizeOpenApiComponentsKey("..").length, "..".length)
      deepStrictEqual(sanitizeOpenApiComponentsKey("a--b").length, "a--b".length)
    })

    it("replaces non-ascii characters with '_'", () => {
      deepStrictEqual(sanitizeOpenApiComponentsKey("café"), "caf_")
      deepStrictEqual(sanitizeOpenApiComponentsKey("你好"), "__")
      deepStrictEqual(sanitizeOpenApiComponentsKey("🤖"), "_")
      deepStrictEqual(sanitizeOpenApiComponentsKey("a🤖b"), "a_b")
    })

    it("is idempotent", () => {
      const inputs = [
        "",
        "Simple",
        "a b",
        "a/b",
        "a..b",
        "café",
        "🤖",
        "A1.B2-_"
      ] as const
      for (const input of inputs) {
        const once = sanitizeOpenApiComponentsKey(input)
        const twice = sanitizeOpenApiComponentsKey(once)
        deepStrictEqual(twice, once)
      }
    })
  })

  describe("fromSchemaDraft07", () => {
    it("rewrites the Draft-07 meta-schema URI without an empty fragment", () => {
      deepStrictEqual(
        JsonSchema.fromSchemaDraft07({ $schema: "http://json-schema.org/draft-07/schema" }).schema,
        { $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12 }
      )
    })

    it("preserves all Draft-07 semantics and opaque custom keywords", () => {
      const custom = { $ref: "#/definitions/Literal" }
      const input: JsonSchema.JsonSchema = {
        if: { properties: { kind: { const: "full" } } },
        // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword
        then: { required: ["value"] },
        else: { not: { required: ["value"] } },
        contains: { type: "number" },
        dependencies: {
          enabled: ["value"],
          kind: { required: ["label"] }
        },
        "x-custom": custom
      }

      deepStrictEqual(JsonSchema.fromSchemaDraft07(input), {
        dialect: "draft-2020-12",
        schema: {
          if: { properties: { kind: { const: "full" } } },
          // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword
          then: { required: ["value"] },
          else: { not: { required: ["value"] } },
          contains: { type: "number" },
          dependentRequired: { enabled: ["value"] },
          dependentSchemas: { kind: { required: ["label"] } },
          "x-custom": custom
        },
        definitions: {}
      })
    })

    it("preserves Draft-07 validation semantics in the canonical dialect", () => {
      const source: JsonSchema.JsonSchema = {
        type: "object",
        properties: {
          kind: { enum: ["full", "compact"] },
          value: { type: "string" },
          extra: true,
          values: { type: "array", contains: { type: "number" } }
        },
        required: ["kind", "values"],
        dependencies: { value: ["extra"] },
        if: { properties: { kind: { const: "full" } } },
        // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword
        then: { required: ["value"] },
        else: { not: { required: ["value"] } }
      }
      const canonical = makeCanonicalSchema(JsonSchema.fromSchemaDraft07(source))
      deepStrictEqual(ajvDraft07.validateSchema(source), true)
      deepStrictEqual(ajvDraft2020.validateSchema(canonical), true)

      const validateSource = ajvDraft07.compile(source)
      const validateCanonical = ajvDraft2020.compile(canonical)
      for (
        const value of [
          { kind: "full", value: "ok", extra: true, values: [1] },
          { kind: "full", values: [1] },
          { kind: "full", value: "missing dependency", values: [1] },
          { kind: "compact", values: [1] },
          { kind: "compact", value: "forbidden", extra: true, values: [1] },
          { kind: "full", value: "ok", extra: true, values: ["no"] }
        ]
      ) {
        deepStrictEqual(validateCanonical(value), validateSource(value))
      }
    })

    it("converts Draft-07 plain-name identifiers to canonical anchors", () => {
      const document = JsonSchema.fromSchemaDraft07({
        $id: "https://example.com/node#entry",
        type: "string"
      })

      deepStrictEqual(document.schema, {
        $id: "https://example.com/node",
        $anchor: "entry",
        type: "string"
      })
    })

    it("converts canonical anchors without schema identifiers", () => {
      const document: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: { $anchor: "entry" },
        definitions: {}
      }

      deepStrictEqual(JsonSchema.toDocumentDraft07(document).schema, {
        $id: "#entry"
      })
      deepStrictEqual(JsonSchema.toDocumentDraft04(document).schema, {
        id: "#entry"
      })
    })

    it("rejects canonical anchors combined with schema identifiers", () => {
      for (const $id of ["https://example.com/node", "https://example.com/node#"]) {
        const document: JsonSchema.Document<"draft-2020-12"> = {
          dialect: "draft-2020-12",
          schema: { $id, $anchor: "entry" },
          definitions: {}
        }

        assert.throws(
          () => JsonSchema.toDocumentDraft07(document),
          /Cannot convert JSON Schema keyword "\$anchor" to Draft-07/
        )
        assert.throws(
          () => JsonSchema.toDocumentDraft04(document),
          /Cannot convert JSON Schema keyword "\$anchor" to Draft-04/
        )
      }
    })

    it("rejects canonical anchors that cannot become legacy plain-name identifiers", () => {
      const document: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: { $anchor: "_node" },
        definitions: {}
      }

      assert.throws(
        () => JsonSchema.toDocumentDraft07(document),
        /Cannot convert JSON Schema keyword "\$anchor" to Draft-07/
      )
      assert.throws(
        () => JsonSchema.toDocumentDraft04(document),
        /Cannot convert JSON Schema keyword "\$anchor" to Draft-04/
      )
    })

    it("rejects Draft-07 identifiers with fragments that cannot become anchors", () => {
      assert.throws(
        () => JsonSchema.fromSchemaDraft07({ $id: "https://example.com/node#not/a/plain-name" }),
        /Cannot convert JSON Schema keyword "\$id" to Draft 2020-12/
      )
    })

    it("rejects Draft-07 custom keywords that would become active in the canonical dialect", () => {
      for (
        const schema of [
          { dependentRequired: { value: ["other"] } },
          { $vocabulary: { "https://example.com/vocabulary": true } },
          { contentSchema: {} },
          { deprecated: true }
        ]
      ) {
        assert.throws(
          () => JsonSchema.fromSchemaDraft07(schema),
          /Cannot convert JSON Schema keyword .* to Draft 2020-12/
        )
      }
    })

    it("preserves not", () => {
      const input: JsonSchema.JsonSchema = { not: { type: "string" } }
      const result = JsonSchema.fromSchemaDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: { not: { type: "string" } },
        definitions: {}
      })
    })

    it("normalizes a schema without definitions to the canonical document shape", () => {
      const input: JsonSchema.JsonSchema = {
        type: "string"
      }
      const result = JsonSchema.fromSchemaDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "string"
        },
        definitions: {}
      })
    })

    it("extracts root definitions and rewrites Draft-07 refs to $defs refs", () => {
      const input: JsonSchema.JsonSchema = {
        type: "object",
        properties: {
          a: { $ref: "#/definitions/A" },
          b: { $ref: "#/definitions/B" }
        },
        definitions: {
          A: {
            type: "string",
            $ref: "#/definitions/B"
          },
          B: {
            type: "number"
          }
        }
      }
      const result = JsonSchema.fromSchemaDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            a: { $ref: "#/$defs/A" },
            b: { $ref: "#/$defs/B" }
          }
        },
        definitions: {
          A: {
            $ref: "#/$defs/B"
          },
          B: {
            type: "number"
          }
        }
      })

      const validateCanonical = ajvDraft2020.compile(makeCanonicalSchema(result))
      const values = [
        { a: 1, b: 2 },
        { a: "not a number", b: 2 },
        { a: 1, b: "not a number" }
      ]
      deepStrictEqual(values.map(validateCanonical), [true, false, false])
    })

    it("ignores $id next to Draft-07 refs when tracking resources", () => {
      const result = JsonSchema.fromSchemaDraft07({
        definitions: {
          Target: { type: "string" },
          Reference: {
            $id: "nested.json",
            $ref: "#/definitions/Target"
          }
        }
      })

      deepStrictEqual(result.definitions.Reference, { $ref: "#/$defs/Target" })
    })

    it("converts Draft-07 tuple items to prefixItems", () => {
      const input: JsonSchema.JsonSchema = {
        type: "array",
        items: [
          { type: "string" },
          { type: "number" }
        ],
        additionalItems: { type: "boolean" }
      }
      const result = JsonSchema.fromSchemaDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "array",
          prefixItems: [
            { type: "string" },
            { type: "number" }
          ],
          items: { type: "boolean" }
        },
        definitions: {}
      })
    })

    it("relocates refs into converted tuple items and schema dependencies", () => {
      const result = JsonSchema.fromSchemaDraft07({
        properties: {
          container: {
            items: [{ type: "string" }],
            dependencies: { value: { type: "number" } }
          },
          tupleItem: { $ref: "#/properties/container/items/0" },
          dependency: { $ref: "#/properties/container/dependencies/value" }
        }
      })

      deepStrictEqual(result.schema, {
        properties: {
          container: {
            prefixItems: [{ type: "string" }],
            dependentSchemas: { value: { type: "number" } }
          },
          tupleItem: { $ref: "#/properties/container/prefixItems/0" },
          dependency: { $ref: "#/properties/container/dependentSchemas/value" }
        }
      })
    })

    it("preserves a single items schema as items", () => {
      const input: JsonSchema.JsonSchema = {
        type: "array",
        items: { type: "string" }
      }
      const result = JsonSchema.fromSchemaDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "array",
          items: { type: "string" }
        },
        definitions: {}
      })
    })

    it("preserves annotations", () => {
      const input: JsonSchema.JsonSchema = {
        type: "string",
        title: "My String",
        description: "A string value",
        default: "default",
        examples: ["example1", "example2"],
        format: "email",
        readOnly: true,
        writeOnly: true
      }
      const result = JsonSchema.fromSchemaDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "string",
          title: "My String",
          description: "A string value",
          default: "default",
          examples: ["example1", "example2"],
          format: "email",
          readOnly: true,
          writeOnly: true
        },
        definitions: {}
      })
    })

    it("preserves string constraints", () => {
      const input: JsonSchema.JsonSchema = {
        type: "string",
        pattern: "^[a-z]+$",
        minLength: 1,
        maxLength: 100
      }
      const result = JsonSchema.fromSchemaDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "string",
          pattern: "^[a-z]+$",
          minLength: 1,
          maxLength: 100
        },
        definitions: {}
      })
    })

    it("preserves number constraints", () => {
      const input: JsonSchema.JsonSchema = {
        type: "number",
        minimum: 0,
        maximum: 100,
        exclusiveMinimum: 0,
        exclusiveMaximum: 100,
        multipleOf: 2
      }
      const result = JsonSchema.fromSchemaDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "number",
          minimum: 0,
          maximum: 100,
          exclusiveMinimum: 0,
          exclusiveMaximum: 100,
          multipleOf: 2
        },
        definitions: {}
      })
    })

    it("preserves array constraints", () => {
      const input: JsonSchema.JsonSchema = {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 10,
        uniqueItems: true
      }
      const result = JsonSchema.fromSchemaDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 10,
          uniqueItems: true
        },
        definitions: {}
      })
    })

    it("preserves object constraints", () => {
      const input: JsonSchema.JsonSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" }
        },
        required: ["name"],
        patternProperties: {
          "^S_": { type: "string" }
        },
        additionalProperties: { type: "boolean" },
        propertyNames: { pattern: "^[A-Z]" },
        minProperties: 1,
        maxProperties: 10
      }
      const result = JsonSchema.fromSchemaDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" }
          },
          required: ["name"],
          patternProperties: {
            "^S_": { type: "string" }
          },
          additionalProperties: { type: "boolean" },
          propertyNames: { pattern: "^[A-Z]" },
          minProperties: 1,
          maxProperties: 10
        },
        definitions: {}
      })
    })

    it("preserves enum, const, allOf, anyOf, and oneOf", () => {
      const input: JsonSchema.JsonSchema = {
        enum: ["a", "b", "c"],
        const: "constant",
        allOf: [
          { type: "array", items: { type: "string" } },
          { minItems: 1 }
        ],
        anyOf: [
          { type: "array", items: [{ type: "string" }] },
          { type: "number" }
        ],
        oneOf: [
          { type: "array", items: [{ type: "string" }], additionalItems: { type: "number" } },
          { type: "boolean" }
        ]
      }
      const result = JsonSchema.fromSchemaDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          enum: ["a", "b", "c"],
          const: "constant",
          allOf: [
            { type: "array", items: { type: "string" } },
            { minItems: 1 }
          ],
          anyOf: [
            { type: "array", prefixItems: [{ type: "string" }] },
            { type: "number" }
          ],
          oneOf: [
            { type: "array", prefixItems: [{ type: "string" }], items: { type: "number" } },
            { type: "boolean" }
          ]
        },
        definitions: {}
      })
    })

    it("moves nested definitions to $defs and relocates local JSON Pointer refs", () => {
      const input: JsonSchema.JsonSchema = {
        type: "object",
        properties: {
          nested: {
            definitions: {
              NestedType: {
                type: "number"
              }
            },
            $ref: "#/properties/nested/definitions/NestedType"
          }
        }
      }
      const result = JsonSchema.fromSchemaDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            nested: {
              $defs: {
                NestedType: {
                  type: "number"
                }
              },
              $ref: "#/properties/nested/$defs/NestedType"
            }
          }
        },
        definitions: {}
      })
    })

    it("relocates fragment refs relative to nested schema resources", () => {
      const result = JsonSchema.fromSchemaDraft07({
        properties: {
          nested: {
            $id: "nested.json",
            definitions: { Value: { type: "string" } },
            allOf: [{ $ref: "#/definitions/Value" }]
          }
        }
      })

      deepStrictEqual(result.schema, {
        properties: {
          nested: {
            $id: "nested.json",
            $defs: { Value: { type: "string" } },
            allOf: [{ $ref: "#/$defs/Value" }]
          }
        }
      })
    })

    it("relocates URI refs to nested schema resources", () => {
      const result = JsonSchema.fromSchemaDraft07({
        $id: "https://example.com/root.json",
        properties: {
          value: { $ref: "nested.json#/definitions/Value" }
        },
        definitions: {
          Nested: {
            $id: "schemas/../nested.json",
            definitions: { Value: { type: "string" } }
          }
        }
      })

      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          $id: "https://example.com/root.json",
          properties: {
            value: { $ref: "nested.json#/$defs/Value" }
          }
        },
        definitions: {
          Nested: {
            $id: "schemas/../nested.json",
            $defs: { Value: { type: "string" } }
          }
        }
      })
    })

    it("relocates JSON Pointer URI fragments", () => {
      const result = JsonSchema.fromSchemaDraft07({
        properties: {
          value: { $ref: "#/definitions/a%20b" },
          equivalent: { $ref: "#/definitions/%56alue" },
          encodedSeparators: { $ref: "#%2Fdefinitions%2FValue" },
          percent: { $ref: "#/definitions/a%25b" },
          escaped: { $ref: "#/definitions/a~1b" },
          utf8: { $ref: "#/definitions/caf%C3%A9" },
          invalid: { $ref: "#/%" },
          invalidUtf8: { $ref: "#/%FF" }
        },
        definitions: {
          "a b": { type: "string" },
          Value: { type: "number" },
          "a%b": { type: "boolean" },
          "a/b": { type: "object" },
          "café": { type: "array" }
        }
      })

      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          properties: {
            value: { $ref: "#/$defs/a%20b" },
            equivalent: { $ref: "#/$defs/Value" },
            encodedSeparators: { $ref: "#/$defs/Value" },
            percent: { $ref: "#/$defs/a%25b" },
            escaped: { $ref: "#/$defs/a~1b" },
            utf8: { $ref: "#/$defs/caf%C3%A9" },
            invalid: { $ref: "#/%" },
            invalidUtf8: { $ref: "#/%FF" }
          }
        },
        definitions: {
          "a b": { type: "string" },
          Value: { type: "number" },
          "a%b": { type: "boolean" },
          "a/b": { type: "object" },
          "café": { type: "array" }
        }
      })
    })

    it("preserves custom properties in Draft-07 input", () => {
      const input: JsonSchema.JsonSchema = {
        type: "string",
        "x-custom": "value"
      }
      const result = JsonSchema.fromSchemaDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "string",
          "x-custom": "value"
        },
        definitions: {}
      })
    })

    it("preserves malformed values for recognized keywords", () => {
      const input: JsonSchema.JsonSchema = {
        $ref: 1,
        definitions: {
          Invalid: [1, { not: false }] as unknown as JsonSchema.JsonSchema
        },
        properties: {
          nested: {
            definitions: "invalid",
            not: [false, { type: "string" }]
          }
        },
        patternProperties: "invalid",
        allOf: "invalid"
      }

      deepStrictEqual(JsonSchema.fromSchemaDraft07(input), {
        dialect: "draft-2020-12",
        schema: {
          $ref: 1,
          properties: {
            nested: {
              $defs: "invalid",
              not: [false, { type: "string" }]
            }
          },
          patternProperties: "invalid",
          allOf: "invalid"
        },
        definitions: {
          Invalid: [1, { not: false }] as unknown as JsonSchema.JsonSchema
        }
      })
    })

    it("ignores additionalItems when items is not a tuple", () => {
      deepStrictEqual(
        JsonSchema.fromSchemaDraft07({
          type: "array",
          items: { type: "string" },
          additionalItems: false
        }).schema,
        {
          type: "array",
          items: { type: "string" }
        }
      )
    })
  })

  describe("fromSchemaDraft2020_12", () => {
    it("normalizes a schema without $defs to the canonical document shape", () => {
      const input: JsonSchema.JsonSchema = {
        type: "string"
      }
      const result = JsonSchema.fromSchemaDraft2020_12(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "string"
        },
        definitions: {}
      })
    })

    it("extracts root $defs without rewriting Draft-2020-12 refs", () => {
      const input: JsonSchema.JsonSchema = {
        type: "object",
        properties: {
          a: { $ref: "#/$defs/A" },
          b: { $ref: "#/$defs/B" }
        },
        $defs: {
          A: {
            type: "string",
            $ref: "#/$defs/B"
          },
          B: {
            type: "number"
          }
        }
      }
      const result = JsonSchema.fromSchemaDraft2020_12(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            a: { $ref: "#/$defs/A" },
            b: { $ref: "#/$defs/B" }
          }
        },
        definitions: {
          A: {
            type: "string",
            $ref: "#/$defs/B"
          },
          B: {
            type: "number"
          }
        }
      })
    })

    it("preserves nested definitions and local JSON Pointer refs", () => {
      const input: JsonSchema.JsonSchema = {
        type: "object",
        properties: {
          nested: {
            definitions: {
              NestedType: {
                type: "number"
              }
            },
            $ref: "#/properties/nested/definitions/NestedType"
          }
        }
      }
      const result = JsonSchema.fromSchemaDraft2020_12(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            nested: {
              definitions: {
                NestedType: {
                  type: "number"
                }
              },
              $ref: "#/properties/nested/definitions/NestedType"
            }
          }
        },
        definitions: {}
      })
    })

    it("keeps non-standard properties for Draft-2020-12 input", () => {
      const input: JsonSchema.JsonSchema = {
        type: "string",
        "x-custom": "value"
      }
      const result = JsonSchema.fromSchemaDraft2020_12(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "string",
          "x-custom": "value"
        },
        definitions: {}
      })
    })
  })

  describe("fromSchemaOpenApi3_1", () => {
    it("normalizes the OpenAPI 3.1 base dialect URI", () => {
      deepStrictEqual(
        JsonSchema.fromSchemaOpenApi3_1({ $schema: "https://spec.openapis.org/oas/3.1/dialect/base" }).schema,
        { $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12 }
      )
    })

    it("preserves non-string refs and malformed schema maps", () => {
      const input: JsonSchema.JsonSchema = {
        $ref: null,
        enum: [null],
        properties: [{ $ref: "#/components/schemas/Literal" }]
      }

      deepStrictEqual(JsonSchema.fromSchemaOpenApi3_1(input), {
        dialect: "draft-2020-12",
        schema: input,
        definitions: {}
      })
    })

    it("rewrites OpenAPI component schema refs to $defs refs", () => {
      const input: JsonSchema.JsonSchema = {
        type: "object",
        properties: {
          a: { $ref: "#/components/schemas/A" },
          b: { $ref: "#/components/schemas/B" },
          dynamic: { $dynamicRef: "#/components/schemas/Dynamic" }
        }
      }
      const result = JsonSchema.fromSchemaOpenApi3_1(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            a: { $ref: "#/$defs/A" },
            b: { $ref: "#/$defs/B" },
            dynamic: { $dynamicRef: "#/$defs/Dynamic" }
          }
        },
        definitions: {}
      })
    })

    it("rewrites percent-encoded OpenAPI component refs", () => {
      deepStrictEqual(
        JsonSchema.fromSchemaOpenApi3_1({ $ref: "#%2Fcomponents%2Fschemas%2FA%20B" }),
        {
          dialect: "draft-2020-12",
          schema: { $ref: "#/$defs/A%20B" },
          definitions: {}
        }
      )
    })

    it("normalizes singular examples throughout OpenAPI 3.1 schemas", () => {
      deepStrictEqual(
        JsonSchema.fromSchemaOpenApi3_1({
          example: "root",
          properties: {
            value: { example: "nested" }
          }
        }),
        {
          dialect: "draft-2020-12",
          schema: {
            examples: ["root"],
            properties: {
              value: { examples: ["nested"] }
            }
          },
          definitions: {}
        }
      )
    })

    it("merges singular and array examples in OpenAPI 3.1 schemas", () => {
      deepStrictEqual(
        JsonSchema.fromSchemaOpenApi3_1({ example: "singular", examples: ["first", "second"] }).schema,
        { examples: ["singular", "first", "second"] }
      )
    })

    it("rewrites refs only in schema positions", () => {
      const literal = { $ref: "#/components/schemas/Literal" }
      const input: JsonSchema.JsonSchema = {
        properties: { value: { $ref: "#/components/schemas/Value" } },
        const: literal,
        enum: [literal],
        default: literal,
        examples: [literal]
      }

      deepStrictEqual(JsonSchema.fromSchemaOpenApi3_1(input), {
        dialect: "draft-2020-12",
        schema: {
          properties: { value: { $ref: "#/$defs/Value" } },
          const: literal,
          enum: [literal],
          default: literal,
          examples: [literal]
        },
        definitions: {}
      })
    })

    it("rewrites refs throughout Draft 2020-12 subschemas", () => {
      const input: JsonSchema.JsonSchema = {
        $defs: { Alias: { $ref: "#/components/schemas/Value" } },
        properties: { value: { $ref: "#/components/schemas/Value" } },
        patternProperties: { pattern: { $ref: "#/components/schemas/Value" } },
        dependentSchemas: { dependency: { $ref: "#/components/schemas/Value" } },
        allOf: [{ $ref: "#/components/schemas/Value" }],
        anyOf: [{ $ref: "#/components/schemas/Value" }],
        oneOf: [{ $ref: "#/components/schemas/Value" }],
        prefixItems: [{ $ref: "#/components/schemas/Value" }],
        additionalProperties: { $ref: "#/components/schemas/Value" },
        unevaluatedProperties: { $ref: "#/components/schemas/Value" },
        propertyNames: { $ref: "#/components/schemas/Value" },
        items: { $ref: "#/components/schemas/Value" },
        contains: { $ref: "#/components/schemas/Value" },
        unevaluatedItems: { $ref: "#/components/schemas/Value" },
        not: { $ref: "#/components/schemas/Value" },
        if: { $ref: "#/components/schemas/Value" },
        // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword
        then: { $ref: "#/components/schemas/Value" },
        else: { $ref: "#/components/schemas/Value" },
        contentSchema: { $ref: "#/components/schemas/Value" }
      }

      deepStrictEqual(JsonSchema.fromSchemaOpenApi3_1(input), {
        dialect: "draft-2020-12",
        schema: {
          properties: { value: { $ref: "#/$defs/Value" } },
          patternProperties: { pattern: { $ref: "#/$defs/Value" } },
          dependentSchemas: { dependency: { $ref: "#/$defs/Value" } },
          allOf: [{ $ref: "#/$defs/Value" }],
          anyOf: [{ $ref: "#/$defs/Value" }],
          oneOf: [{ $ref: "#/$defs/Value" }],
          prefixItems: [{ $ref: "#/$defs/Value" }],
          additionalProperties: { $ref: "#/$defs/Value" },
          unevaluatedProperties: { $ref: "#/$defs/Value" },
          propertyNames: { $ref: "#/$defs/Value" },
          items: { $ref: "#/$defs/Value" },
          contains: { $ref: "#/$defs/Value" },
          unevaluatedItems: { $ref: "#/$defs/Value" },
          not: { $ref: "#/$defs/Value" },
          if: { $ref: "#/$defs/Value" },
          // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword
          then: { $ref: "#/$defs/Value" },
          else: { $ref: "#/$defs/Value" },
          contentSchema: { $ref: "#/$defs/Value" }
        },
        definitions: { Alias: { $ref: "#/$defs/Value" } }
      })
    })

    it("does not rewrite refs inside root schema resources", () => {
      const input: JsonSchema.JsonSchema = {
        $id: "inline.json",
        allOf: [
          { $ref: "#/components/schemas/Value" },
          { $dynamicRef: "#/components/schemas/Value" }
        ]
      }

      deepStrictEqual(JsonSchema.fromSchemaOpenApi3_1(input), {
        dialect: "draft-2020-12",
        schema: input,
        definitions: {}
      })
    })

    it("extracts root $defs after rewriting OpenAPI component refs", () => {
      const input: JsonSchema.JsonSchema = {
        type: "object",
        properties: {
          a: {
            $ref: "#/components/schemas/A"
          }
        },
        $defs: {
          MyType: {
            type: "string"
          }
        }
      }
      const result = JsonSchema.fromSchemaOpenApi3_1(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            a: {
              $ref: "#/$defs/A"
            }
          }
        },
        definitions: {
          MyType: {
            type: "string"
          }
        }
      })
    })

    it("preserves nested definitions and local JSON Pointer refs", () => {
      const input: JsonSchema.JsonSchema = {
        type: "object",
        properties: {
          nested: {
            definitions: {
              NestedType: {
                type: "number"
              }
            },
            $ref: "#/properties/nested/definitions/NestedType"
          }
        }
      }
      const result = JsonSchema.fromSchemaOpenApi3_1(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            nested: {
              definitions: {
                NestedType: {
                  type: "number"
                }
              },
              $ref: "#/properties/nested/definitions/NestedType"
            }
          }
        },
        definitions: {}
      })
    })

    it("keeps non-standard properties for OpenAPI 3.1 input", () => {
      const input: JsonSchema.JsonSchema = {
        type: "string",
        "x-custom": "value"
      }
      const result = JsonSchema.fromSchemaOpenApi3_1(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "string",
          "x-custom": "value"
        },
        definitions: {}
      })
    })
  })

  describe("fromSchemaOpenApi3_0", () => {
    function assertFromSchemaOpenApi3_0(input: JsonSchema.JsonSchema, expected: {
      readonly schema: JsonSchema.JsonSchema
      readonly definitions?: JsonSchema.Definitions
    }) {
      const result = JsonSchema.fromSchemaOpenApi3_0(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: expected.schema,
        definitions: expected.definitions ?? {}
      })
    }

    it("rewrites OpenAPI 3.0 component schema refs to $defs refs", () => {
      const input: JsonSchema.JsonSchema = {
        type: "object",
        properties: {
          a: { $ref: "#/components/schemas/A" },
          b: { $ref: "#/components/schemas/B" }
        }
      }
      const result = JsonSchema.fromSchemaOpenApi3_0(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            a: { $ref: "#/$defs/A" },
            b: { $ref: "#/$defs/B" }
          }
        },
        definitions: {}
      })
    })

    it("rewrites percent-encoded OpenAPI 3.0 component refs", () => {
      deepStrictEqual(
        JsonSchema.fromSchemaOpenApi3_0({ $ref: "#%2Fcomponents%2Fschemas%2FA%20B" }),
        {
          dialect: "draft-2020-12",
          schema: { $ref: "#/$defs/A%20B" },
          definitions: {}
        }
      )
    })

    it("preserves definitions as an opaque OpenAPI 3.0 extension", () => {
      const definitions = { Value: { type: "string" } }
      deepStrictEqual(JsonSchema.fromSchemaOpenApi3_0({ definitions }), {
        dialect: "draft-2020-12",
        schema: { definitions },
        definitions: {}
      })
    })

    it("normalizes singular OpenAPI 3.0 example to a draft examples array", () => {
      const input: JsonSchema.JsonSchema = {
        type: "string",
        example: "a"
      }
      const result = JsonSchema.fromSchemaOpenApi3_0(input)
      deepStrictEqual(result, {
        dialect: "draft-2020-12",
        schema: {
          type: "string",
          examples: ["a"]
        },
        definitions: {}
      })
    })

    it("preserves the OpenAPI 3.0 deprecated annotation", () => {
      assertFromSchemaOpenApi3_0(
        { type: "string", deprecated: true },
        { schema: { type: "string", deprecated: true } }
      )
    })

    it("rejects examples because it is not active in OpenAPI 3.0", () => {
      assert.throws(
        () => JsonSchema.fromSchemaOpenApi3_0({ examples: ["value"] }),
        /Cannot convert JSON Schema keyword "examples" to Draft 2020-12/
      )
    })

    it("rejects Draft 2020-12 keywords that are not supported by OpenAPI 3.0", () => {
      assert.throws(
        () => JsonSchema.fromSchemaOpenApi3_0({ unevaluatedProperties: false }),
        /Cannot convert JSON Schema keyword "unevaluatedProperties" to Draft 2020-12/
      )
    })

    it("does not traverse opaque OpenAPI values", () => {
      const literal = { nullable: true, $ref: "#/components/schemas/Literal" }
      assertFromSchemaOpenApi3_0(
        {
          type: "object",
          default: literal,
          example: literal,
          discriminator: { mapping: { value: "#/components/schemas/Value" } },
          "x-custom": literal
        },
        {
          schema: {
            type: "object",
            default: literal,
            examples: [literal],
            discriminator: { mapping: { value: "#/components/schemas/Value" } },
            "x-custom": literal
          }
        }
      )
    })

    type OpenApi3_0Case = {
      readonly name: string
      readonly input: JsonSchema.JsonSchema
      readonly expected: JsonSchema.JsonSchema
    }

    function testOpenApi3_0Cases(cases: ReadonlyArray<OpenApi3_0Case>): void {
      for (const { expected, input, name } of cases) {
        it(name, () => assertFromSchemaOpenApi3_0(input, { schema: expected }))
      }
    }

    describe("nullable", () => {
      testOpenApi3_0Cases([
        {
          name: "ignores nullable without an explicit type",
          input: { nullable: true },
          expected: {}
        },
        {
          name: "adds null to a string type",
          input: { type: "string", nullable: true },
          expected: { type: ["string", "null"] }
        },
        {
          name: "does not widen enum values",
          input: { type: "string", enum: ["a", "b"], nullable: true },
          expected: { type: ["string", "null"], enum: ["a", "b"] }
        },
        {
          name: "does not duplicate null in enum values",
          input: { type: "string", enum: ["a", "b", null], nullable: true },
          expected: { type: ["string", "null"], enum: ["a", "b", null] }
        },
        {
          name: "preserves enum when null is its only value",
          input: { type: "string", enum: [null], nullable: true },
          expected: { type: ["string", "null"], enum: [null] }
        },
        {
          name: "ignores nullable when another constraint is present without type",
          input: { nullable: true, minimum: 0 },
          expected: { minimum: 0 }
        },
        {
          name: "drops nullable false",
          input: { type: "string", nullable: false },
          expected: { type: "string" }
        },
        {
          name: "normalizes nullable inside allOf independently from the parent",
          input: { type: "string", allOf: [{ nullable: true }] },
          expected: {
            type: "string",
            allOf: [{}]
          }
        },
        {
          name: "normalizes nullable on both a parent and its allOf member",
          input: { type: "string", nullable: true, allOf: [{ nullable: true }] },
          expected: {
            type: ["string", "null"],
            allOf: [{}]
          }
        }
      ])
    })

    describe("exclusivity", () => {
      testOpenApi3_0Cases([
        {
          name: "turns exclusiveMinimum true into the minimum value",
          input: { type: "number", minimum: 10, exclusiveMinimum: true },
          expected: { type: "number", exclusiveMinimum: 10 }
        },
        {
          name: "turns exclusiveMaximum true into the maximum value",
          input: { type: "number", maximum: 100, exclusiveMaximum: true },
          expected: { type: "number", exclusiveMaximum: 100 }
        },
        {
          name: "drops exclusiveMinimum false",
          input: { type: "number", minimum: 10, exclusiveMinimum: false },
          expected: { type: "number", minimum: 10 }
        },
        {
          name: "drops exclusiveMaximum false",
          input: { type: "number", maximum: 100, exclusiveMaximum: false },
          expected: { type: "number", maximum: 100 }
        },
        {
          name: "drops exclusiveMinimum true when minimum is absent",
          input: { type: "number", exclusiveMinimum: true },
          expected: { type: "number" }
        },
        {
          name: "drops exclusiveMaximum true when maximum is absent",
          input: { type: "number", exclusiveMaximum: true },
          expected: { type: "number" }
        }
      ])
    })
  })

  describe("toDocumentDraft07", () => {
    it("rewrites the canonical meta-schema URI with an empty fragment", () => {
      deepStrictEqual(
        JsonSchema.toDocumentDraft07({
          dialect: "draft-2020-12",
          schema: { $schema: `${JsonSchema.META_SCHEMA_URI_DRAFT_2020_12}#` },
          definitions: {}
        }).schema,
        { $schema: JsonSchema.META_SCHEMA_URI_DRAFT_07 }
      )
    })

    it("omits the canonical meta-schema URI from embedded resources", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {},
        definitions: {
          Embedded: {
            $id: "embedded.json",
            $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12,
            type: "string"
          }
        }
      }

      deepStrictEqual(JsonSchema.toDocumentDraft07(input).definitions.Embedded, {
        $id: "embedded.json",
        type: "string"
      })
    })

    it("rejects custom dialects in embedded resources", () => {
      assert.throws(
        () =>
          JsonSchema.toDocumentDraft07({
            dialect: "draft-2020-12",
            schema: {},
            definitions: {
              Embedded: {
                $id: "embedded.json",
                $schema: "https://example.com/dialect",
                type: "string"
              }
            }
          }),
        /Cannot convert JSON Schema keyword "\$schema" to Draft-07/
      )
    })

    it("lowers canonical keywords and preserves opaque custom keywords", () => {
      const custom = { $ref: "#/$defs/Literal" }
      const result = JsonSchema.toDocumentDraft07({
        dialect: "draft-2020-12",
        schema: {
          if: { properties: { kind: { const: "full" } } },
          // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword
          then: { required: ["value"] },
          else: { not: { required: ["value"] } },
          contains: { type: "number" },
          dependentRequired: {
            enabled: ["value"],
            kind: ["label"]
          },
          dependentSchemas: {
            kind: { minProperties: 1 },
            mode: { required: ["value"] }
          },
          "x-custom": custom
        },
        definitions: {}
      })

      deepStrictEqual(result.schema, {
        if: { properties: { kind: { const: "full" } } },
        // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword
        then: { required: ["value"] },
        else: { not: { required: ["value"] } },
        contains: { type: "number" },
        dependencies: {
          enabled: ["value"],
          kind: { allOf: [{ minProperties: 1 }, { required: ["label"] }] },
          mode: { required: ["value"] }
        },
        "x-custom": custom
      })
    })

    it("moves nested $defs to definitions and relocates local JSON Pointer refs", () => {
      const result = JsonSchema.toDocumentDraft07({
        dialect: "draft-2020-12",
        schema: {
          properties: {
            nested: {
              $defs: { Value: { type: "string" } },
              $ref: "#/properties/nested/$defs/Value"
            }
          }
        },
        definitions: {}
      })

      deepStrictEqual(result.schema, {
        properties: {
          nested: {
            definitions: { Value: { type: "string" } },
            allOf: [{ $ref: "#/properties/nested/definitions/Value" }]
          }
        }
      })
    })

    it("relocates fragment refs when emitting nested schema resources", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {
          allOf: [
            { $ref: "nested.json#/$defs/Value" },
            { $ref: "external.json#/$defs/Value" }
          ]
        },
        definitions: {
          Nested: {
            $id: "nested.json",
            $defs: { Value: { type: "string" } },
            allOf: [{ $ref: "#/$defs/Value" }]
          }
        }
      }

      deepStrictEqual(JsonSchema.toDocumentDraft07(input), {
        dialect: "draft-07",
        schema: {
          allOf: [
            { $ref: "nested.json#/definitions/Value" },
            { $ref: "external.json#/$defs/Value" }
          ]
        },
        definitions: {
          Nested: {
            $id: "nested.json",
            definitions: { Value: { type: "string" } },
            allOf: [{ $ref: "#/definitions/Value" }]
          }
        }
      })
      deepStrictEqual(JsonSchema.toDocumentDraft04(input), {
        dialect: "draft-04",
        schema: {
          allOf: [
            { $ref: "nested.json#/definitions/Value" },
            { $ref: "external.json#/$defs/Value" }
          ]
        },
        definitions: {
          Nested: {
            id: "nested.json",
            definitions: { Value: { type: "string" } },
            allOf: [{ $ref: "#/definitions/Value" }]
          }
        }
      })
    })

    it("converts contentSchema bodies and references", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {
          contentSchema: { $defs: { Value: { const: "value" } } },
          allOf: [{ $ref: "#/contentSchema/$defs/Value" }]
        },
        definitions: {}
      }

      deepStrictEqual(JsonSchema.toDocumentDraft07(input).schema, {
        contentSchema: { definitions: { Value: { const: "value" } } },
        allOf: [{ $ref: "#/contentSchema/definitions/Value" }]
      })
      deepStrictEqual(JsonSchema.toDocumentDraft04(input).schema, {
        contentSchema: { definitions: { Value: { enum: ["value"] } } },
        allOf: [{ $ref: "#/contentSchema/definitions/Value" }]
      })
    })

    it("rejects canonical constraints that Draft-07 cannot represent", () => {
      for (
        const schema of [
          { contains: { type: "string" }, minContains: 2 },
          { contains: { type: "string" }, maxContains: 3 },
          { unevaluatedProperties: false },
          { unevaluatedItems: false },
          { $dynamicRef: "#node" },
          { $vocabulary: { "https://example.com/vocabulary": true } },
          { dependencies: { value: ["other"] } }
        ]
      ) {
        assert.throws(
          () => JsonSchema.toDocumentDraft07({ dialect: "draft-2020-12", schema, definitions: {} }),
          /Cannot convert JSON Schema keyword .* to Draft-07/
        )
      }
    })

    it("preserves Schema.Never", () => {
      const result = JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(Schema.Never))
      deepStrictEqual(result, {
        dialect: "draft-07",
        schema: { not: {} },
        definitions: {}
      })
    })

    it("omits an empty required array", () => {
      const document = JsonSchema.toDocumentDraft07({
        dialect: "draft-2020-12",
        schema: { type: "object", required: [] },
        definitions: {}
      })

      deepStrictEqual(document.schema, { type: "object" })
    })

    it("preserves every supported annotation and validation keyword", () => {
      const schema: JsonSchema.JsonSchema = {
        type: "object",
        required: ["value"],
        enum: ["a", "b"],
        const: "a",
        title: "title",
        description: "description",
        default: "a",
        examples: ["a"],
        format: "custom",
        readOnly: true,
        writeOnly: true,
        pattern: "^a$",
        minimum: 0,
        maximum: 10,
        exclusiveMinimum: 0,
        exclusiveMaximum: 10,
        minLength: 1,
        maxLength: 10,
        minItems: 1,
        maxItems: 10,
        minProperties: 1,
        maxProperties: 10,
        multipleOf: 2,
        uniqueItems: true,
        properties: { value: { type: "string" } },
        patternProperties: { "^x-": { type: "string" } },
        not: { type: "null" },
        additionalProperties: false,
        propertyNames: { minLength: 1 },
        allOf: [{ type: "object" }],
        anyOf: [{ type: "string" }],
        oneOf: [{ type: "number" }],
        items: { type: "string" }
      }

      deepStrictEqual(
        JsonSchema.toDocumentDraft07({
          dialect: "draft-2020-12",
          schema,
          definitions: {}
        }).schema,
        schema
      )
    })

    it("preserves validation semantics", () => {
      const document = JsonSchema.toDocumentDraft07({
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            mode: { const: "on" },
            value: { type: "number", exclusiveMinimum: 0 },
            tuple: { type: "array", prefixItems: [{ type: "string" }], items: false }
          },
          required: ["mode", "value", "tuple"],
          additionalProperties: false
        },
        definitions: {}
      })
      const schema = makeSchema(document)
      deepStrictEqual(ajvDraft07.validateSchema(schema), true)

      const validate = ajvDraft07.compile(schema)
      deepStrictEqual(validate({ mode: "on", value: 1, tuple: ["a"] }), true)
      deepStrictEqual(validate({ mode: "off", value: 1, tuple: ["a"] }), false)
      deepStrictEqual(validate({ mode: "on", value: 0, tuple: ["a"] }), false)
      deepStrictEqual(validate({ mode: "on", value: 1, tuple: ["a", "b"] }), false)
    })

    it("rewrites $defs refs to Draft-07 definitions refs", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            a: { $ref: "#/$defs/A" },
            b: { $ref: "#/$defs/B" }
          }
        },
        definitions: {
          A: {
            type: "string",
            $ref: "#/$defs/B"
          },
          B: {
            type: "number"
          }
        }
      }
      const result = JsonSchema.toDocumentDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-07",
        schema: {
          type: "object",
          properties: {
            a: { $ref: "#/definitions/A" },
            b: { $ref: "#/definitions/B" }
          }
        },
        definitions: {
          A: {
            type: "string",
            allOf: [{ $ref: "#/definitions/B" }]
          },
          B: {
            type: "number"
          }
        }
      })
    })

    it("rewrites refs only in schema positions", () => {
      const literal = { $ref: "#/$defs/Literal" }
      const result = JsonSchema.toDocumentDraft07({
        dialect: "draft-2020-12",
        schema: {
          properties: { value: { $ref: "#/$defs/Value" } },
          const: literal,
          enum: [literal],
          default: literal,
          examples: [literal]
        },
        definitions: { Value: { type: "string" } }
      })

      deepStrictEqual(result, {
        dialect: "draft-07",
        schema: {
          properties: { value: { $ref: "#/definitions/Value" } },
          const: literal,
          enum: [literal],
          default: literal,
          examples: [literal]
        },
        definitions: { Value: { type: "string" } }
      })
    })

    it("preserves constraints next to refs and existing allOf", () => {
      const document = JsonSchema.toDocumentDraft07({
        dialect: "draft-2020-12",
        schema: {
          $ref: "#/$defs/S",
          minLength: 3,
          allOf: [{ maxLength: 5 }]
        },
        definitions: { S: { type: "string" } }
      })

      deepStrictEqual(document.schema, {
        minLength: 3,
        allOf: [
          { maxLength: 5 },
          { $ref: "#/definitions/S" }
        ]
      })

      const schema = makeSchema(document)
      deepStrictEqual(ajvDraft07.validateSchema(schema), true)
      const validate = ajvDraft07.compile(schema)
      deepStrictEqual(validate("abc"), true)
      deepStrictEqual(validate("a"), false)
      deepStrictEqual(validate("abcdef"), false)
    })

    it("keeps existing allOf locations stable when wrapping ref siblings", () => {
      const document = JsonSchema.toDocumentDraft07({
        dialect: "draft-2020-12",
        schema: {
          $ref: "#/$defs/Base",
          allOf: [{ type: "string" }],
          properties: { copy: { $ref: "#/allOf/0" } }
        },
        definitions: { Base: { type: "object" } }
      })

      deepStrictEqual(document.schema, {
        allOf: [
          { type: "string" },
          { $ref: "#/definitions/Base" }
        ],
        properties: { copy: { $ref: "#/allOf/0" } }
      })
    })

    it("converts prefixItems to a Draft-07 items tuple", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {
          type: "array",
          prefixItems: [
            { type: "string" },
            { type: "number" }
          ],
          items: { type: "boolean" }
        },
        definitions: {}
      }
      const result = JsonSchema.toDocumentDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-07",
        schema: {
          type: "array",
          items: [
            { type: "string" },
            { type: "number" }
          ],
          additionalItems: { type: "boolean" }
        },
        definitions: {}
      })
    })

    it("preserves a single items schema as items", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {
          type: "array",
          items: { type: "string" }
        },
        definitions: {}
      }
      const result = JsonSchema.toDocumentDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-07",
        schema: {
          type: "array",
          items: { type: "string" }
        },
        definitions: {}
      })
    })

    it("preserves custom properties in Draft-07 output", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {
          type: "string",
          "x-custom": "value"
        },
        definitions: {}
      }
      const result = JsonSchema.toDocumentDraft07(input)
      deepStrictEqual(result, {
        dialect: "draft-07",
        schema: {
          type: "string",
          "x-custom": "value"
        },
        definitions: {}
      })
    })

    it("preserves malformed values for recognized keywords", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {
          $ref: 1,
          properties: "invalid",
          not: [false, { type: "string" }],
          allOf: "invalid",
          prefixItems: "invalid"
        },
        definitions: {}
      }

      deepStrictEqual(JsonSchema.toDocumentDraft07(input), {
        dialect: "draft-07",
        schema: {
          $ref: 1,
          properties: "invalid",
          not: [false, { type: "string" }],
          allOf: "invalid",
          items: "invalid"
        },
        definitions: {}
      })
    })
  })

  describe("toDocumentDraft04", () => {
    it("rewrites the canonical meta-schema URI with an empty fragment", () => {
      deepStrictEqual(
        JsonSchema.toDocumentDraft04({
          dialect: "draft-2020-12",
          schema: { $schema: `${JsonSchema.META_SCHEMA_URI_DRAFT_2020_12}#` },
          definitions: {}
        }).schema,
        { $schema: JsonSchema.META_SCHEMA_URI_DRAFT_04 }
      )
    })

    it("omits the canonical meta-schema URI from embedded resources", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {},
        definitions: {
          Embedded: {
            $id: "embedded.json",
            $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12,
            type: "string"
          }
        }
      }

      deepStrictEqual(JsonSchema.toDocumentDraft04(input).definitions.Embedded, {
        id: "embedded.json",
        type: "string"
      })
    })

    it("rejects custom dialects in embedded resources", () => {
      assert.throws(
        () =>
          JsonSchema.toDocumentDraft04({
            dialect: "draft-2020-12",
            schema: {},
            definitions: {
              Embedded: {
                $id: "embedded.json",
                $schema: "https://example.com/dialect",
                type: "string"
              }
            }
          }),
        /Cannot convert JSON Schema keyword "\$schema" to Draft-04/
      )
    })

    it("lowers canonical dependencies directly and preserves custom keywords", () => {
      const result = JsonSchema.toDocumentDraft04({
        dialect: "draft-2020-12",
        schema: {
          dependentRequired: { enabled: ["value"] },
          dependentSchemas: { mode: { required: ["value"] } },
          "x-custom": { value: true }
        },
        definitions: {}
      })

      deepStrictEqual(result.schema, {
        dependencies: {
          enabled: ["value"],
          mode: { required: ["value"] }
        },
        "x-custom": { value: true }
      })
    })

    it("rewrites $defs refs to Draft-04 definitions refs", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            value: { $ref: "#/$defs/Value" }
          }
        },
        definitions: {
          Value: { type: "string" }
        }
      }
      const result = JsonSchema.toDocumentDraft04(input)
      deepStrictEqual(result, {
        dialect: "draft-04",
        schema: {
          type: "object",
          properties: {
            value: { $ref: "#/definitions/Value" }
          }
        },
        definitions: {
          Value: { type: "string" }
        }
      })
    })

    it("preserves every supported Draft-04 keyword and newer annotations as extensions", () => {
      const input: JsonSchema.JsonSchema = {
        type: "object",
        required: ["value"],
        enum: ["a", "b"],
        title: "title",
        description: "description",
        default: "a",
        format: "custom",
        pattern: "^a$",
        minimum: 0,
        maximum: 10,
        minLength: 1,
        maxLength: 10,
        minItems: 1,
        maxItems: 10,
        minProperties: 1,
        maxProperties: 10,
        multipleOf: 2,
        uniqueItems: true,
        properties: { value: { type: "string" } },
        patternProperties: { "^x-": { type: "string" } },
        not: { type: "null" },
        additionalProperties: false,
        allOf: [{ type: "object" }],
        anyOf: [{ type: "string" }],
        oneOf: [{ type: "number" }],
        items: { type: "string" },
        examples: ["a"],
        readOnly: true,
        writeOnly: true
      }
      const expected: JsonSchema.JsonSchema = {
        type: "object",
        required: ["value"],
        enum: ["a", "b"],
        title: "title",
        description: "description",
        default: "a",
        format: "custom",
        pattern: "^a$",
        minimum: 0,
        maximum: 10,
        minLength: 1,
        maxLength: 10,
        minItems: 1,
        maxItems: 10,
        minProperties: 1,
        maxProperties: 10,
        multipleOf: 2,
        uniqueItems: true,
        properties: { value: { type: "string" } },
        patternProperties: { "^x-": { type: "string" } },
        not: { type: "null" },
        additionalProperties: { not: {} },
        allOf: [{ type: "object" }],
        anyOf: [{ type: "string" }],
        oneOf: [{ type: "number" }],
        items: { type: "string" },
        examples: ["a"],
        readOnly: true,
        writeOnly: true
      }

      deepStrictEqual(
        JsonSchema.toDocumentDraft04({
          dialect: "draft-2020-12",
          schema: input,
          definitions: {}
        }).schema,
        expected
      )
    })

    it("rejects validation keywords that Draft-04 cannot represent", () => {
      for (
        const schema of [
          { propertyNames: { minLength: 1 } },
          { contains: { type: "string" }, minContains: 0 },
          { contains: { type: "string" }, minContains: 2 },
          {
            if: { $id: "condition" },
            // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword
            then: {},
            else: {}
          },
          { unevaluatedProperties: false },
          { $dynamicRef: "#node" },
          { $vocabulary: { "https://example.com/vocabulary": true } },
          { id: "legacy-id" }
        ]
      ) {
        assert.throws(
          () => JsonSchema.toDocumentDraft04({ dialect: "draft-2020-12", schema, definitions: {} }),
          /Cannot convert JSON Schema keyword .* to Draft-04/
        )
      }
    })

    it("converts inactive conditional schema bodies", () => {
      for (const key of ["if", "then", "else"] as const) {
        const result = JsonSchema.toDocumentDraft04({
          dialect: "draft-2020-12",
          schema: {
            [key]: { $defs: { Value: { const: "value" } } },
            allOf: [{ $ref: `#/${key}/$defs/Value` }]
          },
          definitions: {}
        })

        deepStrictEqual(result.schema, {
          [key]: { definitions: { Value: { enum: ["value"] } } },
          allOf: [{ $ref: `#/${key}/definitions/Value` }]
        })
      }
    })

    it("lowers conditionals and contains while preserving validation semantics", () => {
      const document = JsonSchema.toDocumentDraft04({
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            mode: { enum: ["full", "compact"] },
            value: { type: "string" },
            values: { contains: { type: "number" } }
          },
          required: ["mode", "values"],
          if: { properties: { mode: { const: "full" } } },
          // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword
          then: { required: ["value"] },
          else: { not: { required: ["value"] } }
        },
        definitions: {}
      })
      const schema = makeSchema(document)
      deepStrictEqual(ajvDraft04.validateSchema(schema), true)

      const validate = ajvDraft04.compile(schema)
      deepStrictEqual(validate({ mode: "full", value: "ok", values: [1] }), true)
      deepStrictEqual(validate({ mode: "full", values: [1] }), false)
      deepStrictEqual(validate({ mode: "compact", values: [1] }), true)
      deepStrictEqual(validate({ mode: "compact", value: "unexpected", values: [1] }), false)
      deepStrictEqual(validate({ mode: "full", value: "ok", values: ["no"] }), false)
      deepStrictEqual(validate({ mode: "full", value: "ok", values: 1 }), true)
    })

    it("omits an empty required array", () => {
      const document = JsonSchema.toDocumentDraft04({
        dialect: "draft-2020-12",
        schema: { type: "object", required: [] },
        definitions: {}
      })

      deepStrictEqual(document.schema, { type: "object" })
      deepStrictEqual(ajvDraft04.validateSchema(makeSchema(document)), true)
    })

    it("omits empty dependentRequired arrays", () => {
      const empty = JsonSchema.toDocumentDraft04({
        dialect: "draft-2020-12",
        schema: { dependentRequired: { value: [] } },
        definitions: {}
      })
      deepStrictEqual(empty.schema, {})
      deepStrictEqual(ajvDraft04.validateSchema(makeSchema(empty)), true)

      const combined = JsonSchema.toDocumentDraft04({
        dialect: "draft-2020-12",
        schema: {
          dependentRequired: { value: [] },
          dependentSchemas: { value: { type: "string" } }
        },
        definitions: {}
      })
      deepStrictEqual(combined.schema, { dependencies: { value: { type: "string" } } })
      deepStrictEqual(ajvDraft04.validateSchema(makeSchema(combined)), true)
    })

    it("converts const to enum", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {
          enum: ["a", "b"],
          const: "b",
          allOf: [{ type: "string" }]
        },
        definitions: {}
      }
      const result = JsonSchema.toDocumentDraft04(input)
      deepStrictEqual(result.schema, {
        enum: ["a", "b"],
        allOf: [{ type: "string" }, { enum: ["b"] }]
      })

      deepStrictEqual(
        JsonSchema.toDocumentDraft04({
          dialect: "draft-2020-12",
          schema: { const: "a" },
          definitions: {}
        }).schema,
        { enum: ["a"] }
      )

      deepStrictEqual(
        JsonSchema.toDocumentDraft04({
          dialect: "draft-2020-12",
          schema: { enum: ["a", "b"], const: "b" },
          definitions: {}
        }).schema,
        { enum: ["a", "b"], allOf: [{ enum: ["b"] }] }
      )
    })

    it("preserves refs in literal values", () => {
      const literal = { $ref: "#/$defs/Literal" }

      deepStrictEqual(
        JsonSchema.toDocumentDraft04({
          dialect: "draft-2020-12",
          schema: { const: literal },
          definitions: {}
        }).schema,
        { enum: [literal] }
      )
      deepStrictEqual(
        JsonSchema.toDocumentDraft04({
          dialect: "draft-2020-12",
          schema: { enum: [literal], default: literal },
          definitions: {}
        }).schema,
        { enum: [literal], default: literal }
      )
    })

    it("converts numeric exclusive bounds to Draft-04 boolean exclusivity", () => {
      const cases: ReadonlyArray<readonly [JsonSchema.JsonSchema, JsonSchema.JsonSchema]> = [
        [{ minimum: 1 }, { minimum: 1 }],
        [{ exclusiveMinimum: 1 }, { minimum: 1, exclusiveMinimum: true }],
        [{ minimum: 2, exclusiveMinimum: 1 }, { minimum: 2 }],
        [{ minimum: 1, exclusiveMinimum: 1 }, { minimum: 1, exclusiveMinimum: true }],
        [{ minimum: 1, exclusiveMinimum: 2 }, { minimum: 2, exclusiveMinimum: true }],
        [{ maximum: 2 }, { maximum: 2 }],
        [{ exclusiveMaximum: 2 }, { maximum: 2, exclusiveMaximum: true }],
        [{ maximum: 1, exclusiveMaximum: 2 }, { maximum: 1 }],
        [{ maximum: 2, exclusiveMaximum: 2 }, { maximum: 2, exclusiveMaximum: true }],
        [{ maximum: 2, exclusiveMaximum: 1 }, { maximum: 1, exclusiveMaximum: true }]
      ]
      for (const [schema, expected] of cases) {
        deepStrictEqual(
          JsonSchema.toDocumentDraft04({
            dialect: "draft-2020-12",
            schema,
            definitions: {}
          }).schema,
          expected
        )
      }
    })

    it("converts boolean schemas only in schema positions", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            allowed: true,
            denied: false,
            nested: { not: false }
          },
          additionalProperties: false,
          allOf: [true],
          anyOf: [false]
        },
        definitions: {}
      }
      const result = JsonSchema.toDocumentDraft04(input)
      deepStrictEqual(result.schema, {
        type: "object",
        properties: {
          allowed: {},
          denied: { not: {} },
          nested: { not: { not: {} } }
        },
        additionalProperties: { not: {} },
        allOf: [{}],
        anyOf: [{ not: {} }]
      })
    })

    it("converts tuple members and their trailing boolean schema", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {
          type: "array",
          prefixItems: [true, false],
          items: false
        },
        definitions: {}
      }
      const result = JsonSchema.toDocumentDraft04(input)
      deepStrictEqual(result.schema, {
        type: "array",
        items: [{}, { not: {} }],
        additionalItems: { not: {} }
      })

      deepStrictEqual(
        JsonSchema.toDocumentDraft04({
          dialect: "draft-2020-12",
          schema: { type: "array", items: false },
          definitions: {}
        }).schema,
        { type: "array", items: { not: {} } }
      )
    })

    it("converts schemas in additionalProperties and additionalItems", () => {
      const result = JsonSchema.toDocumentDraft04({
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          additionalProperties: { const: "value" },
          properties: {
            tuple: {
              type: "array",
              prefixItems: [{ type: "string" }],
              items: { const: "rest" }
            }
          }
        },
        definitions: {}
      })

      deepStrictEqual(result.schema, {
        type: "object",
        additionalProperties: { enum: ["value"] },
        properties: {
          tuple: {
            type: "array",
            items: [{ type: "string" }],
            additionalItems: { enum: ["rest"] }
          }
        }
      })
    })

    it("preserves malformed values for recognized keywords", () => {
      const result = JsonSchema.toDocumentDraft04({
        dialect: "draft-2020-12",
        schema: {
          properties: "invalid",
          not: [1],
          allOf: "invalid"
        },
        definitions: {}
      })

      deepStrictEqual(result.schema, {
        properties: "invalid",
        not: [1],
        allOf: "invalid"
      })
    })

    it("preserves allOf, not, and null", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {
          anyOf: [
            { type: "null" },
            { allOf: [{ not: { type: "string" } }] }
          ]
        },
        definitions: {}
      }
      const result = JsonSchema.toDocumentDraft04(input)
      deepStrictEqual(result.schema, input.schema)
    })

    it("preserves newer annotations as Draft-04 extensions", () => {
      const input: JsonSchema.Document<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          examples: [{ value: 1 }]
        },
        definitions: {}
      }
      const result = JsonSchema.toDocumentDraft04(input)
      deepStrictEqual(result.schema, { type: "object", examples: [{ value: 1 }] })
    })

    it("preserves constraints next to refs", () => {
      const document = JsonSchema.toDocumentDraft04({
        dialect: "draft-2020-12",
        schema: { $ref: "#/$defs/S", minLength: 3 },
        definitions: { S: { type: "string" } }
      })

      deepStrictEqual(document.schema, {
        allOf: [{ $ref: "#/definitions/S" }],
        minLength: 3
      })

      const schema = makeSchema(document)
      deepStrictEqual(ajvDraft04.validateSchema(schema), true)
      const validate = ajvDraft04.compile(schema)
      deepStrictEqual(validate("abc"), true)
      deepStrictEqual(validate("a"), false)
    })

    it("preserves validation semantics for converted constraints", () => {
      const document = JsonSchema.toDocumentDraft04({
        dialect: "draft-2020-12",
        schema: {
          type: "object",
          properties: {
            mode: { const: "on" },
            value: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 2 },
            tuple: { type: "array", prefixItems: [{ type: "string" }], items: false }
          },
          required: ["mode", "value", "tuple"],
          additionalProperties: false
        },
        definitions: {}
      })
      const schema = makeSchema(document)
      deepStrictEqual(ajvDraft04.validateSchema(schema), true)

      const validate = ajvDraft04.compile(schema)
      deepStrictEqual(validate({ mode: "on", value: 1, tuple: ["a"] }), true)
      deepStrictEqual(validate({ mode: "off", value: 1, tuple: ["a"] }), false)
      deepStrictEqual(validate({ mode: "on", value: 0, tuple: ["a"] }), false)
      deepStrictEqual(validate({ mode: "on", value: 1, tuple: ["a", "b"] }), false)
    })

    it("converts documents generated from Effect schemas", () => {
      const shared = Schema.Struct({ value: Schema.String })
      const schema = Schema.Struct({
        mode: Schema.Literal("enabled"),
        threshold: Schema.Finite.check(Schema.isGreaterThan(0)),
        tuple: Schema.Tuple([Schema.String, Schema.Boolean]),
        left: shared,
        right: shared
      })
      const document = JsonSchema.toDocumentDraft04(Schema.toJsonSchemaDocument(schema))
      const draft04 = makeSchema(document)
      deepStrictEqual(ajvDraft04.validateSchema(draft04), true)

      const validate = ajvDraft04.compile(draft04)
      const valid = {
        mode: "enabled",
        threshold: 1,
        tuple: ["a", true],
        left: { value: "left" },
        right: { value: "right" }
      }
      deepStrictEqual(validate(valid), true)
      deepStrictEqual(validate({ ...valid, threshold: 0 }), false)
      deepStrictEqual(validate({ ...valid, tuple: ["a", true, false] }), false)
    })
  })

  describe("toMultiDocumentOpenApi3_1", () => {
    it("rejects opaque keywords that OpenAPI 3.1 would activate", () => {
      for (
        const input of [
          { schemas: [{ example: "value" }], definitions: {} },
          { schemas: [{ properties: { value: { discriminator: {} } } }], definitions: {} },
          { schemas: [{}], definitions: { Value: { xml: {} } } },
          { schemas: [{ externalDocs: {} }], definitions: {} }
        ] as const
      ) {
        assert.throws(
          () => JsonSchema.toMultiDocumentOpenApi3_1({ dialect: "draft-2020-12", ...input }),
          /Cannot convert JSON Schema keyword .* to OpenAPI 3.1/
        )
      }
    })

    it("does not inspect opaque values for OpenAPI 3.1 keyword collisions", () => {
      const literal = { example: "value", discriminator: {}, xml: {}, externalDocs: {} }
      deepStrictEqual(
        JsonSchema.toMultiDocumentOpenApi3_1({
          dialect: "draft-2020-12",
          schemas: [{ const: literal }],
          definitions: {}
        }).schemas,
        [{ const: literal }]
      )
    })

    it("rewrites `$defs` references to `components/schemas`", () => {
      const input: JsonSchema.MultiDocument<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schemas: [
          {
            type: "object",
            properties: {
              a: { $ref: "#/$defs/A" },
              b: { $ref: "#/$defs/B" }
            }
          }
        ],
        definitions: {
          A: {
            type: "string",
            $ref: "#/$defs/B"
          },
          B: {
            type: "number"
          }
        }
      }
      const result = JsonSchema.toMultiDocumentOpenApi3_1(input)
      deepStrictEqual(result, {
        dialect: "openapi-3.1",
        schemas: [
          {
            type: "object",
            properties: {
              a: { $ref: "#/components/schemas/A" },
              b: { $ref: "#/components/schemas/B" }
            }
          }
        ],
        definitions: {
          A: {
            type: "string",
            $ref: "#/components/schemas/B"
          },
          B: {
            type: "number"
          }
        }
      })
    })

    it("rewrites refs only in schema positions", () => {
      const literal = { $ref: "#/$defs/Literal" }
      const result = JsonSchema.toMultiDocumentOpenApi3_1({
        dialect: "draft-2020-12",
        schemas: [{
          properties: { value: { $ref: "#/$defs/Value" } },
          const: literal,
          enum: [literal],
          default: literal,
          examples: [literal]
        }],
        definitions: { Value: { type: "string" } }
      })

      deepStrictEqual(result, {
        dialect: "openapi-3.1",
        schemas: [{
          properties: { value: { $ref: "#/components/schemas/Value" } },
          const: literal,
          enum: [literal],
          default: literal,
          examples: [literal]
        }],
        definitions: { Value: { type: "string" } }
      })
    })

    it("sanitizes component schema keys and rewritten refs together", () => {
      const input: JsonSchema.MultiDocument<"draft-2020-12"> = {
        dialect: "draft-2020-12",
        schemas: [
          {
            type: "object",
            properties: {
              "A.B": { "$ref": "#/$defs/A$B" }
            }
          }
        ],
        definitions: {
          "A$B": { "$ref": "#/$defs/B$C" },
          "B$C": { type: "string" }
        }
      }
      const result = JsonSchema.toMultiDocumentOpenApi3_1(input)
      deepStrictEqual(result, {
        dialect: "openapi-3.1",
        schemas: [
          {
            type: "object",
            properties: {
              "A.B": { "$ref": "#/components/schemas/A_B" }
            }
          }
        ],
        definitions: {
          "A_B": { "$ref": "#/components/schemas/B_C" },
          "B_C": { type: "string" }
        }
      })
    })

    it("unescapes a definition key before sanitizing its ref", () => {
      const result = JsonSchema.toMultiDocumentOpenApi3_1({
        dialect: "draft-2020-12",
        schemas: [{ $ref: "#/$defs/A~1B" }],
        definitions: {
          "A/B": { type: "string" }
        }
      })

      deepStrictEqual(result, {
        dialect: "openapi-3.1",
        schemas: [{ $ref: "#/components/schemas/A_B" }],
        definitions: {
          A_B: { type: "string" }
        }
      })
    })

    it("decodes a definition key before sanitizing its ref", () => {
      const result = JsonSchema.toMultiDocumentOpenApi3_1({
        dialect: "draft-2020-12",
        schemas: [{
          allOf: [
            { $ref: "#/$defs/A%20B" },
            { $dynamicRef: "#/$defs/A%20B" }
          ]
        }],
        definitions: {
          "A B": { type: "string" }
        }
      })

      deepStrictEqual(result, {
        dialect: "openapi-3.1",
        schemas: [{
          allOf: [
            { $ref: "#/components/schemas/A_B" },
            { $dynamicRef: "#/components/schemas/A_B" }
          ]
        }],
        definitions: {
          A_B: { type: "string" }
        }
      })
    })

    it("does not rewrite local refs inside embedded schema resources", () => {
      const result = JsonSchema.toMultiDocumentOpenApi3_1({
        dialect: "draft-2020-12",
        schemas: [{
          allOf: [
            { $dynamicRef: "#/$defs/Embedded" },
            {
              $id: "inline.json",
              $defs: { Inner: { type: "string" } },
              $dynamicRef: "#/$defs/Inner"
            }
          ]
        }],
        definitions: {
          Embedded: {
            $id: "embedded.json",
            $defs: { Inner: { type: "number" } },
            allOf: [
              { $ref: "#/$defs/Inner" },
              { $dynamicRef: "#/$defs/Inner" }
            ]
          }
        }
      })

      deepStrictEqual(result, {
        dialect: "openapi-3.1",
        schemas: [{
          allOf: [
            { $dynamicRef: "#/components/schemas/Embedded" },
            {
              $id: "inline.json",
              $defs: { Inner: { type: "string" } },
              $dynamicRef: "#/$defs/Inner"
            }
          ]
        }],
        definitions: {
          Embedded: {
            $id: "embedded.json",
            $defs: { Inner: { type: "number" } },
            allOf: [
              { $ref: "#/$defs/Inner" },
              { $dynamicRef: "#/$defs/Inner" }
            ]
          }
        }
      })
    })

    it("does not rewrite local refs inside root schema resources", () => {
      const schema = {
        $id: "inline.json",
        $defs: { Inner: { type: "string" } },
        allOf: [
          { $ref: "#/$defs/Inner" },
          { $dynamicRef: "#/$defs/Inner" }
        ]
      }

      deepStrictEqual(
        JsonSchema.toMultiDocumentOpenApi3_1({
          dialect: "draft-2020-12",
          schemas: [schema],
          definitions: {}
        }),
        {
          dialect: "openapi-3.1",
          schemas: [schema],
          definitions: {}
        }
      )
    })

    it("rejects shared definition refs from root schema resources", () => {
      for (const keyword of ["$ref", "$dynamicRef"] as const) {
        assert.throws(
          () =>
            JsonSchema.toMultiDocumentOpenApi3_1({
              dialect: "draft-2020-12",
              schemas: [{ $id: "inline.json", [keyword]: "#/$defs/Value" }],
              definitions: { Value: { type: "string" } }
            }),
          new RegExp(`Cannot convert JSON Schema keyword "\\${keyword}" to OpenAPI 3\\.1`)
        )
      }
    })

    it("suffixes a sanitized key that collides with a valid key", () => {
      const result = JsonSchema.toMultiDocumentOpenApi3_1({
        dialect: "draft-2020-12",
        schemas: [
          {
            allOf: [
              { $ref: "#/$defs/A_B" },
              { $ref: "#/$defs/A~1B" }
            ]
          }
        ],
        definitions: {
          A_B: { type: "string" },
          "A/B": { type: "number" }
        }
      })

      deepStrictEqual(result, {
        dialect: "openapi-3.1",
        schemas: [
          {
            allOf: [
              { $ref: "#/components/schemas/A_B" },
              { $ref: "#/components/schemas/A_B_1" }
            ]
          }
        ],
        definitions: {
          A_B: { type: "string" },
          A_B_1: { type: "number" }
        }
      })
    })

    it("allocates suffixes deterministically and skips occupied keys", () => {
      const convert = (definitions: JsonSchema.Definitions) =>
        JsonSchema.toMultiDocumentOpenApi3_1({
          dialect: "draft-2020-12",
          schemas: [
            {
              allOf: [
                { $ref: "#/$defs/A_B" },
                { $ref: "#/$defs/A_B_1" },
                { $ref: "#/$defs/A~1B" },
                { $ref: "#/$defs/A?B" }
              ]
            }
          ],
          definitions
        })
      const expected: JsonSchema.MultiDocument<"openapi-3.1"> = {
        dialect: "openapi-3.1",
        schemas: [
          {
            allOf: [
              { $ref: "#/components/schemas/A_B" },
              { $ref: "#/components/schemas/A_B_1" },
              { $ref: "#/components/schemas/A_B_2" },
              { $ref: "#/components/schemas/A_B_3" }
            ]
          }
        ],
        definitions: {
          A_B: { type: "string" },
          A_B_1: { type: "boolean" },
          A_B_2: { type: "number" },
          A_B_3: { type: "null" }
        }
      }

      deepStrictEqual(
        convert({
          "A?B": { type: "null" },
          A_B_1: { type: "boolean" },
          "A/B": { type: "number" },
          A_B: { type: "string" }
        }),
        expected
      )
      deepStrictEqual(
        convert({
          A_B: { type: "string" },
          "A/B": { type: "number" },
          A_B_1: { type: "boolean" },
          "A?B": { type: "null" }
        }),
        expected
      )
    })

    it("reserves sanitized bases before allocating suffixes", () => {
      const result = JsonSchema.toMultiDocumentOpenApi3_1({
        dialect: "draft-2020-12",
        schemas: [
          {
            allOf: [
              { $ref: "#/$defs/A~1B" },
              { $ref: "#/$defs/A?B" },
              { $ref: "#/$defs/A?B?1" }
            ]
          }
        ],
        definitions: {
          "A/B": { type: "number" },
          "A?B": { type: "string" },
          "A?B?1": { type: "boolean" }
        }
      })

      deepStrictEqual(result, {
        dialect: "openapi-3.1",
        schemas: [
          {
            allOf: [
              { $ref: "#/components/schemas/A_B" },
              { $ref: "#/components/schemas/A_B_2" },
              { $ref: "#/components/schemas/A_B_1" }
            ]
          }
        ],
        definitions: {
          A_B: { type: "number" },
          A_B_2: { type: "string" },
          A_B_1: { type: "boolean" }
        }
      })
    })

    it("rewrites nested definition refs without changing other refs", () => {
      const result = JsonSchema.toMultiDocumentOpenApi3_1({
        dialect: "draft-2020-12",
        schemas: [
          {
            allOf: [
              { $ref: "#/$defs/A~1B/properties/value" },
              { $ref: "https://example.com/schema#/$defs/A~1B" },
              { $ref: "#/other/A~1B" }
            ]
          }
        ],
        definitions: {
          "A/B": {
            type: "object",
            properties: { value: { type: "string" } }
          }
        }
      })

      deepStrictEqual(result, {
        dialect: "openapi-3.1",
        schemas: [
          {
            allOf: [
              { $ref: "#/components/schemas/A_B/properties/value" },
              { $ref: "https://example.com/schema#/$defs/A~1B" },
              { $ref: "#/other/A~1B" }
            ]
          }
        ],
        definitions: {
          A_B: {
            type: "object",
            properties: { value: { type: "string" } }
          }
        }
      })
    })
  })

  describe("input immutability", () => {
    const canonicalSchema: JsonSchema.JsonSchema = {
      type: "object",
      properties: {
        value: {
          type: "array",
          prefixItems: [{ type: "string" }],
          items: false
        }
      }
    }

    for (
      const [name, convert, input] of [
        [
          "fromSchemaDraft07",
          JsonSchema.fromSchemaDraft07,
          {
            type: "array",
            items: [{ type: "string" }],
            additionalItems: false,
            definitions: { Value: { type: "string" } }
          }
        ],
        ["fromSchemaDraft2020_12", JsonSchema.fromSchemaDraft2020_12, canonicalSchema],
        ["fromSchemaOpenApi3_1", JsonSchema.fromSchemaOpenApi3_1, canonicalSchema],
        [
          "fromSchemaOpenApi3_0",
          JsonSchema.fromSchemaOpenApi3_0,
          { type: "array", items: { type: "string" }, nullable: true }
        ]
      ] as const
    ) {
      it(`${name} does not mutate its input`, () => {
        assertDoesNotMutate(structuredClone(input), convert)
      })
    }

    for (
      const [name, convert] of [
        ["toDocumentDraft07", JsonSchema.toDocumentDraft07],
        ["toDocumentDraft04", JsonSchema.toDocumentDraft04]
      ] as const
    ) {
      it(`${name} does not mutate its input`, () => {
        assertDoesNotMutate(
          {
            dialect: "draft-2020-12",
            schema: structuredClone(canonicalSchema),
            definitions: { Value: { type: "string" } }
          },
          convert
        )
      })
    }

    it("toMultiDocumentOpenApi3_1 does not mutate its input", () => {
      assertDoesNotMutate(
        {
          dialect: "draft-2020-12",
          schemas: [structuredClone(canonicalSchema)] as const,
          definitions: { Value: { type: "string" } }
        },
        JsonSchema.toMultiDocumentOpenApi3_1
      )
    })
  })

  describe("roundtrip conversions", () => {
    it("preserves a Draft-07 schema and definitions through canonical form", () => {
      const original: JsonSchema.JsonSchema = {
        type: "object",
        readOnly: true,
        writeOnly: true,
        not: { required: ["forbidden"] },
        properties: {
          name: { type: "string" },
          items: {
            type: "array",
            items: [
              { type: "string" },
              { type: "number" }
            ],
            additionalItems: { type: "boolean" }
          },
          ref: {
            $ref: "#/definitions/MyType"
          }
        },
        definitions: {
          MyType: {
            type: "string"
          }
        }
      }

      const to2020_12 = JsonSchema.fromSchemaDraft07(original)
      const backTo07 = JsonSchema.toDocumentDraft07(to2020_12)

      deepStrictEqual(backTo07.schema, {
        type: "object",
        readOnly: true,
        writeOnly: true,
        not: { required: ["forbidden"] },
        properties: {
          name: { type: "string" },
          items: {
            type: "array",
            items: [
              { type: "string" },
              { type: "number" }
            ],
            additionalItems: { type: "boolean" }
          },
          ref: {
            $ref: "#/definitions/MyType"
          }
        }
      })
      deepStrictEqual(backTo07.definitions, {
        MyType: {
          type: "string"
        }
      })
    })
  })
})
