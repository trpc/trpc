import { assert, describe, it, vi } from "@effect/vitest"
import { Effect, Schema, SchemaAST, SchemaParser } from "effect"
import { SchemaCompiler, SchemaJITCompiler } from "effect/schema"
import { deepStrictEqual, strictEqual, throws } from "../utils/assert.ts"

describe("SchemaCompiler", () => {
  it("resolves a type guard on first invocation", () => {
    const schema = Schema.String.annotate({ title: "lazy type guard" })
    const ast = SchemaAST.toType(schema.ast)
    const guard = SchemaParser.is(schema)
    let calls = 0

    SchemaCompiler.set(ast, {
      is: () => {
        calls++
        return true
      },
      decodeEffect: Effect.succeed
    })

    strictEqual(guard(1), true)
    strictEqual(guard(2), true)
    strictEqual(calls, 2)

    SchemaCompiler.set(ast, {
      is: () => false,
      decodeEffect: Effect.succeed
    })

    strictEqual(guard(3), true)
    strictEqual(SchemaParser.is(schema)(3), false)
    strictEqual(calls, 3)
  })

  it("reuses interpreted candidates inside a selectively compiled Union", () => {
    const child = Schema.String.annotate({ title: "interpreted Union candidate" })
    const schema = Schema.Union([child, Schema.Number])
    const initialize = vi.spyOn(child.ast, "getParser")
    try {
      SchemaJITCompiler.enable(schema.ast)
      const make = SchemaParser.make(schema)
      strictEqual(make("first"), "first")
      strictEqual(make("second"), "second")
      strictEqual(initialize.mock.calls.length, 1)
    } finally {
      initialize.mockRestore()
    }
  })

  it("retains a resolved Union member parser after replacement", () => {
    const child = Schema.String.annotate({ title: "resolved Union candidate" })
    const decode = SchemaParser.decodeUnknownSync(Schema.Union([child, Schema.Number]))

    strictEqual(decode("original"), "original")

    SchemaCompiler.set(child.ast, {
      decode: () => "replacement",
      decodeEffect: () => Effect.succeed("replacement")
    })

    strictEqual(decode("cached"), "cached")
    strictEqual(SchemaParser.decodeUnknownSync(child)("new consumer"), "replacement")
  })

  it("uses a replacement for an unresolved Union member", () => {
    const child = Schema.String.annotate({ title: "unresolved Union candidate" })
    const decode = SchemaParser.decodeUnknownSync(Schema.Union([Schema.Number, child]))

    strictEqual(decode(1), 1)

    SchemaCompiler.set(child.ast, {
      decode: () => "replacement",
      decodeEffect: () => Effect.succeed("replacement")
    })

    strictEqual(decode("first visit"), "replacement")
  })

  it("installs a decoder in the shared registry", () => {
    const schema = Schema.Struct({ value: Schema.String })
    const early = SchemaParser.decodeUnknownSync(schema)
    deepStrictEqual(early({ value: "interpreted" }), { value: "interpreted" })

    let decodes = 0
    SchemaCompiler.set(schema.ast, {
      is: () => true,
      decode: (_input, options) =>
        options.reportInput === true
          ? { value: "compiled" }
          : SchemaCompiler.invalid,
      decodeEffect: () => {
        decodes++
        return Effect.succeed({ value: "detailed" })
      }
    })

    const late = SchemaParser.decodeUnknownSync(schema)
    deepStrictEqual(late({ value: 1 }, { reportInput: true }), { value: "compiled" })
    deepStrictEqual(late({ value: 1 }), { value: "detailed" })
    strictEqual(decodes, 1)

    // Parsers that resolved the old entry before set keep using it.
    deepStrictEqual(early({ value: "interpreted" }), { value: "interpreted" })
  })

  it("uses is only for type guards", () => {
    const schema = Schema.Struct({ value: Schema.String })
    let validations = 0
    SchemaCompiler.set(schema.ast, {
      is: (input, options) => {
        strictEqual(options, SchemaAST.defaultParseOptions)
        return (input as { readonly value?: unknown }).value === "accepted"
      },
      decode: (input) => {
        validations++
        return input
      },
      decodeEffect: Effect.succeed
    })

    strictEqual(SchemaParser.is(schema)({ value: "accepted" }), true)
    strictEqual(SchemaParser.is(schema)({ value: "rejected" }), false)
    deepStrictEqual(SchemaParser.decodeUnknownSync(schema)({ value: "decoded" }), { value: "decoded" })
    strictEqual(validations, 1)
  })

  it("retains one resolved entry across sync option paths", () => {
    for (const direction of ["decode", "encode"]) {
      for (const firstOptions of [undefined, { reportInput: true }]) {
        const schema = Schema.Struct({ value: Schema.String })
        const makeSync = () =>
          direction === "decode"
            ? SchemaParser.decodeUnknownSync(schema)
            : SchemaParser.encodeUnknownSync(schema)
        const decode = makeSync()
        const input = { value: "original" }
        deepStrictEqual(decode(input, firstOptions), input)

        SchemaCompiler.set(schema.ast, {
          decode: () => ({ value: "replacement" }),
          decodeEffect: () => Effect.succeed({ value: "replacement" })
        })

        deepStrictEqual(decode(input), input)
        deepStrictEqual(decode(input, { reportInput: true }), input)
        deepStrictEqual(makeSync()(input), { value: "replacement" })
      }
    }
  })

  it("does not resolve child operations until the child is parsed", () => {
    const child = Schema.String.annotate({ title: "lazy child" })
    let reads = 0
    SchemaCompiler.set(child.ast, {
      get decode() {
        reads++
        return undefined
      },
      get decodeEffect() {
        reads++
        return Effect.succeed
      }
    })
    const schema = Schema.Struct({ first: Schema.Number, child })
    const decode = SchemaParser.decodeUnknownSync(schema)
    throws(() => decode({ first: "invalid", child: "unreached" }))
    strictEqual(reads, 0)
    deepStrictEqual(decode({ first: 1, child: "reached" }), { first: 1, child: "reached" })
    strictEqual(reads, 2)
    deepStrictEqual(decode({ first: 2, child: "cached" }), { first: 2, child: "cached" })
    strictEqual(reads, 2)
  })

  it("uses an installed child decoder from an interpreted Array", () => {
    const child = Schema.String.annotate({ title: "installed array child" })
    SchemaCompiler.set(child.ast, {
      decode: (input) => typeof input === "string" ? `${input}!` : SchemaCompiler.invalid,
      decodeEffect: (input) => Effect.succeed(`${input}!`)
    })

    deepStrictEqual(
      SchemaParser.decodeUnknownSync(Schema.Array(child))(["a"]),
      ["a!"]
    )
  })

  it("exposes the canonical missing value to installed decoders", () => {
    const schema = Schema.Struct({ value: Schema.optionalKey(Schema.String) })
    assert(schema.ast._tag === "Objects")
    const value = schema.ast.propertySignatures[0].type
    let sawMissing = false
    SchemaCompiler.set(value, {
      decode: (input) => typeof input === "string" ? input : SchemaCompiler.invalid,
      decodeEffect: (input) => {
        sawMissing = input === SchemaCompiler.missing
        return Effect.succeed(input)
      }
    })

    deepStrictEqual(SchemaParser.decodeUnknownSync(schema)({}), {})
    strictEqual(sawMissing, true)
  })

  it("installs encoders on the flipped AST", () => {
    const schema = Schema.FiniteFromString
    SchemaCompiler.set(SchemaAST.flip(schema.ast), {
      decode: () => "aot",
      decodeEffect: () => Effect.succeed("detailed")
    })

    strictEqual(SchemaParser.encodeUnknownSync(schema)(1), "aot")
  })
})

