import { assert, describe, it } from "@effect/vitest"
import type { Options as AjvOptions } from "ajv"
import { Exit, JsonSchema, Schema, SchemaRepresentation } from "effect"

// oxlint-disable-next-line @typescript-eslint/no-require-imports
const Ajv2020 = require("ajv/dist/2020")

const ajv = new Ajv2020.default(
  {
    allErrors: true,
    strict: false,
    validateSchema: true,
    code: { esm: true }
  } satisfies AjvOptions
)

function compile(document: JsonSchema.Document<"draft-2020-12">) {
  return ajv.compile({
    $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12,
    ...document.schema,
    $defs: document.definitions
  })
}

function assertSameAcceptedValues(
  left: (input: unknown) => unknown,
  right: (input: unknown) => unknown,
  inputs: ReadonlyArray<unknown>
): void {
  for (const input of inputs) {
    assert.strictEqual(
      left(input) === true,
      right(input) === true,
      `Validation differs for ${JSON.stringify(input)}`
    )
  }
}

function assertJsonSchemaEquivalent(
  left: JsonSchema.Document<"draft-2020-12">,
  right: JsonSchema.Document<"draft-2020-12">,
  inputs: ReadonlyArray<unknown>
): void {
  assertSameAcceptedValues(compile(left), compile(right), inputs)
}

function assertJsonSchemaImportRoundTrip(
  schema: JsonSchema.JsonSchema,
  inputs: ReadonlyArray<unknown>
): void {
  const source = JsonSchema.fromSchemaDraft2020_12(schema)
  const imported = SchemaRepresentation.fromJsonSchemaDocument(source, { patterns: "apply" })
  const representation = SchemaRepresentation.toRepresentation(imported.ast)
  const emitted = SchemaRepresentation.toJsonSchemaDocument(representation, { onExcessProperty: "error" })
  assertJsonSchemaEquivalent(source, emitted, inputs)

  const validate = compile(source)
  const decode = Schema.decodeUnknownExit(imported as unknown as Schema.ConstraintDecoder<unknown>, {
    onExcessProperty: "error"
  })
  assertSameAcceptedValues((input) => Exit.isSuccess(decode(input)), validate, inputs)
}

function assertRepresentationRoundTrip(
  schema: Schema.ConstraintDecoder<unknown>,
  inputs: ReadonlyArray<unknown>,
  options: Schema.ToJsonSchemaOptions = { onExcessProperty: "error" }
): void {
  const emitted = Schema.toJsonSchemaDocument(schema, options)
  const imported = SchemaRepresentation.fromJsonSchemaDocument(emitted, { patterns: "apply" })
  const decodeSource = Schema.decodeUnknownExit(schema, { onExcessProperty: "error" })
  const decodeImported = Schema.decodeUnknownExit(imported as unknown as Schema.ConstraintDecoder<unknown>, {
    onExcessProperty: "error"
  })
  assertSameAcceptedValues(
    (input) => Exit.isSuccess(decodeImported(input)),
    (input) => Exit.isSuccess(decodeSource(input)),
    inputs
  )
  assertJsonSchemaEquivalent(emitted, Schema.toJsonSchemaDocument(imported, options), inputs)
}

function assertLooseRepresentationRoundTrip(
  schema: Schema.ConstraintDecoder<unknown>,
  inputs: ReadonlyArray<unknown>,
  options?: Schema.ToJsonSchemaOptions
): Schema.Top {
  const emitted = Schema.toJsonSchemaDocument(schema, options)
  const imported = SchemaRepresentation.fromJsonSchemaDocument(emitted, { patterns: "apply" })
  const decodeSource = Schema.decodeUnknownExit(schema, { onExcessProperty: "error" })
  const decodeImported = Schema.decodeUnknownExit(imported as unknown as Schema.ConstraintDecoder<unknown>, {
    onExcessProperty: "error"
  })
  for (const input of inputs) {
    if (Exit.isSuccess(decodeSource(input))) {
      assert.isTrue(Exit.isSuccess(decodeImported(input)), `Import rejects ${JSON.stringify(input)}`)
    }
  }
  assertJsonSchemaEquivalent(emitted, Schema.toJsonSchemaDocument(imported, options), inputs)
  return imported
}

