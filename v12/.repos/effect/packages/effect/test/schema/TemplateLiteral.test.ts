import { assert, describe, it } from "@effect/vitest"
import { Context, Effect, Schema, SchemaAST, SchemaGetter, SchemaTransformation } from "effect"

describe("TemplateLiteral", () => {
  it("does not expand shared subtemplates during construction", () => {
    let visits = 0
    let part: SchemaAST.AST = new Proxy(new SchemaAST.String(), {
      get(target, property, receiver) {
        if (property === "encoding") visits++
        return Reflect.get(target, property, receiver)
      }
    })
    const depth = 20
    for (let level = 0; level < depth; level++) {
      part = new SchemaAST.TemplateLiteral([part, part])
    }
    assert.isAtMost(visits, depth)
  })

  it("rejects codecs at construction, including transformations between equal types", () => {
    for (
      const part of [
        Schema.BooleanFromBit,
        Schema.FiniteFromString,
        Schema.String.pipe(Schema.decode(SchemaTransformation.snakeToCamel()))
      ]
    ) {
      assert.throws(
        () => Schema.TemplateLiteral([part]),
        "TemplateLiteral parts cannot have an encoding at parts[0]"
      )
      assert.throws(
        () => new SchemaAST.TemplateLiteral([part.ast]),
        "TemplateLiteral parts cannot have an encoding at parts[0]"
      )
    }
  })

  it("rejects codecs inside nested unions", () => {
    const part = Schema.Union([
      Schema.String,
      Schema.Union([Schema.Number, Schema.BooleanFromBit])
    ])
    assert.throws(
      () => Schema.TemplateLiteral(["prefix", part]),
      "TemplateLiteral parts cannot have an encoding at parts[1].types[1].types[1]"
    )
  })

  it("rejects a transformed nested template", () => {
    const part = Schema.TemplateLiteral([Schema.String]).pipe(
      Schema.decode(SchemaTransformation.snakeToCamel())
    )
    assert.throws(
      () => Schema.TemplateLiteral([part]),
      "TemplateLiteral parts cannot have an encoding at parts[0]"
    )
  })

  it.effect("supports branded parts, checks, and explicit projections", () =>
    Effect.gen(function*() {
      const schema = Schema.TemplateLiteral([
        Schema.NonEmptyString.pipe(Schema.brand("Prefix")),
        ":",
        Schema.Int.check(Schema.isGreaterThan(0))
      ])
      assert.strictEqual(yield* Schema.decodeEffect(schema)("a:1"), "a:1")
      assert.isFalse(Schema.is(schema)(":1"))
      assert.isFalse(Schema.is(schema)("a:0"))

      const bits = Schema.TemplateLiteral([Schema.toEncoded(Schema.BooleanFromBit)])
      assert.isTrue(Schema.is(bits)("0"))
      assert.isTrue(Schema.is(bits)("1"))
      assert.isFalse(Schema.is(bits)("true"))
    }))
})

