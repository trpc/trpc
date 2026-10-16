import { assert, describe, it } from "@effect/vitest"
import { JsonSchema, Schema, SchemaRepresentation, SchemaTransformation } from "effect"
import { throws } from "../../utils/assert.ts"

// oxlint-disable-next-line @typescript-eslint/no-require-imports
const AjvDraft07 = require("ajv")

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

const stringIdentityTransformation = SchemaTransformation.transform({
  decode: (value: string) => value,
  encode: (value: string) => value
})

describe("SchemaRepresentation.toJsonSchemaMultiDocument", () => {
  describe("definition canonicalization", () => {
    it("deduplicates equivalent fallback definitions", () => {
      const Content = Schema.Struct({ text: Schema.String }).annotate({ identifier: "Tool.Content" })
      const first = Schema.toCodecJson(Schema.fromJsonString(Content))
      const second = Schema.toCodecJson(Schema.fromJsonString(Content))
      const document = SchemaRepresentation.toRepresentations([first.ast, second.ast])

      assert.deepStrictEqual(SchemaRepresentation.toJsonSchemaMultiDocument(document), {
        dialect: "draft-2020-12",
        schemas: [
          { $ref: "#/$defs/Tool.ContentEncoded" },
          { $ref: "#/$defs/Tool.ContentEncoded" }
        ],
        definitions: {
          "Tool.ContentEncoded": {
            type: "string",
            contentMediaType: "application/json"
          }
        }
      })
    })

    it("does not deduplicate different fallback definitions", () => {
      const Content = Schema.String.annotate({ identifier: "Fallback" })
      const string = Schema.toCodecJson(
        Schema.String.pipe(Schema.decodeTo(Content, stringIdentityTransformation))
      )
      const boolean = Schema.toCodecJson(
        Schema.Boolean.pipe(
          Schema.decodeTo(
            Content,
            SchemaTransformation.transform({
              decode: (value) => String(value),
              encode: (value) => value === "true"
            })
          )
        )
      )
      const output = SchemaRepresentation.toJsonSchemaMultiDocument(
        SchemaRepresentation.toRepresentations([string.ast, boolean.ast])
      )

      assert.deepStrictEqual(output.schemas, [
        { $ref: "#/$defs/FallbackEncoded" },
        { $ref: "#/$defs/FallbackEncoded_1" }
      ])
      assert.deepStrictEqual(output.definitions, {
        FallbackEncoded: { type: "string" },
        FallbackEncoded_1: { type: "boolean" }
      })
    })

    it("does not deduplicate explicit identifiers", () => {
      const ExplicitA = Schema.String.annotate({ identifier: "ExplicitA" })
      const ExplicitB = Schema.String.annotate({ identifier: "ExplicitB" })
      const output = SchemaRepresentation.toJsonSchemaMultiDocument(
        SchemaRepresentation.toRepresentations([ExplicitA.ast, ExplicitB.ast])
      )

      assert.deepStrictEqual(output.schemas, [
        { $ref: "#/$defs/ExplicitA" },
        { $ref: "#/$defs/ExplicitB" }
      ])
      assert.deepStrictEqual(output.definitions, {
        ExplicitA: { type: "string" },
        ExplicitB: { type: "string" }
      })
    })

    it("deduplicates fallback definitions after linking their dependencies", () => {
      const Child = Schema.String.annotate({ identifier: "Child" })
      const Parent = Schema.Struct({ child: Child }).annotate({ identifier: "Parent" })
      const make = () => {
        const encoded = Schema.Struct({
          child: Schema.fromJsonString(Child)
        })
        return Schema.toCodecJson(
          encoded.pipe(
            Schema.decodeTo(
              Parent,
              SchemaTransformation.transform({
                decode: ({ child }) => ({ child }),
                encode: ({ child }) => ({ child })
              })
            )
          )
        )
      }
      const first = make()
      const second = make()
      const output = SchemaRepresentation.toJsonSchemaMultiDocument(
        SchemaRepresentation.toRepresentations([first.ast, second.ast])
      )

      assert.deepStrictEqual(output.schemas, [
        { $ref: "#/$defs/ParentEncoded" },
        { $ref: "#/$defs/ParentEncoded" }
      ])
      assert.deepStrictEqual(output.definitions, {
        ChildEncoded: {
          type: "string",
          contentMediaType: "application/json"
        },
        ParentEncoded: {
          type: "object",
          properties: {
            child: { $ref: "#/$defs/ChildEncoded" }
          },
          required: ["child"],
          additionalProperties: true
        }
      })
    })

    it("escapes canonical fallback references", () => {
      const Content = Schema.String.annotate({ identifier: "Child/~" })
      const first = Schema.toCodecJson(Schema.fromJsonString(Content))
      const second = Schema.toCodecJson(Schema.fromJsonString(Content))
      const output = SchemaRepresentation.toJsonSchemaMultiDocument(
        SchemaRepresentation.toRepresentations([first.ast, second.ast])
      )

      assert.deepStrictEqual(output.schemas, [
        { $ref: "#/$defs/Child~1~0Encoded" },
        { $ref: "#/$defs/Child~1~0Encoded" }
      ])
      assert.deepStrictEqual(output.definitions, {
        "Child/~Encoded": {
          type: "string",
          contentMediaType: "application/json"
        }
      })
    })

    for (
      const [identifier, token] of [
        ["Rate", "Rate"],
        ["id~a/b", "id~0a~1b"],
        ["Rate%", "Rate%25"],
        ["Rate%2F", "Rate%252F"],
        ["Rate%25", "Rate%2525"]
      ]
    ) {
      it(`rewrites callback references to the canonical ${identifier} definition`, () => {
        const Content = Schema.String.annotate({ identifier })
        const make = () =>
          Schema.toCodecJson(
            Schema.String.check(Schema.isMinLength(1)).pipe(
              Schema.decodeTo(Content, stringIdentityTransformation)
            )
          )
        const first = make()
        const second = make()
        const callback = Schema.Unknown.check(Schema.makeFilter(() => true, {
          toJsonSchema: () => ({ $ref: `#/$defs/${token}Encoded_1` })
        }))
        const document = SchemaRepresentation.toRepresentations([first.ast, second.ast, callback.ast])
        assert.deepStrictEqual(Object.keys(document.references), [`${identifier}Encoded`, `${identifier}Encoded_1`])
        const output = SchemaRepresentation.toJsonSchemaMultiDocument(document)

        assert.deepStrictEqual(Object.keys(output.definitions), [`${identifier}Encoded`])
        assert.deepStrictEqual(output.schemas[2], { $ref: `#/$defs/${token}Encoded` })
        for (const restored of SchemaRepresentation.fromJsonSchemaMultiDocument(output)) {
          assert.strictEqual(Schema.is(restored)("value"), true)
          assert.strictEqual(Schema.is(restored)(1), false)
        }
      })
    }

    it("rewrites callback references with encoded leading separators", () => {
      const Content = Schema.String.annotate({ identifier: "Rate%" })
      const make = () =>
        Schema.toCodecJson(
          Schema.String.check(Schema.isMinLength(1)).pipe(
            Schema.decodeTo(Content, stringIdentityTransformation)
          )
        )
      const callback = Schema.Unknown.check(Schema.makeFilter(() => true, {
        toJsonSchema: () => ({ $ref: "#%2F$defs%2FRate%25Encoded_1" })
      }))
      const output = SchemaRepresentation.toJsonSchemaMultiDocument(
        SchemaRepresentation.toRepresentations([make().ast, make().ast, callback.ast])
      )

      assert.deepStrictEqual(Object.keys(output.definitions), ["Rate%Encoded"])
      assert.deepStrictEqual(output.schemas[2], { $ref: "#/$defs/Rate%25Encoded" })
      assert.doesNotThrow(() => SchemaRepresentation.fromJsonSchemaMultiDocument(output))
    })

    for (
      const $ref of [
        "#/$defs/Rate%Encoded_1",
        "#%2F$defs%2FRate%Encoded_1",
        "#/$defs/Rate#Encoded_1"
      ]
    ) {
      it(`rejects malformed callback reference ${JSON.stringify($ref)}`, () => {
        const callback = Schema.Unknown.check(Schema.makeFilter(() => true, {
          toJsonSchema: () => ({ $ref })
        }))
        expectError(
          () =>
            SchemaRepresentation.toJsonSchemaMultiDocument(
              SchemaRepresentation.toRepresentations([callback.ast])
            ),
          `Invalid JSON Pointer URI fragment ${JSON.stringify($ref)}`
        )
      })
    }

    for (const separator of ["/", "%2F", "%2f", "~1", "%7E1"]) {
      it(`distinguishes pointer separators from escaped slashes in ${separator} callback references`, () => {
        const Content = Schema.String.annotate({ identifier: "Box/properties/value" })
        const make = () =>
          Schema.toCodecJson(
            Schema.String.check(Schema.isMinLength(1)).pipe(
              Schema.decodeTo(Content, stringIdentityTransformation)
            )
          )
        const Box = Schema.Struct({ valueEncoded_1: Schema.Boolean }).annotate({ identifier: "Box" })
        const $ref = `#/$defs/Box${separator}properties${separator}valueEncoded_1`
        const callback = Schema.Unknown.check(Schema.makeFilter(() => true, {
          toJsonSchema: () => ({ $ref })
        }))
        const output = SchemaRepresentation.toJsonSchemaMultiDocument(
          SchemaRepresentation.toRepresentations([make().ast, make().ast, Box.ast, callback.ast])
        )
        // Normalize URI fragments before validation: Ajv alone treats %2F as token contents.
        const document = JsonSchema.toDocumentDraft07({
          dialect: output.dialect,
          schema: output.schemas[3],
          definitions: output.definitions
        })
        const validate = new AjvDraft07.default({ strict: false }).compile({
          ...document.schema,
          definitions: document.definitions
        })
        const isName = separator === "~1" || separator === "%7E1"
        assert.strictEqual(validate(true), !isName)
        assert.strictEqual(validate("value"), isName)
        assert.strictEqual(output.schemas[3].$ref, isName ? "#/$defs/Box~1properties~1valueEncoded" : $ref)
      })
    }

    it("preserves an encoded pointer suffix when rewriting a percent-named alias", () => {
      const representation = SchemaRepresentation.toRepresentation(
        Schema.Struct({ "value%2F": Schema.Boolean }).ast
      ).representation
      if (representation._tag !== "Objects") throw new Error("Expected an object representation")
      const definition: SchemaRepresentation.Representation = {
        ...representation,
        annotations: { "~identifier": "Box%" }
      }
      const $ref = "#/$defs/Box%25_1%2Fproperties%2Fvalue%252F"
      const reference = Object.freeze({ $ref, default: Object.freeze({ $ref }) })
      const output = SchemaRepresentation.toJsonSchemaMultiDocument({
        representations: [{
          _tag: "Unknown",
          checks: [{
            _tag: "Filter",
            aborted: false,
            annotations: { toJsonSchema: () => reference }
          }]
        }],
        references: { "Box%": definition, "Box%_1": definition }
      })

      assert.strictEqual(output.schemas[0].$ref, "#/$defs/Box%25%2Fproperties%2Fvalue%252F")
      assert.deepStrictEqual(output.schemas[0].default, { $ref })
      assert.strictEqual(reference.$ref, $ref)
      const document = JsonSchema.toDocumentDraft07({
        dialect: output.dialect,
        schema: output.schemas[0],
        definitions: output.definitions
      })
      const validate = new AjvDraft07.default({ strict: false }).compile({
        ...document.schema,
        definitions: document.definitions
      })
      assert.strictEqual(validate(true), true)
      assert.strictEqual(validate("value"), false)
    })

    // JSON Schema callbacks are user-provided and may have effects, so invocation count is observable.
    it("invokes each fallback callback once before deduplicating equivalent output", () => {
      let visits = 0
      const Content = Schema.String.annotate({ identifier: "Callback" })
      const make = (reverse: boolean) => {
        const encoded = Schema.String.check(
          Schema.makeFilter<string>(() => true, {
            toJsonSchema: () => {
              visits++
              return reverse ? { maxLength: 10, minLength: 1 } : { minLength: 1, maxLength: 10 }
            }
          })
        )
        return Schema.toCodecJson(
          encoded.pipe(Schema.decodeTo(Content, stringIdentityTransformation))
        )
      }
      const first = make(false)
      const second = make(true)
      const output = SchemaRepresentation.toJsonSchemaMultiDocument(
        SchemaRepresentation.toRepresentations([first.ast, second.ast])
      )

      assert.strictEqual(visits, 2)
      assert.deepStrictEqual(output.schemas, [
        { $ref: "#/$defs/CallbackEncoded" },
        { $ref: "#/$defs/CallbackEncoded" }
      ])
      assert.deepStrictEqual(output.definitions, {
        CallbackEncoded: {
          type: "string",
          minLength: 1,
          maxLength: 10
        }
      })
    })

    it("reuses a compiled definition when extracting an index signature pattern", () => {
      let visits = 0
      const Key = Schema.String.check(
        Schema.makeFilter<string>(() => true, {
          identifier: "Key",
          toJsonSchema: () => {
            visits++
            return { pattern: "^key$" }
          }
        })
      )
      const Root = Schema.Record(Key, Schema.String)
      const output = SchemaRepresentation.toJsonSchemaMultiDocument(
        SchemaRepresentation.toRepresentations([Root.ast])
      )

      assert.strictEqual(visits, 1)
      assert.deepStrictEqual(output.schemas, [{
        type: "object",
        patternProperties: {
          "^key$": { type: "string" }
        },
        additionalProperties: true
      }])
    })

    it("deduplicates fallback definitions that share a recursive dependency", () => {
      interface OptionalNode {
        readonly next?: OptionalNode | undefined
      }
      const Encoded: Schema.Codec<OptionalNode> = Schema.suspend(() =>
        Schema.Struct({
          next: Schema.optional(Encoded)
        })
      )
      const Content = Encoded.annotate({ identifier: "Node" })
      const make = () =>
        Schema.toCodecJson(
          Encoded.pipe(
            Schema.decodeTo(
              Content,
              SchemaTransformation.transform({
                decode: (node) => node,
                encode: (node) => node
              })
            )
          )
        )
      const first = make()
      const second = make()
      const output = SchemaRepresentation.toJsonSchemaMultiDocument(
        SchemaRepresentation.toRepresentations([first.ast, second.ast])
      )

      assert.deepStrictEqual(output.schemas, [
        { $ref: "#/$defs/NodeEncoded" },
        { $ref: "#/$defs/NodeEncoded" }
      ])
      assert.deepStrictEqual(output.definitions, {
        Objects_: {
          type: "object",
          properties: {
            next: {
              anyOf: [
                { $ref: "#/$defs/Objects_" },
                { type: "null" }
              ]
            }
          },
          additionalProperties: true
        },
        NodeEncoded: { $ref: "#/$defs/Objects_" }
      })
    })

    it("does not deduplicate fallback definitions with distinct recursive dependencies", () => {
      interface RequiredNode {
        readonly next: RequiredNode
      }
      const Content: Schema.Codec<RequiredNode> = Schema.Struct({
        next: Schema.suspend(() => Content)
      }).annotate({ identifier: "Node" })
      const make = () => {
        const Encoded: Schema.Codec<RequiredNode> = Schema.Struct({
          next: Schema.suspend(() => Encoded)
        })
        return Schema.toCodecJson(
          Encoded.pipe(
            Schema.decodeTo(
              Content,
              SchemaTransformation.transform({
                decode: (node) => node,
                encode: (node) => node
              })
            )
          )
        )
      }
      const first = make()
      const second = make()
      const output = SchemaRepresentation.toJsonSchemaMultiDocument(
        SchemaRepresentation.toRepresentations([first.ast, second.ast])
      )

      assert.deepStrictEqual(output.schemas, [
        { $ref: "#/$defs/NodeEncoded" },
        { $ref: "#/$defs/NodeEncoded_1" }
      ])
      assert.deepStrictEqual(output.definitions, {
        Suspend_: {
          type: "object",
          properties: {
            next: { $ref: "#/$defs/Suspend_" }
          },
          required: ["next"],
          additionalProperties: true
        },
        NodeEncoded: {
          type: "object",
          properties: {
            next: { $ref: "#/$defs/Suspend_" }
          },
          required: ["next"],
          additionalProperties: true
        },
        Suspend_1: {
          type: "object",
          properties: {
            next: { $ref: "#/$defs/Suspend_1" }
          },
          required: ["next"],
          additionalProperties: true
        },
        NodeEncoded_1: {
          type: "object",
          properties: {
            next: { $ref: "#/$defs/Suspend_1" }
          },
          required: ["next"],
          additionalProperties: true
        }
      })
    })
  })

  describe("multi-root compilation", () => {
    it("preserves root order and shared named definitions", () => {
      const A = Schema.String.annotate({ identifier: "A", description: "a" })
      const B = Schema.String.annotate({ identifier: "B", description: "b" })
      const C = Schema.Tuple([A, B])
      const multiDocument = SchemaRepresentation.toRepresentations([A.ast, B.ast, C.ast])
      const jsonMultiDocument = SchemaRepresentation.toJsonSchemaMultiDocument(multiDocument)
      assert.deepStrictEqual(jsonMultiDocument, {
        dialect: "draft-2020-12",
        schemas: [
          { "$ref": "#/$defs/A" },
          { "$ref": "#/$defs/B" },
          {
            "type": "array",
            "prefixItems": [
              { "$ref": "#/$defs/A" },
              { "$ref": "#/$defs/B" }
            ],
            "minItems": 2,
            "maxItems": 2
          }
        ],
        definitions: {
          A: {
            "type": "string",
            "description": "a"
          },
          B: {
            "type": "string",
            "description": "b"
          }
        }
      })
    })
    it("emits standard annotations and oneOf unions", () => {
      const output = SchemaRepresentation.toJsonSchemaMultiDocument({
        representations: [
          {
            _tag: "String",
            annotations: {
              format: "email",
              contentEncoding: "base64",
              contentMediaType: "application/json",
              contentSchema: { type: "string" }
            },
            checks: []
          },
          {
            _tag: "Union",
            types: [StringRepresentation, { _tag: "Boolean", checks: [] }],
            options: { mode: "oneOf" },
            checks: []
          }
        ],
        references: {}
      })

      assert.deepStrictEqual(output.schemas, [
        {
          type: "string",
          format: "email",
          contentEncoding: "base64",
          contentMediaType: "application/json",
          contentSchema: { type: "string" }
        },
        { oneOf: [{ type: "string" }, { type: "boolean" }] }
      ])
    })

    it("resolves oneOf exactness through recursive references", () => {
      const approximate: SchemaRepresentation.Representation = {
        _tag: "String",
        checks: [{
          _tag: "Filter",
          aborted: false,
          annotations: { toJsonSchema: () => [{ minLength: 1 }, true] }
        }]
      }
      const output = SchemaRepresentation.toJsonSchemaMultiDocument({
        representations: [
          { _tag: "Reference", $ref: "Exact" },
          { _tag: "Reference", $ref: "Approximate" }
        ],
        references: {
          Exact: {
            _tag: "Union",
            types: [{ _tag: "Reference", $ref: "Exact" }, { _tag: "Boolean", checks: [] }],
            options: { mode: "oneOf" },
            checks: []
          },
          Approximate: {
            _tag: "Union",
            types: [{ _tag: "Reference", $ref: "Approximate" }, approximate],
            options: { mode: "oneOf" },
            checks: []
          }
        }
      })

      assert.deepStrictEqual(output, {
        dialect: "draft-2020-12",
        schemas: [
          { $ref: "#/$defs/Exact" },
          { $ref: "#/$defs/Approximate" }
        ],
        definitions: {
          Exact: {
            oneOf: [{ $ref: "#/$defs/Exact" }, { type: "boolean" }]
          },
          Approximate: {
            anyOf: [{ $ref: "#/$defs/Approximate" }, { type: "string", minLength: 1 }]
          }
        }
      })
    })

    it("uses group overrides without visiting children and otherwise falls back to allOf", () => {
      let visits = 0
      const child: SchemaRepresentation.Filter = {
        _tag: "Filter",
        aborted: false,
        annotations: {
          toJsonSchema: () => {
            visits++
            return { minLength: 1 }
          }
        }
      }
      const override: SchemaRepresentation.FilterGroup = {
        _tag: "FilterGroup",
        checks: [child],
        annotations: {
          description: "override",
          toJsonSchema: () => ({ format: "custom" })
        }
      }
      const fallback: SchemaRepresentation.FilterGroup = {
        _tag: "FilterGroup",
        checks: [child, { _tag: "Filter", aborted: false }],
        annotations: { description: "fallback" }
      }
      const document: SchemaRepresentation.MultiDocument = {
        representations: [
          { _tag: "String", checks: [override] },
          { _tag: "String", checks: [fallback] }
        ],
        references: {}
      }

      const output = SchemaRepresentation.toJsonSchemaMultiDocument(document)
      assert.strictEqual(visits, 1)
      assert.deepStrictEqual(output.schemas, [
        {
          type: "string",
          allOf: [{ format: "custom", description: "override" }]
        },
        {
          type: "string",
          allOf: [{ allOf: [{ minLength: 1 }], description: "fallback" }]
        }
      ])
    })

    it("preserves unknown references returned by callbacks", () => {
      const reference = { $ref: "#/$defs/Unknown" }
      const output = SchemaRepresentation.toJsonSchemaMultiDocument({
        representations: [{
          _tag: "String",
          checks: [{
            _tag: "Filter",
            aborted: false,
            annotations: { toJsonSchema: () => reference }
          }]
        }],
        references: {}
      })

      assert.deepStrictEqual(output.schemas, [{
        type: "string",
        allOf: [reference]
      }])
    })

    it("rewrites callback references without mutating callback output", () => {
      const defaultValue = Object.freeze({ $ref: "#/$defs//properties/value" })
      const reference = Object.freeze({ $ref: "#/$defs//properties/value", default: defaultValue })
      const definition = (): SchemaRepresentation.Representation => ({
        _tag: "String",
        annotations: { "~identifier": "Value" },
        checks: []
      })
      const output = SchemaRepresentation.toJsonSchemaMultiDocument({
        representations: [{
          _tag: "String",
          annotations: { default: -0 },
          checks: [{
            _tag: "Filter",
            aborted: false,
            annotations: { toJsonSchema: () => reference }
          }]
        }],
        references: { A: definition(), "": definition() }
      })

      assert.deepStrictEqual(reference, { $ref: "#/$defs//properties/value", default: defaultValue })
      assert.strictEqual(Object.is(output.schemas[0].default, -0), true)
      assert.deepStrictEqual(output, {
        dialect: "draft-2020-12",
        schemas: [{
          type: "string",
          default: -0,
          allOf: [{ $ref: "#/$defs/A/properties/value", default: { $ref: "#/$defs//properties/value" } }]
        }],
        definitions: { A: { type: "string" } }
      })
    })

    it("preserves unknown references in annotation values", () => {
      const reference = { $ref: "#/$defs/Unknown" }
      const output = SchemaRepresentation.toJsonSchemaMultiDocument({
        representations: [{
          _tag: "String",
          annotations: { default: reference },
          checks: []
        }],
        references: {}
      })

      assert.deepStrictEqual(output.schemas, [{
        type: "string",
        default: reference
      }])
    })

    it("resolves referenced index-signature parameters and stops cycles", () => {
      const record = (
        parameter: SchemaRepresentation.Representation
      ): SchemaRepresentation.Representation => ({
        _tag: "Objects",
        propertySignatures: [],
        indexSignatures: [{ parameter, type: StringRepresentation }],
        checks: []
      })
      const pattern = SchemaRepresentation.toRepresentation(
        Schema.String.check(Schema.isPattern(/^a/u)).ast
      ).representation
      const output = SchemaRepresentation.toJsonSchemaMultiDocument({
        representations: [
          record({ _tag: "Reference", $ref: "Pattern" }),
          record({ _tag: "Reference", $ref: "Cycle" })
        ],
        references: {
          Pattern: pattern,
          Cycle: { _tag: "Reference", $ref: "Cycle" }
        }
      })

      assert.deepStrictEqual(output.schemas, [
        {
          type: "object",
          patternProperties: { "^a": { type: "string" } },
          additionalProperties: true
        },
        {
          type: "object",
          additionalProperties: true
        }
      ])

      expectError(
        () =>
          SchemaRepresentation.toJsonSchemaDocument({
            representation: record({ _tag: "Reference", $ref: "Missing" }),
            references: {}
          }),
        `Invalid reference Missing\n  at ["representation"]["indexSignatures"][0]["parameter"]["$ref"]`
      )
    })
  })
})