describe("SchemaJITCompiler", () => {
  it("reuses option-independent generated functions for explicit options", () => {
    const schema = Schema.Struct({ nested: Schema.Struct({ value: Schema.String }) })
    const input = { nested: { value: "valid" } }
    const Function = globalThis.Function
    let constructions = 0
    try {
      globalThis.Function = ((...args: ReadonlyArray<string>) => {
        constructions++
        return Function(...args)
      }) as FunctionConstructor

      SchemaJITCompiler.enable(schema.ast)
      const decode = SchemaParser.decodeUnknownSync(schema)
      deepStrictEqual(decode(input), input)
      strictEqual(SchemaParser.is(schema)(input), true)
      const initialized = constructions
      assert(initialized > 1)
      for (const options of [{}, { reportInput: true }, { errors: "all" }, { disableChecks: true }] as const) {
        deepStrictEqual(decode(input, options), input)
        strictEqual(SchemaParser.is(schema)(input), true)
        strictEqual(constructions, initialized)
      }
    } finally {
      globalThis.Function = Function
    }
  })

  it("keeps generated operations lazy", () => {
    const schema = Schema.Struct({ value: Schema.String })
    const Function = globalThis.Function
    let constructions = 0
    try {
      globalThis.Function = ((...args: ReadonlyArray<string>) => {
        constructions++
        return Function(...args)
      }) as FunctionConstructor

      SchemaJITCompiler.enable(schema.ast)
      strictEqual(constructions, 1)
      deepStrictEqual(SchemaParser.decodeUnknownSync(schema)({ value: "valid" }), { value: "valid" })
      assert(constructions > 1)
    } finally {
      globalThis.Function = Function
    }
  })

  it("replaces only the selected AST and leaves resolved parsers intact", () => {
    const selected = Schema.Struct({ value: Schema.String })
    const untouched = Schema.Struct({ value: Schema.String })
    const early = SchemaParser.decodeUnknownSync(selected)
    deepStrictEqual(early({ value: "valid" }), { value: "valid" })

    SchemaJITCompiler.enable(selected.ast)

    let earlyReads = 0
    throws(() =>
      early({
        get value() {
          earlyReads++
          return 1
        }
      })
    )
    strictEqual(earlyReads, 1)

    let selectedReads = 0
    throws(() =>
      SchemaParser.decodeUnknownSync(selected)({
        get value() {
          selectedReads++
          return 1
        }
      })
    )
    strictEqual(selectedReads, 2)

    let untouchedReads = 0
    throws(() =>
      SchemaParser.decodeUnknownSync(untouched)({
        get value() {
          untouchedReads++
          return 1
        }
      })
    )
    strictEqual(untouchedReads, 1)
  })

  it("compiles descendants through an unsupported lazy root", () => {
    const child = Schema.Struct({ value: Schema.String })
    const schema = Schema.suspend(() => child)
    SchemaJITCompiler.enable(schema.ast)

    let reads = 0
    throws(() =>
      SchemaParser.decodeUnknownSync(schema)({
        get value() {
          reads++
          return 1
        }
      })
    )
    strictEqual(reads, 2)
  })

  it("prepares declaration type parameters with the selective compiler on first use", () => {
    const child = Schema.Struct({ value: Schema.String })
    const schema = Schema.ReadonlySet(child)
    SchemaJITCompiler.enable(schema.ast)
    const decode = SchemaParser.decodeUnknownSync(schema)
    deepStrictEqual(decode(new Set([{ value: "a", extra: true }])), new Set([{ value: "a" }]))
    throws(() => decode(new Set([{ value: 1 }])))
  })

  it("does not initialize unused declaration type parameter operations", () => {
    const child = Schema.Struct({ value: Schema.String })
    let reads = 0
    SchemaCompiler.set(child.ast, {
      get decode() {
        reads++
        return undefined
      },
      get decodeEffect() {
        reads++
        return Effect.succeed
      }
    })
    const schema = Schema.ReadonlySet(child)
    SchemaJITCompiler.enable(schema.ast)
    const decode = SchemaParser.decodeUnknownSync(schema)
    strictEqual(reads, 0)
    deepStrictEqual(decode(new Set()), new Set())
    strictEqual(reads, 0)
    deepStrictEqual(decode(new Set([{ value: "a" }])), new Set([{ value: "a" }]))
    strictEqual(reads, 2)
  })

  it("preserves an installed decoder when dynamic code generation is unavailable", () => {
    const schema = Schema.Struct({ value: Schema.String })
    SchemaCompiler.set(schema.ast, {
      decode: () => ({ value: "installed" }),
      decodeEffect: () => Effect.succeed({ value: "installed" })
    })
    const Function = globalThis.Function
    try {
      globalThis.Function = (() => {
        throw new Error("dynamic function generation unavailable")
      }) as any
      SchemaJITCompiler.enable(schema.ast)
    } finally {
      globalThis.Function = Function
    }

    deepStrictEqual(SchemaParser.decodeUnknownSync(schema)({ value: 1 }), { value: "installed" })
  })
})
