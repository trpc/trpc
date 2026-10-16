import { assert } from "@effect/vitest"
import { JsonSchema, Schema, SchemaRepresentation } from "effect"
import { TestSchema } from "effect/testing"
import { describe, it } from "vitest"
import { deepStrictEqual, throws } from "../../utils/assert.ts"

const makeCode = SchemaRepresentation.makeCode

type Expected = {
  readonly codes: SchemaRepresentation.Code
  readonly references?: Partial<SchemaRepresentation.CodeDocument["references"]>
}

function toSchemaFromJsonSchemaDocument(
  document: JsonSchema.Document<"draft-2020-12">,
  options?: SchemaRepresentation.FromJsonSchemaOptions
): Schema.Top {
  return SchemaRepresentation.fromJsonSchemaDocument(document, { patterns: "apply", ...options })
}

describe("fromJsonSchemaDocument", () => {
  it("round-trips optional Never properties (#8137)", () => {
    const original = Schema.Struct({ value: Schema.optionalKey(Schema.Never) })
    const imported = SchemaRepresentation.fromJsonSchemaDocument(Schema.toJsonSchemaDocument(original))
    assertCode(imported, {
      codes: makeCode(
        `Schema.StructWithRest(Schema.Struct({ "value": Schema.optionalKey(Schema.Never) }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))])`,
        `{ readonly "value"?: never } & { readonly [x: string]: Schema.Json }`
      )
    })
  })

  it("imports not-empty schemas at the root and through references", () => {
    assertFromJsonSchema({ schema: { not: {}, description: "impossible" } }, {
      codes: makeCode(`Schema.Never.annotate({ "description": "impossible" })`, `never`)
    })
    assertFromJsonSchema({
      schema: {
        type: "object",
        properties: { value: { $ref: "#/$defs/Impossible" } },
        required: ["value"],
        $defs: { Impossible: { type: "string", not: {} } }
      }
    }, {
      codes: makeCode(
        `Schema.StructWithRest(Schema.Struct({ "value": Impossible }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))])`,
        `{ readonly "value": Impossible } & { readonly [x: string]: Schema.Json }`
      ),
      references: {
        nonRecursives: [{
          $ref: `Impossible`,
          code: makeCode(`Schema.Never.annotate({ "identifier": "Impossible" })`, `never`)
        }]
      }
    })
  })

  it("preserves Never in array items and union members", () => {
    assertFromJsonSchema(
      { schema: { type: "array", items: { not: {} } } },
      { codes: makeCode(`Schema.Array(Schema.Never)`, `ReadonlyArray<never>`) }
    )
    assertFromJsonSchema(
      { schema: { type: "array", prefixItems: [{ not: {} }] } },
      {
        codes: makeCode(
          `Schema.TupleWithRest(Schema.Tuple([Schema.optionalKey(Schema.Never)]), [Schema.Json.annotate({ "expected": "JSON value" })])`,
          `readonly [(never)?, ...Array<Schema.Json>]`
        )
      }
    )
    assertFromJsonSchema(
      { schema: { anyOf: [{ not: {} }, { type: "string" }] } },
      { codes: makeCode(`Schema.Union([Schema.Never, Schema.String])`, `never | string`) }
    )
    assertFromJsonSchema(
      { schema: { oneOf: [{ not: {} }, { type: "string" }] } },
      { codes: makeCode(`Schema.Union([Schema.Never, Schema.String], { mode: "oneOf" })`, `never | string`) }
    )
  })

  it("imports string lengths by code point and integers as safe integers", () => {
    for (
      const [source, input, expected] of [
        [{ type: "string", minLength: 2 }, "😀", false],
        [{ type: "string", maxLength: 1 }, "😀", true],
        [{ type: "string", minLength: 1 }, "😀", true],
        [{ type: "string", minLength: 1 }, "", false],
        [{ type: "string", maxLength: 0 }, "", true],
        [{ type: "string", maxLength: 0 }, "a", false],
        [{ type: "string", minLength: 2 }, "é", false],
        [{ type: "string", maxLength: 1 }, "é", true],
        [{ type: "string", minLength: 2 }, "e\u0301", true],
        [{ type: "string", maxLength: 1 }, "e\u0301", false],
        [{ type: "string", minLength: 2 }, "\uD800", false],
        [{ type: "string", maxLength: 1 }, "\uD800", true],
        [{ type: "integer" }, 1e20, false],
        [{ type: "string", pattern: "^.$" }, "😀", true]
      ] as const
    ) {
      const schema = toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12(source))
      assert.strictEqual(Schema.is(schema)(input), expected)
    }
  })

  it("uses imported string semantics while intersecting primitive literals", () => {
    const minLength = toSchemaFromJsonSchemaDocument(
      JsonSchema.fromSchemaDraft2020_12({ enum: ["😀", "e\u0301"], minLength: 2 })
    )
    assert.isFalse(Schema.is(minLength)("😀"))
    assert.isTrue(Schema.is(minLength)("e\u0301"))

    const pattern = toSchemaFromJsonSchemaDocument(
      JsonSchema.fromSchemaDraft2020_12({ const: "😀", pattern: "^.$" })
    )
    assert.isTrue(Schema.is(pattern)("😀"))
  })

  it("reports patterns unsupported in ECMAScript Unicode mode", () => {
    throws(
      () =>
        toSchemaFromJsonSchemaDocument(
          JsonSchema.fromSchemaDraft2020_12({ type: "string", pattern: "\\a" })
        ),
      `Cannot import pattern using ECMAScript Unicode mode.\n  at ["schema"]["pattern"]`
    )
  })

  function assertFromJsonSchema(
    input: {
      readonly schema: JsonSchema.JsonSchema
      readonly options?: SchemaRepresentation.FromJsonSchemaOptions
    },
    expected: Expected
  ) {
    const jsonDocument = JsonSchema.fromSchemaDraft2020_12(input.schema)
    const schema = toSchemaFromJsonSchemaDocument(jsonDocument, input.options)
    assertCode(schema, expected)
  }

  function assertCode(schema: Schema.Top, expected: Expected) {
    deepStrictEqual(SchemaRepresentation.toCodeDocument(SchemaRepresentation.toRepresentations([schema.ast])), {
      codes: [expected.codes],
      references: {
        nonRecursives: expected.references?.nonRecursives ?? [],
        recursives: expected.references?.recursives ?? {}
      },
      artifacts: []
    })
  }

  it("unconstrained schema", () => {
    assertFromJsonSchema(
      { schema: {} },
      { codes: makeCode(`Schema.Json.annotate({ "expected": "JSON value" })`, `Schema.Json`) }
    )
    assertFromJsonSchema(
      {
        schema: {
          title: "a",
          description: "b",
          default: "c",
          examples: ["d"],
          readOnly: true,
          writeOnly: true
        }
      },
      {
        codes: makeCode(
          `Schema.Json.annotate({ "expected": "JSON value", "title": "a", "description": "b", "default": "c", "examples": ["d"], "readOnly": true, "writeOnly": true })`,
          `Schema.Json`
        )
      }
    )
  })

  it("keeps annotation-only schemas unconstrained", () => {
    assertFromJsonSchema({ schema: { format: "email" } }, {
      codes: makeCode(`Schema.Json.annotate({ "expected": "JSON value", "format": "email" })`, `Schema.Json`)
    })
  })

  describe("const", () => {
    it("string literal", () => {
      assertFromJsonSchema(
        { schema: { const: "a" } },
        { codes: makeCode(`Schema.Literal("a")`, `"a"`) }
      )
      assertFromJsonSchema(
        { schema: { const: "a", description: "a" } },
        { codes: makeCode(`Schema.Literal("a").annotate({ "description": "a" })`, `"a"`) }
      )
    })

    it("const: literal (number)", () => {
      assertFromJsonSchema(
        { schema: { const: 1 } },
        { codes: makeCode(`Schema.Literal(1)`, `1`) }
      )
    })

    it("const: literal (boolean)", () => {
      assertFromJsonSchema(
        { schema: { const: true } },
        { codes: makeCode(`Schema.Literal(true)`, `true`) }
      )
    })

    it("null literal", () => {
      assertFromJsonSchema(
        { schema: { const: null } },
        { codes: makeCode(`Schema.Null`, `null`) }
      )
      assertFromJsonSchema(
        { schema: { const: null, description: "a" } },
        { codes: makeCode(`Schema.Null.annotate({ "description": "a" })`, `null`) }
      )
    })

    it("rejects structured values", () => {
      for (const value of [{}, []]) {
        throws(
          () => toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({ const: value })),
          `Only primitive values are supported in "const" and "enum".\n  at ["schema"]["const"]`
        )
      }
    })
  })

  describe("enum", () => {
    it("single string member", () => {
      assertFromJsonSchema(
        { schema: { enum: ["a"] } },
        { codes: makeCode(`Schema.Literal("a")`, `"a"`) }
      )
      assertFromJsonSchema(
        { schema: { enum: ["a"], description: "a" } },
        { codes: makeCode(`Schema.Literal("a").annotate({ "description": "a" })`, `"a"`) }
      )
    })

    it("single enum (number)", () => {
      assertFromJsonSchema(
        { schema: { enum: [1] } },
        { codes: makeCode(`Schema.Literal(1)`, `1`) }
      )
    })

    it("single enum (boolean)", () => {
      assertFromJsonSchema(
        { schema: { enum: [true] } },
        { codes: makeCode(`Schema.Literal(true)`, `true`) }
      )
    })

    it("multiple literal members", () => {
      assertFromJsonSchema(
        { schema: { enum: ["a", 1] } },
        { codes: makeCode(`Schema.Literals(["a", 1])`, `"a" | 1`) }
      )
      assertFromJsonSchema(
        { schema: { enum: ["a", 1], description: "a" } },
        { codes: makeCode(`Schema.Literals(["a", 1]).annotate({ "description": "a" })`, `"a" | 1`) }
      )
    })

    it("enum containing null", () => {
      assertFromJsonSchema(
        { schema: { enum: ["a", null] } },
        { codes: makeCode(`Schema.Union([Schema.Literal("a"), Schema.Null])`, `"a" | null`) }
      )
    })
  })

  it("anyOf", () => {
    assertFromJsonSchema(
      { schema: { anyOf: [{ const: "a" }, { enum: [1, 2] }] } },
      { codes: makeCode(`Schema.Union([Schema.Literal("a"), Schema.Literals([1, 2])])`, `"a" | 1 | 2`) }
    )
  })

  it("anyOf with siblings", () => {
    assertFromJsonSchema(
      {
        schema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          anyOf: [
            { properties: { a: { type: "string" } }, required: ["a"] },
            { properties: { b: { type: "number" } }, required: ["b"] }
          ]
        }
      },
      {
        codes: makeCode(
          `Schema.Union([Schema.StructWithRest(Schema.Struct({ "a": Schema.String, "id": Schema.String }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))]), Schema.StructWithRest(Schema.Struct({ "b": Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" })), "id": Schema.String }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))])])`,
          `{ readonly "a": string, readonly "id": string } & { readonly [x: string]: Schema.Json } | { readonly "b": number, readonly "id": string } & { readonly [x: string]: Schema.Json }`
        )
      }
    )
  })

  it("oneOf", () => {
    assertFromJsonSchema(
      { schema: { oneOf: [{ const: "a" }, { enum: [1, 2] }] } },
      {
        codes: makeCode(
          `Schema.Union([Schema.Literal("a"), Schema.Literals([1, 2])], { mode: "oneOf" })`,
          `"a" | 1 | 2`
        )
      }
    )
  })

  it("oneOf with siblings", () => {
    assertFromJsonSchema(
      {
        schema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          oneOf: [
            { properties: { a: { type: "string" } }, required: ["a"] },
            { properties: { b: { type: "number" } }, required: ["b"] }
          ]
        }
      },
      {
        codes: makeCode(
          `Schema.Union([Schema.StructWithRest(Schema.Struct({ "a": Schema.String, "id": Schema.String }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))]), Schema.StructWithRest(Schema.Struct({ "b": Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" })), "id": Schema.String }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))])], { mode: "oneOf" })`,
          `{ readonly "a": string, readonly "id": string } & { readonly [x: string]: Schema.Json } | { readonly "b": number, readonly "id": string } & { readonly [x: string]: Schema.Json }`
        )
      }
    )
  })

  describe("type: null", () => {
    it("type only", () => {
      assertFromJsonSchema(
        { schema: { type: "null" } },
        { codes: makeCode(`Schema.Null`, `null`) }
      )
    })
  })

  describe("type: string", () => {
    it("type only", () => {
      assertFromJsonSchema(
        { schema: { type: "string" } },
        { codes: makeCode(`Schema.String`, `string`) }
      )
    })

    describe("checks", () => {
      it("minLength", () => {
        assertFromJsonSchema(
          { schema: { type: "string", minLength: 1 } },
          {
            codes: makeCode(
              `Schema.String.check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" }))`,
              `string`
            )
          }
        )
      })

      it("maxLength", () => {
        assertFromJsonSchema(
          { schema: { type: "string", maxLength: 1 } },
          {
            codes: makeCode(
              `Schema.String.check(Schema.isMaxCodePoints(1).annotate({ "expected": "a string with at most 1 code points" }))`,
              `string`
            )
          }
        )
      })

      it("pattern with an explicit string type", () => {
        assertFromJsonSchema(
          { schema: { type: "string", pattern: "a*" } },
          {
            codes: makeCode(
              `Schema.String.check(Schema.isPattern(new RegExp("a*", "u")).annotate({ "expected": "a string matching the RegExp a*" }))`,
              `string`
            )
          }
        )
      })

      it("pattern only constrains strings", () => {
        assertFromJsonSchema({ schema: { pattern: "^a+$" } }, {
          codes: makeCode(
            `Schema.Union([Schema.Null, Schema.String.check(Schema.isPattern(new RegExp("^a+$", "u")).annotate({ "expected": "a string matching the RegExp ^a+$" })), Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" })), Schema.Boolean, Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" })), Schema.Array(Schema.Json.annotate({ "expected": "JSON value" }))])`,
            `null | string | number | boolean | { readonly [x: string]: Schema.Json } | ReadonlyArray<Schema.Json>`
          )
        })
      })
    })
  })

  describe("type: number", () => {
    it("type only", () => {
      assertFromJsonSchema(
        { schema: { type: "number" } },
        {
          codes: makeCode(
            `Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" }))`,
            `number`
          )
        }
      )
    })

    describe("checks", () => {
      it("minimum", () => {
        assertFromJsonSchema(
          { schema: { type: "number", minimum: 1 } },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" })).check(Schema.isGreaterThanOrEqualTo(1).annotate({ "expected": "a value greater than or equal to 1" }))`,
              `number`
            )
          }
        )
      })

      it("maximum", () => {
        assertFromJsonSchema(
          { schema: { type: "number", maximum: 1 } },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" })).check(Schema.isLessThanOrEqualTo(1).annotate({ "expected": "a value less than or equal to 1" }))`,
              `number`
            )
          }
        )
      })

      it("exclusiveMinimum", () => {
        assertFromJsonSchema(
          { schema: { type: "number", exclusiveMinimum: 1 } },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" })).check(Schema.isGreaterThan(1).annotate({ "expected": "a value greater than 1" }))`,
              `number`
            )
          }
        )
      })

      it("exclusiveMaximum", () => {
        assertFromJsonSchema(
          { schema: { type: "number", exclusiveMaximum: 1 } },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" })).check(Schema.isLessThan(1).annotate({ "expected": "a value less than 1" }))`,
              `number`
            )
          }
        )
      })

      it("multipleOf", () => {
        assertFromJsonSchema(
          { schema: { type: "number", multipleOf: 1 } },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" })).check(Schema.isMultipleOf(1).annotate({ "expected": "a value that is a multiple of 1" }))`,
              `number`
            )
          }
        )
      })
    })
  })

  describe("type: integer", () => {
    it("type only", () => {
      assertFromJsonSchema(
        { schema: { type: "integer" } },
        { codes: makeCode(`Schema.Number.check(Schema.isInt().annotate({ "expected": "an integer" }))`, `number`) }
      )
    })

    describe("checks", () => {
      it("minimum", () => {
        assertFromJsonSchema(
          { schema: { type: "integer", minimum: 1 } },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isInt().annotate({ "expected": "an integer" })).check(Schema.isGreaterThanOrEqualTo(1).annotate({ "expected": "a value greater than or equal to 1" }))`,
              `number`
            )
          }
        )
      })

      it("maximum", () => {
        assertFromJsonSchema(
          { schema: { type: "integer", maximum: 1 } },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isInt().annotate({ "expected": "an integer" })).check(Schema.isLessThanOrEqualTo(1).annotate({ "expected": "a value less than or equal to 1" }))`,
              `number`
            )
          }
        )
      })

      it("exclusiveMinimum", () => {
        assertFromJsonSchema(
          { schema: { type: "integer", exclusiveMinimum: 1 } },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isInt().annotate({ "expected": "an integer" })).check(Schema.isGreaterThan(1).annotate({ "expected": "a value greater than 1" }))`,
              `number`
            )
          }
        )
      })

      it("exclusiveMaximum", () => {
        assertFromJsonSchema(
          { schema: { type: "integer", exclusiveMaximum: 1 } },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isInt().annotate({ "expected": "an integer" })).check(Schema.isLessThan(1).annotate({ "expected": "a value less than 1" }))`,
              `number`
            )
          }
        )
      })

      it("multipleOf", () => {
        assertFromJsonSchema(
          { schema: { type: "integer", multipleOf: 1 } },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isInt().annotate({ "expected": "an integer" })).check(Schema.isMultipleOf(1).annotate({ "expected": "a value that is a multiple of 1" }))`,
              `number`
            )
          }
        )
      })
    })
  })

  describe("type: boolean", () => {
    it("type only", () => {
      assertFromJsonSchema(
        { schema: { type: "boolean" } },
        { codes: makeCode(`Schema.Boolean`, `boolean`) }
      )
    })
  })

  describe("type: array", () => {
    it("type only", () => {
      assertFromJsonSchema(
        { schema: { type: "array" } },
        {
          codes: makeCode(
            `Schema.Array(Schema.Json.annotate({ "expected": "JSON value" }))`,
            `ReadonlyArray<Schema.Json>`
          )
        }
      )
    })

    it("items", () => {
      assertFromJsonSchema(
        {
          schema: {
            type: "array",
            items: { type: "string" }
          }
        },
        { codes: makeCode(`Schema.Array(Schema.String)`, `ReadonlyArray<string>`) }
      )
    })

    it("prefixItems preserves maxItems below the prefix length", () => {
      assertFromJsonSchema(
        {
          schema: {
            type: "array",
            prefixItems: [{ type: "string" }, { type: "number" }],
            maxItems: 1
          }
        },
        {
          codes: makeCode(
            `Schema.TupleWithRest(Schema.Tuple([Schema.optionalKey(Schema.String), Schema.optionalKey(Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" })))]), [Schema.Json.annotate({ "expected": "JSON value" })]).check(Schema.isMaxLength(1).annotate({ "expected": "a value with a length of at most 1" }))`,
            `readonly [(string)?, (number)?, ...Array<Schema.Json>]`
          )
        }
      )
    })

    it("prefixItems preserves maxItems above the prefix length", () => {
      assertFromJsonSchema(
        {
          schema: {
            type: "array",
            prefixItems: [{ type: "string" }],
            maxItems: 2
          }
        },
        {
          codes: makeCode(
            `Schema.TupleWithRest(Schema.Tuple([Schema.optionalKey(Schema.String)]), [Schema.Json.annotate({ "expected": "JSON value" })]).check(Schema.isMaxLength(2).annotate({ "expected": "a value with a length of at most 2" }))`,
            `readonly [(string)?, ...Array<Schema.Json>]`
          )
        }
      )
    })

    it("prefixItems omits maxItems redundant with items: false", () => {
      assertFromJsonSchema(
        {
          schema: {
            type: "array",
            prefixItems: [{ type: "string" }],
            items: false,
            maxItems: 2
          }
        },
        { codes: makeCode(`Schema.Tuple([Schema.optionalKey(Schema.String)])`, `readonly [(string)?]`) }
      )
    })

    it("prefixItems closes when maxItems equals the prefix length", () => {
      assertFromJsonSchema(
        {
          schema: {
            type: "array",
            prefixItems: [{ type: "string" }],
            maxItems: 1
          }
        },
        { codes: makeCode(`Schema.Tuple([Schema.optionalKey(Schema.String)])`, `readonly [(string)?]`) }
      )
    })

    it("prefixItems marks elements required by minItems", () => {
      assertFromJsonSchema(
        {
          schema: {
            type: "array",
            prefixItems: [{ type: "string" }],
            minItems: 1,
            maxItems: 1
          }
        },
        { codes: makeCode(`Schema.Tuple([Schema.String])`, `readonly [string]`) }
      )
    })

    it("prefixItems & minItems", () => {
      assertFromJsonSchema(
        {
          schema: {
            type: "array",
            prefixItems: [{ type: "string" }],
            minItems: 1,
            items: { type: "number" }
          }
        },
        {
          codes: makeCode(
            `Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" }))])`,
            `readonly [string, ...Array<number>]`
          )
        }
      )
    })

    describe("checks", () => {
      it("minItems", () => {
        assertFromJsonSchema(
          { schema: { type: "array", minItems: 1 } },
          {
            codes: makeCode(
              `Schema.Array(Schema.Json.annotate({ "expected": "JSON value" })).check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" }))`,
              `ReadonlyArray<Schema.Json>`
            )
          }
        )
      })

      it("maxItems", () => {
        assertFromJsonSchema(
          { schema: { type: "array", maxItems: 1 } },
          {
            codes: makeCode(
              `Schema.Array(Schema.Json.annotate({ "expected": "JSON value" })).check(Schema.isMaxLength(1).annotate({ "expected": "a value with a length of at most 1" }))`,
              `ReadonlyArray<Schema.Json>`
            )
          }
        )
      })

      it("uniqueItems", () => {
        assertFromJsonSchema(
          { schema: { type: "array", uniqueItems: true } },
          {
            codes: makeCode(
              `Schema.Array(Schema.Json.annotate({ "expected": "JSON value" })).check(Schema.isUnique().annotate({ "expected": "an array with unique items" }))`,
              `ReadonlyArray<Schema.Json>`
            )
          }
        )
      })

      it("does not require uniqueness when uniqueItems is false", () => {
        assertFromJsonSchema({ schema: { type: "array", uniqueItems: false } }, {
          codes: makeCode(
            `Schema.Array(Schema.Json.annotate({ "expected": "JSON value" }))`,
            `ReadonlyArray<Schema.Json>`
          )
        })
      })
    })
  })

  describe("type: object", () => {
    it("delegates excess properties of closed structs to ParseOptions", async () => {
      const schema = toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
        type: "object",
        properties: { name: { type: "string" } },
        additionalProperties: false
      }))
      const asserts = new TestSchema.Asserts(schema as unknown as Schema.ConstraintDecoder<unknown>)
      const decoding = asserts.decoding()
      const strictDecoding = asserts.decoding({ parseOptions: { onExcessProperty: "error" } })
      const input = { extra: 1 }
      await decoding.succeed(input, {})
      assert.deepStrictEqual(input, { extra: 1 })
      await strictDecoding.fail(input, `Expected no excess property\n  at ["extra"]`)
      await strictDecoding.succeed({})
      for (const value of [null, false, 0, "", [], undefined]) {
        await decoding.fail(value, "Expected object")
      }
    })

    it("preserves JSON-valued additional properties for every open form", async () => {
      for (const additionalProperties of [undefined, true, {}]) {
        const schema = toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
          type: "object",
          properties: { name: { type: "string" } },
          ...(additionalProperties === undefined ? {} : { additionalProperties })
        }))
        const asserts = new TestSchema.Asserts(schema as unknown as Schema.ConstraintDecoder<unknown>)
        const decoding = asserts.decoding()
        const input = { name: "Mario", extra: { values: [1, null, true] } }
        await decoding.succeed(input)
        await asserts.decoding({ parseOptions: { onExcessProperty: "error" } }).succeed(input)
        for (const extra of [undefined, Infinity, Symbol("extra"), () => 1]) {
          await decoding.fail({ extra }, `Expected JSON value\n  at ["extra"]`)
        }
      }
    })

    it("runs property checks after stripping excess properties", async () => {
      const schema = toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
        type: "object",
        properties: { name: { type: "string" } },
        additionalProperties: false,
        maxProperties: 1,
        propertyNames: { enum: ["name"] }
      }))
      const asserts = new TestSchema.Asserts(schema as unknown as Schema.ConstraintDecoder<unknown>)
      await asserts.decoding().succeed({ name: "Mario", extra: 1 }, { name: "Mario" })
      await asserts.decoding({ parseOptions: { onExcessProperty: "error" } }).fail(
        { name: "Mario", extra: 1 },
        `Expected no excess property\n  at ["extra"]`
      )
    })

    it("allows additional properties by default", () => {
      assertFromJsonSchema(
        { schema: { type: "object" } },
        {
          codes: makeCode(
            `Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))`,
            `{ readonly [x: string]: Schema.Json }`
          )
        }
      )
    })

    it("closes an object when additionalProperties is false", () => {
      assertFromJsonSchema(
        {
          schema: {
            type: "object",
            additionalProperties: false
          }
        },
        { codes: makeCode(`Schema.Record(Schema.String, Schema.Never)`, `{ readonly [x: string]: never }`) }
      )
    })

    it("preserves closed empty objects through representation persistence and code generation", async () => {
      const schema = toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
        type: "object",
        additionalProperties: false
      }))
      const persisted = SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(schema.ast))
      const revived = SchemaRepresentation.fromRepresentation(SchemaRepresentation.fromJson(persisted), {
        revivers: []
      })
      for (const current of [schema, revived]) {
        const asserts = new TestSchema.Asserts(current as unknown as Schema.ConstraintDecoder<unknown>)
        for (
          const decoding of [asserts.decoding(), asserts.decoding({ parseOptions: { onExcessProperty: "error" } })]
        ) {
          await decoding.succeed({})
          for (const value of [1, undefined]) {
            await decoding.fail({ extra: value }, `Expected never\n  at ["extra"]`)
          }
          await decoding.fail([], "Expected object")
        }
      }
      assertCode(revived, {
        codes: makeCode(`Schema.Record(Schema.String, Schema.Never)`, `{ readonly [x: string]: never }`)
      })
    })

    it("additionalProperties", () => {
      assertFromJsonSchema(
        {
          schema: {
            type: "object",
            additionalProperties: { type: "boolean" }
          }
        },
        { codes: makeCode(`Schema.Record(Schema.String, Schema.Boolean)`, `{ readonly [x: string]: boolean }`) }
      )
    })

    it("properties", () => {
      assertFromJsonSchema(
        {
          schema: {
            type: "object",
            properties: { a: { type: "string" }, b: { type: "string" } },
            required: ["a"],
            additionalProperties: false
          }
        },
        {
          codes: makeCode(
            `Schema.Struct({ "a": Schema.String, "b": Schema.optionalKey(Schema.String) })`,
            `{ readonly "a": string, readonly "b"?: string }`
          )
        }
      )
    })

    it("properties & additionalProperties", () => {
      throws(
        () =>
          toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
            type: "object",
            properties: { a: { type: "string" } },
            required: ["a"],
            additionalProperties: { type: "boolean" }
          })),
        `Cannot combine typed "additionalProperties" with other property schemas: Effect index signatures also check excluded keys.\n  at ["schema"]`
      )
    })

    it("explains why typed additional properties cannot exclude patterned keys", () => {
      throws(
        () =>
          toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
            type: "object",
            patternProperties: { "^a": { type: "string" } },
            additionalProperties: { type: "number" }
          })),
        `Cannot combine typed "additionalProperties" with other property schemas: Effect index signatures also check excluded keys.\n  at ["schema"]`
      )
    })

    it("explains the supported closed pattern form when properties are declared or required", () => {
      for (const fields of [{ properties: { a: { type: "number" } } }, { required: ["a"] }] as const) {
        throws(
          () =>
            toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
              type: "object",
              patternProperties: { "^a": { type: "number" } },
              additionalProperties: false,
              ...fields
            })),
          `Cannot import this closed patterned object: only one pattern without properties is supported.\n  at ["schema"]`
        )
      }
    })

    it("round-trips a closed Record with a patterned key", async () => {
      const original = Schema.Record(Schema.String.check(Schema.isStartingWith("a")), Schema.Finite)
      const document = Schema.toJsonSchemaDocument(original, { onExcessProperty: "error" })
      assert.deepStrictEqual(document.schema, {
        type: "object",
        patternProperties: { "^a": { type: "number" } },
        additionalProperties: false
      })
      const imported = toSchemaFromJsonSchemaDocument(document)
      const asserts = new TestSchema.Asserts(imported as unknown as Schema.ConstraintDecoder<unknown>)
      const decoding = asserts.decoding()
      const strictDecoding = asserts.decoding({ parseOptions: { onExcessProperty: "error" } })
      for (const input of [{}, { a: 1 }, { a: 1, abc: 2 }]) {
        await decoding.succeed(input)
        await strictDecoding.succeed(input)
      }
      const input = { a: 1, z: "extra" }
      await decoding.succeed(input, { a: 1 })
      assert.deepStrictEqual(input, { a: 1, z: "extra" })
      await decoding.succeed({ z: 1 }, {})
      await strictDecoding.fail(input, `Expected no excess property\n  at ["z"]`)
      await strictDecoding.fail({ z: 1 }, `Expected no excess property\n  at ["z"]`)
      for (const value of ["x", null, undefined]) {
        await decoding.fail({ a: value }, `Expected number\n  at ["a"]`)
        await strictDecoding.fail({ a: value }, `Expected number\n  at ["a"]`)
      }
      await decoding.fail({ a: Infinity }, `Expected a finite number\n  at ["a"]`)
      await strictDecoding.fail({ a: Infinity }, `Expected a finite number\n  at ["a"]`)
      for (const value of [null, false, 0, "", [], undefined]) {
        await decoding.fail(value, "Expected object")
      }
      assert.deepStrictEqual(Schema.toJsonSchemaDocument(imported, { onExcessProperty: "error" }), document)
    })

    it("imports a closed patterned Record through references", () => {
      assertFromJsonSchema({
        schema: {
          type: "object",
          properties: { values: { $ref: "#/$defs/Values" } },
          required: ["values"],
          additionalProperties: false,
          $defs: {
            Values: {
              type: "object",
              patternProperties: { a: { $ref: "#/$defs/Value" } },
              additionalProperties: false
            },
            Value: { type: "string", minLength: 2 }
          }
        }
      }, {
        codes: makeCode(`Schema.Struct({ "values": Values })`, `{ readonly "values": Values }`),
        references: {
          nonRecursives: [{
            $ref: `Value`,
            code: makeCode(
              `Schema.String.check(Schema.isMinCodePoints(2).annotate({ "expected": "a string with at least 2 code points", "identifier": "Value" }))`,
              `string`
            )
          }, {
            $ref: `Values`,
            code: makeCode(
              `Schema.Record(Schema.String.check(Schema.isPattern(new RegExp("a", "u")).annotate({ "expected": "a string matching the RegExp a" })), Value).annotate({ "identifier": "Values" })`,
              `{ readonly [x: string]: Value }`
            )
          }]
        }
      })
    })

    it("keeps a closed pattern with Never values as an object schema", () => {
      assertFromJsonSchema({
        schema: {
          type: "object",
          patternProperties: { "^a": { not: {} } },
          additionalProperties: false
        }
      }, {
        codes: makeCode(
          `Schema.Record(Schema.String.check(Schema.isPattern(new RegExp("^a", "u")).annotate({ "expected": "a string matching the RegExp ^a" })), Schema.Never)`,
          `{ readonly [x: string]: never }`
        )
      })
    })

    it("matches finite patternProperties keys in Unicode mode", () => {
      const document = JsonSchema.fromSchemaDraft2020_12({
        allOf: [
          {
            type: "object",
            properties: { "😀": {} },
            additionalProperties: false
          },
          {
            type: "object",
            patternProperties: { "^.$": { type: "string" } }
          }
        ]
      })
      const schema = toSchemaFromJsonSchemaDocument(document)
      assert.isTrue(Schema.is(schema)({ "😀": "value" }))
      assert.isFalse(Schema.is(schema)({ "😀": 1 }))
      assertCode(schema, {
        codes: makeCode(`Schema.Struct({ "😀": Schema.optionalKey(Schema.String) })`, `{ readonly "😀"?: string }`)
      })
    })

    it("rejects closed multiple pattern properties", () => {
      throws(
        () =>
          toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
            type: "object",
            patternProperties: {
              "a*": { type: "string" },
              "b*": { type: "number" }
            },
            additionalProperties: false
          })),
        `Cannot import this closed patterned object: only one pattern without properties is supported.\n  at ["schema"]`
      )
    })

    describe("checks", () => {
      it("minProperties", () => {
        assertFromJsonSchema(
          { schema: { type: "object", minProperties: 1 } },
          {
            codes: makeCode(
              `Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" })).check(Schema.isMinProperties(1).annotate({ "expected": "a value with at least 1 entry" }))`,
              `{ readonly [x: string]: Schema.Json }`
            )
          }
        )
      })

      it("maxProperties", () => {
        assertFromJsonSchema(
          { schema: { type: "object", maxProperties: 1 } },
          {
            codes: makeCode(
              `Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" })).check(Schema.isMaxProperties(1).annotate({ "expected": "a value with at most 1 entry" }))`,
              `{ readonly [x: string]: Schema.Json }`
            )
          }
        )
      })
    })

    describe("propertyNames", () => {
      it("pattern", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "object",
              propertyNames: { pattern: "^[A-Z]" }
            }
          },
          {
            codes: makeCode(
              `Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" })).check(Schema.isPropertyNames(Schema.String.check(Schema.isPattern(new RegExp("^[A-Z]", "u")).annotate({ "expected": "a string matching the RegExp ^[A-Z]" }))).annotate({ "expected": "an object with property names matching the schema" }))`,
              `{ readonly [x: string]: Schema.Json }`
            )
          }
        )
      })

      it("false", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "object",
              propertyNames: false
            }
          },
          {
            codes: makeCode(
              `Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" })).check(Schema.isPropertyNames(Schema.Never).annotate({ "expected": "an object with property names matching the schema" }))`,
              `{ readonly [x: string]: Schema.Json }`
            )
          }
        )
      })

      it("allOf combines checks", () => {
        assertFromJsonSchema(
          {
            schema: {
              allOf: [
                { type: "object", propertyNames: { pattern: "^[A-Z]" } },
                { type: "object", propertyNames: { minLength: 2 } }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" })).check(Schema.isPropertyNames(Schema.String.check(Schema.isPattern(new RegExp("^[A-Z]", "u")).annotate({ "expected": "a string matching the RegExp ^[A-Z]" }))).annotate({ "expected": "an object with property names matching the schema" })).check(Schema.isPropertyNames(Schema.String.check(Schema.isMinCodePoints(2).annotate({ "expected": "a string with at least 2 code points" }))).annotate({ "expected": "an object with property names matching the schema" }))`,
              `{ readonly [x: string]: Schema.Json }`
            )
          }
        )
      })
    })
  })

  it("array of types", () => {
    assertFromJsonSchema(
      {
        schema: { type: ["string", "null"] }
      },
      { codes: makeCode(`Schema.Union([Schema.String, Schema.Null])`, `string | null`) }
    )
    assertFromJsonSchema(
      {
        schema: {
          type: ["string", "null"],
          description: "a"
        }
      },
      {
        codes: makeCode(`Schema.Union([Schema.String, Schema.Null]).annotate({ "description": "a" })`, `string | null`)
      }
    )
  })

  it("ignores true schemas in allOf", () => {
    assertFromJsonSchema(
      { schema: { allOf: [true, { type: "string" }] } },
      { codes: makeCode(`Schema.String`, `string`) }
    )
  })

  it("rejects structured enum members", () => {
    for (const value of [[], {}, { not: "data" }]) {
      throws(
        () => toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({ enum: ["a", value] })),
        `Only primitive values are supported in "const" and "enum".\n  at ["schema"]["enum"][1]`
      )
    }
    throws(
      () => toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({ const: "a", enum: [{}] })),
      `Only primitive values are supported in "const" and "enum".\n  at ["schema"]["enum"][0]`
    )
  })

  it("imports built-in JSON Schema annotations", () => {
    assertFromJsonSchema(
      {
        schema: {
          type: "string",
          format: "email",
          contentEncoding: "base64",
          contentMediaType: "application/json",
          contentSchema: { type: "number" }
        }
      },
      {
        codes: makeCode(
          `Schema.String.annotate({ "format": "email", "contentEncoding": "base64", "contentMediaType": "application/json", "contentSchema": { "type": "number" } })`,
          `string`
        )
      }
    )
  })

  describe("$ref", () => {
    it("rejects local references inside nested resources", () => {
      const reference = { $ref: "#/$defs/X" }
      const nested = { $id: "child", $defs: { X: { type: "number" } } }
      for (
        const [body, suffix] of [
          [reference, ""],
          [{ type: "object", properties: { value: reference } }, `["properties"]["value"]`],
          [{ properties: { value: reference } }, `["properties"]["value"]`],
          [{ type: "array", items: reference }, `["items"]`],
          [{ type: "array", prefixItems: [reference] }, `["prefixItems"][0]`],
          [{ allOf: [reference] }, `["allOf"][0]`],
          [{ anyOf: [reference, { type: "null" }] }, `["anyOf"][0]`],
          [{ oneOf: [reference, { type: "null" }] }, `["oneOf"][0]`],
          [{ type: "object", additionalProperties: reference }, `["additionalProperties"]`],
          [{ type: "object", patternProperties: { "^a": reference } }, `["patternProperties"]["^a"]`],
          [{ type: "object", propertyNames: reference }, `["propertyNames"]`]
        ] as const
      ) {
        throws(
          () =>
            toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
              $id: "https://example.com/root",
              type: "object",
              properties: { child: { ...nested, ...body } },
              $defs: { X: { type: "string" } }
            })),
          `Cannot resolve $ref under a nested "$id". Resolve or flatten it first.\n  at ["schema"]["properties"]["child"]${suffix}["$ref"]`
        )
      }
    })

    it("keeps root ids and nested resources without references supported", () => {
      assertFromJsonSchema({
        schema: {
          $id: "https://example.com/root",
          type: "object",
          properties: {
            child: { $id: "child", type: "number", $defs: { Unused: { $ref: "#/$defs/X" } } },
            value: { $ref: "#/$defs/X" }
          },
          $defs: { X: { type: "string" } }
        }
      }, {
        codes: makeCode(
          `Schema.StructWithRest(Schema.Struct({ "child": Schema.optionalKey(Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" }))), "value": Schema.optionalKey(X) }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))])`,
          `{ readonly "child"?: number, readonly "value"?: X } & { readonly [x: string]: Schema.Json }`
        ),
        references: {
          nonRecursives: [{ $ref: `X`, code: makeCode(`Schema.String.annotate({ "identifier": "X" })`, `string`) }]
        }
      })
    })

    it("determines resource scope from onEnter results", () => {
      const document = JsonSchema.fromSchemaDraft2020_12({
        type: "object",
        properties: { child: { $id: "child", $ref: "#/$defs/X" } },
        $defs: { X: { type: "string" } }
      })
      const schema = toSchemaFromJsonSchemaDocument(document, {
        onEnter: (schema) => ({ ...schema, $id: undefined })
      })
      assertCode(schema, {
        codes: makeCode(
          `Schema.StructWithRest(Schema.Struct({ "child": Schema.optionalKey(X) }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))])`,
          `{ readonly "child"?: X } & { readonly [x: string]: Schema.Json }`
        ),
        references: {
          nonRecursives: [{ $ref: "X", code: makeCode(`Schema.String.annotate({ "identifier": "X" })`, `string`) }]
        }
      })

      throws(
        () =>
          toSchemaFromJsonSchemaDocument(
            JsonSchema.fromSchemaDraft2020_12({
              type: "array",
              items: { $ref: "#/$defs/X" },
              $defs: { X: { type: "string" } }
            }),
            {
              onEnter: (schema) => schema.$ref === undefined ? schema : { ...schema, $id: "child" }
            }
          ),
        `Cannot resolve $ref under a nested "$id". Resolve or flatten it first.\n  at ["schema"]["items"]["$ref"]`
      )
    })

    it("rejects references in a reachable definition with its own id", () => {
      throws(
        () =>
          toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
            $ref: "#/$defs/Child",
            $defs: {
              Child: {
                $id: "https://example.com/child",
                type: "object",
                properties: { value: { $ref: "#/$defs/X" } }
              },
              X: { type: "string" }
            }
          })),
        `Cannot resolve $ref under a nested "$id". Resolve or flatten it first.\n  at ["definitions"]["Child"]["properties"]["value"]["$ref"]`
      )
    })

    it("rejects a reference below a definition instead of resolving its final token", () => {
      throws(
        () =>
          toSchemaFromJsonSchemaDocument(
            JsonSchema.fromSchemaDraft07({
              definitions: {
                inner: { type: "number" },
                outer: {
                  type: "object",
                  properties: {
                    inner: { type: "string" }
                  }
                }
              },
              type: "object",
              properties: {
                copy: { $ref: "#/definitions/outer/properties/inner" }
              }
            })
          ),
        `Unsupported $ref "#/$defs/outer/properties/inner". Use "#/$defs/Name".\n  at ["schema"]["properties"]["copy"]["$ref"]`
      )
    })

    it("rejects an empty reference", () => {
      throws(
        () => toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({ $ref: "" })),
        `Unsupported $ref "". Use "#/$defs/Name".\n  at ["schema"]["$ref"]`
      )
    })

    it("rejects an external reference instead of aliasing a local definition", () => {
      throws(
        () =>
          toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
            $ref: "https://example.com/schema#/$defs/A",
            $defs: {
              A: { type: "string" }
            }
          })),
        `Unsupported $ref "https://example.com/schema#/$defs/A". Use "#/$defs/Name".\n  at ["schema"]["$ref"]`
      )
    })

    it("reports the full reference when a direct definition is missing", () => {
      throws(
        () => toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({ $ref: "#/$defs/Missing" })),
        `Missing definition "Missing" for $ref "#/$defs/Missing".\n  at ["schema"]["$ref"]`
      )
    })

    it("unescapes a direct definition reference", () => {
      assertFromJsonSchema({
        schema: {
          $ref: "#/$defs/A~1B~0C",
          $defs: {
            "A/B~C": { type: "string" }
          }
        }
      }, {
        codes: makeCode(`A_B_C`, `A_B_C`),
        references: {
          nonRecursives: [{
            $ref: `A_B_C`,
            code: makeCode(`Schema.String.annotate({ "identifier": "A/B~C" })`, `string`)
          }]
        }
      })
    })

    it("decodes a direct definition reference", () => {
      assertFromJsonSchema({
        schema: {
          $ref: "#/$defs/A%20B",
          $defs: {
            "A B": { type: "string" }
          }
        }
      }, {
        codes: makeCode(`A_B`, `A_B`),
        references: {
          nonRecursives: [{ $ref: `A_B`, code: makeCode(`Schema.String.annotate({ "identifier": "A B" })`, `string`) }]
        }
      })
    })

    it("resolves a direct reference to an empty definition key", () => {
      assertFromJsonSchema({
        schema: {
          $ref: "#/$defs/",
          $defs: {
            "": { type: "string" }
          }
        }
      }, {
        codes: makeCode(`_`, `_`),
        references: {
          nonRecursives: [{ $ref: `_`, code: makeCode(`Schema.String.annotate({ "identifier": "" })`, `string`) }]
        }
      })
    })

    it("should create a Reference and a definition", () => {
      assertFromJsonSchema(
        {
          schema: {
            $ref: "#/$defs/A",
            $defs: {
              A: {
                type: "string"
              }
            }
          }
        },
        {
          codes: makeCode(`A`, `A`),
          references: {
            nonRecursives: [{ $ref: `A`, code: makeCode(`Schema.String.annotate({ "identifier": "A" })`, `string`) }]
          }
        }
      )
    })

    it("should preserve an annotated $ref as a stable suspend", () => {
      assertFromJsonSchema(
        {
          schema: {
            $ref: "#/$defs/A",
            description: "a",
            $defs: {
              A: {
                type: "string"
              }
            }
          }
        },
        {
          codes: makeCode(`Schema.suspend((): Schema.Codec<A> => A).annotate({ "description": "a" })`, `A`),
          references: {
            nonRecursives: [{ $ref: `A`, code: makeCode(`Schema.String.annotate({ "identifier": "A" })`, `string`) }]
          }
        }
      )
    })

    it("does not combine annotation siblings with a $ref", () => {
      assertFromJsonSchema({
        schema: {
          $ref: "#/$defs/A",
          format: "custom",
          $defs: {
            A: { type: "number" }
          }
        }
      }, {
        codes: makeCode(`Schema.suspend((): Schema.Codec<A> => A).annotate({ "format": "custom" })`, `A`),
        references: {
          nonRecursives: [{
            $ref: `A`,
            code: makeCode(
              `Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number", "identifier": "A" }))`,
              `number`
            )
          }]
        }
      })
    })

    it("should preserve a $ref refined only by annotations as a stable suspend", () => {
      assertFromJsonSchema(
        {
          schema: {
            allOf: [
              { $ref: "#/$defs/A" },
              { description: "a" }
            ],
            $defs: {
              A: {
                type: "string"
              }
            }
          }
        },
        {
          codes: makeCode(`Schema.suspend((): Schema.Codec<A> => A).annotate({ "description": "a" })`, `A`),
          references: {
            nonRecursives: [{ $ref: `A`, code: makeCode(`Schema.String.annotate({ "identifier": "A" })`, `string`) }]
          }
        }
      )
    })

    it("recursive schema", () => {
      assertFromJsonSchema(
        {
          schema: {
            $ref: "#/$defs/A",
            $defs: {
              A: {
                type: "object",
                properties: {
                  name: {
                    type: "string"
                  },
                  children: {
                    type: "array",
                    items: {
                      $ref: "#/$defs/A"
                    }
                  }
                },
                required: [
                  "name",
                  "children"
                ],
                additionalProperties: false
              }
            }
          }
        },
        {
          codes: makeCode(`A`, `A`),
          references: {
            recursives: {
              A: makeCode(
                `Schema.Struct({ "name": Schema.String, "children": Schema.Array(Schema.suspend((): Schema.Codec<A> => A)) }).annotate({ "identifier": "A" })`,
                `{ readonly "name": string, readonly "children": ReadonlyArray<A> }`
              )
            }
          }
        }
      )
    })

    it("preserves annotations on a recursive $ref", () => {
      assertFromJsonSchema(
        {
          schema: {
            $ref: "#/$defs/Node",
            $defs: {
              Node: {
                type: "object",
                properties: {
                  child: {
                    $ref: "#/$defs/Node",
                    description: "recursive child"
                  }
                },
                required: ["child"],
                additionalProperties: false
              }
            }
          }
        },
        {
          codes: makeCode(`Node`, `Node`),
          references: {
            recursives: {
              Node: makeCode(
                `Schema.Struct({ "child": Schema.suspend((): Schema.Codec<Node> => Node).annotate({ "description": "recursive child" }) }).annotate({ "identifier": "Node" })`,
                `{ readonly "child": Node }`
              )
            }
          }
        }
      )
    })

    it("combines assertion siblings with a $ref", () => {
      assertFromJsonSchema({
        schema: {
          $ref: "#/$defs/Name",
          minLength: 2,
          description: "name",
          $defs: {
            Name: { type: "string" }
          }
        }
      }, {
        codes: makeCode(
          `Schema.String.annotate({ "description": "name" }).check(Schema.isMinCodePoints(2).annotate({ "expected": "a string with at least 2 code points" }))`,
          `string`
        )
      })
    })

    it("rejects assertion siblings on a recursive $ref", () => {
      throws(
        () =>
          SchemaRepresentation.fromJsonSchemaDocument(
            JsonSchema.fromSchemaDraft2020_12({
              $ref: "#/$defs/Node",
              $defs: {
                Node: {
                  type: "object",
                  properties: {
                    child: {
                      $ref: "#/$defs/Node",
                      minProperties: 1
                    }
                  }
                }
              }
            })
          ),
        `Recursive $ref "Node" cannot have sibling constraints.\n  at ["definitions"]["Node"]["properties"]["child"]["$ref"]`
      )
    })
  })

  describe("allOf", () => {
    it("prunes disjoint lanes before intersecting unions", () => {
      assertFromJsonSchema({
        schema: {
          allOf: [
            { anyOf: [{ type: "string" }, { type: "number" }] },
            { anyOf: [{ type: "number" }, { type: "boolean" }] }
          ]
        }
      }, {
        codes: makeCode(`Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" }))`, `number`)
      })
    })

    it("rejects intersections requiring a Cartesian product", () => {
      throws(
        () =>
          toSchemaFromJsonSchemaDocument(
            JsonSchema.fromSchemaDraft2020_12({
              allOf: [
                {
                  anyOf: [
                    { type: "string", minLength: 2, maxLength: 3 },
                    { type: "string", minLength: 5, maxLength: 6 }
                  ]
                },
                {
                  anyOf: [
                    { type: "string", pattern: "^a" },
                    { type: "string", pattern: "z$" }
                  ]
                }
              ]
            })
          ),
        `Cannot intersect these "anyOf" or "oneOf" alternatives without expanding their branches.\n  at ["schema"]["allOf"][1]`
      )
    })

    it("rejects distributions that duplicate a nested choice", () => {
      throws(
        () =>
          toSchemaFromJsonSchemaDocument(
            JsonSchema.fromSchemaDraft2020_12({
              allOf: [
                {
                  anyOf: [
                    { type: "object", properties: { tag: { const: "a" } } },
                    { type: "object", properties: { tag: { const: "b" } } }
                  ]
                },
                {
                  type: "object",
                  properties: {
                    value: { anyOf: [{ type: "string" }, { type: "number" }] }
                  }
                }
              ]
            })
          ),
        `Cannot intersect these "anyOf" or "oneOf" alternatives without expanding their branches.\n  at ["schema"]["allOf"][1]`
      )
    })

    it("distributes across a nested reference without choices", () => {
      assertFromJsonSchema({
        schema: {
          allOf: [
            {
              anyOf: [
                { type: "object", required: ["a"] },
                { type: "object", required: ["b"] }
              ]
            },
            {
              type: "object",
              properties: {
                value: { $ref: "#/$defs/Value" }
              },
              required: ["value"]
            }
          ],
          $defs: {
            Value: { type: "string" }
          }
        }
      }, {
        codes: makeCode(
          `Schema.Union([Schema.StructWithRest(Schema.Struct({ "a": Schema.Json.annotate({ "expected": "JSON value" }), "value": Value }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))]), Schema.StructWithRest(Schema.Struct({ "b": Schema.Json.annotate({ "expected": "JSON value" }), "value": Value }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))])])`,
          `{ readonly "a": Schema.Json, readonly "value": Value } & { readonly [x: string]: Schema.Json } | { readonly "b": Schema.Json, readonly "value": Value } & { readonly [x: string]: Schema.Json }`
        ),
        references: {
          nonRecursives: [{
            $ref: `Value`,
            code: makeCode(`Schema.String.annotate({ "identifier": "Value" })`, `string`)
          }]
        }
      })
    })

    it("reports unsupported keywords after a false schema", () => {
      throws(
        () =>
          toSchemaFromJsonSchemaDocument(
            JsonSchema.fromSchemaDraft2020_12({
              allOf: [false, { contains: {} }]
            })
          ),
        `Cannot import JSON Schema keyword "contains": Effect has no equivalent constraint.\n  at ["schema"]["allOf"][1]["contains"]`
      )
    })

    it("intersects one constraint with many alternatives linearly", () => {
      assertFromJsonSchema({
        schema: {
          pattern: "^value-",
          anyOf: Array.from({ length: 16 }, (_, index) => ({ const: `value-${index}` }))
        }
      }, {
        codes: makeCode(
          `Schema.Literals(["value-0", "value-1", "value-2", "value-3", "value-4", "value-5", "value-6", "value-7", "value-8", "value-9", "value-10", "value-11", "value-12", "value-13", "value-14", "value-15"])`,
          `"value-0" | "value-1" | "value-2" | "value-3" | "value-4" | "value-5" | "value-6" | "value-7" | "value-8" | "value-9" | "value-10" | "value-11" | "value-12" | "value-13" | "value-14" | "value-15"`
        )
      })
    })

    it("resolves a root reference before intersecting allOf", () => {
      const definition: JsonSchema.JsonSchema = { type: "string", minLength: 1 }
      assertFromJsonSchema({
        schema: {
          $ref: "#/$defs/A",
          allOf: [{ type: "string", maxLength: 2 }],
          $defs: { A: definition }
        }
      }, {
        codes: makeCode(
          `Schema.String.check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" })).check(Schema.isMaxCodePoints(2).annotate({ "expected": "a string with at most 2 code points" }))`,
          `string`
        )
      })
    })

    it("resolves a reference declared inside allOf", () => {
      const definition: JsonSchema.JsonSchema = { type: "string", minLength: 1 }
      assertFromJsonSchema({
        schema: {
          allOf: [{ $ref: "#/$defs/A" }, { type: "string", maxLength: 2 }],
          $defs: { A: definition }
        }
      }, {
        codes: makeCode(
          `Schema.String.check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" })).check(Schema.isMaxCodePoints(2).annotate({ "expected": "a string with at most 2 code points" }))`,
          `string`
        )
      })
    })

    it("preserves annotations on array intersections", () => {
      assertFromJsonSchema(
        {
          schema: {
            type: "array",
            allOf: [{ description: "a" }]
          }
        },
        {
          codes: makeCode(
            `Schema.Array(Schema.Json.annotate({ "expected": "JSON value" })).annotate({ "description": "a" })`,
            `ReadonlyArray<Schema.Json>`
          )
        }
      )
    })

    it("preserves annotations on object intersections", () => {
      assertFromJsonSchema(
        {
          schema: {
            type: "object",
            additionalProperties: false,
            allOf: [{ description: "a" }]
          }
        },
        {
          codes: makeCode(
            `Schema.Record(Schema.String, Schema.Never).annotate({ "description": "a" })`,
            `{ readonly [x: string]: never }`
          )
        }
      )
    })

    it("returns Never when a union has no compatible member", () => {
      assertFromJsonSchema(
        {
          schema: {
            type: "string",
            allOf: [{ anyOf: [{ type: "number" }, { type: "boolean" }] }]
          }
        },
        { codes: makeCode(`Schema.Never`, `never`) }
      )
    })

    function assertLiteralRefinement(
      refinement: JsonSchema.JsonSchema,
      valid: string | number,
      invalid: string | number
    ) {
      for (const literal of [valid, invalid]) {
        for (const allOf of [[refinement, { const: literal }], [{ const: literal }, refinement]]) {
          const value = JSON.stringify(literal)
          assertFromJsonSchema(
            { schema: { allOf } },
            {
              codes: literal === valid ? makeCode(`Schema.Literal(${value})`, value) : makeCode(`Schema.Never`, `never`)
            }
          )
        }
      }
    }

    describe("literal refinements", () => {
      it("minLength", () => {
        assertLiteralRefinement({ type: "string", minLength: 2 }, "ab", "a")
      })

      it("maxLength", () => {
        assertLiteralRefinement({ type: "string", maxLength: 1 }, "a", "ab")
      })

      it("pattern", () => {
        assertLiteralRefinement({ type: "string", pattern: "^a+$" }, "aa", "ab")
      })

      it("integer", () => {
        assertLiteralRefinement({ type: "integer" }, 1, 1.5)
      })

      it("multipleOf", () => {
        assertLiteralRefinement({ type: "number", multipleOf: 0.1 }, 0.3, 0.31)
      })

      it("multipleOf beyond the toFixed precision limit", () => {
        assertLiteralRefinement({ type: "number", multipleOf: Number("1e-101") }, 0, Number("5e-102"))
      })

      it("multipleOf with a large scientific operand", () => {
        assertLiteralRefinement({ type: "number", multipleOf: 2 }, Number("1e21"), 1)
      })

      it("multipleOf with a nonzero subnormal remainder", () => {
        assertLiteralRefinement({ type: "number", multipleOf: Number("1e-323") }, 0, Number("1.042e-321"))
      })

      it("minimum", () => {
        assertLiteralRefinement({ type: "number", minimum: 1 }, 1, 0)
      })

      it("maximum", () => {
        assertLiteralRefinement({ type: "number", maximum: 1 }, 1, 2)
      })

      it("exclusiveMinimum", () => {
        assertLiteralRefinement({ type: "number", exclusiveMinimum: 1 }, 2, 1)
      })

      it("exclusiveMaximum", () => {
        assertLiteralRefinement({ type: "number", exclusiveMaximum: 1 }, 0, 1)
      })

      it("filter group", () => {
        assertLiteralRefinement(
          { type: "number", allOf: [{ minimum: 1, maximum: 2, description: "range" }] },
          2,
          0
        )
      })

      it("filters enum members when the refinement precedes the enum", () => {
        assertFromJsonSchema(
          { schema: { type: "string", minLength: 2, allOf: [{ enum: ["a", "ab"] }] } },
          { codes: makeCode(`Schema.Literal("ab")`, `"ab"`) }
        )
      })

      it("filters enum members when the enum precedes the refinement", () => {
        assertFromJsonSchema(
          { schema: { enum: ["a", "ab"], allOf: [{ type: "string", minLength: 2 }] } },
          { codes: makeCode(`Schema.Literal("ab")`, `"ab"`) }
        )
      })
    })

    it("no type", () => {
      assertFromJsonSchema(
        {
          schema: {
            allOf: [
              { type: "string" }
            ]
          }
        },
        { codes: makeCode(`Schema.String`, `string`) }
      )
    })

    describe("type: string", () => {
      it("& minLength", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              allOf: [
                { minLength: 1 }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.String.check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" }))`,
              `string`
            )
          }
        )
      })

      it("& minLength + description", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              allOf: [
                { minLength: 1, description: "b" }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.String.check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1", "description": "b" }))`,
              `string`
            )
          }
        )
      })

      it("description & minLength", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              description: "a",
              allOf: [
                { minLength: 1 }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.String.annotate({ "description": "a" }).check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" }))`,
              `string`
            )
          }
        )
      })

      it("description & description", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              description: "a",
              allOf: [
                { description: "b" }
              ]
            }
          },
          { codes: makeCode(`Schema.String.annotate({ "description": "b" })`, `string`) }
        )
      })

      it("description & minLength + description", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              description: "a",
              allOf: [
                { minLength: 1, description: "b" }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.String.annotate({ "description": "a" }).check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1", "description": "b" }))`,
              `string`
            )
          }
        )
      })

      it("maxLength & minLength", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              maxLength: 2,
              allOf: [
                { minLength: 1 }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.String.check(Schema.isMaxCodePoints(2).annotate({ "expected": "a string with at most 2 code points" })).check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" }))`,
              `string`
            )
          }
        )
      })

      it("description + maxLength & minLength", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              description: "a",
              maxLength: 2,
              allOf: [
                { minLength: 1 }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.String.annotate({ "description": "a" }).check(Schema.isMaxCodePoints(2).annotate({ "expected": "a string with at most 2 code points" })).check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" }))`,
              `string`
            )
          }
        )
      })

      it("description + maxLength & minLength + description", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              description: "a",
              maxLength: 2,
              allOf: [
                { minLength: 1, description: "b" }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.String.annotate({ "description": "a" }).check(Schema.isMaxCodePoints(2).annotate({ "expected": "a string with at most 2 code points" })).check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1", "description": "b" }))`,
              `string`
            )
          }
        )
      })

      it("& minLength + maxLength", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              allOf: [
                { minLength: 1, maxLength: 2 }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.String.check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" })).check(Schema.isMaxCodePoints(2).annotate({ "expected": "a string with at most 2 code points" }))`,
              `string`
            )
          }
        )
      })

      it("& minLength + maxLength + description", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              allOf: [
                { minLength: 1, maxLength: 2, description: "b" }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.String.check(Schema.makeFilterGroup([Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" }), Schema.isMaxCodePoints(2).annotate({ "expected": "a string with at most 2 code points" })]).annotate({ "description": "b" }))`,
              `string`
            )
          }
        )
      })

      it("& (minLength & maxLength + description)", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              allOf: [
                { minLength: 1, allOf: [{ maxLength: 2, description: "c" }] }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.String.check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" })).check(Schema.isMaxCodePoints(2).annotate({ "expected": "a string with at most 2 code points", "description": "c" }))`,
              `string`
            )
          }
        )
      })

      it("& (minLength + description & maxLength + description)", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              allOf: [
                { minLength: 1, description: "b", allOf: [{ maxLength: 2, description: "c" }] }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.String.check(Schema.makeFilterGroup([Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" }), Schema.isMaxCodePoints(2).annotate({ "expected": "a string with at most 2 code points", "description": "c" })]).annotate({ "description": "b" }))`,
              `string`
            )
          }
        )
      })

      it("intersects with a single-member string enum", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              allOf: [
                { enum: ["a"] }
              ]
            }
          },
          { codes: makeCode(`Schema.Literal("a")`, `"a"`) }
        )
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              description: "a",
              allOf: [
                { enum: ["a"], description: "b" }
              ]
            }
          },
          { codes: makeCode(`Schema.Literal("a").annotate({ "description": "b" })`, `"a"`) }
        )
      })

      it("intersects with a multi-member string enum", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              allOf: [
                { enum: ["a", "b"] }
              ]
            }
          },
          { codes: makeCode(`Schema.Literals(["a", "b"])`, `"a" | "b"`) }
        )
      })

      it("& mixed enum", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "string",
              allOf: [
                { enum: ["a", 1] }
              ]
            }
          },
          { codes: makeCode(`Schema.Literal("a")`, `"a"`) }
        )
      })
    })

    describe("type: number", () => {
      it("number & number preserves annotations after removing duplicate checks", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "number",
              allOf: [{ type: "number", description: "b" }]
            }
          },
          {
            codes: makeCode(
              `Schema.Number.annotate({ "description": "b" }).check(Schema.isFinite().annotate({ "expected": "a finite number" }))`,
              `number`
            )
          }
        )
      })

      it("number & integer", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "number",
              allOf: [
                { type: "integer" }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" })).check(Schema.isInt().annotate({ "expected": "an integer" }))`,
              `number`
            )
          }
        )
      })

      it("number & integer & integer", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "number",
              allOf: [
                { type: "integer", minimum: 2 },
                { type: "integer", maximum: 2 }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" })).check(Schema.isInt().annotate({ "expected": "an integer" })).check(Schema.isGreaterThanOrEqualTo(2).annotate({ "expected": "a value greater than or equal to 2" })).check(Schema.isLessThanOrEqualTo(2).annotate({ "expected": "a value less than or equal to 2" }))`,
              `number`
            )
          }
        )
      })

      it("integer & number", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "integer",
              allOf: [
                { type: "number" }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isInt().annotate({ "expected": "an integer" })).check(Schema.isFinite().annotate({ "expected": "a finite number" }))`,
              `number`
            )
          }
        )
      })

      it("& (minimum + description & maximum + description)", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "number",
              allOf: [
                { minimum: 1, description: "b", allOf: [{ maximum: 2, description: "c" }] }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" })).check(Schema.makeFilterGroup([Schema.isGreaterThanOrEqualTo(1).annotate({ "expected": "a value greater than or equal to 1" }), Schema.isLessThanOrEqualTo(2).annotate({ "expected": "a value less than or equal to 2", "description": "c" })]).annotate({ "description": "b" }))`,
              `number`
            )
          }
        )
      })

      it("continues intersecting after an annotated filter group", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "number",
              allOf: [
                { minimum: 1, maximum: 2, description: "range" },
                { type: "integer" }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" })).check(Schema.makeFilterGroup([Schema.isGreaterThanOrEqualTo(1).annotate({ "expected": "a value greater than or equal to 1" }), Schema.isLessThanOrEqualTo(2).annotate({ "expected": "a value less than or equal to 2" })]).annotate({ "description": "range" })).check(Schema.isInt().annotate({ "expected": "an integer" }))`,
              `number`
            )
          }
        )
      })

      it("intersects with a single-member number enum", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "number",
              allOf: [
                { enum: [1] }
              ]
            }
          },
          { codes: makeCode(`Schema.Literal(1)`, `1`) }
        )
        assertFromJsonSchema(
          {
            schema: {
              type: "number",
              description: "a",
              allOf: [
                { enum: [1], description: "b" }
              ]
            }
          },
          { codes: makeCode(`Schema.Literal(1).annotate({ "description": "b" })`, `1`) }
        )
      })

      it("intersects with a multi-member number enum", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "number",
              allOf: [
                { enum: [1, 2] }
              ]
            }
          },
          { codes: makeCode(`Schema.Literals([1, 2])`, `1 | 2`) }
        )
      })
    })

    describe("type: boolean", () => {
      it("boolean & boolean", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "boolean",
              allOf: [{ type: "boolean" }]
            }
          },
          { codes: makeCode(`Schema.Boolean`, `boolean`) }
        )
      })

      it("boolean & non-boolean literal", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "boolean",
              allOf: [{ const: 1 }]
            }
          },
          { codes: makeCode(`Schema.Never`, `never`) }
        )
      })

      it("intersects with a single-member boolean enum", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "boolean",
              allOf: [
                { enum: [true] }
              ]
            }
          },
          { codes: makeCode(`Schema.Literal(true)`, `true`) }
        )
        assertFromJsonSchema(
          {
            schema: {
              type: "boolean",
              description: "a",
              allOf: [
                { enum: [true], description: "b" }
              ]
            }
          },
          { codes: makeCode(`Schema.Literal(true).annotate({ "description": "b" })`, `true`) }
        )
      })
    })

    describe("type: array", () => {
      function assertArrayAllOf(
        a: JsonSchema.JsonSchema,
        b: JsonSchema.JsonSchema,
        expected: Expected
      ) {
        for (const [schema, member] of [[a, b], [b, a]]) {
          assertFromJsonSchema(
            { schema: { ...schema, allOf: [member] } },
            expected
          )
        }
      }

      it("uniqueItems & uniqueItems", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "array",
              uniqueItems: true,
              allOf: [
                { uniqueItems: true }
              ]
            }
          },
          {
            codes: makeCode(
              `Schema.Array(Schema.Json.annotate({ "expected": "JSON value" })).check(Schema.isUnique().annotate({ "expected": "an array with unique items" }))`,
              `ReadonlyArray<Schema.Json>`
            )
          }
        )
      })

      it("combines unequal open prefixes", () => {
        assertArrayAllOf(
          {
            type: "array",
            prefixItems: [{ type: "string" }],
            minItems: 1,
            items: { type: "string" }
          },
          {
            type: "array",
            prefixItems: [{ type: "string" }, { const: "tail" }],
            minItems: 2,
            items: { type: "string" }
          },
          {
            codes: makeCode(
              `Schema.TupleWithRest(Schema.Tuple([Schema.String, Schema.Literal("tail")]), [Schema.String])`,
              `readonly [string, "tail", ...Array<string>]`
            )
          }
        )
      })

      it("truncates optional elements forbidden by a closed tuple", () => {
        assertArrayAllOf(
          {
            type: "array",
            prefixItems: [{ type: "string" }],
            minItems: 1,
            maxItems: 1
          },
          {
            type: "array",
            prefixItems: [{ type: "string" }, { type: "number" }],
            minItems: 1,
            maxItems: 2
          },
          { codes: makeCode(`Schema.Tuple([Schema.String])`, `readonly [string]`) }
        )
      })

      it("returns Never when a closed tuple forbids a required element", () => {
        assertArrayAllOf(
          {
            type: "array",
            prefixItems: [{ type: "string" }],
            minItems: 1,
            maxItems: 1
          },
          {
            type: "array",
            prefixItems: [{ type: "string" }, { type: "number" }],
            minItems: 2,
            maxItems: 2
          },
          { codes: makeCode(`Schema.Never`, `never`) }
        )
      })

      it("combines an open rest with a closed rest", () => {
        assertArrayAllOf(
          {
            type: "array",
            prefixItems: [{ type: "string" }],
            minItems: 1,
            items: { type: "number" }
          },
          {
            type: "array",
            prefixItems: [{ type: "string" }],
            minItems: 1,
            maxItems: 1
          },
          { codes: makeCode(`Schema.Tuple([Schema.String])`, `readonly [string]`) }
        )
      })

      it("closes the tuple when the rest intersection is Never", () => {
        assertArrayAllOf(
          {
            type: "array",
            prefixItems: [{ type: "string" }],
            minItems: 1,
            items: { type: "string" }
          },
          {
            type: "array",
            prefixItems: [{ type: "string" }],
            minItems: 1,
            items: { type: "number" }
          },
          { codes: makeCode(`Schema.Tuple([Schema.String])`, `readonly [string]`) }
        )
      })

      it("rejects a required literal that fails rest refinements", () => {
        assertArrayAllOf(
          {
            type: "array",
            minItems: 1,
            items: { const: 0 }
          },
          {
            type: "array",
            prefixItems: [{ type: "number", minimum: 1 }],
            minItems: 1,
            maxItems: 1
          },
          { codes: makeCode(`Schema.Never`, `never`) }
        )
      })

      it("truncates an optional literal that fails rest refinements", () => {
        assertArrayAllOf(
          {
            type: "array",
            items: { const: 0 }
          },
          {
            type: "array",
            prefixItems: [{ type: "number", minimum: 1 }],
            maxItems: 1
          },
          { codes: makeCode(`Schema.Tuple([])`, `readonly []`) }
        )
      })

      it("preserves a literal that satisfies rest refinements", () => {
        assertArrayAllOf(
          {
            type: "array",
            minItems: 1,
            items: { const: 2 }
          },
          {
            type: "array",
            prefixItems: [{ type: "number", minimum: 1 }],
            minItems: 1,
            maxItems: 1
          },
          {
            codes: makeCode(
              `Schema.Tuple([Schema.Literal(2)]).check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" }))`,
              `readonly [2]`
            )
          }
        )
      })
    })

    it("short-circuits false intersections to Never", () => {
      assertFromJsonSchema(
        { schema: { allOf: [false, { type: "string" }] } },
        { codes: makeCode(`Schema.Never`, `never`) }
      )
    })

    it("returns Never when intersecting array and string", () => {
      assertFromJsonSchema(
        { schema: { allOf: [{ type: "array" }, { type: "string" }] } },
        { codes: makeCode(`Schema.Never`, `never`) }
      )
    })

    it("returns Never when intersecting object and string", () => {
      assertFromJsonSchema(
        { schema: { allOf: [{ type: "object" }, { type: "string" }] } },
        { codes: makeCode(`Schema.Never`, `never`) }
      )
    })

    it("returns Never when intersecting null and string", () => {
      assertFromJsonSchema(
        { schema: { allOf: [{ type: "null" }, { type: "string" }] } },
        { codes: makeCode(`Schema.Never`, `never`) }
      )
    })

    it("returns Never when intersecting distinct literals", () => {
      assertFromJsonSchema(
        { schema: { allOf: [{ const: 1 }, { const: 2 }] } },
        { codes: makeCode(`Schema.Never`, `never`) }
      )
    })

    it("preserves null when intersecting null types", () => {
      assertFromJsonSchema(
        { schema: { allOf: [{ type: "null" }, { type: "null" }] } },
        { codes: makeCode(`Schema.Null`, `null`) }
      )
    })

    it("preserves a literal when intersecting identical literals", () => {
      assertFromJsonSchema(
        { schema: { allOf: [{ const: 1 }, { const: 1 }] } },
        { codes: makeCode(`Schema.Literal(1)`, `1`) }
      )
    })

    it("preserves a matching literal after a boolean type", () => {
      assertFromJsonSchema(
        { schema: { allOf: [{ type: "boolean" }, { const: true }] } },
        { codes: makeCode(`Schema.Literal(true)`, `true`) }
      )
    })

    it("preserves a matching literal before a boolean type", () => {
      assertFromJsonSchema(
        { schema: { allOf: [{ const: true }, { type: "boolean" }] } },
        { codes: makeCode(`Schema.Literal(true)`, `true`) }
      )
    })

    it("combines a string with a reference", () => {
      const definition: JsonSchema.JsonSchema = { type: "string", minLength: 1 }
      assertFromJsonSchema(
        {
          schema: {
            type: "string",
            allOf: [{ $ref: "#/$defs/A" }],
            $defs: { A: definition }
          }
        },
        {
          codes: makeCode(
            `Schema.String.check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" }))`,
            `string`
          )
        }
      )
    })

    it("preserves annotations on a reference inside allOf", () => {
      const definition: JsonSchema.JsonSchema = { type: "string", minLength: 1 }

      assertFromJsonSchema({
        schema: {
          type: "string",
          allOf: [{ $ref: "#/$defs/A", description: "annotated" }],
          $defs: { A: definition }
        }
      }, {
        codes: makeCode(
          `Schema.String.annotate({ "description": "annotated" }).check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" }))`,
          `string`
        )
      })
    })

    it("preserves annotations on a root reference intersected with allOf", () => {
      const definition: JsonSchema.JsonSchema = { type: "string", minLength: 1 }

      assertFromJsonSchema({
        schema: {
          $ref: "#/$defs/A",
          description: "annotated",
          allOf: [{ type: "string" }],
          $defs: { A: definition }
        }
      }, {
        codes: makeCode(
          `Schema.String.annotate({ "description": "annotated" }).check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" }))`,
          `string`
        )
      })
    })

    it("preserves annotations through reference aliases", () => {
      assertFromJsonSchema({
        schema: {
          type: "string",
          allOf: [{ $ref: "#/$defs/A" }],
          $defs: {
            A: { $ref: "#/$defs/B", description: "alias" },
            B: { type: "string" }
          }
        }
      }, { codes: makeCode(`Schema.String.annotate({ "description": "alias" })`, `string`) })
    })

    it("merges annotations on string intersections", () => {
      assertFromJsonSchema({
        schema: {
          allOf: [
            { type: "string", contentMediaType: "application/json" },
            { type: "string", contentSchema: { type: "number" } }
          ]
        }
      }, {
        codes: makeCode(
          `Schema.String.annotate({ "contentMediaType": "application/json", "contentSchema": { "type": "number" } })`,
          `string`
        )
      })
    })

    it("merges constraints on overlapping required properties", () => {
      assertFromJsonSchema({
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { a: { type: "string" } },
          required: ["a"],
          allOf: [{
            type: "object",
            additionalProperties: false,
            properties: { a: { type: "string", minLength: 2 } },
            required: ["a"]
          }]
        }
      }, {
        codes: makeCode(
          `Schema.Struct({ "a": Schema.String.check(Schema.isMinCodePoints(2).annotate({ "expected": "a string with at least 2 code points" })) })`,
          `{ readonly "a": string }`
        )
      })
    })

    it("preserves optional properties when intersecting object fields", () => {
      assertFromJsonSchema({
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { a: { type: "string" } },
          allOf: [{
            type: "object",
            additionalProperties: false,
            properties: { a: { minLength: 1 } }
          }]
        }
      }, {
        codes: makeCode(
          `Schema.Struct({ "a": Schema.optionalKey(Schema.String.check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" }))) })`,
          `{ readonly "a"?: string }`
        )
      })
    })

    it("keeps additionalProperties scopes separate", () => {
      for (
        const schema of [
          {
            type: "object",
            additionalProperties: false,
            allOf: [{ properties: { a: { type: "string" } } }]
          },
          {
            type: "object",
            properties: { a: { type: "string" } },
            allOf: [{ additionalProperties: false }]
          }
        ]
      ) {
        assertFromJsonSchema({ schema }, {
          codes: makeCode(`Schema.Struct({ "a": Schema.optionalKey(Schema.Never) })`, `{ readonly "a"?: never }`)
        })
      }
    })

    it("does not move sibling properties into a closed scope", () => {
      assertFromJsonSchema({
        schema: {
          type: "object",
          properties: { a: { type: "string" } },
          additionalProperties: false,
          allOf: [{ properties: { b: { type: "number" } } }]
        }
      }, {
        codes: makeCode(
          `Schema.Struct({ "a": Schema.optionalKey(Schema.String), "b": Schema.optionalKey(Schema.Never) })`,
          `{ readonly "a"?: string, readonly "b"?: never }`
        )
      })
    })

    it("rejects an object when a required sibling property is outside a closed scope", () => {
      assertFromJsonSchema({
        schema: {
          type: "object",
          additionalProperties: false,
          allOf: [{ properties: { a: { type: "string" } }, required: ["a"] }]
        }
      }, { codes: makeCode(`Schema.Never`, `never`) })
    })

    it("keeps object keyword scopes through references", () => {
      assertFromJsonSchema({
        schema: {
          $ref: "#/$defs/Closed",
          allOf: [{ properties: { a: { type: "string" } } }],
          $defs: {
            Closed: { type: "object", additionalProperties: false }
          }
        }
      }, { codes: makeCode(`Schema.Struct({ "a": Schema.optionalKey(Schema.Never) })`, `{ readonly "a"?: never }`) })
    })

    it("applies a sibling additionalProperties schema to fixed properties", () => {
      const schema = toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
        type: "object",
        properties: { a: { type: "string" } },
        allOf: [{ additionalProperties: { type: "boolean" } }]
      }))
      assertCode(schema, {
        codes: makeCode(
          `Schema.StructWithRest(Schema.Struct({ "a": Schema.optionalKey(Schema.Never) }), [Schema.Record(Schema.String, Schema.Boolean)])`,
          `{ readonly "a"?: never } & { readonly [x: string]: boolean }`
        )
      })
      deepStrictEqual(Schema.toJsonSchemaDocument(schema).schema, {
        type: "object",
        properties: { a: { not: {} } },
        allOf: [{ type: "object", additionalProperties: { type: "boolean" } }]
      })
    })

    it("lowers open patterns over a finite object domain", () => {
      assertFromJsonSchema({
        schema: {
          type: "object",
          properties: { a: { type: "string" } },
          additionalProperties: false,
          allOf: [{ patternProperties: { "^a$": { minLength: 2 } } }]
        }
      }, {
        codes: makeCode(
          `Schema.Struct({ "a": Schema.optionalKey(Schema.String.check(Schema.isMinCodePoints(2).annotate({ "expected": "a string with at least 2 code points" }))) })`,
          `{ readonly "a"?: string }`
        )
      })
    })

    it("rejects open pattern scopes", () => {
      for (const additional of [{}, { additionalProperties: true }, { additionalProperties: {} }] as const) {
        const schema = {
          type: "object",
          patternProperties: { "^a": { type: "number" } },
          ...additional
        } as const
        throws(
          () => toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12(schema)),
          `Cannot import open "patternProperties": unmatched keys cannot be typed correctly.\n  at ["schema"]`
        )
        assertFromJsonSchema({ schema, options: { patterns: "ignore" } }, {
          codes: makeCode(
            `Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))`,
            `{ readonly [x: string]: Schema.Json }`
          )
        })
      }
    })

    it("rejects open patterns with fixed properties", () => {
      throws(
        () =>
          toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
            type: "object",
            properties: { a: { type: "string" } },
            patternProperties: { "^a$": { minLength: 2 } }
          })),
        `Cannot import open "patternProperties": unmatched keys cannot be typed correctly.\n  at ["schema"]`
      )
    })

    it("rejects nested open pattern scopes with their source paths", () => {
      const open = { type: "object", patternProperties: { "^a": { type: "number" } } } as const
      const cases: ReadonlyArray<readonly [JsonSchema.JsonSchema, string]> = [
        [{ type: "array", items: open }, `["schema"]["items"]`],
        [{ type: "object", properties: { values: open } }, `["schema"]["properties"]["values"]`],
        [{ anyOf: [{ type: "string" }, open] }, `["schema"]["anyOf"][1]`],
        [{ $ref: "#/$defs/Values", $defs: { Values: open } }, `["definitions"]["Values"]`]
      ]
      for (const [schema, path] of cases) {
        throws(
          () => toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12(schema)),
          `Cannot import open "patternProperties": unmatched keys cannot be typed correctly.\n  at ${path}`
        )
      }
    })

    it("lowers an initially open pattern over a finite object domain", () => {
      assertFromJsonSchema({
        schema: {
          type: "object",
          patternProperties: { "^a$": { minLength: 2 } },
          allOf: [{
            properties: { a: { type: "string" } },
            additionalProperties: false
          }]
        }
      }, {
        codes: makeCode(
          `Schema.Struct({ "a": Schema.optionalKey(Schema.String.check(Schema.isMinCodePoints(2).annotate({ "expected": "a string with at least 2 code points" }))) })`,
          `{ readonly "a"?: string }`
        )
      })
    })

    it("lowers a referenced open pattern over a finite object domain", () => {
      assertFromJsonSchema({
        schema: {
          type: "object",
          properties: { a: { type: "string" } },
          additionalProperties: false,
          allOf: [{ $ref: "#/$defs/Pattern" }],
          $defs: {
            Pattern: {
              type: "object",
              patternProperties: { "^a$": { minLength: 2 } }
            }
          }
        }
      }, {
        codes: makeCode(
          `Schema.Struct({ "a": Schema.optionalKey(Schema.String.check(Schema.isMinCodePoints(2).annotate({ "expected": "a string with at least 2 code points" }))) })`,
          `{ readonly "a"?: string }`
        )
      })
    })

    it("rejects object scopes that require pattern complements", () => {
      throws(
        () =>
          toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
            type: "object",
            additionalProperties: false,
            patternProperties: { "^a": { type: "string" } },
            allOf: [
              {
                type: "object",
                additionalProperties: false,
                patternProperties: { "^b": { type: "number" } }
              }
            ]
          })),
        `Cannot import this closed patterned object: only one pattern without properties is supported.\n  at ["schema"]["allOf"][0]`
      )
    })

    it("preserves a closed pattern scope when intersecting a finite object domain", () => {
      assertFromJsonSchema({
        schema: {
          type: "object",
          properties: { a: { type: "number" }, b: { type: "number" } },
          additionalProperties: false,
          allOf: [{
            type: "object",
            patternProperties: { "^a": { type: "number" } },
            additionalProperties: false
          }]
        }
      }, {
        codes: makeCode(
          `Schema.Struct({ "a": Schema.optionalKey(Schema.Number.check(Schema.isFinite().annotate({ "expected": "a finite number" }))), "b": Schema.optionalKey(Schema.Never) })`,
          `{ readonly "a"?: number, readonly "b"?: never }`
        )
      })
    })

    describe("type: object", () => {
      it("add properties", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "object",
              additionalProperties: false,
              allOf: [
                { properties: { a: { type: "string" } } }
              ]
            }
          },
          { codes: makeCode(`Schema.Struct({ "a": Schema.optionalKey(Schema.Never) })`, `{ readonly "a"?: never }`) }
        )
      })

      it("add additionalProperties", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "object",
              allOf: [
                { additionalProperties: { type: "boolean" } }
              ]
            }
          },
          { codes: makeCode(`Schema.Record(Schema.String, Schema.Boolean)`, `{ readonly [x: string]: boolean }`) }
        )
      })
    })
  })

  describe("unsupported validation keywords", () => {
    it("not", () => {
      throws(
        () =>
          toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft07({
            type: "object",
            properties: {
              value: { not: { type: "string" } }
            }
          })),
        `Cannot import JSON Schema keyword "not": Effect has no equivalent constraint.\n  at ["schema"]["properties"]["value"]["not"]`
      )
    })

    for (
      const [keyword, value] of [
        ["$dynamicRef", "#node"],
        ["contains", { type: "string" }],
        ["dependentRequired", { a: ["b"] }],
        ["dependentSchemas", { a: { required: ["b"] } }],
        ["unevaluatedItems", false],
        ["unevaluatedProperties", false]
      ] as const
    ) {
      it(keyword, () => {
        throws(
          () => toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({ [keyword]: value })),
          `Cannot import JSON Schema keyword "${keyword}": Effect has no equivalent constraint.\n  at ["schema"][${
            JSON.stringify(keyword)
          }]`
        )
      })
    }

    for (const branch of ["then", "else"] as const) {
      it(`if/${branch}`, () => {
        throws(
          () =>
            toSchemaFromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({
              if: { type: "string" },
              [branch]: false
            })),
          `Cannot import JSON Schema keyword "if": Effect has no equivalent constraint.\n  at ["schema"]["if"]`
        )
      })
    }

    it("ignores inactive conditional and contains cardinality keywords", () => {
      for (
        const [keyword, value] of [
          ["if", false],
          ["then", false],
          ["else", false],
          ["minContains", 1],
          ["maxContains", 2]
        ] as const
      ) {
        assertFromJsonSchema(
          { schema: { [keyword]: value } },
          { codes: makeCode(`Schema.Json.annotate({ "expected": "JSON value" })`, `Schema.Json`) }
        )
      }
    })

    it("ignores custom keywords", () => {
      assertFromJsonSchema({ schema: { custom: false } }, {
        codes: makeCode(`Schema.Json.annotate({ "expected": "JSON value" })`, `Schema.Json`)
      })
    })
  })

  describe("options", () => {
    describe("patterns", () => {
      it("can reject previously exclusive branches when patterns are ignored", () => {
        const document = JsonSchema.fromSchemaDraft2020_12({
          oneOf: [
            { type: "string", pattern: "^a$" },
            { type: "string", pattern: "^b$" }
          ]
        })
        const applied = toSchemaFromJsonSchemaDocument(document, { patterns: "apply" })
        const ignored = toSchemaFromJsonSchemaDocument(document, { patterns: "ignore" })
        for (const input of ["a", "b"]) {
          assert.isTrue(Schema.is(applied)(input))
          assert.isFalse(Schema.is(ignored)(input))
        }
      })

      it("rejects patterns by default", () => {
        for (
          const [schema, path] of [
            [{ type: "string", pattern: "^a+$" }, `["schema"]["pattern"]`],
            [
              { type: "object", patternProperties: { "^a+$": { type: "string" } } },
              `["schema"]["patternProperties"]["^a+$"]`
            ],
            [
              { type: "object", propertyNames: { pattern: "^a+$" } },
              `["schema"]["propertyNames"]["pattern"]`
            ]
          ] as const
        ) {
          throws(
            () => SchemaRepresentation.fromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12(schema)),
            `Patterns may block validation and are disabled. Use patterns: "apply" for trusted schemas or "ignore" to discard them.\n  at ${path}`
          )
        }
      })

      it("applies patterns explicitly", () => {
        assertFromJsonSchema({ schema: { type: "string", pattern: "^a+$" }, options: { patterns: "apply" } }, {
          codes: makeCode(
            `Schema.String.check(Schema.isPattern(new RegExp("^a+$", "u")).annotate({ "expected": "a string matching the RegExp ^a+$" }))`,
            `string`
          )
        })
      })

      it("applies patterns whose source is canonicalized by RegExp", () => {
        for (
          const [pattern, source, matching, nonMatching] of [
            ["a/b", "a\\/b", "a/b", "ab"],
            ["", "(?:)", "anything", undefined],
            ["\n", "\\n", "a\nb", "ab"],
            ["\r", "\\r", "a\rb", "ab"],
            ["\u2028", "\\u2028", "a\u2028b", "ab"],
            ["\u2029", "\\u2029", "a\u2029b", "ab"]
          ] as const
        ) {
          const schema = toSchemaFromJsonSchemaDocument(
            JsonSchema.fromSchemaDraft2020_12({ type: "string", pattern })
          )
          const representation = SchemaRepresentation.toRepresentation(schema.ast).representation
          assert.strictEqual(representation._tag, "String")
          if (representation._tag === "String") {
            assert.deepStrictEqual(representation.checks[0]?.representation?.payload, { source, flags: "u" })
          }
          assert.isTrue(Schema.is(schema)(matching))
          if (nonMatching !== undefined) {
            assert.isFalse(Schema.is(schema)(nonMatching))
          }
          assert.isFalse(Schema.is(schema)(123))
        }
      })

      it("ignores patterns explicitly", () => {
        assertFromJsonSchema({ schema: { type: "string", pattern: "^a+$" }, options: { patterns: "ignore" } }, {
          codes: makeCode(`Schema.String`, `string`)
        })
        assertFromJsonSchema({ schema: { type: "string", pattern: "[" }, options: { patterns: "ignore" } }, {
          codes: makeCode(`Schema.String`, `string`)
        })
      })

      it("ignores pattern property value constraints explicitly", () => {
        assertFromJsonSchema({
          schema: {
            type: "object",
            patternProperties: {
              "^a+$": { type: "string" },
              "^b+$": { type: "number" }
            },
            additionalProperties: false
          },
          options: { patterns: "ignore" }
        }, {
          codes: makeCode(
            `Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))`,
            `{ readonly [x: string]: Schema.Json }`
          )
        })
        assertFromJsonSchema({
          schema: {
            type: "object",
            patternProperties: { "^a+$": { type: "string" } },
            additionalProperties: { type: "boolean" }
          },
          options: { patterns: "ignore" }
        }, {
          codes: makeCode(
            `Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))`,
            `{ readonly [x: string]: Schema.Json }`
          )
        })
      })
    })

    describe("onEnter", () => {
      it("additionalProperties false via onEnter", () => {
        assertFromJsonSchema(
          {
            schema: {
              type: "object",
              properties: {
                a: { type: "string" }
              },
              required: ["a"]
            },
            options: {
              onEnter: (js) => {
                if (js.type === "object" && js.additionalProperties === undefined) {
                  return { ...js, additionalProperties: false }
                }
                return js
              }
            }
          },
          { codes: makeCode(`Schema.Struct({ "a": Schema.String })`, `{ readonly "a": string }`) }
        )
      })

      it("strips annotation keys via onEnter", () => {
        assertFromJsonSchema(
          {
            schema: {
              title: "a",
              description: "b",
              examples: ["d"]
            },
            options: {
              onEnter: (js) => {
                const out = { ...js }
                delete out.examples
                return out
              }
            }
          },
          {
            codes: makeCode(
              `Schema.Json.annotate({ "expected": "JSON value", "title": "a", "description": "b" })`,
              `Schema.Json`
            )
          }
        )
      })

      it("filters annotations by predicate via onEnter", () => {
        assertFromJsonSchema(
          {
            schema: {
              title: "a",
              description: "b",
              examples: ["d"],
              default: "c"
            },
            options: {
              onEnter: (js) => {
                const out: any = {}
                for (const [k, v] of Object.entries(js)) {
                  if (k === "title" || k === "default" || k === "type") out[k] = v
                }
                return out
              }
            }
          },
          {
            codes: makeCode(
              `Schema.Json.annotate({ "expected": "JSON value", "title": "a", "default": "c" })`,
              `Schema.Json`
            )
          }
        )
      })

      it("default preserves all annotations", () => {
        assertFromJsonSchema(
          {
            schema: {
              title: "a",
              description: "b",
              default: "c",
              examples: ["d"]
            }
          },
          {
            codes: makeCode(
              `Schema.Json.annotate({ "expected": "JSON value", "title": "a", "description": "b", "default": "c", "examples": ["d"] })`,
              `Schema.Json`
            )
          }
        )
      })
    })
  })
})