describe("TemplateLiteralParser", () => {
  it.effect("transforms a template into a tuple and encodes transformed parts", () =>
    Effect.gen(function*() {
      const schema = Schema.TemplateLiteralParser(["bit:", Schema.BooleanFromBit])
      const encoded = Schema.toEncoded(schema)
      assert.strictEqual(encoded.ast._tag, "TemplateLiteral")
      assert.isTrue(Schema.is(encoded)("bit:1"))
      assert.isFalse(Schema.is(encoded)("bit:true"))
      assert.deepStrictEqual(yield* Schema.decodeEffect(schema)("bit:1"), ["bit:", true])
      assert.strictEqual(yield* Schema.encodeEffect(schema)(["bit:", false]), "bit:0")
      assert.strictEqual((yield* Effect.result(Schema.decodeUnknownEffect(schema)("bit:true")))._tag, "Failure")
    }))

  it.effect("preserves decoded checks and supports decode-only parts", () =>
    Effect.gen(function*() {
      const part = Schema.Literals([0, 1]).pipe(Schema.decodeTo(
        Schema.Boolean.check(Schema.makeFilter((value) => value)),
        {
          decode: SchemaGetter.transform((value) => value === 1),
          encode: SchemaGetter.forbiddenEncoding
        }
      ))
      const schema = Schema.TemplateLiteralParser([part])
      assert.deepStrictEqual(yield* Schema.decodeEffect(schema)("1"), [true])
      assert.strictEqual((yield* Effect.result(Schema.decodeEffect(schema)("0")))._tag, "Failure")
      assert.strictEqual((yield* Effect.result(Schema.encodeEffect(schema)([true])))._tag, "Failure")
    }))

  it.effect("preserves string coercion for transformed numeric parts", () =>
    Effect.gen(function*() {
      const schema = Schema.TemplateLiteralParser(["a", Schema.FiniteFromString])
      assert.deepStrictEqual(yield* Schema.decodeEffect(schema)("a"), ["a", 0])
      assert.deepStrictEqual(yield* Schema.decodeEffect(schema)("a1"), ["a", 1])
      assert.strictEqual((yield* Effect.result(Schema.decodeEffect(schema)("ab")))._tag, "Failure")
    }))

  it.effect("enforces oneOf after decoding overlapping encoded members", () =>
    Effect.gen(function*() {
      const part = Schema.Union([
        Schema.String.pipe(Schema.decodeTo(Schema.Literal("a"))),
        Schema.String.pipe(Schema.decodeTo(Schema.Literal("b")))
      ], { mode: "oneOf" })
      const schema = Schema.TemplateLiteralParser([part])
      assert.deepStrictEqual(yield* Schema.decodeEffect(schema)("a"), ["a"])
      assert.deepStrictEqual(yield* Schema.decodeEffect(schema)("b"), ["b"])
      assert.strictEqual((yield* Effect.result(Schema.decodeEffect(schema)("c")))._tag, "Failure")
      assert.strictEqual(yield* Schema.encodeEffect(schema)(["a"]), "a")

      const ambiguous = Schema.TemplateLiteralParser([
        Schema.Union([Schema.String, Schema.Number], { mode: "oneOf" })
      ])
      assert.strictEqual((yield* Effect.result(Schema.decodeEffect(ambiguous)("1")))._tag, "Failure")
      assert.strictEqual(yield* Schema.encodeEffect(ambiguous)(["1"]), "1")
    }))

  it.effect("preserves shared unions when normalizing encoded parts", () =>
    Effect.gen(function*() {
      let part: Schema.Codec<"a" | "b", string> = Schema.Union([
        Schema.String.pipe(Schema.decodeTo(Schema.Literal("a"))),
        Schema.String.pipe(Schema.decodeTo(Schema.Literal("b")))
      ], { mode: "oneOf" })
      const depth = 12
      for (let level = 0; level < depth; level++) {
        part = Schema.Union([part, part])
      }
      const schema = Schema.TemplateLiteralParser([part, ":", part])
      const source = Schema.toEncoded(schema).ast
      if (source._tag !== "TemplateLiteral") return assert.fail("Expected a TemplateLiteral source")
      assert.isTrue(source.parts[0] === source.parts[2])
      let current = source.parts[0]
      for (let level = 0; level < depth; level++) {
        if (current._tag !== "Union") return assert.fail("Expected a Union part")
        assert.isTrue(current.types[0] === current.types[1])
        current = current.types[0]
      }
      assert.deepStrictEqual(yield* Schema.decodeEffect(schema)("a:b"), ["a", ":", "b"])
      assert.strictEqual(yield* Schema.encodeEffect(schema)(["b", ":", "a"]), "b:a")
    }))

  it.effect("keeps greedy segmentation without requiring tuple round-trips", () =>
    Effect.gen(function*() {
      const schema = Schema.TemplateLiteralParser([Schema.String, ":", Schema.String])
      const encoded = yield* Schema.encodeEffect(schema)(["a", ":", "b:c"])
      assert.strictEqual(encoded, "a:b:c")
      assert.deepStrictEqual(yield* Schema.decodeEffect(schema)(encoded), ["a:b", ":", "c"])
    }))

  it.effect("uses separate decoding and encoding services", () =>
    Effect.gen(function*() {
      class DecodeScale extends Context.Service<DecodeScale, number>()("TemplateLiteral/DecodeScale") {}
      class EncodeScale extends Context.Service<EncodeScale, number>()("TemplateLiteral/EncodeScale") {}
      const part = Schema.Number.pipe(Schema.decode({
        decode: SchemaGetter.transformEffect((value) => Effect.map(DecodeScale, (scale) => value * scale)),
        encode: SchemaGetter.transformEffect((value) => Effect.map(EncodeScale, (scale) => value / scale))
      }))
      const schema = Schema.TemplateLiteralParser(["value:", part])
      assert.deepStrictEqual(
        yield* Schema.decodeEffect(schema)("value:2").pipe(Effect.provideService(DecodeScale, 3)),
        ["value:", 6]
      )
      assert.strictEqual(
        yield* Schema.encodeEffect(schema)(["value:", 6]).pipe(Effect.provideService(EncodeScale, 2)),
        "value:3"
      )
    }))
})
