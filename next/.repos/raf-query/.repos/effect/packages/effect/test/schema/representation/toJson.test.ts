import { assert, describe, it } from "@effect/vitest"
import { Schema, SchemaAST, SchemaRepresentation } from "effect"
import { throws } from "../../utils/assert.ts"

function makeStringProperty<const Name>(name: Name) {
  return {
    name,
    type: { _tag: "String", checks: [] },
    isOptional: false,
    isMutable: false
  } as const
}

function assertToJson(
  representation: SchemaRepresentation.Representation,
  jsonRepresentation: Schema.Json
): void {
  assert.deepStrictEqual(
    SchemaRepresentation.toJson({ representation, references: {} }),
    { representation: jsonRepresentation, references: {} }
  )
}

function assertRoundtrip(
  representation: SchemaRepresentation.Representation,
  jsonRepresentation: Schema.Json
): void {
  const document: SchemaRepresentation.Document = { representation, references: {} }
  const json: Schema.Json = { representation: jsonRepresentation, references: {} }
  assertToJson(representation, jsonRepresentation)
  assert.deepStrictEqual(SchemaRepresentation.fromJson(json), document)
}

describe("SchemaRepresentation.toJson", () => {
  it("rejects invalid documents", () => {
    throws(
      () =>
        SchemaRepresentation.toJson({
          representation: { _tag: "Reference", $ref: "" },
          references: {}
        }),
      `Expected a value with a length of at least 1\n  at ["representation"]["$ref"]`
    )
  })

  it("rejects checks on Suspend representations", () => {
    throws(
      () =>
        SchemaRepresentation.toJson({
          representation: {
            _tag: "Suspend",
            checks: [null],
            thunk: { _tag: "String", checks: [] }
          } as never,
          references: {}
        }),
      `Expected no excess property\n  at ["representation"]["checks"][0]`
    )
  })

  it("requires representation when persisting a Filter", () => {
    throws(
      () =>
        SchemaRepresentation.toJson({
          representation: { _tag: "String", checks: [{ _tag: "Filter", aborted: false }] },
          references: {}
        }),
      `Missing key\n  at ["representation"]["checks"][0]["representation"]`
    )
  })

  it("removes live callbacks and preserves JSON annotations from a custom filter", () => {
    const filter = Schema.makeFilter<string>(() => true, {
      description: "custom",
      callback: () => "live",
      representation: {
        id: "acme/schema/custom",
        payload: { minimum: 1 },
        schemas: [Schema.Number.ast]
      },
      toCode: () => ({ runtime: "Custom" }),
      toJsonSchema: () => ({ minLength: 1 }),
      arbitraryConstraint: { minLength: 1 }
    }).abort()

    assert.deepStrictEqual(
      SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(Schema.String.check(filter).ast)),
      {
        representation: {
          _tag: "String",
          checks: [{
            _tag: "Filter",
            representation: {
              id: "acme/schema/custom",
              payload: { minimum: 1 },
              schemas: [{ _tag: "Number", checks: [] }]
            },
            annotations: {
              description: "custom",
              arbitraryConstraint: { minLength: 1 }
            },
            aborted: true
          }]
        },
        references: {}
      }
    )
  })

  it("removes live callbacks from a custom declaration", () => {
    const schema = Schema.declare<string>((input): input is string => typeof input === "string", {
      description: "custom",
      representation: { id: "acme/schema/custom", payload: null },
      toCode: () => ({ runtime: "Custom", Type: "string" }),
      toJsonSchema: () => ({ type: "string" })
    })

    assert.deepStrictEqual(
      SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(schema.ast)),
      {
        representation: {
          _tag: "Declaration",
          representation: { id: "acme/schema/custom", payload: null },
          annotations: {
            description: "custom"
          },
          typeParameters: [],
          checks: []
        },
        references: {}
      }
    )
  })

  it("preserves JSON annotations", () => {
    const document = SchemaRepresentation.toRepresentation(
      Schema.String.annotate({ values: ["1", "Symbol(a)", "NaN"] }).ast
    )

    assert.deepStrictEqual(SchemaRepresentation.toJson(document), {
      representation: {
        _tag: "String",
        annotations: { values: ["1", "Symbol(a)", "NaN"] },
        checks: []
      },
      references: {}
    })
  })

  it("omits annotations containing only non-JSON values", () => {
    assertToJson(
      {
        _tag: "String",
        annotations: { callback: () => "live" },
        checks: []
      },
      { _tag: "String", checks: [] }
    )
  })

  it("omits undefined annotations", () => {
    assertToJson(
      {
        _tag: "String",
        annotations: undefined,
        checks: []
      },
      { _tag: "String", checks: [] }
    )
  })

  it("prunes nested representation annotations", () => {
    assertToJson(
      {
        _tag: "Union",
        types: [{
          _tag: "String",
          annotations: {
            title: "nested",
            callback: () => "live"
          },
          checks: []
        }],
        options: { mode: "anyOf" },
        checks: []
      },
      {
        _tag: "Union",
        types: [{
          _tag: "String",
          annotations: { title: "nested" },
          checks: []
        }],
        options: { mode: "anyOf" },
        checks: []
      }
    )
  })

  it("prunes annotations in check schema dependencies", () => {
    assertToJson(
      {
        _tag: "String",
        checks: [{
          _tag: "Filter",
          representation: {
            id: "acme/schema/custom",
            payload: null,
            schemas: [{
              _tag: "Number",
              annotations: {
                title: "dependency",
                callback: () => "live"
              },
              checks: []
            }]
          },
          aborted: false
        }]
      },
      {
        _tag: "String",
        checks: [{
          _tag: "Filter",
          representation: {
            id: "acme/schema/custom",
            payload: null,
            schemas: [{
              _tag: "Number",
              annotations: { title: "dependency" },
              checks: []
            }]
          },
          aborted: false
        }]
      }
    )
  })

  it("preserves __proto__ annotations as data properties", () => {
    const annotations: Record<string, unknown> = {}
    Object.defineProperty(annotations, "__proto__", {
      value: "safe",
      enumerable: true
    })

    assertToJson(
      {
        _tag: "String",
        annotations,
        checks: []
      },
      {
        _tag: "String",
        annotations: JSON.parse(`{"__proto__":"safe"}`),
        checks: []
      }
    )
  })

  it("preserves shared JSON annotation values", () => {
    const shared = { value: "shared" }
    const document = SchemaRepresentation.toRepresentation(
      Schema.String.annotate({ value: { left: shared, right: shared } }).ast
    )

    assert.deepStrictEqual(SchemaRepresentation.toJson(document), {
      representation: {
        _tag: "String",
        annotations: {
          value: {
            left: { value: "shared" },
            right: { value: "shared" }
          }
        },
        checks: []
      },
      references: {}
    })
  })

  it("omits a cyclic annotation atomically", () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    const document = SchemaRepresentation.toRepresentation(
      Schema.String.annotate({ cyclic, title: "kept" }).ast
    )

    assert.deepStrictEqual(SchemaRepresentation.toJson(document), {
      representation: {
        _tag: "String",
        annotations: { title: "kept" },
        checks: []
      },
      references: {}
    })
  })

  it("omits a sparse-array annotation atomically", () => {
    const sparse = new Array<unknown>(1)
    const document = SchemaRepresentation.toRepresentation(
      Schema.String.annotate({ sparse, title: "kept" }).ast
    )

    assert.deepStrictEqual(SchemaRepresentation.toJson(document), {
      representation: {
        _tag: "String",
        annotations: { title: "kept" },
        checks: []
      },
      references: {}
    })
  })

  it("omits an annotation containing bigint atomically", () => {
    const document = SchemaRepresentation.toRepresentation(
      Schema.String.annotate({ invalid: { value: 1n }, title: "kept" }).ast
    )

    assert.deepStrictEqual(SchemaRepresentation.toJson(document), {
      representation: {
        _tag: "String",
        annotations: { title: "kept" },
        checks: []
      },
      references: {}
    })
  })

  it("omits an annotation containing undefined atomically", () => {
    const document = SchemaRepresentation.toRepresentation(
      Schema.String.annotate({ invalid: { value: undefined }, title: "kept" }).ast
    )

    assert.deepStrictEqual(SchemaRepresentation.toJson(document), {
      representation: {
        _tag: "String",
        annotations: { title: "kept" },
        checks: []
      },
      references: {}
    })
  })

  it("encodes annotation accessors", () => {
    const accessor = {}
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get() {
        return "value"
      }
    })
    const document = SchemaRepresentation.toRepresentation(Schema.String.annotate({ accessor }).ast)

    assert.deepStrictEqual(SchemaRepresentation.toJson(document), {
      representation: {
        _tag: "String",
        annotations: { accessor: { value: "value" } },
        checks: []
      },
      references: {}
    })
  })

  it("preserves filter groups without an identity", () => {
    const first = Schema.makeFilter<string>(() => true, {
      representation: { id: "acme/schema/first", payload: null }
    })
    const second = Schema.makeFilter<string>(() => true, {
      representation: { id: "acme/schema/second", payload: null }
    }).abort()
    const group = Schema.makeFilterGroup([first, second], { description: "both" })

    assert.deepStrictEqual(
      SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(Schema.String.check(group).ast)),
      {
        representation: {
          _tag: "String",
          checks: [{
            _tag: "FilterGroup",
            annotations: { description: "both" },
            checks: [
              {
                _tag: "Filter",
                representation: { id: "acme/schema/first", payload: null },
                aborted: false
              },
              {
                _tag: "Filter",
                representation: { id: "acme/schema/second", payload: null },
                aborted: true
              }
            ]
          }]
        },
        references: {}
      }
    )
  })

  it("preserves tuple element annotations independently", () => {
    const schema = Schema.Tuple([
      Schema.String.annotateKey({ description: "element", callback: () => "live" })
    ])

    assert.deepStrictEqual(
      SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(schema.ast)),
      {
        representation: {
          _tag: "Arrays",
          elements: [{
            type: { _tag: "String", checks: [] },
            isOptional: false,
            annotations: { description: "element" }
          }],
          rest: [],
          checks: []
        },
        references: {}
      }
    )
  })

  it("preserves property annotations independently", () => {
    const schema = Schema.Struct({
      value: Schema.String.annotateKey({ description: "property", callback: () => "live" })
    })

    assert.deepStrictEqual(
      SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(schema.ast)),
      {
        representation: {
          _tag: "Objects",
          propertySignatures: [{
            name: { type: "string", value: "value" },
            type: { _tag: "String", checks: [] },
            isOptional: false,
            isMutable: false,
            annotations: { description: "property" }
          }],
          indexSignatures: [],
          checks: []
        },
        references: {}
      }
    )
  })

  it("encodes bigint structural values", () => {
    assert.deepStrictEqual(
      SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(Schema.Literal(1n).ast)),
      {
        representation: {
          _tag: "Literal",
          literal: { type: "bigint", value: "1" },
          checks: []
        },
        references: {}
      }
    )
  })

  it("preserves ambiguous Enum values", () => {
    assertRoundtrip(
      {
        _tag: "Enum",
        enums: [
          ["StringNaN", "NaN"],
          ["NumberNaN", Number.NaN],
          ["StringInfinity", "Infinity"],
          ["NumberInfinity", Number.POSITIVE_INFINITY]
        ],
        checks: []
      },
      {
        _tag: "Enum",
        enums: [
          ["StringNaN", { type: "string", value: "NaN" }],
          ["NumberNaN", { type: "number", value: "NaN" }],
          ["StringInfinity", { type: "string", value: "Infinity" }],
          ["NumberInfinity", { type: "number", value: "Infinity" }]
        ],
        checks: []
      }
    )
  })

  it("preserves ambiguous property names", () => {
    const globalSymbol = Symbol.for("acme/schema/key")
    assertRoundtrip(
      {
        _tag: "Objects",
        propertySignatures: [
          makeStringProperty("1"),
          makeStringProperty(1),
          makeStringProperty("Symbol(acme/schema/key)"),
          makeStringProperty(globalSymbol)
        ],
        indexSignatures: [],
        checks: []
      },
      {
        _tag: "Objects",
        propertySignatures: [
          makeStringProperty({ type: "string", value: "1" }),
          makeStringProperty({ type: "number", value: 1 }),
          makeStringProperty({ type: "string", value: "Symbol(acme/schema/key)" }),
          makeStringProperty({ type: "symbol", value: "Symbol(acme/schema/key)" })
        ],
        indexSignatures: [],
        checks: []
      }
    )
  })

  it("preserves string literals resembling non-finite numbers", () => {
    for (const literal of ["NaN", "Infinity", "-Infinity"]) {
      assert.deepStrictEqual(
        SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(Schema.Literal(literal).ast)),
        {
          representation: { _tag: "Literal", literal: { type: "string", value: literal }, checks: [] },
          references: {}
        }
      )
    }
  })

  it("encodes global symbols", () => {
    assert.deepStrictEqual(
      SchemaRepresentation.toJson(
        SchemaRepresentation.toRepresentation(Schema.UniqueSymbol(Symbol.for("acme/schema/key")).ast)
      ),
      {
        representation: {
          _tag: "UniqueSymbol",
          symbol: "Symbol(acme/schema/key)",
          checks: []
        },
        references: {}
      }
    )
  })

  it("rejects local symbols", () => {
    throws(
      () =>
        SchemaRepresentation.toJson(
          SchemaRepresentation.toRepresentation(Schema.UniqueSymbol(Symbol("local")).ast)
        ),
      `cannot serialize to string, Symbol is not registered\n  at ["representation"]["symbol"]`
    )
  })

  it("rejects local symbols used as property names", () => {
    throws(
      () =>
        SchemaRepresentation.toJson({
          representation: {
            _tag: "Objects",
            propertySignatures: [
              makeStringProperty(Symbol("local"))
            ],
            indexSignatures: [],
            checks: []
          },
          references: {}
        }),
      `cannot serialize to string, Symbol is not registered\n  at ["representation"]["propertySignatures"][0]["name"]["value"]`
    )
  })

  it("encodes recursive references", () => {
    let schema: Schema.Codec<unknown>
    schema = Schema.suspend((): Schema.Codec<unknown> => schema)

    assert.deepStrictEqual(
      SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(schema.ast)),
      {
        representation: { _tag: "Reference", $ref: "Suspend_" },
        references: {
          Suspend_: {
            _tag: "Suspend",
            thunk: { _tag: "Reference", $ref: "Suspend_" },
            checks: []
          }
        }
      }
    )
  })

  it("encodes fromJsonString annotations", () => {
    const schema = SchemaAST.toEncoded(Schema.fromJsonString(Schema.Struct({ value: Schema.Number })).ast)
    const document = SchemaRepresentation.toRepresentation(schema)

    assert.deepStrictEqual(SchemaRepresentation.toJson(document), {
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
})
