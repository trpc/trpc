import { assert, describe, it } from "@effect/vitest"
import {
  Effect,
  Exit,
  Option,
  Result,
  Schema,
  SchemaAST,
  SchemaGetter,
  SchemaParser,
  SchemaTransformation
} from "effect"
import * as Codegen from "effect/internal/schema/codegen"
import { SchemaCompiler, SchemaJITCompiler } from "effect/schema"
import { deepStrictEqual, strictEqual } from "../utils/assert.ts"

describe("compiler regression contracts", () => {
  it("preserves template literal issues after compilation", () => {
    const schema = Schema.TemplateLiteral(["count:", Schema.Int.check(Schema.isGreaterThan(0))])
    const inputs = ["count:1", "count:0", "count:1.5", "invalid", null]
    const snapshot = () => {
      const decode = SchemaParser.decodeUnknownResult(schema)
      // Diagnostic ASTs contain freshly constructed transformation functions.
      return inputs.map((input) => Result.mapError(decode(input), (issue) => JSON.stringify(issue)))
    }
    const interpreted = snapshot()
    SchemaJITCompiler.enable(schema.ast)
    deepStrictEqual(snapshot(), interpreted)
  })

  it.effect("preserves missing and present undefined through eager and suspended transformations", () =>
    Effect.gen(function*() {
      for (const suspended of [false, true]) {
        const seen: Array<Option.Option<unknown>> = []
        const schema = Schema.Struct({
          value: Schema.Unknown.pipe(
            Schema.decode({
              decode: SchemaGetter.transformOptionalEffect<unknown, unknown>((input) => {
                seen.push(input)
                const output = Option.isNone(input) || input.value === "omit" ? Option.none() : Option.some(undefined)
                return suspended ? Effect.sync(() => output) : Effect.succeed(output)
              }),
              encode: SchemaGetter.passthrough()
            }),
            Schema.optionalKey
          )
        })
        for (const compiled of [false, true]) {
          if (compiled) SchemaJITCompiler.enable(schema.ast)
          seen.length = 0
          const decode = SchemaParser.decodeUnknownEffect(schema)
          deepStrictEqual(yield* decode({}), {})
          deepStrictEqual(yield* decode({ value: "omit" }), {})
          deepStrictEqual(yield* decode({ value: "present" }), { value: undefined })
          deepStrictEqual(seen, [Option.none(), Option.some("omit"), Option.some("present")])
        }
      }
    }))

  it.effect("continues encoding checkpoints after middleware recovery without replaying transformations", () =>
    Effect.gen(function*() {
      for (const suspended of [false, true]) {
        const events: Array<string> = []
        const schema = Schema.String.pipe(
          Schema.decodeTo(
            Schema.Number.check(Schema.isGreaterThan(0)),
            SchemaTransformation.transform({
              decode: (input) => {
                events.push("first")
                return Number(input)
              },
              encode: String
            })
          ),
          Schema.middlewareDecoding((effect) =>
            Effect.catchEager(effect, () => {
              events.push("recover")
              return suspended ? Effect.sync(() => Option.some(1)) : Effect.succeed(Option.some(1))
            })
          ),
          Schema.decodeTo(
            Schema.String,
            SchemaTransformation.transform({
              decode: (input) => {
                events.push("last")
                return String(input)
              },
              encode: Number
            })
          )
        )
        for (const compiled of [false, true]) {
          if (compiled) SchemaJITCompiler.enable(schema.ast)
          const decode = SchemaParser.decodeUnknownEffect(schema)
          events.length = 0
          strictEqual(yield* decode("2"), "2")
          deepStrictEqual(events, ["first", "last"])
          events.length = 0
          strictEqual(yield* decode("-1"), "1")
          deepStrictEqual(events, ["first", "recover", "last"])
          events.length = 0
          strictEqual(yield* decode(false), "1")
          deepStrictEqual(events, ["recover", "last"])
        }
      }
    }))

  it.effect("resolved parsers return Effects containing their actual output", () =>
    Effect.gen(function*() {
      const object = { value: "a" }
      const cases: ReadonlyArray<readonly [Schema.Codec<unknown>, unknown, unknown]> = [
        [Schema.String, "a", "a"],
        [Schema.Number, -0, -0],
        [Schema.Literal(0), -0, -0],
        [Schema.Undefined, undefined, undefined],
        [Schema.ObjectKeyword, object, object],
        [Schema.Json, object, object],
        [Schema.Struct({}), 1, 1],
        [Schema.TemplateLiteral(["a"]), "a", "a"],
        [Schema.FiniteFromString, "1", 1]
      ]
      for (const [schema, input, expected] of cases) {
        for (const compiled of [false, true]) {
          if (compiled) SchemaJITCompiler.enable(schema.ast)
          const parser = SchemaParser.decodeUnknownEffect(schema)
          const effect = parser(input, SchemaAST.defaultParseOptions)
          strictEqual(Effect.isEffect(effect), true)
          const output = yield* Effect.map(effect, (value) => value)
          strictEqual(Object.is(output, expected), true)
          const publicEffect = SchemaParser.decodeUnknownEffect(schema)(input)
          strictEqual(Effect.isEffect(publicEffect), true)
          strictEqual(Object.is(yield* publicEffect, expected), true)
        }
      }
    }))

  it.effect("retains public success values across subsequent and reentrant parser calls", () =>
    Effect.gen(function*() {
      let reenter: (input: unknown) => string
      const schema = Schema.String.check(
        Schema.makeFilter((value) => value !== "first" || reenter("nested") === "nested")
      )
      for (const compiled of [false, true]) {
        if (compiled) SchemaJITCompiler.enable(schema.ast)
        const decode = SchemaParser.decodeUnknownEffect(schema)
        const decodeSync = SchemaParser.decodeUnknownSync(schema)
        reenter = decodeSync
        const first = decode("first")
        const second = decode("second")
        strictEqual(
          yield* Effect.map(first, (value) => {
            strictEqual(decodeSync("nested"), "nested")
            return value
          }),
          "first"
        )
        strictEqual(yield* second, "second")
        strictEqual(yield* first, "first")
      }
    }))

  it.effect("preserves unchanged fields before and after asynchronous transformations", () =>
    Effect.gen(function*() {
      const number = Schema.String.pipe(Schema.decodeTo(Schema.Number, {
        decode: SchemaGetter.transformOptionalEffect((input) =>
          Effect.yieldNow.pipe(Effect.as(Option.map(input, Number)))
        ),
        encode: SchemaGetter.transform(String)
      }))
      const tuple = Schema.Tuple([Schema.String, number, Schema.Undefined]).check(
        Schema.makeFilter((value) => value[0] === "before" && value[1] === 42 && value[2] === undefined)
      )
      const struct = Schema.Struct({ before: Schema.String, middle: number, after: Schema.Undefined }).check(
        Schema.makeFilter((value) => value.before === "before" && value.middle === 42 && value.after === undefined)
      )
      for (const compiled of [false, true]) {
        if (compiled) {
          SchemaJITCompiler.enable(tuple.ast)
          SchemaJITCompiler.enable(struct.ast)
        }
        deepStrictEqual(
          yield* SchemaParser.decodeUnknownEffect(tuple)(["before", "42", undefined]),
          ["before", 42, undefined]
        )
        deepStrictEqual(
          yield* SchemaParser.decodeUnknownEffect(struct)({ before: "before", middle: "42", after: undefined }),
          { before: "before", middle: 42, after: undefined }
        )
      }
    }))

  it("calls installed operations with options without inspecting extra function properties", () => {
    const schema = Schema.Struct({ value: Schema.String })
    const seen: Array<SchemaAST.ParseOptions> = []
    const is: SchemaCompiler.Is = (_input, options) => {
      seen.push(options)
      return true
    }
    const decode: SchemaCompiler.Decode = (input, options) => {
      seen.push(options)
      return input
    }
    for (const operation of [is, decode]) {
      Object.defineProperty(operation, "default", {
        get() {
          throw new Error("Not part of the compiled decoder contract")
        }
      })
    }
    SchemaCompiler.set(schema.ast, { is, decode, decodeEffect: Effect.succeed })
    const input = { value: "a" }
    strictEqual(SchemaParser.is(schema)(input), true)
    strictEqual(SchemaParser.decodeUnknownSync(schema)(input), input)
    const options = { reportInput: true }
    strictEqual(SchemaParser.decodeUnknownSync(schema, options)(input), input)
    deepStrictEqual(seen, [SchemaAST.defaultParseOptions, SchemaAST.defaultParseOptions, options])
  })

  it("bounds inlining of shared subgraphs", () => {
    let schema: Schema.Codec<unknown> = Schema.Struct({ value: Schema.optionalKey(Schema.String) })
    let valid: unknown = { value: "value" }
    let invalid: unknown = { value: 1 }
    for (let i = 0; i < 16; i++) {
      schema = Schema.Struct({
        left: Schema.optionalKey(schema),
        right: Schema.optionalKey(schema)
      })
      valid = { left: valid }
      invalid = { left: invalid }
    }
    const cases = [
      { schema, valid, invalid },
      { schema, valid: { left: { right: {} } }, invalid: { left: { right: 1 } } },
      { schema: Schema.Array(schema), valid: [{}], invalid: [1] },
      { schema: Schema.Union([schema, Schema.String]), valid: {}, invalid: 1 }
    ]
    for (const { schema, valid, invalid } of cases) {
      const expected = SchemaParser.decodeUnknownResult(schema)(invalid)
      assert(Result.isFailure(expected))
      SchemaJITCompiler.enable(schema.ast)
      deepStrictEqual(SchemaParser.decodeUnknownSync(schema)(valid), valid)
      strictEqual(SchemaParser.is(schema)(valid), true)
      strictEqual(SchemaParser.is(schema)(invalid), false)
      deepStrictEqual(SchemaParser.decodeUnknownResult(schema)(invalid), expected)
    }
  })

  it("bounds generated composed parsers for wide objects", () => {
    const property = Schema.optionalKey(Schema.String)
    const schema = Schema.Struct(Object.fromEntries(
      Array.from({ length: 4096 }, (_, i) => [`key${i}`, property])
    ))
    SchemaJITCompiler.enable(schema.ast)
    const input = { key4095: "last" }
    deepStrictEqual(SchemaParser.decodeUnknownSync(schema)(input), input)
    strictEqual(SchemaParser.is(schema)(input), true)
    strictEqual(SchemaParser.is(schema)({ key4095: 1 }), false)
  })

  it("applies generation limits to every occurrence of a reused schema", () => {
    const compiles = (schema: Schema.Top) => Codegen.generate(schema.ast, "decode") !== undefined
    const nest = (schema: Schema.Top, depth: number): Schema.Top => {
      for (let i = 0; i < depth; i++) schema = Schema.Struct({ n: schema })
      return schema
    }
    assert.isTrue(compiles(nest(Schema.String, 256)))
    assert.isFalse(compiles(nest(Schema.String, 257)))
    const inner = nest(Schema.String, 200)
    assert.isFalse(compiles(nest(inner, 57)))
    assert.isTrue(compiles(nest(inner, 56)))
    assert.isFalse(compiles(nest(inner, 57)))

    const field = Schema.Struct(Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`f${i}`, Schema.String])))
    assert.isFalse(compiles(Schema.Struct({ a: field, b: field, c: field, d: field })))
    assert.isTrue(compiles(Schema.Struct({ a: field, b: field, c: field })))
  })

  it("does not generate code for schemas nesting a declaration or suspension", () => {
    const Recursive: Schema.Top = Schema.Struct({ next: Schema.optionalKey(Schema.suspend(() => Recursive)) })
    for (const field of [Schema.Date, Recursive]) {
      assert.isUndefined(Codegen.generate(Schema.Struct({ a: Schema.Struct({ b: field }) }).ast, "decode"))
    }
  })

  it("does not reanalyse a nested schema that cannot be generated for each enclosing schema", () => {
    let reads = 0
    const date: SchemaAST.AST = new Proxy(Schema.Date.ast, {
      get(target, key, receiver) {
        reads++
        return Reflect.get(target, key, receiver)
      }
    })
    const levels: Array<SchemaAST.AST> = [date]
    for (let i = 0; i < 50; i++) {
      levels.push(new SchemaAST.Objects([new SchemaAST.PropertySignature("n", levels[i])], []))
    }
    for (const ast of levels.slice(1).reverse()) {
      assert.isUndefined(Codegen.generate(ast, "decode"))
    }
    assert.isBelow(reads, 10)
  })

  it("preserves repeated Union members when selecting generated decoders", () => {
    const member = Schema.Struct({ kind: Schema.Literal("a"), value: Schema.Number })
    for (const mode of ["anyOf", "oneOf"] as const) {
      const schema = Schema.Union([
        member,
        Schema.Struct({ kind: Schema.Literal("b"), value: Schema.String }),
        member,
        Schema.Never
      ], { mode })
      SchemaJITCompiler.enable(schema.ast)
      const decode = SchemaParser.decodeUnknownResult(schema)
      const is = SchemaParser.is(schema)
      const input = { kind: "a", value: 1 } as const
      strictEqual(is(input), mode === "anyOf")
      const result = decode(input)
      if (mode === "anyOf") {
        deepStrictEqual(result, Result.succeed(input))
      } else {
        assert(Result.isFailure(result))
        strictEqual(result.failure._tag, "OneOf")
      }
      const other = { kind: "b", value: "value" } as const
      strictEqual(is(other), true)
      deepStrictEqual(decode(other), Result.succeed(other))
    }
  })

  it("stops oneOf after its second successful candidate", () => {
    const schema = Schema.Union([
      Schema.String.check(Schema.isMinLength(1)),
      Schema.String.check(Schema.isMaxLength(10)),
      Schema.String.check(Schema.makeFilter(() => {
        throw new Error("The third candidate must not be evaluated")
      }))
    ], { mode: "oneOf" })
    for (const compiled of [false, true]) {
      if (compiled) SchemaJITCompiler.enable(schema.ast)
      strictEqual(SchemaParser.is(schema)("hello"), false)
      for (const options of [undefined, { errors: "all" }] as const) {
        const result = SchemaParser.decodeUnknownResult(schema, options)("hello")
        assert(Result.isFailure(result))
        strictEqual(result.failure._tag, "OneOf")
      }
    }
  })

  it.effect("accepts both zero signs and preserves the input across parser adapters", () =>
    Effect.gen(function*() {
      const options: Array<SchemaAST.ParseOptions | undefined> = [
        undefined,
        { errors: "all" },
        { reportInput: true }
      ]
      for (const literal of [0, -0]) {
        const schemas = [
          Schema.Literal(literal),
          Schema.Union([Schema.Literal(literal), Schema.Literal(1)]),
          Schema.Literal(literal).check(Schema.makeFilter((n) => Object.is(n, -0)))
        ]
        for (const schema of schemas) {
          const nested = Schema.Struct({ values: Schema.Array(schema) })
          for (const compiled of [false, true]) {
            if (compiled) {
              SchemaJITCompiler.enable(schema.ast)
              SchemaJITCompiler.enable(nested.ast)
            }
            for (const input of [0, -0]) {
              if (schema.ast.checks && !Object.is(input, -0)) {
                strictEqual(SchemaParser.is(schema)(input), false)
                assert(Result.isFailure(SchemaParser.decodeUnknownResult(schema)(input)))
                continue
              }
              strictEqual(SchemaParser.is(schema)(input), true)
              for (const option of options) {
                strictEqual(Object.is(SchemaParser.decodeUnknownSync(schema, option)(input), input), true)
                strictEqual(Object.is(SchemaParser.encodeUnknownSync(schema, option)(input), input), true)
                const result = SchemaParser.decodeUnknownResult(schema, option)(input)
                assert(Result.isSuccess(result))
                strictEqual(Object.is(result.success, input), true)
                const exit = SchemaParser.decodeUnknownExit(schema, option)(input)
                assert(Exit.isSuccess(exit))
                strictEqual(Object.is(exit.value, input), true)
                const optional = SchemaParser.decodeUnknownOption(schema, option)(input)
                assert(Option.isSome(optional))
                strictEqual(Object.is(optional.value, input), true)
                const output = yield* SchemaParser.decodeUnknownEffect(schema, option)(input)
                strictEqual(Object.is(output, input), true)
                const decoded = SchemaParser.decodeUnknownSync(nested, option)({ values: [input] })
                strictEqual(Object.is(decoded.values[0], input), true)
              }
            }
          }
        }
      }
    }))

  it("retains the original encoding AST in local checks", () => {
    const schema = Schema.NumberFromString.check(
      Schema.makeFilter((_value, ast) => ast === schema.ast && ast.encoding !== undefined)
    )
    strictEqual(SchemaParser.decodeUnknownSync(schema)("1"), 1)
    SchemaJITCompiler.enable(schema.ast)
    strictEqual(SchemaParser.decodeUnknownSync(schema)("1"), 1)
  })

  it("retains the original encoding AST in structural issues", () => {
    const schema = Schema.String.pipe(Schema.decodeTo(
      Schema.Number,
      SchemaTransformation.transform({ decode: () => "invalid" as any, encode: String })
    ))
    for (const compiled of [false, true]) {
      if (compiled) SchemaJITCompiler.enable(schema.ast)
      const result = SchemaParser.decodeUnknownResult(schema)("input")
      assert(Result.isFailure(result))
      assert(result.failure._tag === "InvalidType")
      strictEqual(result.failure.ast, schema.ast)
    }
  })

  it("installs accessors without evaluating them and reads only the selected operation once", () => {
    const schema = Schema.Struct({ value: Schema.String })
    const reads: Array<string> = []
    const decoder = {
      get is() {
        strictEqual(this, decoder)
        reads.push("is")
        return (_input: unknown) => true
      },
      get decode() {
        strictEqual(this, decoder)
        reads.push("decode")
        return (input: unknown) => input
      },
      get decodeEffect() {
        strictEqual(this, decoder)
        reads.push("decodeEffect")
        return Effect.succeed
      }
    }
    SchemaCompiler.set(schema.ast, decoder)
    deepStrictEqual(reads, [])
    strictEqual(SchemaParser.is(schema)({ value: "a" }), true)
    strictEqual(SchemaParser.is(schema)({ value: "b" }), true)
    deepStrictEqual(reads, ["is"])
    const input = { value: "a" }
    strictEqual(SchemaParser.decodeUnknownSync(schema)(input), input)
    strictEqual(SchemaParser.decodeUnknownSync(schema)(input), input)
    deepStrictEqual(reads, ["is", "decode"])
  })

  it("memoizes an absent optional operation", () => {
    const schema = Schema.Struct({ value: Schema.String })
    let reads = 0
    SchemaCompiler.set(schema.ast, {
      get is() {
        reads++
        return undefined
      },
      decode: (input) => input,
      decodeEffect: Effect.succeed
    })
    strictEqual(SchemaParser.is(schema)({ value: "a" }), true)
    strictEqual(SchemaParser.is(schema)({ value: "b" }), true)
    strictEqual(reads, 1)
  })

  it("shares lazy detailed decoding across public adapters without mutating the supplied decoder", () => {
    const schema = Schema.Struct({ value: Schema.String })
    const reads: Array<string> = []
    const decoder = Object.freeze({
      get decode() {
        strictEqual(this, decoder)
        reads.push("decode")
        return () => SchemaCompiler.invalid
      },
      get decodeEffect() {
        strictEqual(this, decoder)
        reads.push("decodeEffect")
        return Effect.succeed
      }
    })
    SchemaCompiler.set(schema.ast, decoder)
    const input = { value: "a" }
    strictEqual(SchemaParser.decodeUnknownSync(schema)(input), input)
    deepStrictEqual(SchemaParser.decodeUnknownResult(schema)(input), Result.succeed(input))
    strictEqual(SchemaParser.decodeUnknownSync(schema, { reportInput: true })(input), input)
    deepStrictEqual(reads, ["decode", "decodeEffect"])
  })

  it("does not restart validation inside the detailed decoder", () => {
    const schema = Schema.Struct({ values: Schema.Array(Schema.Struct({ value: Schema.String })) })
    SchemaJITCompiler.enable(schema.ast)
    let reads = 0
    const result = SchemaParser.decodeUnknownResult(schema)({
      values: [{
        get value() {
          reads++
          return 1
        }
      }]
    })
    assert(Result.isFailure(result))
    strictEqual(reads, 2)
  })

  it("uses the interpreter after selective JIT generation fails", () => {
    const schema = Schema.Struct({ value: Schema.String })
    const original = globalThis.Function
    const defect = new SyntaxError("generated source defect")
    let attempts = 0
    try {
      globalThis.Function = ((...parameters: Array<string>) => {
        if (parameters.length === 1 && parameters[0] === "return true") return original(...parameters)
        attempts++
        throw defect
      }) as FunctionConstructor
      SchemaJITCompiler.enable(schema.ast)
      const decode = SchemaParser.decodeUnknownSync(schema)
      deepStrictEqual(decode({ value: "a", extra: true }), { value: "a" })
      assert(Result.isFailure(SchemaParser.decodeUnknownResult(schema)({ value: 1 })))
      deepStrictEqual(decode({ value: "b" }), { value: "b" })
      strictEqual(attempts, 1)
    } finally {
      globalThis.Function = original
    }
  })
})
