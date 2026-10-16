import { assert, describe, it } from "@effect/vitest"
import { Brand, Schema, SchemaRepresentation } from "effect"
import { throws } from "../../utils/assert.ts"

const filterId = "acme/schema/minLength"

const minLengthReviver: SchemaRepresentation.FilterReviver<{ readonly minimum: number }> = {
  id: filterId,
  payloadSchema: Schema.Struct({ minimum: Schema.Number }),
  revive: ({ annotations, payload }) => minLengthCheck(payload.minimum, annotations)
}

function minLengthCheck(minimum: number, annotations?: Schema.Annotations.Filter) {
  return Schema.makeFilter<string>((value) => value.length >= minimum, {
    representation: { id: filterId, payload: { minimum } },
    ...annotations
  })
}

function revive(
  schema: Schema.Top,
  revivers: ReadonlyArray<SchemaRepresentation.AnyReviver> = []
): Schema.Top {
  return SchemaRepresentation.fromRepresentation(
    SchemaRepresentation.fromJson(SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(schema.ast))),
    { revivers }
  )
}

function assertRepresentationRoundtrip(
  schema: Schema.Top,
  revivers: ReadonlyArray<SchemaRepresentation.AnyReviver> = []
): Schema.Top {
  const expected = SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(schema.ast))
  const revived = SchemaRepresentation.fromRepresentation(SchemaRepresentation.fromJson(expected), { revivers })
  assert.deepStrictEqual(SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(revived.ast)), expected)
  return revived
}

function errorFrom(run: () => unknown): Error {
  let result: Error | undefined
  throws(run, (error: unknown) => {
    assert.instanceOf(error, Error)
    result = error
    return undefined
  })
  assert.isDefined(result)
  return result
}

function filterJson(): Schema.Json {
  return SchemaRepresentation.toJson(
    SchemaRepresentation.toRepresentation(Schema.String.check(minLengthCheck(2)).ast)
  )
}

