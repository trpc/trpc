import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema, SchemaAST, SchemaRepresentation } from "effect"

describe("SchemaRepresentation.toRepresentations", () => {
  describe("root identity and sharing", () => {
    it("preserves root order", () => {
      const document = SchemaRepresentation.toRepresentations([
        Schema.String.ast,
        Schema.Number.ast,
        Schema.Boolean.ast
      ])

      assert.deepStrictEqual(document, {
        representations: [
          { _tag: "String", checks: [] },
          { _tag: "Number", checks: [] },
          { _tag: "Boolean", checks: [] }
        ],
        references: {}
      })
    })

    it("shares a named reference between roots", () => {
      const shared = Schema.String.annotate({ identifier: "Shared" })
      const document = SchemaRepresentation.toRepresentations([shared.ast, shared.ast])

      assert.deepStrictEqual(document, {
        representations: [
          { _tag: "Reference", $ref: "Shared" },
          { _tag: "Reference", $ref: "Shared" }
        ],
        references: {
          Shared: {
            _tag: "String",
            annotations: { identifier: "Shared" },
            checks: []
          }
        }
      })
    })

    it("shares a fallback reference across contextual copies of the same encoded AST", () => {
      const Content = Schema.Struct({ text: Schema.String }).annotate({ identifier: "Tool.Content" })
      const first = Schema.toCodecJson(Schema.fromJsonString(Content))
      const second = Schema.toCodecJson(Schema.fromJsonString(Content))
      const document = SchemaRepresentation.toRepresentations([first.ast, second.ast])

      assert.notStrictEqual(first.ast, second.ast)
      assert.deepStrictEqual(document, {
        representations: [
          { _tag: "Reference", $ref: "Tool.ContentEncoded" },
          { _tag: "Reference", $ref: "Tool.ContentEncoded" }
        ],
        references: {
          "Tool.ContentEncoded": {
            _tag: "String",
            annotations: {
              expected: "a string that will be decoded as JSON",
              contentMediaType: "application/json",
              "~identifier": "Tool.Content"
            },
            checks: []
          }
        }
      })
    })

    it("shares copies of the same AST with the same Context", () => {
      const ast = Schema.String.annotate({ identifier: "Value" }).ast
      const context = new SchemaAST.Context(false, false)
      const first = SchemaAST.replaceContext(ast, context)
      const second = SchemaAST.replaceContext(ast, context)

      assert.notStrictEqual(first, second)
      assert.deepStrictEqual(SchemaRepresentation.toRepresentations([first, second]), {
        representations: [
          { _tag: "Reference", $ref: "Value" },
          { _tag: "Reference", $ref: "Value" }
        ],
        references: {
          Value: {
            _tag: "String",
            annotations: { identifier: "Value" },
            checks: []
          }
        }
      })
    })

    it("preserves the original owner through repeated Context replacements", () => {
      const ast = Schema.String.annotate({ identifier: "Value" }).ast
      const first = SchemaAST.replaceContext(ast, new SchemaAST.Context(true, false))
      const chained = SchemaAST.replaceContext(first, new SchemaAST.Context(false, true))
      const direct = SchemaAST.replaceContext(ast, new SchemaAST.Context(false, true))

      assert.strictEqual(SchemaAST.getContextOwner(first), ast)
      assert.strictEqual(SchemaAST.getContextOwner(chained), ast)
      assert.deepStrictEqual(SchemaRepresentation.toRepresentations([chained, direct]), {
        representations: [
          { _tag: "Reference", $ref: "Value" },
          { _tag: "Reference", $ref: "Value" }
        ],
        references: {
          Value: {
            _tag: "String",
            annotations: { identifier: "Value" },
            checks: []
          }
        }
      })
    })

    it("keeps a checked derivative distinct from its identified source", () => {
      const base = Schema.String.annotate({ identifier: "Text" })
      const refined = base.pipe(Schema.check(Schema.isMinLength(1)))
      const forward = SchemaRepresentation.toRepresentations([base.ast, refined.ast])
      const reversed = SchemaRepresentation.toRepresentations([refined.ast, base.ast])

      assert.deepStrictEqual(forward.representations[0], { _tag: "Reference", $ref: "Text" })
      assert.strictEqual(forward.representations[1]._tag, "String")
      if (forward.representations[1]._tag === "String") {
        assert.strictEqual(forward.representations[1].checks.length, 1)
      }
      assert.strictEqual(reversed.representations[0]._tag, "String")
      if (reversed.representations[0]._tag === "String") {
        assert.strictEqual(reversed.representations[0].checks.length, 1)
      }
      assert.deepStrictEqual(reversed.representations[1], { _tag: "Reference", $ref: "Text" })
      assert.deepStrictEqual(forward.references, {
        Text: {
          _tag: "String",
          annotations: { identifier: "Text" },
          checks: []
        }
      })
      assert.deepStrictEqual(reversed.references, forward.references)
    })
  })

  describe.each([
    { name: "toType", project: SchemaAST.toType },
    { name: "toEncoded", project: SchemaAST.toEncoded },
    { name: "flip", project: SchemaAST.flip }
  ])("contextual projections with $name", ({ project }) => {
    it.each([
      {
        name: "primitive",
        schema: Schema.NumberFromString.pipe(Schema.annotateEncoded({ identifier: "Wire" }))
      },
      { name: "struct", schema: Schema.Struct({ value: Schema.NumberFromString }) },
      { name: "array", schema: Schema.Array(Schema.NumberFromString) },
      { name: "tuple", schema: Schema.Tuple([Schema.NumberFromString, Schema.String]) },
      { name: "union", schema: Schema.Union([Schema.NumberFromString, Schema.Boolean]) },
      { name: "declaration", schema: Schema.Option(Schema.NumberFromString) },
      { name: "suspend", schema: Schema.suspend(() => Schema.Struct({ value: Schema.NumberFromString })) },
      {
        name: "encoding chain",
        schema: Schema.String.pipe(
          Schema.decodeTo(Schema.NumberFromString),
          Schema.annotateEncoded({ identifier: "Wire" })
        )
      }
    ])("shares the $name reference while preserving each field's context", ({ schema }) => {
      const value = schema.annotate({ identifier: "Value" })
      const struct = Schema.Struct({
        optional: Schema.optionalKey(value),
        mutable: Schema.mutableKey(value),
        both: Schema.optionalKey(Schema.mutableKey(value)),
        required: value
      })
      const expected = SchemaRepresentation.toRepresentation(project(value.ast))
      const document = SchemaRepresentation.toRepresentations([project(struct.ast), project(value.ast)])

      assert.deepStrictEqual(document.references, expected.references)
      assert.deepStrictEqual(document.representations, [
        {
          _tag: "Objects",
          propertySignatures: [
            { name: "optional", type: expected.representation, isOptional: true, isMutable: false },
            { name: "mutable", type: expected.representation, isOptional: false, isMutable: true },
            { name: "both", type: expected.representation, isOptional: true, isMutable: true },
            { name: "required", type: expected.representation, isOptional: false, isMutable: false }
          ],
          indexSignatures: [],
          checks: []
        },
        expected.representation
      ])
    })

    it("shares recursive references across contextual copies", () => {
      const node: SchemaAST.Suspend = new SchemaAST.Suspend(
        () =>
          new SchemaAST.Objects([
            new SchemaAST.PropertySignature("value", Schema.NumberFromString.ast),
            new SchemaAST.PropertySignature("next", SchemaAST.optionalKey(node))
          ], []),
        { identifier: "Node" }
      )
      const document = SchemaRepresentation.toRepresentations([
        project(SchemaAST.mutableKey(node)),
        project(node)
      ])

      assert.deepStrictEqual(document.representations, [
        { _tag: "Reference", $ref: "Node" },
        { _tag: "Reference", $ref: "Node" }
      ])
      assert.deepStrictEqual(Object.keys(document.references), ["Node"])
      const representation = document.references.Node
      assert.strictEqual(representation._tag, "Suspend")
      if (representation._tag !== "Suspend") return
      assert.strictEqual(representation.thunk._tag, "Objects")
      if (representation.thunk._tag !== "Objects") return
      assert.deepStrictEqual(representation.thunk.propertySignatures[1], {
        name: "next",
        type: { _tag: "Reference", $ref: "Node" },
        isOptional: true,
        isMutable: false
      })
    })
  })

  it("shares type references without losing key annotations or constructor defaults", () => {
    const value = Schema.NumberFromString.annotate({ identifier: "Value" })
    const schema = Schema.toType(Schema.Struct({
      annotated: value.annotateKey({ description: "field" }),
      defaulted: value.pipe(Schema.withConstructorDefault(Effect.succeed(1))),
      required: value
    }))
    const document = Schema.toRepresentation(schema)

    assert.deepStrictEqual(Object.keys(document.references), ["Value"])
    assert.strictEqual(document.representation._tag, "Objects")
    if (document.representation._tag !== "Objects") return
    assert.deepStrictEqual(document.representation.propertySignatures[0], {
      name: "annotated",
      type: { _tag: "Reference", $ref: "Value" },
      isOptional: false,
      isMutable: false,
      annotations: { description: "field" }
    })
    assert.deepStrictEqual(schema.make({ annotated: 2, required: 3 }), { annotated: 2, defaulted: 1, required: 3 })
  })

  it("keeps projected checks and value annotations distinct from the source", () => {
    const value = Schema.optionalKey(Schema.NumberFromString).annotate({ identifier: "Value" })
    const checked = value.check(Schema.isGreaterThan(0))
    const annotated = value.annotate({ description: "another value" })
    const document = SchemaRepresentation.toRepresentations([
      SchemaAST.toType(value.ast),
      SchemaAST.toType(checked.ast),
      SchemaAST.toType(annotated.ast)
    ])

    assert.deepStrictEqual(document.representations[0], { _tag: "Reference", $ref: "Value" })
    assert.strictEqual(document.representations[1]._tag, "Number")
    if (document.representations[1]._tag !== "Number") return
    assert.strictEqual(document.representations[1].checks.length, 1)
    assert.deepStrictEqual(document.representations[2], { _tag: "Reference", $ref: "Value_1" })
    assert.deepStrictEqual(document.references.Value, {
      _tag: "Number",
      annotations: { identifier: "Value" },
      checks: []
    })
    assert.deepStrictEqual(document.references.Value_1, {
      _tag: "Number",
      annotations: { identifier: "Value_1", description: "another value" },
      checks: []
    })
  })

  describe("reference policies", () => {
    it("exposes the projected body and counts contextual copies together", () => {
      const value = Schema.NumberFromString.annotate({ identifier: "Value" })
      const inputs: Array<SchemaRepresentation.ReferencePolicyInput> = []
      const document = SchemaRepresentation.toRepresentations([
        SchemaAST.toType(Schema.optionalKey(value).ast),
        SchemaAST.toType(value.ast)
      ], {
        referencePolicy: (input) => {
          inputs.push(input)
          return SchemaAST.getLastEncoding(input.ast)._tag
        }
      })

      assert.strictEqual(inputs.length, 1)
      assert.strictEqual(inputs[0].occurrences, 2)
      assert.strictEqual(inputs[0].ast.encoding, undefined)
      assert.deepStrictEqual(document, {
        representations: [
          { _tag: "Reference", $ref: "Number" },
          { _tag: "Reference", $ref: "Number" }
        ],
        references: {
          Number: { _tag: "Number", annotations: { identifier: "Number" }, checks: [] }
        }
      })
    })

    it("supports policies based on occurrence counts", () => {
      const shared = Schema.Struct({ value: Schema.String })
      const equivalent = Schema.Struct({ value: Schema.String })
      const referencePolicy: SchemaRepresentation.ReferencePolicy = ({ ast, occurrences }) =>
        occurrences > 1 ? `${ast._tag}_` : undefined

      const single = SchemaRepresentation.toRepresentations([shared.ast], { referencePolicy })
      const distinct = SchemaRepresentation.toRepresentations([shared.ast, equivalent.ast], {
        referencePolicy: ({ ast, occurrences }) =>
          ast._tag === "Objects" && occurrences > 1 ? `${ast._tag}_` : undefined
      })
      const repeated = SchemaRepresentation.toRepresentations([shared.ast, shared.ast], { referencePolicy })

      assert.deepStrictEqual(single.references, {})
      assert.deepStrictEqual(distinct.references, {})
      assert.deepStrictEqual(repeated.representations, [
        { _tag: "Reference", $ref: "Objects_" },
        { _tag: "Reference", $ref: "Objects_" }
      ])
      assert.deepStrictEqual(Object.keys(repeated.references), ["Objects_"])
    })

    it("suffixes policy name collisions", () => {
      const first = Schema.Struct({ first: Schema.String })
      const second = Schema.Struct({ second: Schema.String })
      const document = SchemaRepresentation.toRepresentations([first.ast, second.ast], {
        referencePolicy: ({ ast }) => ast._tag === "Objects" ? "Model" : undefined
      })

      assert.deepStrictEqual(document.representations, [
        { _tag: "Reference", $ref: "Model" },
        { _tag: "Reference", $ref: "Model_1" }
      ])
      assert.deepStrictEqual(Object.keys(document.references), ["Model", "Model_1"])
    })

    it("distinguishes identifiers that share the same encoded AST owner", () => {
      const first = Schema.NumberFromString.annotate({ identifier: "First" })
      const second = Schema.NumberFromString.annotate({ identifier: "Second" })
      const inputs: Array<SchemaRepresentation.ReferencePolicyInput> = []
      const document = SchemaRepresentation.toRepresentations([first.ast, second.ast], {
        referencePolicy: (input) => {
          inputs.push(input)
          return input.identifier
        }
      })

      assert.deepStrictEqual(document.representations, [
        { _tag: "Reference", $ref: "FirstEncoded" },
        { _tag: "Reference", $ref: "SecondEncoded" }
      ])
      assert.deepStrictEqual(Object.keys(document.references), ["FirstEncoded", "SecondEncoded"])
      assert.deepStrictEqual(inputs.map(({ identifier, occurrences }) => ({ identifier, occurrences })), [
        { identifier: "FirstEncoded", occurrences: 1 },
        { identifier: "SecondEncoded", occurrences: 1 }
      ])
      assert.strictEqual(inputs[0].ast, inputs[1].ast)
    })
  })

  describe("identifier collisions", () => {
    it("suffixes different schemas with the same identifier", () => {
      const first = Schema.String.annotate({ identifier: "Value", description: "first" })
      const second = Schema.Number.annotate({ identifier: "Value", description: "second" })

      assert.deepStrictEqual(
        SchemaRepresentation.toRepresentations([first.ast, second.ast]),
        {
          representations: [
            { _tag: "Reference", $ref: "Value" },
            { _tag: "Reference", $ref: "Value_1" }
          ],
          references: {
            Value: {
              _tag: "String",
              annotations: { identifier: "Value", description: "first" },
              checks: []
            },
            Value_1: {
              _tag: "Number",
              annotations: { identifier: "Value_1", description: "second" },
              checks: []
            }
          }
        }
      )
    })

    it("suffixes referentially distinct ASTs with equal representations", () => {
      const first = Schema.String.annotate({ identifier: "Value" })
      const second = Schema.String.annotate({ identifier: "Value" })

      assert.deepStrictEqual(
        SchemaRepresentation.toRepresentations([first.ast, second.ast]),
        {
          representations: [
            { _tag: "Reference", $ref: "Value" },
            { _tag: "Reference", $ref: "Value_1" }
          ],
          references: {
            Value: {
              _tag: "String",
              annotations: { identifier: "Value" },
              checks: []
            },
            Value_1: {
              _tag: "String",
              annotations: { identifier: "Value_1" },
              checks: []
            }
          }
        }
      )
    })

    it("suffixes fallback and explicit identifier collisions in encounter order", () => {
      const first = Schema.String.annotate({ "~identifier": "Person" })
      const second = Schema.Number.annotate({ "~identifier": "Person" })
      const explicit = Schema.Boolean.annotate({ identifier: "PersonEncoded" })

      assert.deepStrictEqual(
        SchemaRepresentation.toRepresentations([first.ast, second.ast, explicit.ast]),
        {
          representations: [
            { _tag: "Reference", $ref: "PersonEncoded" },
            { _tag: "Reference", $ref: "PersonEncoded_1" },
            { _tag: "Reference", $ref: "PersonEncoded_2" }
          ],
          references: {
            PersonEncoded: {
              _tag: "String",
              annotations: { "~identifier": "Person" },
              checks: []
            },
            PersonEncoded_1: {
              _tag: "Number",
              annotations: { "~identifier": "Person" },
              checks: []
            },
            PersonEncoded_2: {
              _tag: "Boolean",
              annotations: { identifier: "PersonEncoded_2" },
              checks: []
            }
          }
        }
      )
    })
  })
})
