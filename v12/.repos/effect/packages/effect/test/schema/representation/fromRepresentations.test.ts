import { assert, describe, it } from "@effect/vitest"
import { Schema, SchemaRepresentation } from "effect"

function decode(schema: Schema.Top, input: unknown): unknown {
  return Schema.decodeUnknownSync(schema as Schema.Codec<unknown>)(input)
}

describe("SchemaRepresentation.fromRepresentations", () => {
  it("preserves root order", () => {
    const schemas = SchemaRepresentation.fromRepresentations({
      representations: [
        { _tag: "String", checks: [] },
        { _tag: "Boolean", checks: [] },
        { _tag: "Number", checks: [] }
      ],
      references: {}
    }, { revivers: [] })

    assert.strictEqual(decode(schemas[0], "value"), "value")
    assert.strictEqual(decode(schemas[1], true), true)
    assert.strictEqual(decode(schemas[2], 1), 1)
  })

  it("does not revive unreachable references", () => {
    const schemas = SchemaRepresentation.fromRepresentations({
      representations: [{ _tag: "String", checks: [] }],
      references: {
        Unused: {
          _tag: "Declaration",
          typeParameters: [],
          representation: { id: "missing", payload: null },
          checks: []
        }
      }
    }, { revivers: [] })

    assert.strictEqual(decode(schemas[0], "value"), "value")
  })

  it("normalizes aliases while preserving the outer reference", () => {
    const schemas = SchemaRepresentation.fromRepresentations({
      representations: [{ _tag: "Reference", $ref: "Alias" }],
      references: {
        Alias: { _tag: "Reference", $ref: "Value" },
        Value: { _tag: "String", checks: [] }
      }
    }, { revivers: [] })

    assert.strictEqual(schemas[0].ast._tag, "String")
    assert.strictEqual(decode(schemas[0], "value"), "value")
    assert.deepStrictEqual(SchemaRepresentation.toRepresentation(schemas[0].ast).representation, {
      _tag: "Reference",
      $ref: "Alias"
    })
  })

  it("shares a resolved reference between roots", () => {
    const schemas = SchemaRepresentation.fromRepresentations({
      representations: [
        { _tag: "Reference", $ref: "Shared" },
        { _tag: "Reference", $ref: "Shared" }
      ],
      references: {
        Shared: { _tag: "Number", checks: [] }
      }
    }, { revivers: [] })

    assert.strictEqual(schemas[0], schemas[1])
    assert.strictEqual(schemas[0].ast._tag, "Number")
  })

  it("resolves a reachable __proto__ reference", () => {
    const references: Record<string, SchemaRepresentation.Representation> = {}
    Object.defineProperty(references, "__proto__", {
      value: { _tag: "String", checks: [] },
      enumerable: true
    })
    const schemas = SchemaRepresentation.fromRepresentations({
      representations: [{ _tag: "Reference", $ref: "__proto__" }],
      references
    }, { revivers: [] })

    assert.strictEqual(decode(schemas[0], "value"), "value")
  })

  it("revives recursive definitions", () => {
    const schemas = SchemaRepresentation.fromRepresentations({
      representations: [{ _tag: "Reference", $ref: "Recursive" }],
      references: {
        Recursive: {
          _tag: "Objects",
          checks: [],
          propertySignatures: [
            {
              name: "value",
              type: { _tag: "Number", checks: [] },
              isOptional: false,
              isMutable: false
            },
            {
              name: "next",
              type: { _tag: "Reference", $ref: "Recursive" },
              isOptional: true,
              isMutable: false
            }
          ],
          indexSignatures: []
        }
      }
    }, { revivers: [] })

    assert.strictEqual(schemas[0].ast._tag, "Objects")
    if (schemas[0].ast._tag === "Objects") {
      assert.strictEqual(schemas[0].ast.propertySignatures[1].type._tag, "Suspend")
    }
    assert.deepStrictEqual(
      decode(schemas[0], {
        value: 1,
        next: { value: 2 }
      }),
      {
        value: 1,
        next: { value: 2 }
      }
    )
  })

  it("revives mutually recursive definitions with concrete roots", () => {
    const schemas = SchemaRepresentation.fromRepresentations({
      representations: [
        { _tag: "Reference", $ref: "A" },
        { _tag: "Reference", $ref: "B" }
      ],
      references: {
        A: {
          _tag: "Objects",
          checks: [],
          propertySignatures: [{
            name: "b",
            type: { _tag: "Reference", $ref: "B" },
            isOptional: true,
            isMutable: false
          }],
          indexSignatures: []
        },
        B: {
          _tag: "Objects",
          checks: [],
          propertySignatures: [{
            name: "a",
            type: { _tag: "Reference", $ref: "A" },
            isOptional: true,
            isMutable: false
          }],
          indexSignatures: []
        }
      }
    }, { revivers: [] })

    assert.strictEqual(schemas[0].ast._tag, "Objects")
    assert.strictEqual(schemas[1].ast._tag, "Objects")
    if (schemas[0].ast._tag === "Objects" && schemas[1].ast._tag === "Objects") {
      const b = schemas[0].ast.propertySignatures[0].type
      const a = schemas[1].ast.propertySignatures[0].type
      assert.isTrue(b._tag === "Suspend" || a._tag === "Suspend")
    }
    assert.deepStrictEqual(decode(schemas[0], { b: { a: {} } }), { b: { a: {} } })
    assert.deepStrictEqual(decode(schemas[1], { a: { b: {} } }), { a: { b: {} } })
  })
})