describe("SchemaRepresentation.fromRepresentation", () => {
  it("revives Null", () => {
    assertRepresentationRoundtrip(Schema.Null)
  })

  it("revives Undefined", () => {
    assertRepresentationRoundtrip(Schema.Undefined)
  })

  it("revives Void", () => {
    assertRepresentationRoundtrip(Schema.Void)
  })

  it("revives Never", () => {
    assertRepresentationRoundtrip(Schema.Never)
  })

  it("revives Unknown", () => {
    assertRepresentationRoundtrip(Schema.Unknown)
  })

  it("revives Any", () => {
    assertRepresentationRoundtrip(Schema.Any)
  })

  it("revives String", () => {
    assertRepresentationRoundtrip(Schema.String)
  })

  it("revives Number", () => {
    assertRepresentationRoundtrip(Schema.Number)
  })

  it("revives Boolean", () => {
    assertRepresentationRoundtrip(Schema.Boolean)
  })

  it("revives BigInt", () => {
    assertRepresentationRoundtrip(Schema.BigInt)
  })

  it("revives Symbol", () => {
    assertRepresentationRoundtrip(Schema.Symbol)
  })

  it("revives ObjectKeyword", () => {
    assertRepresentationRoundtrip(Schema.ObjectKeyword)
  })

  it("revives Literal without changing its type", () => {
    for (
      const [literal, differentType] of [
        ["1", 1n],
        ["true", true],
        [1, "1"],
        [1n, "1"],
        [true, "true"]
      ] as const
    ) {
      const schema = assertRepresentationRoundtrip(Schema.Literal(literal))
      assert.isTrue(Schema.is(schema)(literal))
      assert.isFalse(Schema.is(schema)(differentType))
    }
  })

  it("revives UniqueSymbol", () => {
    const symbol = Symbol.for("acme/schema/symbol")
    const schema = assertRepresentationRoundtrip(Schema.UniqueSymbol(symbol))
    assert.isTrue(Schema.is(schema)(symbol))
    assert.isFalse(Schema.is(schema)(Symbol.for("acme/schema/other")))
  })

  it("revives Enum", () => {
    const schema = assertRepresentationRoundtrip(Schema.Enum({ A: "a", One: 1 }))
    assert.isTrue(Schema.is(schema)("a"))
    assert.isTrue(Schema.is(schema)(1))
    assert.isFalse(Schema.is(schema)("other"))
  })

  it("rejects non-finite numeric Enum values", () => {
    throws(
      () =>
        SchemaRepresentation.fromRepresentation({
          representation: {
            _tag: "Enum",
            enums: [["NumberNaN", Number.NaN]],
            checks: []
          },
          references: {}
        }, { revivers: [] }),
      new Error("A numeric enum value must be finite, got NaN")
    )
  })

  it("revives TemplateLiteral", () => {
    const schema = assertRepresentationRoundtrip(Schema.TemplateLiteral(["prefix-", Schema.String]))
    assert.isTrue(Schema.is(schema)("prefix-value"))
    assert.isFalse(Schema.is(schema)("value"))
  })

  it("revives a reference in TemplateLiteral as a concrete part", () => {
    const schema = assertRepresentationRoundtrip(
      Schema.TemplateLiteral(["prefix-", Schema.String.annotate({ identifier: "Part" })])
    )
    assert.strictEqual(schema.ast._tag, "TemplateLiteral")
    if (schema.ast._tag === "TemplateLiteral") {
      assert.strictEqual(schema.ast.parts[1]._tag, "String")
    }
    assert.isTrue(Schema.is(schema)("prefix-value"))
  })

  it("revives nested references in a TemplateLiteral union", () => {
    const schema = assertRepresentationRoundtrip(
      Schema.TemplateLiteral([
        "prefix-",
        Schema.Union([
          Schema.Literal("a").annotate({ identifier: "A" }),
          Schema.Literal("b").annotate({ identifier: "B" })
        ]).annotate({ identifier: "Part" })
      ])
    )
    assert.isTrue(Schema.is(schema)("prefix-a"))
    assert.isTrue(Schema.is(schema)("prefix-b"))
    assert.isFalse(Schema.is(schema)("prefix-c"))
  })

  it("revives Tuple", () => {
    assertRepresentationRoundtrip(Schema.Tuple([Schema.String, Schema.optionalKey(Schema.Number)]))
  })

  it("revives Array", () => {
    assertRepresentationRoundtrip(Schema.Array(Schema.String))
  })

  it("revives TupleWithRest", () => {
    assertRepresentationRoundtrip(
      Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number, Schema.Boolean])
    )
  })

  it("revives Struct", () => {
    assertRepresentationRoundtrip(Schema.Struct({
      required: Schema.String,
      optional: Schema.optionalKey(Schema.Number),
      mutable: Schema.mutableKey(Schema.Boolean)
    }))
  })

  it("revives Record", () => {
    assertRepresentationRoundtrip(Schema.Record(Schema.String, Schema.Number))
  })

  it("revives a reference used as a Record key", () => {
    const schema = assertRepresentationRoundtrip(
      Schema.Record(Schema.String.annotate({ identifier: "Key" }), Schema.Number)
    )
    assert.strictEqual(schema.ast._tag, "Objects")
    if (schema.ast._tag === "Objects") {
      assert.strictEqual(schema.ast.indexSignatures[0].parameter._tag, "String")
    }
    assert.deepStrictEqual(Schema.decodeUnknownSync(schema as Schema.Codec<unknown>)({ a: 1 }), { a: 1 })
  })

  it("revives StructWithRest", () => {
    assertRepresentationRoundtrip(
      Schema.StructWithRest(Schema.Struct({ value: Schema.Number }), [Schema.Record(Schema.Symbol, Schema.String)])
    )
  })

  it("revives Union", () => {
    const schema = assertRepresentationRoundtrip(Schema.Union([Schema.String, Schema.Number]))
    assert.isTrue(Schema.is(schema)("value"))
    assert.isTrue(Schema.is(schema)(1))
    assert.isFalse(Schema.is(schema)(true))
  })

  it("revives Union options through live and JSON representation roundtrips", () => {
    const representation = {
      _tag: "Union",
      types: [{ _tag: "String", checks: [] }, { _tag: "Number", checks: [] }],
      options: { mode: "oneOf" },
      checks: []
    } as const satisfies SchemaRepresentation.Representation
    const document = { representation, references: {} }
    const revived = SchemaRepresentation.fromRepresentation(document, { revivers: [] })
    assert.strictEqual(revived.ast._tag, "Union")
    if (revived.ast._tag === "Union") assert.deepStrictEqual(revived.ast.options, representation.options)
    const fromJson = SchemaRepresentation.fromRepresentation(
      SchemaRepresentation.fromJson(SchemaRepresentation.toJson(document)),
      { revivers: [] }
    )
    assert.strictEqual(fromJson.ast._tag, "Union")
    if (fromJson.ast._tag === "Union") assert.deepStrictEqual(fromJson.ast.options, representation.options)
  })

  it("revives an empty Union as Never", () => {
    const schema = SchemaRepresentation.fromRepresentation({
      representation: { _tag: "Union", types: [], options: { mode: "anyOf" }, checks: [] },
      references: {}
    }, { revivers: [] })
    assert.isFalse(Schema.is(schema)(undefined))
    assert.isFalse(Schema.is(schema)(null))
  })

  it("revives Suspend", () => {
    interface Category {
      readonly name: string
      readonly children: ReadonlyArray<Category>
    }
    const Category: Schema.Codec<Category> = Schema.Struct({
      name: Schema.String,
      children: Schema.Array(Schema.suspend((): Schema.Codec<Category> => Category))
    }).annotate({ identifier: "Category" })
    const schema = revive(Category) as Schema.Codec<unknown>
    assert.strictEqual(schema.ast._tag, "Objects")
    if (schema.ast._tag === "Objects") {
      const children = schema.ast.propertySignatures.find((property) => property.name === "children")
      assert.isDefined(children)
      assert.strictEqual(children.type._tag, "Arrays")
      if (children.type._tag === "Arrays") {
        assert.strictEqual(children.type.rest[0]._tag, "Suspend")
      }
    }
    assert.deepStrictEqual(
      Schema.decodeUnknownSync(schema)({
        name: "root",
        children: [{ name: "child", children: [] }]
      }),
      {
        name: "root",
        children: [{ name: "child", children: [] }]
      }
    )
    assert.strictEqual(SchemaRepresentation.toRepresentation(schema.ast).representation._tag, "Reference")
  })

  it("restores node annotations", () => {
    const schema = revive(Schema.String.annotate({ title: "Name" }))
    assert.strictEqual(schema.ast.annotations?.title, "Name")
  })

  it("restores node annotations before checks", () => {
    const schema = assertRepresentationRoundtrip(
      Schema.String
        .annotate({ title: "node" })
        .check(minLengthCheck(2, { description: "check" })),
      [minLengthReviver]
    )

    assert.strictEqual(schema.ast.annotations?.title, "node")
    assert.strictEqual(schema.ast.checks?.[0].annotations?.description, "check")
    assert.strictEqual(schema.ast.checks?.[0].annotations?.title, undefined)
  })

  it("restores tuple element annotations", () => {
    const schema = revive(Schema.Tuple([Schema.String.annotateKey({ description: "element" })]))
    const representation = SchemaRepresentation.toRepresentation(schema.ast).representation
    assert.strictEqual(representation._tag, "Arrays")
    if (representation._tag === "Arrays") {
      assert.strictEqual(representation.elements[0].annotations?.description, "element")
    }
  })

  it("restores property annotations", () => {
    const schema = revive(Schema.Struct({ value: Schema.String.annotateKey({ description: "property" }) }))
    const representation = SchemaRepresentation.toRepresentation(schema.ast).representation
    assert.strictEqual(representation._tag, "Objects")
    if (representation._tag === "Objects") {
      assert.strictEqual(representation.propertySignatures[0].annotations?.description, "property")
    }
  })

  it("restores checks added by fromBrand", () => {
    type Int = number & Brand.Brand<"Int">
    const Int = Brand.check<Int>(Schema.isInt())
    type Positive = number & Brand.Brand<"Positive">
    const Positive = Brand.check<Positive>(Schema.isGreaterThan(0))
    const schema = Schema.Number.pipe(
      Schema.fromBrand("Int", Int),
      Schema.fromBrand("Positive", Positive)
    )

    const restored = assertRepresentationRoundtrip(schema, [
      SchemaRepresentation.isIntReviver,
      SchemaRepresentation.isGreaterThanReviver
    ])
    assert.isTrue(Schema.is(restored)(1))
    assert.isFalse(Schema.is(restored)(1.2))
    assert.isFalse(Schema.is(restored)(-1))
  })

  it("restores a node representation annotation without schema dependencies", () => {
    assertRepresentationRoundtrip(Schema.String.annotate({
      representation: { id: "acme/schema/String", payload: null }
    }))
  })

  it("restores a node representation annotation with schema dependencies", () => {
    assertRepresentationRoundtrip(Schema.String.annotate({
      representation: {
        id: "acme/schema/String",
        payload: null,
        schemas: [Schema.Number.ast]
      }
    }))
  })

  it("revives a Filter", () => {
    const schema = assertRepresentationRoundtrip(
      Schema.String.check(minLengthCheck(2, { description: "at least two" }).abort()),
      [minLengthReviver]
    )
    assert.strictEqual(Schema.decodeUnknownResult(schema as Schema.Codec<unknown>)("a")._tag, "Failure")
    assert.strictEqual(schema.ast.checks?.[0]._tag, "Filter")
    assert.isTrue(schema.ast.checks?.[0]._tag === "Filter" && schema.ast.checks[0].aborted)
    assert.strictEqual(schema.ast.checks?.[0].annotations?.description, "at least two")
  })

  it("revives a FilterGroup without an identity from its children", () => {
    const group = Schema.makeFilterGroup([minLengthCheck(2), minLengthCheck(3)], { description: "both" })
    const schema = assertRepresentationRoundtrip(Schema.String.check(group), [minLengthReviver])
    assert.strictEqual(Schema.decodeUnknownResult(schema as Schema.Codec<unknown>)("ab")._tag, "Failure")
    assert.strictEqual(schema.ast.checks?.[0].annotations?.description, "both")
  })

  it("uses an identified FilterGroup reviver instead of its persisted children", () => {
    const groupId = "acme/schema/group"
    const document = SchemaRepresentation.fromJson({
      representation: {
        _tag: "String",
        checks: [{
          _tag: "FilterGroup",
          representation: { id: groupId, payload: null },
          checks: [{
            _tag: "Filter",
            representation: { id: filterId, payload: { minimum: 1 } },
            aborted: false
          }]
        }]
      },
      references: {}
    })
    const reviver: SchemaRepresentation.FilterGroupReviver<null> = {
      id: groupId,
      payloadSchema: Schema.Null,
      revive: () => Schema.makeFilterGroup([Schema.makeFilter<string>((value) => value !== "blocked")])
    }
    const schema = SchemaRepresentation.fromRepresentation(document, { revivers: [reviver] }) as Schema.Codec<unknown>
    assert.strictEqual(Schema.decodeUnknownSync(schema)("allowed"), "allowed")
    assert.strictEqual(Schema.decodeUnknownResult(schema)("blocked")._tag, "Failure")
  })

  it("revives a Declaration", () => {
    const id = "acme/schema/Box"
    const Box = Schema.declare<{ readonly value: string }>(
      (input): input is { readonly value: string } =>
        typeof input === "object" && input !== null && typeof (input as any).value === "string",
      { representation: { id, payload: { label: "Box" } } }
    )
    const reviver: SchemaRepresentation.DeclarationReviver<{ readonly label: string }> = {
      id,
      payloadSchema: Schema.Struct({ label: Schema.String }),
      revive: ({ annotations, payload }) =>
        Schema.declare<{ readonly value: string }>(
          (input): input is { readonly value: string } =>
            typeof input === "object" && input !== null && typeof (input as any).value === "string",
          { ...annotations, representation: { id, payload } }
        )
    }
    const schema = assertRepresentationRoundtrip(Box, [reviver]) as Schema.Codec<unknown>
    assert.deepStrictEqual(Schema.decodeUnknownSync(schema)({ value: "ok" }), { value: "ok" })
  })

  it("reports a missing reviver", () => {
    assert.strictEqual(
      errorFrom(() =>
        SchemaRepresentation.fromRepresentation(SchemaRepresentation.fromJson(filterJson()), { revivers: [] })
      )
        .message,
      `Missing reviver for ${filterId}\n  at ["representation"]["checks"][0]["representation"]`
    )
  })

  it("rejects duplicate reviver IDs", () => {
    assert.strictEqual(
      errorFrom(() =>
        SchemaRepresentation.fromRepresentation({
          representation: { _tag: "String", checks: [] },
          references: {}
        }, { revivers: [minLengthReviver, minLengthReviver] })
      ).message,
      `Duplicate reviver for ${filterId}\n  at ["revivers"][1]["id"]`
    )
  })

  it("rejects an invalid reviver payload", () => {
    const json = filterJson() as any
    json.representation.checks[0].representation.payload = { minimum: "two" }
    assert.strictEqual(
      errorFrom(() =>
        SchemaRepresentation.fromRepresentation(SchemaRepresentation.fromJson(json), {
          revivers: [minLengthReviver]
        })
      ).message,
      `Invalid representation payload for ${filterId}\n  at ["representation"]["checks"][0]["representation"]["payload"]`
    )
  })

  it("preserves a reviver exception by identity", () => {
    const cause = new Error("boom")
    const reviver = {
      ...minLengthReviver,
      revive: () => {
        throw cause
      }
    }
    assert.strictEqual(
      errorFrom(() =>
        SchemaRepresentation.fromRepresentation(SchemaRepresentation.fromJson(filterJson()), {
          revivers: [reviver]
        })
      ),
      cause
    )
  })

  it("requires a representation identity on a Filter", () => {
    assert.strictEqual(
      errorFrom(() =>
        SchemaRepresentation.fromRepresentation(
          {
            representation: { _tag: "String", checks: [{ _tag: "Filter", aborted: false }] },
            references: {}
          },
          { revivers: [] }
        )
      ).message,
      `Missing representation annotation\n  at ["representation"]["checks"][0]["representation"]`
    )
  })

  it("requires a representation identity on a Declaration", () => {
    assert.strictEqual(
      errorFrom(() =>
        SchemaRepresentation.fromRepresentation(
          {
            representation: { _tag: "Declaration", typeParameters: [], checks: [] },
            references: {}
          },
          { revivers: [] }
        )
      ).message,
      `Missing representation annotation\n  at ["representation"]["representation"]`
    )
  })

  it("reports an invalid reference", () => {
    assert.strictEqual(
      errorFrom(() =>
        SchemaRepresentation.fromRepresentation({
          representation: { _tag: "Reference", $ref: "Missing" },
          references: {}
        }, { revivers: [] })
      ).message,
      `Invalid reference Missing\n  at ["representation"]["$ref"]`
    )
  })
})
