import { assert, describe, it } from "@effect/vitest"
import { Schema, SchemaAST, SchemaRepresentation } from "effect"

describe("SchemaRepresentation.toRepresentation", () => {
  describe("node conversion", () => {
    const keywords = [
      ["Null", Schema.Null],
      ["Undefined", Schema.Undefined],
      ["Void", Schema.Void],
      ["Never", Schema.Never],
      ["Unknown", Schema.Unknown],
      ["Any", Schema.Any],
      ["String", Schema.String],
      ["Number", Schema.Number],
      ["Boolean", Schema.Boolean],
      ["BigInt", Schema.BigInt],
      ["Symbol", Schema.Symbol],
      ["ObjectKeyword", Schema.ObjectKeyword]
    ] as const

    for (const [tag, schema] of keywords) {
      it(tag, () => {
        assert.deepStrictEqual(SchemaRepresentation.toRepresentation(schema.ast), {
          representation: { _tag: tag, checks: [] },
          references: {}
        })
      })
    }

    it("literal", () => {
      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(Schema.Literal("value").ast), {
        representation: { _tag: "Literal", literal: "value", checks: [] },
        references: {}
      })
    })

    it("global unique symbol", () => {
      const symbol = Symbol.for("value")
      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(Schema.UniqueSymbol(symbol).ast), {
        representation: { _tag: "UniqueSymbol", symbol, checks: [] },
        references: {}
      })
    })

    it("enum", () => {
      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(Schema.Enum({ A: "a", One: 1 }).ast), {
        representation: {
          _tag: "Enum",
          enums: [
            ["A", "a"],
            ["One", 1]
          ],
          checks: []
        },
        references: {}
      })
    })

    it("template literal", () => {
      assert.deepStrictEqual(
        SchemaRepresentation.toRepresentation(Schema.TemplateLiteral(["prefix-", Schema.String, Schema.Number]).ast),
        {
          representation: {
            _tag: "TemplateLiteral",
            parts: [
              { _tag: "Literal", literal: "prefix-", checks: [] },
              { _tag: "String", checks: [] },
              { _tag: "Number", checks: [] }
            ],
            checks: []
          },
          references: {}
        }
      )
    })

    it("tuple elements and rest", () => {
      const schema = Schema.TupleWithRest(
        Schema.Tuple([Schema.String, Schema.optionalKey(Schema.Number)]),
        [Schema.Boolean]
      )

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(schema.ast), {
        representation: {
          _tag: "Arrays",
          elements: [
            { type: { _tag: "String", checks: [] }, isOptional: false },
            { type: { _tag: "Number", checks: [] }, isOptional: true }
          ],
          rest: [{ _tag: "Boolean", checks: [] }],
          checks: []
        },
        references: {}
      })
    })

    it("object properties and index signatures", () => {
      const schema = Schema.StructWithRest(
        Schema.Struct({
          required: Schema.String,
          optional: Schema.optionalKey(Schema.Number),
          mutable: Schema.mutableKey(Schema.Boolean)
        }),
        [Schema.Record(Schema.Symbol, Schema.BigInt)]
      )

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(schema.ast), {
        representation: {
          _tag: "Objects",
          propertySignatures: [
            {
              name: "required",
              type: { _tag: "String", checks: [] },
              isOptional: false,
              isMutable: false
            },
            {
              name: "optional",
              type: { _tag: "Number", checks: [] },
              isOptional: true,
              isMutable: false
            },
            {
              name: "mutable",
              type: { _tag: "Boolean", checks: [] },
              isOptional: false,
              isMutable: true
            }
          ],
          indexSignatures: [{
            parameter: { _tag: "Symbol", checks: [] },
            type: { _tag: "BigInt", checks: [] }
          }],
          checks: []
        },
        references: {}
      })
    })

    it("union member order", () => {
      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(Schema.Union([Schema.String, Schema.BigInt]).ast), {
        representation: {
          _tag: "Union",
          types: [
            { _tag: "String", checks: [] },
            { _tag: "BigInt", checks: [] }
          ],
          checks: []
        },
        references: {}
      })
    })

    it("preserves supplied Union options and omits absent options", () => {
      const unionOptions: SchemaAST.UnionOptions = { mode: "oneOf" }
      const union = SchemaRepresentation.toRepresentation(
        new SchemaAST.Union([Schema.String.ast, Schema.Number.ast], unionOptions)
      ).representation

      assert.strictEqual(union._tag, "Union")
      if (union._tag === "Union") assert.strictEqual(union.options, unionOptions)

      const withoutOptions = SchemaRepresentation.toRepresentation(
        Schema.Union([Schema.String, Schema.Number]).ast
      ).representation
      assert.strictEqual(withoutOptions._tag, "Union")
      assert.isFalse(Object.hasOwn(withoutOptions, "options"))
    })
  })

  describe("encoded and type projections", () => {
    it("uses the encoded side of a transformation", () => {
      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(Schema.NumberFromString.ast), {
        representation: {
          _tag: "String",
          annotations: { expected: "a string that will be decoded as a number" },
          checks: []
        },
        references: {}
      })
    })

    it("uses a type-side identifier as a fallback for the encoded representation", () => {
      const schema = Schema.NumberFromString.annotate({ identifier: "Finite" })

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(schema.ast), {
        representation: { _tag: "Reference", $ref: "FiniteEncoded" },
        references: {
          FiniteEncoded: {
            _tag: "String",
            annotations: {
              expected: "a string that will be decoded as a number",
              "~identifier": "Finite"
            },
            checks: []
          }
        }
      })
    })

    it("prefers an explicit encoded-side identifier over a type-side identifier", () => {
      const schema = Schema.NumberFromString.pipe(
        Schema.annotateEncoded({ identifier: "EncodedFinite" }),
        Schema.annotate({ identifier: "Finite" })
      )

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(schema.ast), {
        representation: { _tag: "Reference", $ref: "EncodedFinite" },
        references: {
          EncodedFinite: {
            _tag: "String",
            annotations: {
              expected: "a string that will be decoded as a number",
              identifier: "EncodedFinite"
            },
            checks: []
          }
        }
      })
    })

    it("overrides an encoded-side fallback with the type-side identifier", () => {
      const schema = Schema.NumberFromString.pipe(
        Schema.annotateEncoded({ "~identifier": "Previous" }),
        Schema.annotate({ identifier: "Finite" })
      )

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(schema.ast), {
        representation: { _tag: "Reference", $ref: "FiniteEncoded" },
        references: {
          FiniteEncoded: {
            _tag: "String",
            annotations: {
              expected: "a string that will be decoded as a number",
              "~identifier": "Finite"
            },
            checks: []
          }
        }
      })
    })

    it("uses the type side when the caller projects it", () => {
      assert.deepStrictEqual(
        SchemaRepresentation.toRepresentation(SchemaAST.toType(Schema.NumberFromString.ast)),
        {
          representation: { _tag: "Number", checks: [] },
          references: {}
        }
      )
    })
  })

  describe("schema annotations and declarations", () => {
    it("omits brands", () => {
      assert.deepStrictEqual(
        SchemaRepresentation.toRepresentation(Schema.String.pipe(Schema.brand("A"), Schema.brand("B")).ast),
        {
          representation: { _tag: "String", checks: [] },
          references: {}
        }
      )
    })

    it("preserves declaration code callbacks", () => {
      const toCode: SchemaRepresentation.Generation.Declaration = () => ({ runtime: "Custom", Type: "string" })
      const schema = Schema.declare<string>((input): input is string => typeof input === "string", {
        representation: {
          id: "acme/schema/Custom",
          payload: null
        },
        toCode
      })

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(schema.ast), {
        representation: {
          _tag: "Declaration",
          typeParameters: [],
          checks: [],
          representation: {
            id: "acme/schema/Custom",
            payload: null
          },
          annotations: {
            toCode
          }
        },
        references: {}
      })
    })

    it("converts declaration type parameters", () => {
      const representation = SchemaRepresentation.toRepresentation(Schema.Option(Schema.Number).ast).representation

      assert.strictEqual(representation._tag, "Declaration")
      if (representation._tag !== "Declaration") return
      assert.deepStrictEqual(representation.typeParameters, [{ _tag: "Number", checks: [] }])
    })
  })

  describe("checks", () => {
    it("preserves custom filter callbacks, dependencies and aborted state", () => {
      const toCode: SchemaRepresentation.Generation.Check = () => ({ runtime: "Custom" })
      const toJsonSchema: SchemaRepresentation.ToJsonSchema.Check = () => ({ minLength: 1 })
      const marker = () => "marker"
      const filter = Schema.makeFilter<string>(() => true, {
        representation: {
          id: "acme/schema/Custom",
          payload: { minimum: 1 },
          schemas: [Schema.Number.ast]
        },
        toCode,
        toJsonSchema,
        marker
      }).abort()

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(Schema.String.check(filter).ast), {
        representation: {
          _tag: "String",
          checks: [{
            _tag: "Filter",
            representation: {
              id: "acme/schema/Custom",
              payload: { minimum: 1 },
              schemas: [{ _tag: "Number", checks: [] }]
            },
            annotations: {
              toCode,
              toJsonSchema,
              marker
            },
            aborted: true
          }]
        },
        references: {}
      })
    })

    it("preserves filters without persistence metadata", () => {
      const filter = Schema.makeFilter<string>(() => true, { expected: "custom" })

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(Schema.String.check(filter).ast), {
        representation: {
          _tag: "String",
          checks: [{
            _tag: "Filter",
            annotations: { expected: "custom" },
            aborted: false
          }]
        },
        references: {}
      })
    })

    it("preserves a filter without annotations", () => {
      const filter = Schema.makeFilter<string>(() => true)

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(Schema.String.check(filter).ast), {
        representation: {
          _tag: "String",
          checks: [{ _tag: "Filter", aborted: false }]
        },
        references: {}
      })
    })

    it("preserves filter groups", () => {
      const first = Schema.makeFilter<string>(() => true, { expected: "first" })
      const second = Schema.makeFilter<string>(() => true, { expected: "second" })
      const group = Schema.makeFilterGroup([first, second], { description: "group" })

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(Schema.String.check(group).ast), {
        representation: {
          _tag: "String",
          checks: [{
            _tag: "FilterGroup",
            annotations: { description: "group" },
            checks: [
              { _tag: "Filter", annotations: { expected: "first" }, aborted: false },
              { _tag: "Filter", annotations: { expected: "second" }, aborted: false }
            ]
          }]
        },
        references: {}
      })
    })

    it("converts representation dependencies of built-in filters", () => {
      const schema = Schema.Record(Schema.String, Schema.Number).check(
        Schema.isPropertyNames(Schema.String.check(Schema.isPattern(/^[A-Z]/)))
      )
      const representation = SchemaRepresentation.toRepresentation(schema.ast).representation

      assert.strictEqual(representation._tag, "Objects")
      if (representation._tag !== "Objects") return
      const check = representation.checks[0]
      assert.strictEqual(check._tag, "Filter")
      if (check._tag !== "Filter") return
      const dependency = check.representation?.schemas?.[0]
      assert.isDefined(dependency)
      assert.deepStrictEqual(
        SchemaRepresentation.toJson({ representation: dependency, references: {} }),
        {
          representation: {
            _tag: "String",
            checks: [{
              _tag: "Filter",
              representation: {
                id: "effect/schema/isPattern",
                payload: { source: "^[A-Z]", flags: "" }
              },
              annotations: {
                expected: "a string matching the RegExp ^[A-Z]",
                arbitraryConstraint: { patterns: [{ source: "^[A-Z]", flags: "" }] }
              },
              aborted: false
            }]
          },
          references: {}
        }
      )
    })

    it("extracts shared representation dependencies of filters", () => {
      const shared = Schema.Struct({ value: Schema.String })
      const filter = Schema.makeFilter<string>(() => true, {
        representation: {
          id: "acme/schema/Custom",
          payload: null,
          schemas: [shared.ast, shared.ast]
        }
      })
      const document = SchemaRepresentation.toRepresentation(Schema.String.check(filter).ast, {
        referencePolicy: ({ ast, occurrences }) => occurrences > 1 ? `${ast._tag}_` : undefined
      })
      const representation = document.representation

      assert.strictEqual(representation._tag, "String")
      if (representation._tag !== "String") return
      assert.deepStrictEqual(representation.checks[0].representation?.schemas, [
        { _tag: "Reference", $ref: "Objects_" },
        { _tag: "Reference", $ref: "Objects_" }
      ])
      assert.deepStrictEqual(Object.keys(document.references), ["Objects_"])
    })

    it("converts checks on arrays", () => {
      const representation = SchemaRepresentation.toRepresentation(
        Schema.Array(Schema.String).check(Schema.isMinLength(1)).ast
      ).representation

      assert.strictEqual(representation._tag, "Arrays")
      if (representation._tag !== "Arrays") return
      assert.strictEqual(representation.checks.length, 1)
      assert.deepStrictEqual(representation.checks[0].representation, {
        id: "effect/schema/isMinLength",
        payload: { minLength: 1 }
      })
    })

    it("converts checks on objects", () => {
      const representation = SchemaRepresentation.toRepresentation(
        Schema.Record(Schema.String, Schema.Number).check(Schema.isMinProperties(1)).ast
      ).representation

      assert.strictEqual(representation._tag, "Objects")
      if (representation._tag !== "Objects") return
      assert.strictEqual(representation.checks.length, 1)
      assert.deepStrictEqual(representation.checks[0].representation, {
        id: "effect/schema/isMinProperties",
        payload: { minProperties: 1 }
      })
    })
  })

  describe("contextual annotations", () => {
    it("preserves fromJsonString annotations", () => {
      const schema = SchemaAST.toEncoded(Schema.fromJsonString(Schema.Struct({ value: Schema.Number })).ast)
      const document = SchemaRepresentation.toRepresentation(schema)

      assert.deepStrictEqual(document, {
        representation: {
          _tag: "String",
          annotations: {
            contentMediaType: "application/json",
            expected: "a string that will be decoded as JSON"
          },
          checks: []
        },
        references: {}
      })
    })

    it("preserves tuple element annotations", () => {
      const marker = () => "element"
      const schema = Schema.Tuple([Schema.String.annotateKey({ description: "element", marker })])

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(schema.ast), {
        representation: {
          _tag: "Arrays",
          elements: [{
            type: { _tag: "String", checks: [] },
            isOptional: false,
            annotations: { description: "element", marker }
          }],
          rest: [],
          checks: []
        },
        references: {}
      })
    })

    it("preserves property annotations", () => {
      const marker = () => "property"
      const schema = Schema.Struct({
        value: Schema.String.annotateKey({ description: "property", marker })
      })

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(schema.ast), {
        representation: {
          _tag: "Objects",
          propertySignatures: [{
            name: "value",
            type: { _tag: "String", checks: [] },
            isOptional: false,
            isMutable: false,
            annotations: { description: "property", marker }
          }],
          indexSignatures: [],
          checks: []
        },
        references: {}
      })
    })
  })

  describe("reference policies", () => {
    it("extracts only candidates with identifiers by default", () => {
      const anonymous = Schema.Struct({ value: Schema.String })
      const identified = Schema.Struct({ value: Schema.String }).annotate({ identifier: "Identified" })
      const document = SchemaRepresentation.toRepresentation(
        Schema.Tuple([anonymous, identified]).ast
      )

      assert.deepStrictEqual(Object.keys(document.references), ["Identified"])
      assert.strictEqual(document.representation._tag, "Arrays")
      if (document.representation._tag === "Arrays") {
        assert.deepStrictEqual(document.representation.elements.map((element) => element.type._tag), [
          "Objects",
          "Reference"
        ])
      }
    })

    it("allows a policy to inline an explicitly identified schema", () => {
      const schema = Schema.String.annotate({ identifier: "Value" })

      assert.deepStrictEqual(
        SchemaRepresentation.toRepresentation(schema.ast, { referencePolicy: () => undefined }),
        {
          representation: {
            _tag: "String",
            annotations: { identifier: "Value" },
            checks: []
          },
          references: {}
        }
      )
    })

    it("forces a synthetic reference when a policy inlines a recursive schema", () => {
      interface Node {
        readonly next?: Node
      }
      const Node = Schema.Struct({
        next: Schema.optionalKey(Schema.suspend((): Schema.Codec<Node> => Node))
      }).annotate({ identifier: "Node" })
      const document = SchemaRepresentation.toRepresentation(Node.ast, {
        referencePolicy: () => undefined
      })

      assert.deepStrictEqual(document.representation, { _tag: "Reference", $ref: "Objects_" })
      assert.deepStrictEqual(Object.keys(document.references), ["Objects_"])
    })
  })

  describe("reference allocation and recursion", () => {
    it("extracts a named schema into references", () => {
      const schema = Schema.String.annotate({ identifier: "Value", description: "value" })

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(schema.ast), {
        representation: { _tag: "Reference", $ref: "Value" },
        references: {
          Value: {
            _tag: "String",
            annotations: { identifier: "Value", description: "value" },
            checks: []
          }
        }
      })
    })

    it("supports __proto__ as an identifier", () => {
      const document = SchemaRepresentation.toRepresentation(
        Schema.String.annotate({ identifier: "__proto__" }).ast
      )

      assert.deepStrictEqual(document.representation, { _tag: "Reference", $ref: "__proto__" })
      assert.deepStrictEqual(Object.keys(document.references), ["__proto__"])
      assert.strictEqual(Object.getPrototypeOf(document.references), Object.prototype)
      assert.isTrue(Object.hasOwn(document.references, "__proto__"))
      assert.strictEqual(document.references["__proto__"]._tag, "String")
    })

    it("converts a non-recursive suspend", () => {
      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(Schema.suspend(() => Schema.String).ast), {
        representation: {
          _tag: "Suspend",
          thunk: { _tag: "String", checks: [] },
          checks: []
        },
        references: {}
      })
    })

    it("uses an outer identifier for a recursive schema", () => {
      interface Node {
        readonly next?: Node
      }
      const Node = Schema.Struct({
        next: Schema.optionalKey(Schema.suspend((): Schema.Codec<Node> => Node))
      }).annotate({ identifier: "Node" })

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(Node.ast), {
        representation: { _tag: "Reference", $ref: "Node" },
        references: {
          Node: {
            _tag: "Objects",
            annotations: { identifier: "Node" },
            propertySignatures: [{
              name: "next",
              type: {
                _tag: "Suspend",
                thunk: { _tag: "Reference", $ref: "Node" },
                checks: []
              },
              isOptional: true,
              isMutable: false
            }],
            indexSignatures: [],
            checks: []
          }
        }
      })
    })

    it("suffixes duplicate identifiers on recursive schemas", () => {
      interface First {
        readonly next?: First
      }
      const First = Schema.Struct({
        next: Schema.optionalKey(Schema.suspend((): Schema.Codec<First> => First))
      }).annotate({ identifier: "Node" })
      interface Second {
        readonly next?: Second
      }
      const Second = Schema.Struct({
        next: Schema.optionalKey(Schema.suspend((): Schema.Codec<Second> => Second))
      }).annotate({ identifier: "Node" })

      assert.deepStrictEqual(
        SchemaRepresentation.toRepresentation(Schema.Tuple([First, Second]).ast),
        {
          representation: {
            _tag: "Arrays",
            elements: [
              { isOptional: false, type: { _tag: "Reference", $ref: "Node" } },
              { isOptional: false, type: { _tag: "Reference", $ref: "Node_1" } }
            ],
            rest: [],
            checks: []
          },
          references: {
            Node: {
              _tag: "Objects",
              propertySignatures: [{
                name: "next",
                type: {
                  _tag: "Suspend",
                  checks: [],
                  thunk: { _tag: "Reference", $ref: "Node" }
                },
                isOptional: true,
                isMutable: false
              }],
              indexSignatures: [],
              checks: [],
              annotations: { identifier: "Node" }
            },
            Node_1: {
              _tag: "Objects",
              propertySignatures: [{
                name: "next",
                type: {
                  _tag: "Suspend",
                  checks: [],
                  thunk: { _tag: "Reference", $ref: "Node_1" }
                },
                isOptional: true,
                isMutable: false
              }],
              indexSignatures: [],
              checks: [],
              annotations: { identifier: "Node_1" }
            }
          }
        }
      )
    })

    it("does not resolve an identifier below a check", () => {
      const schema = Schema.String
        .annotate({ identifier: "Text" })
        .pipe(Schema.check(Schema.isMinLength(1)))
      const document = SchemaRepresentation.toRepresentation(schema.ast)

      assert.strictEqual(document.representation._tag, "String")
      assert.deepStrictEqual(document.references, {})
      if (document.representation._tag === "String") {
        assert.deepStrictEqual(document.representation.annotations, { identifier: "Text" })
        assert.strictEqual(document.representation.checks.length, 1)
        assert.strictEqual(document.representation.checks[0].representation?.id, "effect/schema/isMinLength")
      }
    })

    it("uses a fallback identifier for encoded representations", () => {
      const schema = Schema.String.annotate({ "~identifier": "Person" })

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(schema.ast), {
        representation: { _tag: "Reference", $ref: "PersonEncoded" },
        references: {
          PersonEncoded: {
            _tag: "String",
            checks: [],
            annotations: { "~identifier": "Person" }
          }
        }
      })
    })

    it("prefers an identifier over a fallback identifier", () => {
      const schema = Schema.String.annotate({ identifier: "EncodedPerson", "~identifier": "Person" })
      const document = SchemaRepresentation.toRepresentation(schema.ast)

      assert.deepStrictEqual(document.representation, { _tag: "Reference", $ref: "EncodedPerson" })
      assert.deepStrictEqual(Object.keys(document.references), ["EncodedPerson"])
    })

    it("reuses a Class identifier across repeated type-side occurrences", () => {
      class User extends Schema.Class<User>("User")({ name: Schema.String }) {}

      const document = SchemaRepresentation.toRepresentation(SchemaAST.toType(Schema.Tuple([User, User]).ast))
      assert.deepStrictEqual(document.representation, {
        _tag: "Arrays",
        elements: [
          { type: { _tag: "Reference", $ref: "User" }, isOptional: false },
          { type: { _tag: "Reference", $ref: "User" }, isOptional: false }
        ],
        rest: [],
        checks: []
      })
      assert.deepStrictEqual(Object.keys(document.references), ["User"])
    })

    it("extracts anonymous recursion into references", () => {
      let schema: Schema.Codec<unknown>
      schema = Schema.suspend((): Schema.Codec<unknown> => schema)

      assert.deepStrictEqual(SchemaRepresentation.toRepresentation(schema.ast), {
        representation: { _tag: "Reference", $ref: "Suspend_" },
        references: {
          Suspend_: {
            _tag: "Suspend",
            thunk: { _tag: "Reference", $ref: "Suspend_" },
            checks: []
          }
        }
      })
    })
  })
})
