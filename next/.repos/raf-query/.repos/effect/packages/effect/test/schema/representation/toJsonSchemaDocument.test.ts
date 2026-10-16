import { assert, describe, it } from "@effect/vitest"
import { JsonSchema, Schema, SchemaAST, SchemaRepresentation } from "effect"
import { throws } from "../../utils/assert.ts"

function expectError(thunk: () => void, expected: string | Error): void {
  if (typeof expected === "string") {
    throws(thunk, expected)
  } else {
    throws(thunk, (error: unknown) => {
      assert.strictEqual(error, expected)
      return undefined
    })
  }
}

const StringRepresentation: SchemaRepresentation.Representation = {
  _tag: "String",
  checks: []
}

const NumberRepresentation: SchemaRepresentation.Representation = {
  _tag: "Number",
  checks: []
}

const EmptyUnionRepresentation: SchemaRepresentation.Representation = {
  _tag: "Union",
  types: [],
  options: { mode: "anyOf" },
  checks: []
}

describe("SchemaRepresentation.toJsonSchemaDocument", () => {
  // Representation documents are public, persistable inputs. These tests construct them
  // directly so the compiler is covered independently from Schema-to-Representation lowering.
  function compile(representation: SchemaRepresentation.Representation) {
    return SchemaRepresentation.toJsonSchemaDocument(
      { representation, references: {} },
      { onExcessProperty: "error" }
    ).schema
  }

  describe("local reference round trips", () => {
    for (
      const [key, token] of [
        ["Rate", "Rate"],
        ["id~a/b", "id~0a~1b"],
        ["Rate%", "Rate%25"],
        ["id~a/b%25", "id~0a~1b%2525"]
      ]
    ) {
      it(`preserves the definition named ${key}`, () => {
        const input = JsonSchema.fromSchemaDraft2020_12({
          $ref: `#/$defs/${token}`,
          $defs: { [key]: { type: "string" } }
        })
        const imported = SchemaRepresentation.fromJsonSchemaDocument(input)
        assert.strictEqual(Schema.is(imported)("value"), true)
        assert.strictEqual(Schema.is(imported)(1), false)

        const output = SchemaRepresentation.toJsonSchemaDocument(
          SchemaRepresentation.toRepresentation(imported.ast)
        )
        assert.deepStrictEqual(Object.keys(output.definitions), [key])
        const restored = SchemaRepresentation.fromJsonSchemaDocument(output)
        assert.strictEqual(Schema.is(restored)("value"), true)
        assert.strictEqual(Schema.is(restored)(1), false)
        assert.strictEqual(output.schema.$ref, input.schema.$ref)
      })
    }
  })

  describe("representation nodes", () => {
    const keywords = [
      ["Any", { _tag: "Any", checks: [] }, {}],
      ["Unknown", { _tag: "Unknown", checks: [] }, {}],
      ["ObjectKeyword", { _tag: "ObjectKeyword", checks: [] }, {
        anyOf: [{ type: "object" }, { type: "array" }]
      }],
      ["Void", { _tag: "Void", checks: [] }, { type: "null" }],
      ["Undefined", { _tag: "Undefined", checks: [] }, { type: "null" }],
      ["BigInt", { _tag: "BigInt", checks: [] }, {
        type: "string",
        allOf: [{ pattern: "^-?\\d+$" }]
      }],
      ["Symbol", { _tag: "Symbol", checks: [] }, {
        type: "string",
        allOf: [{ pattern: "^Symbol\\(([\\s\\S]*)\\)$" }]
      }],
      ["UniqueSymbol", { _tag: "UniqueSymbol", symbol: Symbol.for("value"), checks: [] }, {
        type: "string",
        enum: ["Symbol(value)"]
      }],
      ["Null", { _tag: "Null", checks: [] }, { type: "null" }],
      ["Never", { _tag: "Never", checks: [] }, { not: {} }]
    ] satisfies ReadonlyArray<
      readonly [string, SchemaRepresentation.Representation, JsonSchema.JsonSchema]
    >

    for (const [tag, representation, expected] of keywords) {
      it(tag, () => {
        assert.deepStrictEqual(compile(representation), expected)
      })
    }

    it("local UniqueSymbol", () => {
      assert.deepStrictEqual(
        compile({ _tag: "UniqueSymbol", symbol: Symbol("value"), checks: [] }),
        { not: {} }
      )
    })

    it("compiles Suspend", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Suspend",
          thunk: StringRepresentation,
          checks: []
        }),
        { type: "string" }
      )
    })

    it("compiles a bigint Literal", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Literal",
          literal: 1n,
          checks: []
        }),
        {
          type: "string",
          enum: ["1"]
        }
      )
    })

    it("compiles a string Literal", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Literal",
          literal: "a",
          checks: []
        }),
        {
          type: "string",
          enum: ["a"]
        }
      )
    })

    it("compiles an empty Enum", () => {
      assert.deepStrictEqual(compile({ _tag: "Enum", enums: [], checks: [] }), { not: {} })
    })

    it("compiles an Enum", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Enum",
          enums: [
            ["A", "a"],
            ["One", 1]
          ],
          checks: []
        }),
        {
          anyOf: [
            { type: "string", enum: ["a"], title: "A" },
            { type: "number", enum: [1], title: "One" }
          ]
        }
      )
    })

    it("rejects non-finite numeric Enum values", () => {
      expectError(
        () =>
          compile({
            _tag: "Enum",
            enums: [
              ["StringNaN", "NaN"],
              ["NumberNaN", Number.NaN]
            ],
            checks: []
          }),
        `Invalid numeric enum value NaN\n  at ["representation"]["enums"][1][1]`
      )
    })

    it("compiles a TemplateLiteral", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "TemplateLiteral",
          parts: [
            { _tag: "Literal", literal: "prefix-", checks: [] },
            StringRepresentation
          ],
          checks: []
        }),
        { type: "string", pattern: "^prefix-[\\s\\S]*?$" }
      )
    })
  })

  describe("arrays and objects", () => {
    it("compiles an empty Objects node as any non-null JSON value", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Objects",
          propertySignatures: [],
          indexSignatures: [],
          checks: []
        }),
        { not: { type: "null" } }
      )
    })

    it("compiles optional tuple elements", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Arrays",
          elements: [
            { type: StringRepresentation, isOptional: false },
            { type: NumberRepresentation, isOptional: true }
          ],
          rest: [],
          checks: []
        }),
        {
          type: "array",
          prefixItems: [{ type: "string" }, {
            anyOf: [
              { type: "number" },
              { type: "string", enum: ["NaN", "Infinity", "-Infinity"] }
            ]
          }],
          maxItems: 2,
          minItems: 1
        }
      )
    })

    it("rejects multiple tuple rest elements", () => {
      expectError(
        () =>
          compile({
            _tag: "Arrays",
            elements: [],
            rest: [StringRepresentation, NumberRepresentation],
            checks: []
          }),
        `Invalid schema representation document\n  at ["representation"]["rest"]`
      )
    })

    it("rejects a symbol object property", () => {
      expectError(
        () =>
          compile({
            _tag: "Objects",
            propertySignatures: [{
              name: Symbol.for("value"),
              type: StringRepresentation,
              isOptional: false,
              isMutable: false
            }],
            indexSignatures: [],
            checks: []
          }),
        `Invalid schema representation document\n  at ["representation"]["propertySignatures"][0]["name"]`
      )
    })

    it("compiles a Never index-signature value as false", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Objects",
          propertySignatures: [],
          indexSignatures: [{ parameter: StringRepresentation, type: { _tag: "Never", checks: [] } }],
          checks: []
        }),
        { type: "object", additionalProperties: false }
      )
    })

    it("removes an unconstrained index-signature value", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Objects",
          propertySignatures: [],
          indexSignatures: [{ parameter: StringRepresentation, type: { _tag: "Unknown", checks: [] } }],
          checks: []
        }),
        { type: "object" }
      )
    })
  })

  describe("unions", () => {
    it("compacts a union of same-type literals", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Union",
          types: [
            { _tag: "Literal", literal: "a", checks: [] },
            { _tag: "Literal", literal: "b", checks: [] }
          ],
          options: { mode: "anyOf" },
          checks: []
        }),
        { type: "string", enum: ["a", "b"] }
      )
    })

    it("does not compact a union of mixed-type literals", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Union",
          types: [
            { _tag: "Literal", literal: "a", checks: [] },
            { _tag: "Literal", literal: 1, checks: [] }
          ],
          options: { mode: "anyOf" },
          checks: []
        }),
        {
          anyOf: [{ type: "string", enum: ["a"] }, { type: "number", enum: [1] }]
        }
      )
    })
  })

  describe("annotations and checks", () => {
    it("emits every supported standard annotation", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "String",
          annotations: {
            title: "Title",
            description: "Description",
            default: "default",
            examples: ["a", "b"],
            readOnly: true,
            writeOnly: false
          },
          checks: []
        }),
        {
          type: "string",
          title: "Title",
          description: "Description",
          default: "default",
          examples: ["a", "b"],
          readOnly: true,
          writeOnly: false
        }
      )
    })

    it("uses a check fragment when the base JSON Schema is empty", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Unknown",
          checks: [{
            _tag: "Filter",
            aborted: false,
            annotations: { toJsonSchema: () => ({ description: "checked" }) }
          }]
        }),
        { description: "checked" }
      )
    })

    it("appends a check to an existing allOf", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "BigInt",
          checks: [{
            _tag: "Filter",
            aborted: false,
            annotations: { toJsonSchema: () => ({ description: "checked" }) }
          }]
        }),
        {
          type: "string",
          allOf: [{ pattern: "^-?\\d+$" }, { description: "checked" }]
        }
      )
    })

    it("lets a check refine number to integer", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Number",
          checks: [{
            _tag: "Filter",
            aborted: false,
            annotations: { toJsonSchema: () => ({ type: "integer" }) }
          }]
        }),
        { type: "integer" }
      )
    })

    it("compiles a callback-free FilterGroup without ordinary annotations", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "String",
          checks: [{
            _tag: "FilterGroup",
            checks: [{
              _tag: "Filter",
              aborted: false,
              annotations: { toJsonSchema: () => ({ minLength: 1 }) }
            }]
          }]
        }),
        { type: "string", allOf: [{ minLength: 1 }] }
      )
    })
  })

  describe("collection and union edge cases", () => {
    it("compiles tuple element annotations", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Arrays",
          elements: [{
            type: StringRepresentation,
            isOptional: false,
            annotations: { description: "element" }
          }],
          rest: [],
          checks: []
        }),
        {
          type: "array",
          prefixItems: [{ type: "string", allOf: [{ description: "element" }] }],
          maxItems: 1,
          minItems: 1
        }
      )
    })

    it("omits minItems when every tuple element is optional", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Arrays",
          elements: [{ type: StringRepresentation, isOptional: true }],
          rest: [],
          checks: []
        }),
        {
          type: "array",
          prefixItems: [{ type: "string" }],
          maxItems: 1
        }
      )
    })

    it("compiles a constrained tuple rest", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Arrays",
          elements: [],
          rest: [StringRepresentation],
          checks: []
        }),
        { type: "array", items: { type: "string" } }
      )
    })

    it("compiles property annotations", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Objects",
          propertySignatures: [{
            name: "value",
            type: StringRepresentation,
            isOptional: true,
            isMutable: false,
            annotations: { description: "property" }
          }],
          indexSignatures: [],
          checks: []
        }),
        {
          type: "object",
          properties: { value: { type: "string", allOf: [{ description: "property" }] } },
          additionalProperties: false
        }
      )
    })

    it("compiles a single-member Union without compacting it", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Union",
          types: [StringRepresentation],
          options: { mode: "anyOf" },
          checks: []
        }),
        { anyOf: [{ type: "string" }] }
      )
    })

    it("falls back from oneOf to anyOf when a branch is approximate", () => {
      const approximate: SchemaRepresentation.Representation = {
        _tag: "String",
        checks: [{
          _tag: "Filter",
          aborted: false,
          annotations: { toJsonSchema: () => [{ minLength: 1 }, true] }
        }]
      }
      assert.deepStrictEqual(
        compile({
          _tag: "Union",
          types: [approximate, { _tag: "Boolean", checks: [] }],
          options: { mode: "oneOf" },
          annotations: { description: "annotated union" },
          checks: []
        }),
        {
          anyOf: [{ type: "string", minLength: 1 }, { type: "boolean" }],
          description: "annotated union"
        }
      )
    })

    it("propagates approximation through nested representations", () => {
      const approximate: SchemaRepresentation.Representation = {
        _tag: "String",
        checks: [{ _tag: "Filter", aborted: false }]
      }
      assert.deepStrictEqual(
        compile({
          _tag: "Union",
          types: [{ _tag: "Arrays", elements: [], rest: [approximate], checks: [] }, NumberRepresentation],
          options: { mode: "oneOf" },
          checks: []
        }),
        {
          anyOf: [
            { type: "array", items: { type: "string" } },
            {
              anyOf: [
                { type: "number" },
                { type: "string", enum: ["NaN", "Infinity", "-Infinity"] }
              ]
            }
          ]
        }
      )
    })

    it("resolves an approximate oneOf copied by contextual annotations", () => {
      const approximate: SchemaRepresentation.Representation = {
        _tag: "String",
        checks: [{
          _tag: "Filter",
          aborted: false,
          annotations: { toJsonSchema: () => [{ minLength: 1 }, true] }
        }]
      }
      assert.deepStrictEqual(
        compile({
          _tag: "Arrays",
          elements: [{
            type: {
              _tag: "Union",
              types: [approximate, { _tag: "Boolean", checks: [] }],
              options: { mode: "oneOf" },
              checks: []
            },
            isOptional: false,
            annotations: { description: "element" }
          }],
          rest: [],
          checks: []
        }),
        {
          type: "array",
          prefixItems: [{
            anyOf: [{ type: "string", minLength: 1 }, { type: "boolean" }],
            allOf: [{ description: "element" }]
          }],
          minItems: 1,
          maxItems: 1
        }
      )
    })

    it("keeps oneOf when every branch is exact", () => {
      assert.deepStrictEqual(
        compile({
          _tag: "Union",
          types: [StringRepresentation, { _tag: "Boolean", checks: [] }],
          options: { mode: "oneOf" },
          checks: []
        }),
        { oneOf: [{ type: "string" }, { type: "boolean" }] }
      )
    })

    it("rejects an unsupported index-signature parameter", () => {
      expectError(
        () =>
          compile({
            _tag: "Objects",
            propertySignatures: [],
            indexSignatures: [{ parameter: NumberRepresentation, type: StringRepresentation }],
            checks: []
          }),
        `Invalid schema representation document\n  at ["representation"]["indexSignatures"][0]["parameter"]`
      )
    })

    it("compiles an empty union as Never", () => {
      assert.deepStrictEqual(
        SchemaRepresentation.toJsonSchemaDocument({
          representation: EmptyUnionRepresentation,
          references: {}
        }).schema,
        { not: {} }
      )
    })

    it("removes items when an empty tuple has an open rest", () => {
      assert.deepStrictEqual(
        SchemaRepresentation.toJsonSchemaDocument({
          representation: {
            _tag: "Arrays",
            elements: [],
            rest: [{ _tag: "Unknown", checks: [] }],
            checks: []
          },
          references: {}
        }).schema,
        { type: "array" }
      )
    })
  })

  describe("checks and callbacks", () => {
    it("passes the type produced by isInt to following check callbacks", () => {
      let receivedType: unknown
      const dependent = Schema.makeFilter<number>(() => true, {
        toJsonSchema: ({ type }) => {
          receivedType = type
          return { minimum: 0 }
        }
      })
      const document = SchemaRepresentation.toRepresentation(
        Schema.Number.check(Schema.isInt(), dependent).ast
      )

      assert.deepStrictEqual(SchemaRepresentation.toJsonSchemaDocument(document).schema, {
        type: "integer",
        minimum: 0
      })
      assert.strictEqual(receivedType, "integer")
    })

    it("omits isPattern flags that JSON Schema cannot represent", () => {
      const pattern = SchemaRepresentation.toJsonSchemaDocument(
        SchemaRepresentation.toRepresentation(Schema.String.check(Schema.isPattern(/^[a-z]+$/i)).ast)
      )
      assert.deepStrictEqual(pattern, {
        dialect: "draft-2020-12",
        schema: { type: "string" },
        definitions: {}
      })
    })

    it("treats an empty override as authoritative and ignores a leaf without a callback", () => {
      let visits = 0
      const document: SchemaRepresentation.Document = {
        representation: {
          _tag: "String",
          checks: [{
            _tag: "FilterGroup",
            annotations: { toJsonSchema: () => ({}) },
            checks: [{
              _tag: "Filter",
              aborted: false,
              annotations: {
                description: "ignored",
                toJsonSchema: () => {
                  visits++
                  return { minLength: 1 }
                }
              }
            }]
          }, {
            _tag: "Filter",
            aborted: false,
            annotations: { description: "no callback" }
          }]
        },
        references: {}
      }

      assert.deepStrictEqual(SchemaRepresentation.toJsonSchemaDocument(document).schema, { type: "string" })
      assert.strictEqual(visits, 0)
    })

    it("compiles representation.schemas before invoking a callback", () => {
      const document: SchemaRepresentation.Document = {
        representation: {
          _tag: "Objects",
          propertySignatures: [],
          indexSignatures: [],
          checks: [{
            _tag: "Filter",
            aborted: false,
            representation: {
              id: "acme/schema/propertyNames",
              payload: null,
              schemas: [StringRepresentation]
            },
            annotations: {
              toJsonSchema: ({ schemas }: SchemaRepresentation.ToJsonSchema.CheckInput) => ({
                propertyNames: schemas[0]
              })
            }
          }]
        },
        references: {}
      }

      assert.deepStrictEqual(SchemaRepresentation.toJsonSchemaDocument(document).schema, {
        not: { type: "null" },
        propertyNames: { type: "string" }
      })
    })

    it("propagates approximation from representation.schemas", () => {
      const approximate: SchemaRepresentation.Representation = {
        _tag: "String",
        checks: [{
          _tag: "Filter",
          aborted: false,
          annotations: { toJsonSchema: () => [{ minLength: 1 }, true] }
        }]
      }
      const dependent: SchemaRepresentation.Representation = {
        _tag: "String",
        checks: [{
          _tag: "Filter",
          aborted: false,
          representation: {
            id: "acme/schema/dependent",
            payload: null,
            schemas: [approximate]
          },
          annotations: { toJsonSchema: () => ({}) }
        }]
      }

      assert.deepStrictEqual(
        compile({
          _tag: "Union",
          types: [dependent, { _tag: "Boolean", checks: [] }],
          options: { mode: "oneOf" },
          checks: []
        }),
        { anyOf: [{ type: "string" }, { type: "boolean" }] }
      )
    })
  })

  describe("declarations and pattern extraction", () => {
    it("approximates declarations", () => {
      const document: SchemaRepresentation.Document = {
        representation: {
          _tag: "Declaration",
          typeParameters: [StringRepresentation],
          checks: [],
          representation: {
            id: "acme/schema/Box",
            payload: null
          }
        },
        references: {}
      }

      assert.deepStrictEqual(SchemaRepresentation.toJsonSchemaDocument(document).schema, {})
    })

    it("compiles every member of a union index-signature parameter", () => {
      const template = SchemaRepresentation.toRepresentation(
        Schema.TemplateLiteral(["a", Schema.String]).ast
      ).representation
      const pattern = SchemaRepresentation.toRepresentation(
        Schema.String.check(Schema.isPattern(/^b/u)).ast
      ).representation
      const document: SchemaRepresentation.Document = {
        representation: {
          _tag: "Objects",
          propertySignatures: [],
          indexSignatures: [{
            parameter: {
              _tag: "Union",
              types: [template, pattern],
              options: { mode: "anyOf" },
              checks: []
            },
            type: StringRepresentation
          }],
          checks: []
        },
        references: {}
      }

      const schema = SchemaRepresentation.toJsonSchemaDocument(document).schema
      assert.deepStrictEqual(Object.keys(schema.patternProperties ?? {}), ["^a[\\s\\S]*?$", "^b"])
    })

    it("does not extract a partial pattern from boolean applicator members", () => {
      const document: SchemaRepresentation.Document = {
        representation: {
          _tag: "Objects",
          propertySignatures: [],
          indexSignatures: [{
            parameter: {
              _tag: "String",
              checks: [{
                _tag: "Filter",
                aborted: false,
                annotations: {
                  toJsonSchema: () => ({ allOf: [false, { pattern: "^a" }] })
                }
              }]
            },
            type: StringRepresentation
          }],
          checks: []
        },
        references: {}
      }

      assert.deepStrictEqual(SchemaRepresentation.toJsonSchemaDocument(document).schema, {
        type: "object",
        additionalProperties: true
      })
    })

    it("does not use an approximate pattern as an index selector", () => {
      const document: SchemaRepresentation.Document = {
        representation: {
          _tag: "Objects",
          propertySignatures: [],
          indexSignatures: [{
            parameter: {
              _tag: "String",
              checks: [{
                _tag: "Filter",
                aborted: false,
                annotations: { toJsonSchema: () => [{ pattern: "^a" }, true] }
              }]
            },
            type: NumberRepresentation
          }],
          checks: []
        },
        references: {}
      }

      assert.deepStrictEqual(compile(document.representation), {
        type: "object",
        propertyNames: { type: "string", pattern: "^a" },
        additionalProperties: {
          anyOf: [
            { type: "number" },
            { type: "string", enum: ["NaN", "Infinity", "-Infinity"] }
          ]
        }
      })
      assert.deepStrictEqual(
        compile({
          _tag: "Union",
          types: [document.representation, { _tag: "Boolean", checks: [] }],
          options: { mode: "oneOf" },
          checks: []
        }),
        {
          anyOf: [{
            type: "object",
            propertyNames: { type: "string", pattern: "^a" },
            additionalProperties: {
              anyOf: [
                { type: "number" },
                { type: "string", enum: ["NaN", "Infinity", "-Infinity"] }
              ]
            }
          }, { type: "boolean" }]
        }
      )
    })

    it("keeps an exact key selector when its value is approximate", () => {
      const key: SchemaRepresentation.Representation = {
        _tag: "String",
        checks: [{
          _tag: "Filter",
          aborted: false,
          annotations: { toJsonSchema: () => ({ pattern: "^a" }) }
        }]
      }
      const value: SchemaRepresentation.Representation = {
        _tag: "String",
        checks: [{
          _tag: "Filter",
          aborted: false,
          annotations: { toJsonSchema: () => [{ minLength: 1 }, true] }
        }]
      }
      assert.deepStrictEqual(
        compile({
          _tag: "Union",
          types: [{
            _tag: "Objects",
            propertySignatures: [],
            indexSignatures: [{ parameter: key, type: value }],
            checks: []
          }, { _tag: "Boolean", checks: [] }],
          options: { mode: "oneOf" },
          checks: []
        }),
        {
          anyOf: [{
            type: "object",
            patternProperties: { "^a": { type: "string", minLength: 1 } },
            additionalProperties: false
          }, { type: "boolean" }]
        }
      )
    })

    it("compiles all supported template-literal parts and rejects other nodes", () => {
      const representation: SchemaRepresentation.Representation = {
        _tag: "TemplateLiteral",
        parts: [
          { _tag: "Literal", literal: "p", checks: [] },
          NumberRepresentation,
          {
            _tag: "TemplateLiteral",
            parts: [
              { _tag: "Literal", literal: "x", checks: [] },
              StringRepresentation
            ],
            checks: []
          },
          {
            _tag: "Union",
            types: [
              { _tag: "Literal", literal: "a", checks: [] },
              { _tag: "Literal", literal: "b", checks: [] }
            ],
            options: { mode: "anyOf" },
            checks: []
          }
        ],
        checks: []
      }

      assert.deepStrictEqual(
        SchemaRepresentation.toJsonSchemaDocument({ representation, references: {} }).schema,
        {
          type: "string",
          pattern: `^p${SchemaAST.FINITE_PATTERN}x${SchemaAST.STRING_PATTERN}(?:a|b)$`
        }
      )

      expectError(
        () =>
          SchemaRepresentation.toJsonSchemaDocument({
            representation: {
              _tag: "TemplateLiteral",
              parts: [{ _tag: "Boolean", checks: [] }],
              checks: []
            },
            references: {}
          }),
        "Invalid schema representation document"
      )
    })
  })

  describe("normalization", () => {
    describe("conservative check compaction", () => {
      function check(
        fragment: JsonSchema.JsonSchema,
        annotations?: SchemaRepresentation.Filter["annotations"]
      ): SchemaRepresentation.Filter {
        return {
          _tag: "Filter",
          aborted: false,
          annotations: { ...annotations, toJsonSchema: () => fragment }
        }
      }

      function compileChecks(...fragments: ReadonlyArray<JsonSchema.JsonSchema>) {
        return compile({
          _tag: "Any",
          checks: fragments.map((fragment) => check(fragment))
        })
      }

      it("keeps colliding keywords in separate schema objects", () => {
        assert.deepStrictEqual(
          compile({
            _tag: "String",
            checks: [check({ minLength: 1 }), check({ minLength: 2 })]
          }),
          {
            type: "string",
            minLength: 1,
            allOf: [{ minLength: 2 }]
          }
        )
      })

      it("inlines pure annotations on a check", () => {
        assert.deepStrictEqual(
          compile({
            _tag: "String",
            checks: [check({ minLength: 1 }, {
              title: "title",
              description: "description",
              default: "default",
              examples: ["example"],
              readOnly: true,
              writeOnly: false
            })]
          }),
          {
            type: "string",
            minLength: 1,
            title: "title",
            description: "description",
            default: "default",
            examples: ["example"],
            readOnly: true,
            writeOnly: false
          }
        )
      })

      it("inlines callback metadata with pure check annotations", () => {
        assert.deepStrictEqual(
          compile({
            _tag: "String",
            checks: [check({ minLength: 1, title: "callback" }, { description: "annotation" })]
          }),
          {
            type: "string",
            minLength: 1,
            title: "callback",
            description: "annotation"
          }
        )
      })

      it("keeps colliding annotations in a separate schema object", () => {
        assert.deepStrictEqual(
          compile({
            _tag: "String",
            annotations: { description: "string" },
            checks: [check({ minLength: 1 }, { description: "check" })]
          }),
          {
            type: "string",
            description: "string",
            allOf: [{ minLength: 1, description: "check" }]
          }
        )
      })

      it("keeps format annotations in a separate schema object", () => {
        assert.deepStrictEqual(
          compile({
            _tag: "String",
            checks: [check({ minLength: 1 }, { format: "annotated-check" })]
          }),
          {
            type: "string",
            allOf: [{ minLength: 1, format: "annotated-check" }]
          }
        )
      })

      it("inlines propertyNames without a collision", () => {
        assert.deepStrictEqual(
          compile({
            _tag: "Objects",
            propertySignatures: [],
            indexSignatures: [],
            checks: [check({ propertyNames: { minLength: 1 } })]
          }),
          {
            not: { type: "null" },
            propertyNames: { minLength: 1 }
          }
        )
      })

      it("keeps colliding propertyNames in separate schema objects", () => {
        assert.deepStrictEqual(
          compile({
            _tag: "Objects",
            propertySignatures: [],
            indexSignatures: [],
            checks: [
              check({ propertyNames: { minLength: 1 } }),
              check({ propertyNames: { maxLength: 2 } })
            ]
          }),
          {
            not: { type: "null" },
            propertyNames: { minLength: 1 },
            allOf: [{ propertyNames: { maxLength: 2 } }]
          }
        )
      })

      it("keeps a reference separate from contextual annotations", () => {
        const document = SchemaRepresentation.toJsonSchemaDocument({
          representation: {
            _tag: "Objects",
            propertySignatures: [{
              name: "value",
              type: { _tag: "Reference", $ref: "Value" },
              isOptional: false,
              isMutable: false,
              annotations: { description: "contextual" }
            }],
            indexSignatures: [],
            checks: []
          },
          references: { Value: StringRepresentation }
        })

        assert.deepStrictEqual(document.schema, {
          type: "object",
          properties: {
            value: {
              allOf: [
                { $ref: "#/$defs/Value" },
                { description: "contextual" }
              ]
            }
          },
          required: ["value"],
          additionalProperties: true
        })
      })

      const coupledKeywords = [
        [
          "contains and minContains",
          { contains: { const: "a" } },
          { minContains: 2 }
        ],
        [
          "properties and additionalProperties",
          { properties: { a: true } },
          { additionalProperties: false }
        ],
        [
          "prefixItems and items",
          { prefixItems: [true] },
          { items: false }
        ],
        [
          "if and else",
          { if: { required: ["a"] } },
          { else: { required: ["b"] } }
        ]
      ] satisfies ReadonlyArray<readonly [string, JsonSchema.JsonSchema, JsonSchema.JsonSchema]>

      for (const [name, first, second] of coupledKeywords) {
        it(`keeps ${name} in separate schema objects`, () => {
          for (const [left, right] of [[first, second], [second, first]]) {
            assert.deepStrictEqual(compileChecks(left, right), {
              ...left,
              allOf: [right]
            })
          }
        })
      }

      it("keeps a fragment containing a custom keyword intact", () => {
        assert.deepStrictEqual(
          compile({
            _tag: "String",
            checks: [check({ minLength: 1, "x-check": true })]
          }),
          {
            type: "string",
            allOf: [{ minLength: 1, "x-check": true }]
          }
        )
      })

      it("keeps format scoped after absorbing a number type", () => {
        assert.deepStrictEqual(
          compile({
            _tag: "Number",
            checks: [check({ type: "number" }, { format: "finite" })]
          }),
          {
            type: "number",
            allOf: [{ format: "finite" }]
          }
        )
      })

      it("inlines callback metadata after absorbing a number type", () => {
        assert.deepStrictEqual(
          compile({
            _tag: "Number",
            checks: [check({ type: "integer", description: "integer" })]
          }),
          {
            type: "integer",
            description: "integer"
          }
        )
      })

      it("does not overwrite an annotation after absorbing a number type", () => {
        assert.deepStrictEqual(
          compile({
            _tag: "Number",
            annotations: { description: "number" },
            checks: [check({ type: "integer" }, { description: "integer" })]
          }),
          {
            type: "integer",
            description: "number",
            allOf: [{ description: "integer" }]
          }
        )
      })
    })

    it("extracts nested number types without losing other allOf members", () => {
      const output = SchemaRepresentation.toJsonSchemaDocument({
        representation: {
          _tag: "Number",
          checks: [{
            _tag: "Filter",
            aborted: false,
            annotations: {
              toJsonSchema: () => ({
                allOf: [
                  {
                    description: "nested",
                    allOf: [{ type: "number" }, { minimum: 1 }]
                  },
                  { type: "integer", maximum: 10 },
                  { title: "kept" }
                ]
              })
            }
          }]
        },
        references: {}
      })

      assert.deepStrictEqual(output.schema, {
        type: "integer",
        allOf: [
          { description: "nested", allOf: [{ minimum: 1 }] },
          { maximum: 10 },
          { title: "kept" }
        ]
      })

      assert.deepStrictEqual(
        SchemaRepresentation.toJsonSchemaDocument({
          representation: {
            _tag: "Number",
            checks: [{
              _tag: "Filter",
              aborted: false,
              annotations: {
                toJsonSchema: () => ({ allOf: [{ type: "number" }, { type: "number" }] })
              }
            }]
          },
          references: {}
        }).schema,
        { type: "number" }
      )
    })
  })

  describe("safety and errors", () => {
    it("never exposes compiler capabilities as extension annotations", () => {
      const document: SchemaRepresentation.Document = {
        representation: {
          _tag: "String",
          annotations: {
            description: "text",
            identifier: "id",
            representation: { id: "acme/schema/String", payload: null },
            toCode: () => ({ runtime: "ignored" }),
            toJsonSchema: () => ({ title: "ignored" }),
            "x-custom": { enabled: true },
            "x-invalid": () => "ignored"
          },
          checks: []
        },
        references: {}
      }

      assert.deepStrictEqual(
        SchemaRepresentation.toJsonSchemaDocument(document, {
          includeAnnotationKey: () => true
        }).schema,
        {
          type: "string",
          description: "text",
          identifier: "id",
          "x-custom": { enabled: true }
        }
      )
    })

    it("captures exceptions from JSON Schema callbacks", () => {
      const cause = new Error("json schema callback")
      const document: SchemaRepresentation.Document = {
        representation: {
          _tag: "String",
          checks: [{
            _tag: "Filter",
            aborted: false,
            annotations: {
              toJsonSchema: () => {
                throw cause
              }
            }
          }]
        },
        references: {}
      }
      expectError(
        () => SchemaRepresentation.toJsonSchemaDocument(document),
        cause
      )
    })

    it("supports __proto__ as a reference", () => {
      const document = SchemaRepresentation.toJsonSchemaDocument(
        SchemaRepresentation.toRepresentation(
          Schema.String.annotate({ identifier: "__proto__" }).ast
        )
      )

      assert.deepStrictEqual(document.schema, {
        $ref: "#/$defs/__proto__"
      })
      assert.deepStrictEqual(Object.keys(document.definitions), ["__proto__"])
      assert.deepStrictEqual(document.definitions["__proto__"], {
        type: "string"
      })
    })

    it("reports missing references with their document path", () => {
      const document: SchemaRepresentation.Document = {
        representation: { _tag: "Reference", $ref: "Missing" },
        references: {}
      }
      expectError(
        () => SchemaRepresentation.toJsonSchemaDocument(document),
        `Invalid reference Missing\n  at ["representation"]["$ref"]`
      )
    })
  })
})
