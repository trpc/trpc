import { assert } from "@effect/vitest"
import { Effect, Schema, SchemaAST, SchemaGetter, SchemaTransformation } from "effect"
import { runInNewContext } from "node:vm"
import { describe, it } from "vitest"
import { deepStrictEqual, doesNotThrow, strictEqual, throws } from "../utils/assert.ts"

describe("SchemaAST", () => {
  describe("mapOrSame", () => {
    it("returns the original array when no element changes", () => {
      const input = [{ value: 1 }, { value: 2 }]
      strictEqual(SchemaAST.mapOrSame(input, (value) => value), input)
    })

    it("returns all mapped elements when an element changes", () => {
      const first = { value: 1 }
      const second = { value: 2 }
      const third = { value: 3 }
      const replacement = { value: 4 }
      const input = [first, second, third]
      let calls = 0
      const output = SchemaAST.mapOrSame(input, (value) => {
        calls++
        return value === second ? replacement : value
      })

      deepStrictEqual(output, [first, replacement, third])
      strictEqual(output === input, false)
      strictEqual(calls, input.length)
    })
  })

  describe("AST updates", () => {
    it("preserves the prototype, children and enumerable symbols when updating a frozen node", () => {
      const marker = Symbol("marker")
      class Objects extends SchemaAST.Objects {
        readonly [marker] = { value: "custom" }
      }
      const ast = Object.freeze(new Objects([new SchemaAST.PropertySignature("a", SchemaAST.string)], []))
      const checks: SchemaAST.Checks = [Schema.isMinProperties(1)]
      const updated = SchemaAST.replaceChecks(ast, checks)

      strictEqual(updated === ast, false)
      strictEqual(updated instanceof Objects, true)
      strictEqual(updated[marker], ast[marker])
      strictEqual(updated.propertySignatures, ast.propertySignatures)
      strictEqual(updated.indexSignatures, ast.indexSignatures)
      strictEqual(updated.checks, checks)
      strictEqual(ast.checks, undefined)
      deepStrictEqual(Schema.decodeUnknownSync(Schema.make<Schema.Codec<unknown>>(updated))({ a: "value" }), {
        a: "value"
      })
    })

    it("keeps identity for unchanged checks, encoding and context", () => {
      const ast = Schema.NumberFromString.check(Schema.isGreaterThan(0)).ast

      strictEqual(SchemaAST.replaceChecks(ast, ast.checks), ast)
      strictEqual(SchemaAST.replaceEncoding(ast, ast.encoding), ast)
      strictEqual(SchemaAST.replaceContext(ast, ast.context), ast)
    })

    it("removes encoding without changing the source or its checks", () => {
      const ast = Schema.NumberFromString.check(Schema.isGreaterThan(0)).ast
      const encoding = ast.encoding
      const updated = SchemaAST.replaceEncoding(ast, undefined)

      strictEqual(updated.encoding, undefined)
      strictEqual(updated.checks, ast.checks)
      strictEqual(ast.encoding, encoding)
      strictEqual(encoding === undefined, false)
      strictEqual(Schema.decodeUnknownSync(Schema.make<Schema.Codec<unknown>>(updated))(1), 1)
      throws(() => Schema.decodeUnknownSync(Schema.make<Schema.Codec<unknown>>(updated))(-1))
    })

    it("restores context owners without losing changes made to a contextual node", () => {
      const ast = Schema.Struct({ a: Schema.String }).ast
      const context = new SchemaAST.Context(true, false)
      const contextual = SchemaAST.replaceContext(ast, context)
      const checks: SchemaAST.Checks = [Schema.isMinProperties(1)]
      const checked = SchemaAST.replaceChecks(contextual, checks)
      const restored = SchemaAST.replaceContext(checked, undefined)

      strictEqual(SchemaAST.getContextOwner(contextual), ast)
      strictEqual(SchemaAST.replaceContext(contextual, undefined), ast)
      strictEqual(SchemaAST.getContextOwner(checked), checked)
      strictEqual(restored.checks, checks)
      strictEqual(restored.context, undefined)
      strictEqual(checked.context, context)
      strictEqual(ast.context, undefined)
    })

    it("shares prepared template data when merging annotations", () => {
      const ast = Schema.TemplateLiteral(["item-", Schema.String]).ast
      const annotated = SchemaAST.annotate(ast, { title: "Item" })
      const updated = SchemaAST.annotate(annotated, { description: "An item identifier" })

      strictEqual(updated.parts, ast.parts)
      strictEqual(updated.encodedParts, ast.encodedParts)
      strictEqual(updated.literals, ast.literals)
      strictEqual(updated.suffixLengths, ast.suffixLengths)
      deepStrictEqual(updated.annotations, { title: "Item", description: "An item identifier" })
      strictEqual(annotated.annotations?.description, undefined)
      strictEqual(Schema.decodeUnknownSync(Schema.make<Schema.Codec<unknown>>(updated))("item-a"), "item-a")
    })

    it("restores the outer context without restoring an earlier encoding", () => {
      const source = Schema.NumberFromString.ast
      const optional = SchemaAST.optionalKey(source)
      const restored = SchemaAST.replaceContext(optional, source.context)
      const schema = Schema.make<Schema.Codec<unknown>>(
        new SchemaAST.Objects([new SchemaAST.PropertySignature("value", restored)], [])
      )

      assert.strictEqual(restored.encoding, optional.encoding)
      assert.strictEqual(SchemaAST.isOptional(SchemaAST.toType(restored)), false)
      assert.strictEqual(SchemaAST.isOptional(SchemaAST.toEncoded(restored)), true)
      assert.deepStrictEqual(Schema.decodeUnknownSync(schema)({ value: "1" }), { value: 1 })
      assert.strictEqual(Schema.decodeUnknownExit(schema)({})._tag, "Failure")
    })

    it("shares the memoized suspended thunk when copying metadata", () => {
      let calls = 0
      const ast = new SchemaAST.Suspend(() => {
        calls++
        return SchemaAST.string
      })
      const annotated = SchemaAST.annotate(ast, { title: "Suspended string" })

      strictEqual(calls, 0)
      strictEqual(annotated.thunk, ast.thunk)
      strictEqual(annotated.thunk(), SchemaAST.string)
      strictEqual(ast.thunk(), SchemaAST.string)
      strictEqual(calls, 1)
      throws(
        () => SchemaAST.replaceChecks(annotated, [Schema.isMinLength(1)]),
        new Error("Cannot add checks to Suspend")
      )
    })
  })

  it("stores constructor defaults directly in the context", () => {
    const defaultValue = Effect.succeed("default")
    const ast = SchemaAST.withConstructorDefault(SchemaAST.string, defaultValue)
    strictEqual(ast.context?.constructorDefault, defaultValue)
  })

  describe("Suspend", () => {
    it("memoizes the thunk", () => {
      let calls = 0
      const ast = new SchemaAST.Suspend(() => {
        calls++
        return SchemaAST.string
      })

      strictEqual(calls, 0)
      strictEqual(ast.thunk(), SchemaAST.string)
      strictEqual(ast.thunk(), SchemaAST.string)
      strictEqual(calls, 1)
    })
  })

  it("isJson", () => {
    strictEqual(SchemaAST.isJson(null), true)
    strictEqual(SchemaAST.isJson(undefined), false)
    strictEqual(SchemaAST.isJson(true), true)
    strictEqual(SchemaAST.isJson(false), true)
    strictEqual(SchemaAST.isJson("string"), true)
    strictEqual(SchemaAST.isJson(1), true)
    strictEqual(SchemaAST.isJson(1.5), true)
    strictEqual(SchemaAST.isJson(1n), false)
    strictEqual(SchemaAST.isJson(NaN), false)
    strictEqual(SchemaAST.isJson(Infinity), false)
    strictEqual(SchemaAST.isJson(-Infinity), false)
    strictEqual(SchemaAST.isJson(Symbol.for("symbol")), false)
    strictEqual(SchemaAST.isJson([]), true)
    strictEqual(SchemaAST.isJson([1]), true)
    strictEqual(SchemaAST.isJson(new Array(1)), false)
    strictEqual(SchemaAST.isJson([1, undefined]), false)
    strictEqual(SchemaAST.isJson([1, 1n]), false)
    let getterCalls = 0
    const arrayWithGetter = [0]
    Object.defineProperty(arrayWithGetter, "0", {
      enumerable: true,
      get() {
        getterCalls++
        return 1
      }
    })
    strictEqual(SchemaAST.isJson(arrayWithGetter), true)
    strictEqual(getterCalls, 1)
    strictEqual(SchemaAST.isJson({}), true)
    strictEqual(SchemaAST.isJson({ a: 1 }), true)
    strictEqual(SchemaAST.isJson({ a: undefined }), false)
    strictEqual(SchemaAST.isJson({ a: 1, b: 1n }), false)
    strictEqual(SchemaAST.isJson(new Map([["a", 1]])), false)
    strictEqual(SchemaAST.isJson(new Set([1])), false)
    strictEqual(SchemaAST.isJson(new Date(0)), false)
    strictEqual(SchemaAST.isJson(/a/), false)
    strictEqual(SchemaAST.isJson(new Uint8Array([1])), false)
    class A {
      readonly a = 1
    }
    strictEqual(SchemaAST.isJson(new A()), false)
    const nullPrototype: Record<string, unknown> = Object.create(null)
    nullPrototype.a = { b: [1, true, null] }
    strictEqual(SchemaAST.isJson(nullPrototype), true)
    const crossRealmRecord: unknown = runInNewContext("({ a: [1, true, null] })")
    strictEqual(SchemaAST.isJson(crossRealmRecord), true)
    const crossRealmClass: unknown = runInNewContext("new (class A { a = 1 })()")
    strictEqual(SchemaAST.isJson(crossRealmClass), false)
    // nested
    strictEqual(SchemaAST.isJson({ a: { b: 1 } }), true)
    strictEqual(SchemaAST.isJson({ a: [1, { b: "c" }] }), true)
    strictEqual(SchemaAST.isJson({ a: { b: 1n } }), false)
    // circular reference
    const circular: Record<string, unknown> = {}
    circular.self = circular
    strictEqual(SchemaAST.isJson(circular), false)
    // accepts DAGs
    const shared = { a: 1 }
    strictEqual(SchemaAST.isJson({ x: shared, y: shared }), true)
    strictEqual(SchemaAST.isJson([shared, { nested: shared }]), true)
    // Nested DAG
    const deeper = { parent: { left: shared, right: shared } }
    strictEqual(SchemaAST.isJson(deeper), true)
  })

  it("isJson is stack safe", () => {
    let valid: unknown = null
    let invalid: unknown = undefined
    for (let i = 0; i < 25_000; i++) {
      valid = [valid]
      invalid = [invalid]
    }
    strictEqual(SchemaAST.isJson(valid), true)
    strictEqual(SchemaAST.isJson(invalid), false)
  })

  it("Schema.toCodecJson rejects non-JSON objects", () => {
    const encode = Schema.encodeUnknownExit(Schema.toCodecJson(Schema.Unknown))
    strictEqual(encode(new Map([["a", 1]]))._tag, "Failure")
  })

  it("isStringTree", () => {
    strictEqual(SchemaAST.isStringTree(undefined), true)
    strictEqual(SchemaAST.isStringTree("string"), true)
    strictEqual(SchemaAST.isStringTree(null), false)
    strictEqual(SchemaAST.isStringTree(true), false)
    strictEqual(SchemaAST.isStringTree(false), false)
    strictEqual(SchemaAST.isStringTree(1), false)
    strictEqual(SchemaAST.isStringTree(1n), false)
    strictEqual(SchemaAST.isStringTree(Symbol.for("symbol")), false)
    strictEqual(SchemaAST.isStringTree([]), true)
    strictEqual(SchemaAST.isStringTree(["a"]), true)
    strictEqual(SchemaAST.isStringTree(["a", undefined]), true)
    strictEqual(SchemaAST.isStringTree(["a", 1]), false)
    strictEqual(SchemaAST.isStringTree(new Array(1)), true)
    const sparseWithInheritedValue = new Array(1)
    const arrayPrototype = Object.create(Array.prototype)
    arrayPrototype[0] = 1
    Object.setPrototypeOf(sparseWithInheritedValue, arrayPrototype)
    strictEqual(SchemaAST.isStringTree(sparseWithInheritedValue), false)
    strictEqual(SchemaAST.isStringTree({}), true)
    strictEqual(SchemaAST.isStringTree({ a: "b" }), true)
    strictEqual(SchemaAST.isStringTree({ a: undefined }), true)
    strictEqual(SchemaAST.isStringTree({ a: "b", c: 1 }), false)
    strictEqual(SchemaAST.isStringTree(new Map([["a", "b"]])), false)
    strictEqual(SchemaAST.isStringTree(new Date(0)), false)
    class A {
      readonly a = "a"
    }
    strictEqual(SchemaAST.isStringTree(new A()), false)
    // nested
    strictEqual(SchemaAST.isStringTree({ a: { b: "c" } }), true)
    strictEqual(SchemaAST.isStringTree({ a: ["b", { c: "d" }] }), true)
    strictEqual(SchemaAST.isStringTree({ a: { b: 1 } }), false)
    // DAG
    const shared = { value: "a" }
    strictEqual(SchemaAST.isStringTree({ left: shared, right: shared }), true)
    // circular reference
    const circular: Record<string, unknown> = {}
    circular.self = circular
    strictEqual(SchemaAST.isStringTree(circular), false)
  })

  it("isStringTree is stack safe", () => {
    let valid: unknown = "value"
    let invalid: unknown = 1
    for (let i = 0; i < 25_000; i++) {
      valid = { value: valid }
      invalid = { value: invalid }
    }
    strictEqual(SchemaAST.isStringTree(valid), true)
    strictEqual(SchemaAST.isStringTree(invalid), false)
  })

  describe("toType", () => {
    it("preserves different key optionality on the decoded and encoded sides", () => {
      const value = Schema.NumberFromString.pipe(Schema.withDecodingDefaultKey(Effect.succeed("1")))
      const schema = Schema.Struct({ value })

      assert.strictEqual(SchemaAST.isOptional(SchemaAST.toType(value.ast)), false)
      assert.strictEqual(SchemaAST.isOptional(SchemaAST.toEncoded(value.ast)), true)
      assert.deepStrictEqual(Schema.decodeUnknownSync(schema)({}), { value: 1 })
      assert.deepStrictEqual(Schema.decodeUnknownSync(Schema.toEncoded(schema))({}), {})
      assert.strictEqual(Schema.decodeUnknownExit(Schema.toType(schema))({})._tag, "Failure")
    })

    it("preserves declaration parsers when projecting contextual copies", () => {
      const ast = new SchemaAST.Declaration(
        [],
        () => () => Effect.succeed("decoded"),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        () => () => Effect.succeed("encoded")
      )
      const contextual = SchemaAST.optionalKey(ast)
      const decoded = SchemaAST.toType(contextual)
      const encoded = SchemaAST.toEncoded(contextual)

      assert.strictEqual(SchemaAST.isOptional(decoded), true)
      assert.strictEqual(SchemaAST.isOptional(encoded), true)
      assert.strictEqual(Schema.decodeUnknownSync(Schema.make<Schema.Codec<string>>(decoded))("input"), "decoded")
      assert.strictEqual(Schema.decodeUnknownSync(Schema.make<Schema.Codec<string>>(encoded))("input"), "encoded")
      assert.strictEqual(
        Schema.decodeUnknownSync(Schema.make<Schema.Codec<string>>(SchemaAST.toType(SchemaAST.flip(contextual))))(
          "input"
        ),
        "encoded"
      )
    })

    it("removes outer encoding and promotes checks when children are unchanged", () => {
      const encoding: SchemaAST.Encoding = [new SchemaAST.Link(SchemaAST.unknown, SchemaTransformation.passthrough())]
      const context = new SchemaAST.Context(true, false)
      const check = Schema.makeFilter((value: { readonly a: string }) => value.a.length > 1)
      const ast = Object.freeze(
        new SchemaAST.Objects(
          [new SchemaAST.PropertySignature("a", SchemaAST.string)],
          [],
          { title: "Object" },
          undefined,
          encoding,
          context,
          [check]
        )
      )
      const projected = SchemaAST.toType(ast)
      const schema = Schema.make<Schema.Codec<unknown>>(projected)

      strictEqual(projected.encoding, undefined)
      strictEqual(projected.encodingChecks, undefined)
      strictEqual(projected.checks?.[0], check)
      strictEqual(projected.propertySignatures, ast.propertySignatures)
      strictEqual(projected.annotations, ast.annotations)
      strictEqual(projected.context, context)
      strictEqual(ast.encoding, encoding)
      strictEqual(ast.encodingChecks?.[0], check)
      strictEqual(SchemaAST.toType(ast), projected)
      strictEqual(SchemaAST.toType(projected), projected)
      deepStrictEqual(Schema.decodeUnknownSync(schema)({ a: "ab" }), { a: "ab" })
      throws(() => Schema.decodeUnknownSync(schema)({ a: "a" }))
    })

    it("keeps only structural encoding checks when outer encoding and child encoding are removed", () => {
      const structural = Schema.isMinProperties(1)
      const encoded = Schema.makeFilter((value: { readonly a: string }) => value.a.length > 1)
      const decoded = Schema.makeFilter((value: { readonly a: number }) => value.a > 0)
      const encoding: SchemaAST.Encoding = [new SchemaAST.Link(SchemaAST.unknown, SchemaTransformation.passthrough())]
      const ast = new SchemaAST.Objects(
        [new SchemaAST.PropertySignature("a", Schema.NumberFromString.ast)],
        [],
        undefined,
        [decoded],
        encoding,
        undefined,
        [encoded.and(structural)]
      )
      const projected = SchemaAST.toType(ast)
      const schema = Schema.make<Schema.Codec<unknown>>(projected)

      strictEqual(projected.encoding, undefined)
      strictEqual(projected.encodingChecks, undefined)
      deepStrictEqual(projected.checks, [decoded, structural])
      strictEqual(projected.propertySignatures[0].type, SchemaAST.toType(Schema.NumberFromString.ast))
      strictEqual(ast.encoding, encoding)
      strictEqual(ast.propertySignatures[0].type, Schema.NumberFromString.ast)
      strictEqual(SchemaAST.toType(projected), projected)
      deepStrictEqual(Schema.decodeUnknownSync(schema)({ a: 1 }), { a: 1 })
      throws(() => Schema.decodeUnknownSync(schema)({ a: -1 }))
      throws(() => Schema.decodeUnknownSync(schema)({ a: "1" }))
    })

    it("preserves lazy recursive references when removing a suspended node's encoding", () => {
      let calls = 0
      const encoding: SchemaAST.Encoding = [new SchemaAST.Link(SchemaAST.unknown, SchemaTransformation.passthrough())]
      const ast: SchemaAST.Suspend = new SchemaAST.Suspend(
        () => {
          calls++
          return new SchemaAST.Objects([
            new SchemaAST.PropertySignature("value", Schema.NumberFromString.ast),
            new SchemaAST.PropertySignature("next", new SchemaAST.Union([SchemaAST.null, ast]))
          ], [])
        },
        undefined,
        undefined,
        encoding
      )
      const projected = SchemaAST.toType(ast)

      strictEqual(calls, 0)
      strictEqual(projected.encoding, undefined)
      strictEqual(ast.encoding, encoding)
      strictEqual(SchemaAST.toType(ast), projected)
      strictEqual(SchemaAST.toType(projected), projected)
      const body = projected.thunk()
      strictEqual(calls, 1)
      strictEqual(projected.thunk(), body)
      if (!SchemaAST.isObjects(body)) throw new Error("Expected Objects")
      const next = body.propertySignatures[1].type
      if (!SchemaAST.isUnion(next)) throw new Error("Expected Union")
      strictEqual(next.types[1], projected)
      const input = { value: 1, next: { value: 2, next: null } }
      deepStrictEqual(Schema.decodeUnknownSync(Schema.make<Schema.Codec<unknown>>(projected))(input), input)
      strictEqual(calls, 1)
    })

    it("is idempotent for suspended schemas", () => {
      const schema = Schema.suspend(() => Schema.Struct({ a: Schema.NumberFromString }))
      const ast = SchemaAST.toType(schema.ast)

      strictEqual(SchemaAST.toType(ast), ast)
    })

    it("toEncoded is idempotent for suspended schemas", () => {
      const schema = Schema.suspend(() => Schema.Struct({ a: Schema.NumberFromString }))
      const ast = SchemaAST.toEncoded(schema.ast)

      strictEqual(SchemaAST.toEncoded(ast), ast)
    })

    it("promotes encodingChecks when contained type shape is preserved", () => {
      const schema = Schema.Struct({ a: Schema.String }).pipe(
        Schema.flip,
        Schema.check(Schema.makeFilter((o) => o.a.length > 1)),
        Schema.flip
      )

      const ast = SchemaAST.toType(schema.ast)

      strictEqual(SchemaAST.isObjects(ast), true)
      strictEqual(ast.checks?.length, 1)
      strictEqual(ast.encodingChecks, undefined)
    })

    it("toEncoded preserves parent checks when projecting checked children without transformations", () => {
      const schema = Schema.Struct({
        xs: Schema.Array(Schema.String).check(Schema.isMinLength(1))
      }).check(Schema.makeFilter((o) => o.xs[0] === "ok"))
      const encoded = Schema.toEncoded(schema)

      strictEqual(Schema.decodeUnknownExit(schema)({ xs: ["bad"] })._tag, "Failure")
      strictEqual(Schema.decodeUnknownExit(encoded)({ xs: ["bad"] })._tag, "Failure")
      deepStrictEqual(Schema.decodeUnknownSync(encoded)({ xs: ["ok"] }), { xs: ["ok"] })
    })

    it("toEncoded preserves union checks when projecting checked members without transformations", () => {
      const schema = Schema.Union([
        Schema.Array(Schema.String).check(Schema.isMinLength(1)),
        Schema.String
      ]).check(Schema.makeFilter((value) => typeof value === "string" || value[0] === "ok"))
      const encoded = Schema.toEncoded(schema)

      strictEqual(Schema.decodeUnknownExit(encoded)(["bad"])._tag, "Failure")
      deepStrictEqual(Schema.decodeUnknownSync(encoded)(["ok"]), ["ok"])
      strictEqual(Schema.decodeUnknownSync(encoded)("ok"), "ok")
    })

    it("toEncoded drops parent checks when a union member has a transformation", () => {
      const schema = Schema.Struct({
        a: Schema.Union([Schema.NumberFromString, Schema.Boolean])
      }).check(Schema.makeFilter((o) => typeof o.a === "boolean" || o.a > 0))
      const encoded = Schema.toEncoded(schema)

      strictEqual(Schema.decodeUnknownExit(schema)({ a: "-1" })._tag, "Failure")
      deepStrictEqual(Schema.decodeUnknownSync(encoded)({ a: "-1" }), { a: "-1" })
    })

    it.each([false, true])("treats suspended children as opaque (already evaluated: %s)", (evaluated) => {
      let calls = 0
      const suspended = Schema.suspend(() => {
        calls++
        return Schema.String
      })
      if (evaluated) Schema.decodeUnknownSync(suspended)("ok")
      const schema = Schema.Struct({ a: Schema.optionalKey(suspended) }).check(
        Schema.makeFilter((o) => o.a !== "bad"),
        Schema.isMinProperties(1)
      )
      const encoded = Schema.toEncoded(schema)

      strictEqual(calls, evaluated ? 1 : 0)
      strictEqual(Schema.decodeUnknownExit(encoded)({})._tag, "Failure")
      deepStrictEqual(Schema.decodeUnknownSync(encoded)({ a: "bad" }), { a: "bad" })
    })

    it("drops encodingChecks when contained type shape changes", () => {
      const schema = Schema.Struct({ a: Schema.FiniteFromString }).pipe(
        Schema.flip,
        Schema.check(Schema.makeFilter((o) => o.a.length > 1)),
        Schema.flip
      )

      const ast = SchemaAST.toType(schema.ast)

      strictEqual(SchemaAST.isObjects(ast), true)
      strictEqual(ast.checks, undefined)
      strictEqual(ast.encodingChecks, undefined)
    })

    it("preserves structural checks when contained type shape changes", () => {
      const check = Schema.isMinProperties(1)
      const schema = Schema.Struct({ a: Schema.NumberFromString }).check(check)

      const ast = SchemaAST.toEncoded(schema.ast)

      strictEqual(SchemaAST.isObjects(ast), true)
      strictEqual(ast.checks?.[0], check)
    })

    it("preserves structural checks when contained element shape changes", () => {
      const check = Schema.isMinLength(1)
      const schema = Schema.Array(Schema.NumberFromString).check(check)

      const ast = SchemaAST.toEncoded(schema.ast)

      strictEqual(SchemaAST.isArrays(ast), true)
      strictEqual(ast.checks?.[0], check)
    })

    it("preserves structural checks when a declaration type parameter shape changes", () => {
      const check = Schema.isMinSize(1)
      const schema = Schema.ReadonlySet(Schema.NumberFromString).check(check)

      const ast = SchemaAST.toEncoded(schema.ast)

      strictEqual(SchemaAST.isDeclaration(ast), true)
      strictEqual(ast.checks?.[0], check)
    })

    it("preserves only the structural members of a mixed filter group", () => {
      const structural = Schema.isMinProperties(1)
      const group = structural.and(Schema.makeFilter<object>(() => true))
      const schema = Schema.Struct({ a: Schema.NumberFromString }).check(group)

      const ast = SchemaAST.toEncoded(schema.ast)

      strictEqual(SchemaAST.isObjects(ast), true)
      strictEqual(ast.checks?.length, 1)
      strictEqual(ast.checks?.[0], structural)
    })
  })

  describe("collectSentinels", () => {
    describe("Declaration", () => {
      it("~sentinels", () => {
        class A {
          readonly _tag = "A"
        }
        const schema = Schema.instanceOf(A, { "~sentinels": [{ key: "_tag", literal: "A" }] })
        const ast = schema.ast
        deepStrictEqual(SchemaAST.collectSentinels(ast), [{ key: "_tag", literal: "A" }])
      })
    })

    describe("Struct", () => {
      it("required tag", () => {
        const schema = Schema.Struct({
          _tag: Schema.Literal("a"),
          a: Schema.String
        })
        const ast = schema.ast
        deepStrictEqual(SchemaAST.collectSentinels(ast), [{ key: "_tag", literal: "a" }])
      })

      it("optional tag", () => {
        const schema = Schema.Struct({
          _tag: Schema.optionalKey(Schema.Literal("a")),
          a: Schema.String
        })
        const ast = schema.ast
        deepStrictEqual(SchemaAST.collectSentinels(ast), [])
      })
    })

    describe("Tuple", () => {
      it("required element", () => {
        const schema = Schema.Tuple([Schema.Literal("a"), Schema.Number])
        const ast = schema.ast
        deepStrictEqual(SchemaAST.collectSentinels(ast), [{ key: 0, literal: "a" }])
      })

      it("optional element", () => {
        const schema = Schema.Tuple([Schema.Number, Schema.optionalKey(Schema.Literal("a"))])
        const ast = schema.ast
        deepStrictEqual(SchemaAST.collectSentinels(ast), [])
      })
    })

    it("Declaration", () => {
      class A {
        readonly _tag = "A"
      }
      const schema = Schema.instanceOf(
        A,
        { "~sentinels": [{ key: "_tag", literal: "A" }] }
      )
      const ast = schema.ast
      deepStrictEqual(SchemaAST.collectSentinels(ast), [{ key: "_tag", literal: "A" }])
    })

    it("Class", () => {
      class A extends Schema.Class<A>("A")({
        type: Schema.Literal("A"),
        a: Schema.String
      }) {}
      const ast = A.ast
      deepStrictEqual(SchemaAST.collectSentinels(ast), [{ key: "type", literal: "A" }])
    })

    it("TaggedClass", () => {
      class A extends Schema.TaggedClass<A>()("A", {
        a: Schema.String
      }) {}
      const ast = A.ast
      deepStrictEqual(SchemaAST.collectSentinels(ast), [{ key: "_tag", literal: "A" }])
    })

    it("Error", () => {
      class E extends Schema.Error<E>("E")({
        type: Schema.Literal("E"),
        e: Schema.String
      }) {}
      const ast = E.ast
      deepStrictEqual(SchemaAST.collectSentinels(ast), [{ key: "type", literal: "E" }])
    })

    it("TaggedError", () => {
      class E extends Schema.TaggedError<E>()("E", {
        e: Schema.String
      }) {}
      const ast = E.ast
      deepStrictEqual(SchemaAST.collectSentinels(ast), [{ key: "_tag", literal: "E" }])
    })

    it("Union: the sentinels common to every member", () => {
      const shared = Schema.Union([
        Schema.Struct({ kind: Schema.Literal("a"), variant: Schema.Literal("x") }),
        Schema.Struct({ kind: Schema.Literal("a"), variant: Schema.Literal("y") })
      ])
      deepStrictEqual(SchemaAST.collectSentinels(shared.ast), [{ key: "kind", literal: "a" }])

      const disjoint = Schema.Union([
        Schema.Struct({ kind: Schema.Literal("a") }),
        Schema.Struct({ kind: Schema.Literal("b") })
      ])
      deepStrictEqual(SchemaAST.collectSentinels(disjoint.ast), [])

      // A suspended member stays opaque, so the intersection is conservative.
      const withSuspend = Schema.Union([
        Schema.Struct({ kind: Schema.Literal("a") }),
        Schema.suspend(() => Schema.Struct({ kind: Schema.Literal("a") }))
      ])
      deepStrictEqual(SchemaAST.collectSentinels(withSuspend.ast), [])
    })
  })

  describe("getCandidateIndex", () => {
    it("should exclude never", () => {
      const schema = Schema.Union([Schema.String, Schema.Never])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      deepStrictEqual(index("a", false), [0])
    })

    it("should exclude by type", () => {
      const schema = Schema.NullishOr(Schema.String)
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      deepStrictEqual(index("a", false), [0])
      deepStrictEqual(index(null, false), [1])
      deepStrictEqual(index(undefined, false), [2])
      deepStrictEqual(index(1, false), [])
    })

    it("should exclude by literals", () => {
      const schema = Schema.Union([
        Schema.UniqueSymbol(Symbol.for("a")),
        Schema.Literal("b"),
        Schema.String
      ])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      deepStrictEqual(index(Symbol.for("a"), false), [0])
      deepStrictEqual(index("b", false), [1, 2])
      deepStrictEqual(index("c", false), [2])
      deepStrictEqual(index(1, false), [])
      deepStrictEqual(index(undefined, false), [])

      const reversed = Schema.Union([Schema.String, Schema.Literal("b")]).ast
      deepStrictEqual(SchemaAST.getCandidateIndex(reversed.types)("c", false), [0])
    })

    it("Literals", () => {
      const schema = Schema.Literals(["a", "b", "c"])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      deepStrictEqual(index("a", false), [0])
      deepStrictEqual(index("b", false), [1])
      deepStrictEqual(index("c", false), [2])
      deepStrictEqual(index("d", false), [])
      deepStrictEqual(index(null, false), [])
      deepStrictEqual(index(undefined, false), [])
    })

    it("literal-only union with a unique symbol", () => {
      const symbol = Symbol.for("a")
      const schema = Schema.Union([Schema.UniqueSymbol(symbol), Schema.Literal("b")])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      deepStrictEqual(index(symbol, false), [0])
      deepStrictEqual(index(Symbol("a"), false), [])
    })

    it("should preserve duplicate literal candidates in member order", () => {
      const schema = Schema.Union([
        Schema.Literal("a").transform("first"),
        Schema.Literal("a").transform("second"),
        Schema.Never
      ])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      deepStrictEqual(index("a", false), [0, 1])
      deepStrictEqual(index("b", false), [])
    })

    it("String | Literals", () => {
      const schema = Schema.Union([Schema.String, Schema.Literals(["a", "b", "c"])])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      deepStrictEqual(index(undefined, false), [])
    })

    it("should handle tagged structs", () => {
      const schema = Schema.Union([
        Schema.Struct({ _tag: Schema.tag("a"), a: Schema.String }),
        Schema.Struct({ _tag: Schema.tag("b"), b: Schema.Number }),
        Schema.String
      ])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      deepStrictEqual(index({}, false), [])
      deepStrictEqual(index({ _tag: "a" }, false), [0])
      deepStrictEqual(index({ _tag: "b" }, false), [1])
      deepStrictEqual(index({ _tag: "c" }, false), [])
      deepStrictEqual(index("", false), [2])
      deepStrictEqual(index(1, false), [])
    })

    it("constructor mode should keep tagged candidates only when an object discriminator is missing", () => {
      const schema = Schema.Union([
        Schema.Struct({ _tag: Schema.tag("a"), a: Schema.String }),
        Schema.Struct({ _tag: Schema.tag("b"), b: Schema.Number })
      ])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)

      deepStrictEqual(index({}, true), [0, 1])
      deepStrictEqual(index({ _tag: undefined }, true), [0, 1])
      deepStrictEqual(index({ _tag: "a" }, true), [0])
      deepStrictEqual(index("a", true), [])
    })

    it("should handle function-valued declarations with sentinels", () => {
      const a = Schema.declare(
        (input): input is () => void => typeof input === "function",
        { "~sentinels": [{ key: "kind", literal: "a" }] }
      )
      const b = Schema.declare(
        (input): input is () => void => typeof input === "function",
        { "~sentinels": [{ key: "kind", literal: "b" }] }
      )
      const schema = Schema.Union([a, b])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      const input = Object.assign(() => {}, { kind: "a" })
      deepStrictEqual(index(input, false), [0])
    })

    it("should preserve duplicate candidates with a common discriminator", () => {
      const member = Schema.Struct({ kind: Schema.Literal("a"), value: Schema.String })
      const schema = Schema.Union([
        member,
        Schema.Struct({ kind: Schema.Literal("b"), value: Schema.Number }),
        member,
        Schema.Never
      ])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      deepStrictEqual(index({ kind: "a" }, false), [0, 2])
      deepStrictEqual(index({ kind: "b" }, false), [1])
      deepStrictEqual(index({ kind: "c" }, false), [])
      deepStrictEqual(index({}, false), [])
      deepStrictEqual(index("a", false), [])
    })

    it("should protect cached common sentinel candidates from external mutation", () => {
      const schema = Schema.Union([
        Schema.Struct({ kind: Schema.Literal("a") }),
        Schema.Struct({ kind: Schema.Literal("b") })
      ])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      const input = { kind: "a" }
      const candidates = index(input, false)
      Reflect.set(candidates, candidates.length, 1)
      deepStrictEqual(index(input, false), [0])
    })

    it("should reuse the candidates of a runtime type without literals", () => {
      const schema = Schema.NullOr(Schema.Struct({ a: Schema.Number }))
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      const candidates = index({ a: 1 }, false)
      deepStrictEqual(candidates, [0])
      strictEqual(index({ b: 2 }, false), candidates)
      strictEqual(Object.isFrozen(candidates), true)
      deepStrictEqual(index(null, false), [1])
    })

    it("should reuse non-discriminated candidates of a tagged union", () => {
      const schema = Schema.Union([
        Schema.Struct({ _tag: Schema.tag("a"), a: Schema.String }),
        Schema.Struct({ b: Schema.Number }),
        Schema.String,
        Schema.Literal(1)
      ])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      const strings = index("x", false)
      deepStrictEqual(strings, [2])
      strictEqual(index("y", false), strings)
      strictEqual(Object.isFrozen(strings), true)
      const objects = index({ _tag: "c" }, false)
      deepStrictEqual(objects, [1])
      strictEqual(index({ _tag: "d" }, false), objects)
      strictEqual(Object.isFrozen(objects), true)
      deepStrictEqual(index({ _tag: "a" }, false), [0, 1])
    })

    it("should handle candidates with different sentinel keys", () => {
      const schema = Schema.Union([
        Schema.Struct({
          kind: Schema.Literal("a"),
          status: Schema.Literal("ready"),
          value: Schema.String
        }),
        Schema.Struct({ status: Schema.Literal("ready"), value: Schema.String })
      ])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      deepStrictEqual(
        index({ kind: "a", status: "ready", value: "value" }, false),
        [0, 1]
      )
      deepStrictEqual(
        index({ kind: "b", status: "ready", value: "value" }, false),
        [1]
      )
      deepStrictEqual(
        index({ kind: undefined, status: "ready", value: "value" }, false),
        [1]
      )
    })

    it("should handle tagged tuples", () => {
      const schema = Schema.Union([
        Schema.Tuple([Schema.Literal("a"), Schema.String]),
        Schema.Tuple([Schema.Literal("b"), Schema.Number]),
        Schema.String
      ])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      deepStrictEqual(index([], false), [])
      deepStrictEqual(index(["a"], false), [0])
      deepStrictEqual(index(["b"], false), [1])
      deepStrictEqual(index(["c"], false), [])
      deepStrictEqual(index("", false), [2])
      deepStrictEqual(index(1, false), [])
    })

    it("should handle tagged tuples with unique symbol sentinels", () => {
      const a = Symbol.for("a")
      const b = Symbol.for("b")
      const schema = Schema.Union([
        Schema.Tuple([Schema.UniqueSymbol(a), Schema.String]),
        Schema.Tuple([Schema.UniqueSymbol(b), Schema.Number])
      ])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      deepStrictEqual(index([a, "value"], false), [0])
      deepStrictEqual(index([b, 1], false), [1])
      deepStrictEqual(index([Symbol("a"), "value"], false), [])
    })

    it(`should deduplicate repeated declaration sentinels in "oneOf" mode`, () => {
      const member = Schema.declare(
        (input): input is object => typeof input === "object" && input !== null,
        {
          "~sentinels": [
            { key: "kind", literal: "a" },
            { key: "kind", literal: "a" }
          ]
        }
      )
      const schema = Schema.Union([member], { mode: "oneOf" })
      const input = { kind: "a" }
      strictEqual(Schema.decodeUnknownSync(schema)(input), input)
    })

    it("should dispatch a nested union member by its common sentinel", () => {
      const hosted = Schema.Union([
        Schema.Struct({ kind: Schema.Literal("a"), variant: Schema.Literal("x") }),
        Schema.Struct({ kind: Schema.Literal("a"), variant: Schema.Literal("y") })
      ])
      const flat = Schema.Struct({ kind: Schema.Literal("b") })
      const index = SchemaAST.getCandidateIndex(Schema.Union([hosted, flat]).ast.types)
      deepStrictEqual(index({ kind: "a" }, false), [0])
      deepStrictEqual(index({ kind: "b" }, false), [1])
    })

    it("should exclude members whose sentinel the input contradicts", () => {
      const schema = Schema.Union([
        Schema.Struct({ kind: Schema.Literal("a"), variant: Schema.Literal("x"), value: Schema.String }),
        Schema.Struct({ kind: Schema.Literal("a"), variant: Schema.Literal("y"), value: Schema.Number })
      ])
      const index = SchemaAST.getCandidateIndex(schema.ast.types)
      deepStrictEqual(index({ kind: "a", variant: "x" }, false), [0])
      deepStrictEqual(index({ kind: "a", variant: "z" }, false), [])
      deepStrictEqual(index({ kind: "a", variant: undefined }, false), [])
      // A missing sentinel key does not exclude: the member still owes the error.
      deepStrictEqual(index({ kind: "a" }, false), [0, 1])
      deepStrictEqual(index({ kind: "a", variant: undefined }, true), [0, 1])
    })
  })

  describe("getIndexSignatureKeys", () => {
    it("String", () => {
      const sym = Symbol.for("sym")
      const input: { readonly [x: PropertyKey]: number } = { a: 1, b: 2, [sym]: 3 }
      deepStrictEqual(SchemaAST.getIndexSignatureKeys(input, Schema.String.ast, SchemaAST.defaultParseOptions), [
        "a",
        "b"
      ])
    })

    it("String with checks", () => {
      const input = { a: 1, ab: 2, b: 3 }
      deepStrictEqual(
        SchemaAST.getIndexSignatureKeys(
          input,
          Schema.String.check(Schema.isPattern(/^a/)).ast,
          SchemaAST.defaultParseOptions
        ),
        ["a", "ab"]
      )
    })

    it("transformed String with decoded checks", () => {
      const schema = Schema.String.pipe(Schema.decode(SchemaTransformation.snakeToCamel())).check(
        Schema.isPattern(/^aB$/)
      )
      const input = { a_b: 1, x_y: 2 }
      deepStrictEqual(SchemaAST.getIndexSignatureKeys(input, schema.ast, SchemaAST.defaultParseOptions), [
        "a_b",
        "x_y"
      ])
    })

    it("TemplateLiteral", () => {
      const schema = Schema.TemplateLiteral(["a"])
      const input = { a: 1, ab: 2, b: 3 }
      deepStrictEqual(SchemaAST.getIndexSignatureKeys(input, schema.ast, SchemaAST.defaultParseOptions), ["a"])
    })

    it("TemplateLiteral with checked parts", () => {
      const schema = Schema.TemplateLiteral(["a", Schema.NonEmptyString])
      const input = { a: 1, ab: 2, b: 3 }
      deepStrictEqual(SchemaAST.getIndexSignatureKeys(input, schema.ast, SchemaAST.defaultParseOptions), ["ab"])
    })

    it("Symbol", () => {
      const a = Symbol.for("a")
      const b = Symbol.for("b")
      const input: { readonly [x: PropertyKey]: number } = { c: 1, [a]: 2, [b]: 3 }
      deepStrictEqual(SchemaAST.getIndexSignatureKeys(input, Schema.Symbol.ast, SchemaAST.defaultParseOptions), [a, b])
    })

    it("Number", () => {
      const input = { "1": 1, "1.5": 2, "-2": 3, a: 4, NaN: 5, x1: 6, "1x": 7 }
      deepStrictEqual(SchemaAST.getIndexSignatureKeys(input, Schema.Number.ast, SchemaAST.defaultParseOptions), [
        "1",
        "1.5",
        "-2",
        "NaN"
      ])
    })

    it("Number with checks", () => {
      const input = { "1": 1, "1.5": 2, "-2": 3, a: 4, NaN: 5 }
      deepStrictEqual(SchemaAST.getIndexSignatureKeys(input, Schema.Int.ast, SchemaAST.defaultParseOptions), [
        "1",
        "-2"
      ])
    })

    it("Union", () => {
      const schema = Schema.Union([Schema.Symbol, Schema.Number])
      const sym = Symbol.for("sym")
      const input: { readonly [x: PropertyKey]: number } = { "1": 1, b: 2, [sym]: 3 }
      deepStrictEqual(SchemaAST.getIndexSignatureKeys(input, schema.ast, SchemaAST.defaultParseOptions), [sym, "1"])
    })
  })

  describe("record", () => {
    it("treats Never parameters as no keys", () => {
      const ast = SchemaAST.record(Schema.Never.ast, Schema.Number.ast)
      deepStrictEqual(ast.propertySignatures, [])
      deepStrictEqual(ast.indexSignatures, [])
    })

    it("ignores Never arms in union parameters", () => {
      const ast = SchemaAST.record(Schema.Union([Schema.String, Schema.Never]).ast, Schema.Number.ast)
      const indexSignature = ast.indexSignatures[0]!

      deepStrictEqual(ast.propertySignatures, [])
      strictEqual(ast.indexSignatures.length, 1)
      strictEqual(indexSignature.parameter, Schema.String.ast)
      strictEqual(indexSignature.type, Schema.Number.ast)
    })
  })

  describe("Union options", () => {
    it("preserves the complete options object through recur and flip", () => {
      const unionOptions: SchemaAST.UnionOptions = { mode: "oneOf" }
      const union = new SchemaAST.Union([Schema.NumberFromString.ast, Schema.String.ast], unionOptions)
      strictEqual(union.recur(SchemaAST.toEncoded).options, unionOptions)
      strictEqual(union.flip(SchemaAST.flip).options, unionOptions)
    })
  })

  describe("IndexSignature", () => {
    it("accepts valid parameters on both type and encoded side", () => {
      doesNotThrow(() => new SchemaAST.IndexSignature(Schema.String.ast, Schema.Number.ast))
      doesNotThrow(() => new SchemaAST.IndexSignature(Schema.NumberFromString.ast, Schema.Number.ast))
      doesNotThrow(() =>
        new SchemaAST.IndexSignature(
          Schema.Union([Schema.String, Schema.NumberFromString]).ast,
          Schema.Number.ast
        )
      )
    })

    it("rejects invalid type side parameters", () => {
      throws(
        () => new SchemaAST.IndexSignature(Schema.Literal("a").ast, Schema.Number.ast),
        new Error("Invalid index signature parameter Literal")
      )
    })

    it("rejects invalid encoded side parameters", () => {
      const StringFromBoolean = Schema.Boolean.pipe(
        Schema.decodeTo(Schema.String, {
          decode: SchemaGetter.transform((b: boolean) => globalThis.String(b)),
          encode: SchemaGetter.transform((s: string) => s === "true")
        })
      )
      throws(
        () => new SchemaAST.IndexSignature(StringFromBoolean.ast, Schema.Number.ast),
        new Error("Invalid index signature parameter String")
      )
      throws(
        () =>
          new SchemaAST.IndexSignature(
            Schema.Union([Schema.String, StringFromBoolean]).ast,
            Schema.Number.ast
          ),
        new Error("Invalid index signature parameter Union")
      )

      const UnionFromBoolean = Schema.Boolean.pipe(
        Schema.decodeTo(Schema.Union([Schema.String, Schema.Number]), {
          decode: SchemaGetter.transform((b: boolean): string | number => b ? "true" : 0),
          encode: SchemaGetter.transform((_value: string | number) => true)
        })
      )
      throws(
        () => new SchemaAST.IndexSignature(UnionFromBoolean.ast, Schema.Number.ast),
        new Error("Invalid index signature parameter Union")
      )
    })
  })
})
