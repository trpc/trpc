import { assert, describe, it } from "@effect/vitest"
import { Schema, SchemaRepresentation } from "effect"
import { assertInclude, throws } from "../../utils/assert.ts"

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

describe("SchemaRepresentation.toCodeDocument annotations", () => {
  it("preserves explicit options on an empty union", () => {
    assert.deepStrictEqual(
      SchemaRepresentation.toCodeDocument({
        representations: [EmptyUnionRepresentation],
        references: {}
      }).codes,
      [{ runtime: `Schema.Union([], { mode: "anyOf" })`, Type: "never" }]
    )
  })

  it("compiles the isPattern and Option vertical slice", () => {
    const document = SchemaRepresentation.toRepresentations([
      Schema.String.check(Schema.isPattern(/^a+$/)).ast,
      Schema.Option(Schema.String).ast
    ])
    const output = SchemaRepresentation.toCodeDocument(document)

    assert.deepStrictEqual(output.codes, [
      {
        runtime:
          `Schema.String.check(Schema.isPattern(new RegExp("^a+$")).annotate({ "expected": "a string matching the RegExp ^a+$" }))`,
        Type: "string"
      },
      {
        runtime: `Schema.Option(Schema.String).annotate({ "expected": "Option" })`,
        Type: "Option.Option<string>"
      }
    ])
    assert.deepStrictEqual(output.artifacts, [{
      _tag: "Import",
      importDeclaration: `import * as Option from "effect/Option"`
    }])
  })

  it("passes compiled dependencies to checks and deduplicates imports", () => {
    const check = (name: string): SchemaRepresentation.Filter => ({
      _tag: "Filter",
      aborted: false,
      representation: {
        id: `acme/schema/${name}`,
        payload: null,
        schemas: [StringRepresentation]
      },
      annotations: {
        toCode: ({ schemas }: SchemaRepresentation.Generation.CheckInput) => ({
          runtime: `Custom.${name}(${schemas[0].runtime})`,
          importDeclarations: [`import * as Custom from "acme/Custom"`]
        })
      }
    })
    const document: SchemaRepresentation.MultiDocument = {
      representations: [{ _tag: "String", checks: [check("first"), check("second")] }],
      references: {}
    }

    const output = SchemaRepresentation.toCodeDocument(document)
    assert.strictEqual(
      output.codes[0].runtime,
      "Schema.String.check(Custom.first(Schema.String)).check(Custom.second(Schema.String))"
    )
    assert.deepStrictEqual(output.artifacts, [{
      _tag: "Import",
      importDeclaration: `import * as Custom from "acme/Custom"`
    }])
  })

  it("emits supported annotation trees atomically", () => {
    const document = SchemaRepresentation.toRepresentations([
      Schema.String.annotate({
        emitted: {
          bigint: 1n,
          symbol: Symbol.for("shared"),
          nan: NaN,
          positive: Infinity,
          negative: -Infinity
        },
        omitted: { value: 1, callback: () => 2 }
      }).ast
    ])

    const runtime = SchemaRepresentation.toCodeDocument(document).codes[0].runtime
    assertInclude(runtime, `"bigint": 1n`)
    assertInclude(runtime, `"symbol": Symbol.for("shared")`)
    assertInclude(runtime, `"nan": NaN`)
    assertInclude(runtime, `"positive": Infinity`)
    assertInclude(runtime, `"negative": -Infinity`)
    assert.isFalse(runtime.includes("omitted"))
    assert.isFalse(runtime.includes("callback"))
  })

  it("preserves fallback identifiers", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [{
        _tag: "String",
        checks: [],
        annotations: { "~identifier": "Person" }
      }],
      references: {}
    })

    assertInclude(output.codes[0].runtime, `.annotate({ "~identifier": "Person" })`)
  })

  it("emits tuple element and property annotations", () => {
    const document: SchemaRepresentation.MultiDocument = {
      representations: [
        {
          _tag: "Arrays",
          elements: [{
            isOptional: false,
            type: StringRepresentation,
            annotations: {
              element: { value: 1 },
              omitted: { callback: () => 1 }
            }
          }],
          rest: [],
          checks: []
        },
        {
          _tag: "Objects",
          propertySignatures: [{
            name: "value",
            type: NumberRepresentation,
            isOptional: false,
            isMutable: false,
            annotations: { property: true }
          }],
          indexSignatures: [],
          checks: []
        }
      ],
      references: {}
    }

    assert.deepStrictEqual(SchemaRepresentation.toCodeDocument(document).codes, [
      {
        runtime: `Schema.Tuple([Schema.String.annotateKey({ "element": { "value": 1 } })])`,
        Type: "readonly [string]"
      },
      {
        runtime: `Schema.Struct({ "value": Schema.Number.annotateKey({ "property": true }) })`,
        Type: `{ readonly "value": number }`
      }
    ])
  })

  it("uses group overrides without visiting children and preserves abort", () => {
    let visits = 0
    const child: SchemaRepresentation.Filter = {
      _tag: "Filter",
      aborted: true,
      annotations: {
        toCode: () => {
          visits++
          return { runtime: "Custom.child()" }
        }
      }
    }
    const document: SchemaRepresentation.MultiDocument = {
      representations: [
        {
          _tag: "String",
          checks: [{
            _tag: "FilterGroup",
            checks: [child],
            annotations: { toCode: () => ({ runtime: "Custom.group()" }) }
          }]
        },
        {
          _tag: "String",
          checks: [{ _tag: "FilterGroup", checks: [child] }]
        }
      ],
      references: {}
    }

    const output = SchemaRepresentation.toCodeDocument(document)
    assert.strictEqual(visits, 1)
    assert.strictEqual(output.codes[0].runtime, "Schema.String.check(Custom.group())")
    assert.strictEqual(
      output.codes[1].runtime,
      "Schema.String.check(Schema.makeFilterGroup([Custom.child().abort()]))"
    )
  })

  it("passes type parameters to declaration callbacks", () => {
    const declaration: SchemaRepresentation.Representation = {
      _tag: "Declaration",
      typeParameters: [StringRepresentation],
      checks: [],
      representation: {
        id: "acme/schema/Box",
        payload: null
      },
      annotations: {
        toCode: ({ typeParameters }: SchemaRepresentation.Generation.DeclarationInput) => ({
          runtime: `Custom.box(${typeParameters[0].runtime})`,
          Type: `Custom.Box<${typeParameters[0].Type}>`,
          importDeclarations: [`import * as Custom from "acme/Custom"`]
        })
      }
    }
    const output = SchemaRepresentation.toCodeDocument({
      representations: [declaration],
      references: {}
    })

    assert.deepStrictEqual(output.codes, [{
      runtime: "Custom.box(Schema.String)",
      Type: "Custom.Box<string>"
    }])
  })

  it("reports missing toCode callbacks and preserves callback exceptions", () => {
    const missing: SchemaRepresentation.MultiDocument = {
      representations: [{
        _tag: "String",
        checks: [{ _tag: "Filter", aborted: false }]
      }],
      references: {}
    }
    expectError(
      () => SchemaRepresentation.toCodeDocument(missing),
      `Missing toCode callback\n  at ["representations"][0]["checks"][0]["annotations"]["toCode"]`
    )

    const cause = new Error("toCode callback")
    const throwing: SchemaRepresentation.MultiDocument = {
      representations: [{
        _tag: "String",
        checks: [{
          _tag: "Filter",
          aborted: false,
          annotations: {
            toCode: () => {
              throw cause
            }
          }
        }]
      }],
      references: {}
    }
    expectError(
      () => SchemaRepresentation.toCodeDocument(throwing),
      cause
    )
  })

  it("generates content media types, optional pre-rest elements and numeric properties", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [
        {
          _tag: "String",
          annotations: { contentMediaType: "text/plain" },
          checks: []
        },
        {
          _tag: "Arrays",
          elements: [{
            type: StringRepresentation,
            isOptional: true
          }],
          rest: [NumberRepresentation],
          checks: []
        },
        {
          _tag: "Objects",
          propertySignatures: [{
            name: 1,
            type: { _tag: "Boolean", checks: [] },
            isOptional: false,
            isMutable: false
          }],
          indexSignatures: [],
          checks: []
        }
      ],
      references: {}
    })

    assert.deepStrictEqual(output.codes, [
      {
        runtime: `Schema.String.annotate({ "contentMediaType": "text/plain" })`,
        Type: "string"
      },
      {
        runtime: `Schema.TupleWithRest(Schema.Tuple([Schema.optionalKey(Schema.String)]), [Schema.Number])`,
        Type: `readonly [(string)?, ...Array<number>]`
      },
      {
        runtime: `Schema.Struct({ 1: Schema.Boolean })`,
        Type: `{ readonly 1: boolean }`
      }
    ])
    assert.deepStrictEqual(output.artifacts, [])
  })

  it("emits references that are not reachable from a root", () => {
    const document: SchemaRepresentation.MultiDocument = {
      representations: [StringRepresentation],
      references: {
        Unused: NumberRepresentation
      }
    }
    assert.deepStrictEqual(SchemaRepresentation.toCodeDocument(document).references, {
      nonRecursives: [{
        $ref: "Unused",
        code: { runtime: "Schema.Number", Type: "number" }
      }],
      recursives: {}
    })
  })

  it("capitalizes a lowercase reference identifier", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [StringRepresentation],
      references: { abc: NumberRepresentation }
    })
    assert.strictEqual(output.references.nonRecursives[0].$ref, "Abc")
  })

  it("preserves a lowercase identifier annotation", () => {
    const schema = Schema.Struct({ a: Schema.String }).annotate({ identifier: "hello" })
    const output = SchemaRepresentation.toCodeDocument(
      SchemaRepresentation.toMultiDocument(Schema.toRepresentation(schema))
    )
    assert.deepStrictEqual(output.references.nonRecursives[0], {
      $ref: "Hello",
      code: {
        runtime: `Schema.Struct({ "a": Schema.String }).annotate({ "identifier": "hello" })`,
        Type: `{ readonly "a": string }`
      }
    })
  })

  it("preserves an uppercase reference identifier", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [StringRepresentation],
      references: { Abc: NumberRepresentation }
    })
    assert.strictEqual(output.references.nonRecursives[0].$ref, "Abc")
  })

  it("prefixes a numeric reference identifier", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [StringRepresentation],
      references: { "1a": NumberRepresentation }
    })
    assert.strictEqual(output.references.nonRecursives[0].$ref, "_1a")
  })

  it("replaces punctuation in a reference identifier", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [StringRepresentation],
      references: { "a-b": NumberRepresentation }
    })
    assert.strictEqual(output.references.nonRecursives[0].$ref, "A_b")
  })

  it("replaces non-ASCII characters in a reference identifier", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [StringRepresentation],
      references: { café: NumberRepresentation }
    })
    assert.strictEqual(output.references.nonRecursives[0].$ref, "Caf_")
  })

  it("replaces an emoji reference identifier", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [StringRepresentation],
      references: { "🤖": NumberRepresentation }
    })
    assert.strictEqual(output.references.nonRecursives[0].$ref, "_")
  })

  it("uses an underscore for an empty reference identifier", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [StringRepresentation],
      references: { "": NumberRepresentation }
    })
    assert.strictEqual(output.references.nonRecursives[0].$ref, "_")
  })

  it("makes colliding sanitized reference identifiers unique", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [StringRepresentation],
      references: {
        "a-b": NumberRepresentation,
        a_b: StringRepresentation
      }
    })
    assert.deepStrictEqual(
      output.references.nonRecursives.map((reference) => reference.$ref),
      ["A_b", "A_b1"]
    )
  })

  it("orders definitions after dependencies found in every representation position", () => {
    const reference = ($ref: string): SchemaRepresentation.Reference => ({ _tag: "Reference", $ref })
    const filter: SchemaRepresentation.Filter = {
      _tag: "Filter",
      aborted: false,
      representation: { id: "acme/schema/filter", payload: null, schemas: [reference("C")] },
      annotations: {
        toCode: () => ({ runtime: "Schema.makeFilter(() => true)" })
      }
    }
    const output = SchemaRepresentation.toCodeDocument({
      representations: [StringRepresentation],
      references: {
        A: StringRepresentation,
        B: NumberRepresentation,
        C: { _tag: "Boolean", checks: [] },
        D: {
          _tag: "Declaration",
          typeParameters: [reference("A")],
          representation: { id: "acme/schema/declaration", payload: null },
          annotations: {
            toCode: () => ({ runtime: "Schema.String", Type: "string" })
          },
          checks: [{ _tag: "FilterGroup", checks: [filter] }]
        },
        E: { _tag: "TemplateLiteral", parts: [reference("D")], checks: [] },
        F: { _tag: "Union", types: [reference("E"), reference("A")], options: { mode: "anyOf" }, checks: [] },
        G: {
          _tag: "Arrays",
          elements: [{ type: reference("F"), isOptional: false }],
          rest: [reference("A")],
          checks: []
        },
        H: {
          _tag: "Objects",
          propertySignatures: [{
            name: "value",
            type: reference("G"),
            isOptional: false,
            isMutable: false
          }],
          indexSignatures: [{ parameter: reference("A"), type: reference("B") }],
          checks: []
        },
        I: { _tag: "Suspend", thunk: reference("H"), checks: [] }
      }
    })

    assert.deepStrictEqual(
      output.references.nonRecursives.map((entry) => entry.$ref),
      ["A", "B", "C", "D", "E", "F", "G", "H", "I"]
    )
  })

  it("orders a shared dependency referenced from multiple representation positions once", () => {
    const shared: SchemaRepresentation.Reference = { _tag: "Reference", $ref: "A" }
    const output = SchemaRepresentation.toCodeDocument({
      representations: [StringRepresentation],
      references: {
        A: StringRepresentation,
        B: {
          _tag: "Arrays",
          elements: [{ type: shared, isOptional: false }],
          rest: [shared],
          checks: []
        },
        C: {
          _tag: "Objects",
          propertySignatures: [],
          indexSignatures: [{ parameter: shared, type: shared }],
          checks: []
        }
      }
    })

    assert.deepStrictEqual(
      output.references.nonRecursives.map((entry) => entry.$ref),
      ["A", "B", "C"]
    )
  })

  it("generates a StructWithRest without fixed properties", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [{
        _tag: "Objects",
        propertySignatures: [],
        indexSignatures: [
          { parameter: StringRepresentation, type: NumberRepresentation },
          { parameter: { _tag: "Symbol", checks: [] }, type: { _tag: "Boolean", checks: [] } }
        ],
        checks: []
      }],
      references: {}
    })

    assert.strictEqual(output.codes[0].Type, `{ readonly [x: string]: number, readonly [x: symbol]: boolean }`)
  })

  it("preserves explicit options on a single-literal Union", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [{
        _tag: "Union",
        types: [{ _tag: "Literal", literal: "a", checks: [] }],
        options: { mode: "anyOf" },
        checks: []
      }],
      references: {}
    })

    assert.deepStrictEqual(output.codes[0], {
      runtime: `Schema.Union([Schema.Literal("a")], { mode: "anyOf" })`,
      Type: `"a"`
    })
  })

  it("preserves optional Union option properties", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [
        {
          _tag: "Union",
          types: [StringRepresentation],
          options: {},
          checks: []
        },
        {
          _tag: "Union",
          types: [NumberRepresentation],
          options: { mode: undefined },
          checks: []
        }
      ],
      references: {}
    })

    assert.deepStrictEqual(output.codes, [
      { runtime: "Schema.Union([Schema.String], {})", Type: "string" },
      { runtime: `Schema.Union([Schema.Number], { mode: undefined })`, Type: "number" }
    ])
  })

  it("emits every member of a mutually recursive reference cycle", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [{ _tag: "Reference", $ref: "A" }],
      references: {
        A: { _tag: "Reference", $ref: "B" },
        B: { _tag: "Reference", $ref: "A" }
      }
    })

    assert.deepStrictEqual(output.references, {
      nonRecursives: [],
      recursives: {
        A: { runtime: "Schema.suspend((): Schema.Codec<B> => B)", Type: "B" },
        B: { runtime: "Schema.suspend((): Schema.Codec<A> => A)", Type: "A" }
      }
    })
  })

  it("emits a non-recursive definition that depends on a recursive definition", () => {
    const output = SchemaRepresentation.toCodeDocument({
      representations: [{ _tag: "Reference", $ref: "B" }],
      references: {
        A: { _tag: "Reference", $ref: "A" },
        B: { _tag: "Reference", $ref: "A" }
      }
    })

    assert.deepStrictEqual(output.references, {
      nonRecursives: [{ $ref: "B", code: { runtime: "A", Type: "A" } }],
      recursives: { A: { runtime: "Schema.suspend((): Schema.Codec<A> => A)", Type: "A" } }
    })
  })

  it("reports missing references with their document path", () => {
    const document: SchemaRepresentation.MultiDocument = {
      representations: [{ _tag: "Reference", $ref: "Missing" }],
      references: {}
    }
    expectError(
      () => SchemaRepresentation.toCodeDocument(document),
      `Invalid reference Missing\n  at ["representations"][0]["$ref"]`
    )
  })

  it("reports a missing reference from a definition", () => {
    expectError(
      () =>
        SchemaRepresentation.toCodeDocument({
          representations: [StringRepresentation],
          references: { Value: { _tag: "Reference", $ref: "Missing" } }
        }),
      `Invalid reference Missing\n  at ["references"]["Value"]["$ref"]`
    )
  })
})