describe("JSON Schema round-trip laws", () => {
  describe("toJsonSchema(fromJsonSchema(A))", () => {
    it("applies type-specific keywords only to matching instances", () => {
      assertJsonSchemaImportRoundTrip(
        { minLength: 2 },
        ["", "a", "ab", 0, true, null, [], {}]
      )
      assertJsonSchemaImportRoundTrip(
        { minimum: 1 },
        [0, 1, "a", true, null, [], {}]
      )
      assertJsonSchemaImportRoundTrip(
        { minItems: 1 },
        [[], [1], "a", 0, true, null, {}]
      )
      assertJsonSchemaImportRoundTrip(
        { required: ["a"] },
        [{}, { a: 1 }, [], "a", 0, true, null]
      )
    })

    it("preserves Unicode string lengths and patterns", () => {
      const inputs = ["", "a", "é", "😀", "e\u0301", "😀a", "\uD800"]
      assertJsonSchemaImportRoundTrip(
        { type: "string", minLength: 2, maxLength: 2 },
        inputs
      )
      assertJsonSchemaImportRoundTrip(
        { type: "string", pattern: "^.$" },
        inputs
      )
    })

    it("conjoins enum with its sibling constraints", () => {
      assertJsonSchemaImportRoundTrip(
        { enum: ["a", "ab", 1], minLength: 2 },
        ["a", "ab", 1, true]
      )
    })

    it("conjoins const with its sibling constraints", () => {
      assertJsonSchemaImportRoundTrip(
        { const: "a", minLength: 2 },
        ["a", "aa", 1, null]
      )
    })

    it("intersects finite enums as sets", () => {
      assertJsonSchemaImportRoundTrip(
        { allOf: [{ enum: ["a", "b", 1] }, { enum: ["b", 1, true] }] },
        ["a", "b", 1, true, null]
      )
    })

    it("preserves oneOf branch multiplicity", () => {
      assertJsonSchemaImportRoundTrip(
        { oneOf: [{ const: "a" }, { const: "a" }] },
        ["a", "b", 1]
      )
    })

    it("preserves minItems after prefixItems", () => {
      assertJsonSchemaImportRoundTrip(
        {
          type: "array",
          prefixItems: [{ type: "string" }],
          items: { type: "number" },
          minItems: 2
        },
        [[], ["a"], ["a", 1], ["a", 1, 2], ["a", "b"]]
      )
    })

    it("intersects one constraint with multiple alternatives linearly", () => {
      assertJsonSchemaImportRoundTrip(
        {
          allOf: [
            {
              anyOf: [
                { type: "string", minLength: 2, maxLength: 3 },
                { type: "string", minLength: 5, maxLength: 6 }
              ]
            },
            { type: "string", pattern: "^a" }
          ]
        },
        ["a", "aa", "bb", "aaaa", "aaaaa", "bbbbb", 1]
      )
    })

    it("preserves empty closed objects", () => {
      assertJsonSchemaImportRoundTrip(
        { type: "object", additionalProperties: false },
        [{}, { a: 1 }, [], [1], null, 1]
      )
    })

    it("applies additionalProperties to required-only names", () => {
      assertJsonSchemaImportRoundTrip(
        { type: "object", required: ["a"], additionalProperties: false },
        [{}, { a: 1 }, { a: "a" }, { b: 1 }, []]
      )
    })

    it("applies an additionalProperties schema to required-only names", () => {
      assertJsonSchemaImportRoundTrip(
        { type: "object", required: ["a"], additionalProperties: { type: "string" } },
        [{}, { a: 1 }, { a: "a" }, { a: "a", b: "b" }, { a: "a", b: 1 }, []]
      )
    })

    it("preserves closed object scopes", () => {
      assertJsonSchemaImportRoundTrip(
        {
          type: "object",
          additionalProperties: false,
          allOf: [{ properties: { a: { type: "string" } } }]
        },
        [{}, { a: "a" }, { a: 1 }, { b: 1 }, { a: "a", b: 1 }, []]
      )
    })

    it("preserves sibling additionalProperties schemas", () => {
      assertJsonSchemaImportRoundTrip(
        {
          type: "object",
          properties: { a: { type: "string" } },
          allOf: [{ additionalProperties: { type: "boolean" } }]
        },
        [{}, { a: "a" }, { b: true }, { b: "b" }, { a: "a", b: true }, []]
      )
    })

    it("preserves closed patternProperties", () => {
      assertJsonSchemaImportRoundTrip(
        {
          type: "object",
          patternProperties: { "^a": { type: "string" } },
          additionalProperties: false
        },
        [{}, { a: "a" }, { a: 1 }, { ab: "a", b: 1 }, { b: 1 }, []]
      )
    })
  })

  describe("fromJsonSchema(toJsonSchema(X))", () => {
    it("preserves structs", () => {
      assertRepresentationRoundTrip(
        Schema.Struct({ a: Schema.String }),
        [{}, { a: "a" }, { a: 1 }, { a: "a", b: 1 }, []]
      )
    })

    it("preserves string indexes", () => {
      assertRepresentationRoundTrip(
        Schema.Record(Schema.String, Schema.Union([Schema.Finite, Schema.String])),
        [{}, { a: "a" }, { a: 1 }, { a: true }, []]
      )
    })

    it("imports the loose default export of approximate pattern records", () => {
      const schema = Schema.Record(Schema.String.check(Schema.isUppercased()), Schema.Finite)
      const inputs = [{}, { A: 1 }, { A: "a" }, { a: 1 }, { a: "a" }, []]
      assertRepresentationRoundTrip(
        schema,
        inputs
      )
      const emitted = Schema.toJsonSchemaDocument(schema)
      assert.deepStrictEqual(emitted.schema, { type: "object", additionalProperties: true })
      const imported = assertLooseRepresentationRoundTrip(schema, inputs)
      assert.isFalse(Schema.is(schema)({ A: "a" }))
      assert.isTrue(Schema.is(imported)({ A: "a" }))
    })

    it("handles conjunctive key patterns permissively", () => {
      const schema = Schema.Record(
        Schema.String.check(Schema.isStartingWith("ab"), Schema.isEndingWith("z")),
        Schema.Finite
      )
      const document = Schema.toJsonSchemaDocument(schema)
      assert.deepStrictEqual(document.schema, {
        type: "object",
        additionalProperties: true
      })
      const validate = compile(document)

      assert.strictEqual(validate({ abc: "not a number" }), true)
      assert.deepStrictEqual(Schema.decodeUnknownSync(schema)({ abc: "not a number" }), {})
      assert.strictEqual(validate({ abz: "not a number" }), true)
      assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(schema)({ abz: "not a number" })))
      assert.strictEqual(validate({ abz: 1 }), true)
      assert.deepStrictEqual(Schema.decodeUnknownSync(schema)({ abz: 1 }), { abz: 1 })

      const strictDocument = Schema.toJsonSchemaDocument(schema, { onExcessProperty: "error" })
      assert.deepStrictEqual(strictDocument.schema, {
        type: "object",
        propertyNames: {
          type: "string",
          pattern: "^ab",
          allOf: [{ pattern: "z$" }]
        },
        additionalProperties: { type: "number" }
      })
      const validateStrict = compile(strictDocument)
      assert.strictEqual(validateStrict({ abc: "not a number" }), false)
      assert.isTrue(
        Exit.isFailure(
          Schema.decodeUnknownExit(schema, { onExcessProperty: "error" })({ abc: "not a number" })
        )
      )
      assert.strictEqual(validateStrict({ abz: "not a number" }), false)
      assert.strictEqual(validateStrict({ abz: 1 }), true)
    })

    it("uses permissive value alternatives with strict conjunctive indexes", () => {
      const schema = Schema.StructWithRest(Schema.Struct({}), [
        Schema.Record(
          Schema.String.check(Schema.isStartingWith("a"), Schema.isEndingWith("z")),
          Schema.Finite
        ),
        Schema.Record(
          Schema.String.check(Schema.isStartingWith("b"), Schema.isEndingWith("z")),
          Schema.Boolean
        )
      ])
      const document = Schema.toJsonSchemaDocument(schema, { onExcessProperty: "error" })
      assert.deepStrictEqual(document.schema, {
        type: "object",
        propertyNames: {
          anyOf: [
            {
              type: "string",
              pattern: "^a",
              allOf: [{ pattern: "z$" }]
            },
            {
              type: "string",
              pattern: "^b",
              allOf: [{ pattern: "z$" }]
            }
          ]
        },
        additionalProperties: {
          anyOf: [{ type: "number" }, { type: "boolean" }]
        }
      })
      const validate = compile(document)

      assert.strictEqual(validate({ az: 1 }), true)
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })({ az: 1 }) as unknown,
        { az: 1 }
      )
      assert.strictEqual(validate({ bz: true }), true)
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })({ bz: true }) as unknown,
        { bz: true }
      )
      assert.strictEqual(validate({ az: true }), true)
      assert.isTrue(
        Exit.isFailure(Schema.decodeUnknownExit(schema, { onExcessProperty: "error" })({ az: true }))
      )
      assert.strictEqual(validate({ cz: 1 }), false)
      assert.isTrue(
        Exit.isFailure(Schema.decodeUnknownExit(schema, { onExcessProperty: "error" })({ cz: 1 }))
      )
    })

    it("imports the loose export of approximate pattern and string indexes", () => {
      const schema = Schema.StructWithRest(Schema.Struct({}), [
        Schema.Record(Schema.String.check(Schema.isUppercased()), Schema.Finite),
        Schema.Record(Schema.String, Schema.Boolean)
      ])
      const inputs = [{}, { A: true }, { A: 1 }, { a: true }, { a: 1 }, []]
      const imported = assertLooseRepresentationRoundTrip(schema, inputs, { onExcessProperty: "error" })
      assert.isFalse(Schema.is(schema)({ A: true }))
      assert.isTrue(Schema.is(imported)({ A: true }))
    })

    it("preserves multiple string indexes", () => {
      assertRepresentationRoundTrip(
        Schema.StructWithRest(Schema.Struct({}), [
          Schema.Record(Schema.String, Schema.Union([Schema.Boolean, Schema.String])),
          Schema.Record(Schema.String, Schema.Union([Schema.Boolean, Schema.Finite]))
        ]),
        [{}, { a: true }, { a: false }, { a: 1 }, { a: "a" }, []]
      )
    })

    it("applies string indexes to explicit properties", () => {
      assertRepresentationRoundTrip(
        Schema.StructWithRest(Schema.Struct({ a: Schema.Union([Schema.String, Schema.Boolean]) }), [
          Schema.Record(Schema.String, Schema.Boolean)
        ]),
        [{}, { a: true }, { a: false }, { a: "a" }, { a: 1 }, { a: true, b: false }, []]
      )
    })
  })
})
