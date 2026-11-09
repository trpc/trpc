import { assert, describe, it } from "@effect/vitest"
import {
  Cause,
  Deferred,
  Effect,
  Fiber,
  Result,
  Schema,
  SchemaGetter,
  SchemaIssue,
  SchemaParser,
  SchemaTransformation
} from "effect"
import { SchemaCompiler } from "effect/schema"
// oxlint-disable-next-line no-unassigned-import
import "effect/schema/SchemaJITCompiler/enable"
import { assertSchemaIssueError, deepStrictEqual, strictEqual, throws } from "../utils/assert.ts"

const schema = Schema.Struct({
  name: Schema.String,
  count: Schema.Number,
  active: Schema.Boolean,
  nested: Schema.Struct({ value: Schema.String })
})

const decode = SchemaParser.decodeUnknownSync(schema)
const is = SchemaParser.is(schema)

describe("SchemaJITCompiler", () => {
  it.effect("preserves product concurrency", () =>
    Effect.gen(function*() {
      const started = yield* Effect.forEach([0, 1, 2], () => Deferred.make<void>())
      const releases = yield* Effect.forEach([0, 1, 2], () => Deferred.make<void>())
      const item = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformEffect((value) => {
          const index = value.charCodeAt(0) - 97
          return Deferred.succeed(started[index], undefined).pipe(
            Effect.andThen(Deferred.await(releases[index])),
            Effect.as(value)
          )
        }),
        encode: SchemaGetter.passthrough()
      }))
      const schema = Schema.Struct({ a: item, b: item, c: item })
      const fiber = yield* SchemaParser.decodeUnknownEffect(schema)(
        { a: "a", b: "b", c: "c" },
        { concurrency: 2 }
      ).pipe(Effect.forkChild)

      yield* Deferred.await(started[0])
      yield* Deferred.await(started[1])
      strictEqual(yield* Deferred.isDone(started[2]), false)

      yield* Deferred.succeed(releases[0], undefined)
      yield* Deferred.await(started[2])
      yield* Deferred.succeed(releases[1], undefined)
      yield* Deferred.succeed(releases[2], undefined)

      deepStrictEqual(yield* Fiber.join(fiber), { a: "a", b: "b", c: "c" })
    }))

  it("compiles a decoder lazily after import", () => {
    const input = {
      name: "a",
      count: 1,
      active: true,
      nested: { value: "b", extra: true },
      extra: true
    }
    const output = decode(input)

    deepStrictEqual(output, {
      name: "a",
      count: 1,
      active: true,
      nested: { value: "b" }
    })
    assert.notStrictEqual(output, input)
    assert.notStrictEqual(output.nested, input.nested)
  })

  it("compiles type guards", () => {
    strictEqual(
      is({
        name: "a",
        count: 1,
        active: true,
        nested: { value: "b" }
      }),
      true
    )
    strictEqual(
      is({
        name: 1,
        count: 1,
        active: true,
        nested: { value: "b" }
      }),
      false
    )

    const defect = new Error("boom")
    let reads = 0
    throws(() =>
      is({
        get name(): string {
          reads++
          throw defect
        },
        count: 1,
        active: true,
        nested: { value: "b" }
      }), (error) => {
      assert(error instanceof Error)
      strictEqual(error.message, "Type guard adapter can only return false for schema issues")
      assert(Cause.hasDies(error.cause as Cause.Cause<never>))
    })
    strictEqual(reads, 1)
  })

  it("does not confuse a valid value with the invalid sentinel", () => {
    const schemas = [
      Schema.Union([Schema.Symbol, Schema.String]),
      Schema.Union([Schema.UniqueSymbol(SchemaCompiler.invalid), Schema.Literal("valid")])
    ]
    for (const schema of schemas) {
      strictEqual(SchemaParser.is(schema)(SchemaCompiler.invalid), true)
      strictEqual(SchemaParser.decodeUnknownSync(schema)(SchemaCompiler.invalid), SchemaCompiler.invalid)
    }
  })

  it("uses default options in compiled type guards", () => {
    const structural = Schema.Struct({ value: Schema.String })
    const is = SchemaParser.is(structural)
    strictEqual(is({ value: "a" }), true)
    strictEqual(is({ value: "a", extra: true }), true)
    strictEqual(is({ value: 1 }), false)

    const checked = Schema.Struct({ a: Schema.String, b: Schema.String }).check(
      Schema.makeFilter((value, _ast, options) => options.reportInput === true && !Object.hasOwn(value, "extra"))
    )
    const input = { b: "b", a: "a", extra: true }
    strictEqual(SchemaParser.is(checked)(input), false)
    deepStrictEqual(SchemaParser.decodeUnknownSync(checked)(input, { reportInput: true }), { a: "a", b: "b" })
    deepStrictEqual(SchemaParser.decodeUnknownSync(checked)(input, { disableChecks: true }), { a: "a", b: "b" })
    strictEqual(SchemaParser.is(checked)(input), false)
  })

  it("accepts the invalid sentinel inside a checked composite", () => {
    const schema = Schema.Struct({ value: Schema.Union([Schema.Symbol, Schema.String]) }).check(
      Schema.makeFilter(() => true)
    )
    const input = { value: SchemaCompiler.invalid }
    strictEqual(SchemaParser.is(schema)(input), true)
    deepStrictEqual(SchemaParser.decodeUnknownSync(schema)(input), input)
  })

  it("keeps runtime options for nested checks, template parts and record keys", () => {
    const checked = Schema.Struct({
      nested: Schema.Struct({ value: Schema.String }).check(
        Schema.makeFilter((_value, _ast, options) => options.reportInput === true)
      )
    })
    const value = { nested: { value: "valid" } }
    strictEqual(SchemaParser.is(checked)(value), false)
    deepStrictEqual(SchemaParser.decodeUnknownSync(checked)(value, { reportInput: true }), value)

    const template = Schema.Struct({
      value: Schema.TemplateLiteral(["prefix-", Schema.String.check(Schema.isMinLength(2))])
    })
    strictEqual(SchemaParser.is(template)({ value: "prefix-a" }), false)
    deepStrictEqual(SchemaParser.decodeUnknownSync(template)({ value: "prefix-a" }, { disableChecks: true }), {
      value: "prefix-a"
    })
    strictEqual(SchemaParser.is(template)({ value: "prefix-a" }), false)

    const record = Schema.Record(Schema.String.check(Schema.isStartingWith("x")), Schema.Number)
    const decode = SchemaParser.decodeUnknownSync(record)
    deepStrictEqual(decode({ x: 1, y: 2 }), { x: 1 })
    deepStrictEqual(decode({ x: 1, y: 2 }, { disableChecks: true }), { x: 1, y: 2 })
  })

  it("runs the diagnostic phase after fast validation fails", () => {
    let reads = 0
    const input = {
      get name() {
        reads++
        return 1
      },
      count: 1,
      active: true,
      nested: { value: "b" }
    }

    throws(() => decode(input), (error) => {
      assertSchemaIssueError(error, `Expected string\n  at ["name"]`)
    })
    strictEqual(reads, 2)
  })

  it("runs one diagnostic pass for a nested failure", () => {
    let checks = 0
    const decode = SchemaParser.decodeUnknownSync(Schema.Struct({
      nested: Schema.Struct({
        value: Schema.String.check(Schema.makeFilter(() => {
          checks++
          return false
        }))
      })
    }))

    throws(() => decode({ nested: { value: "invalid" } }), (error) => {
      assertSchemaIssueError(
        error,
        `Expected <filter>
  at ["nested"]["value"]`
      )
    })
    strictEqual(checks, 2)
  })

  it("preserves diagnostics with shared parser helpers", () => {
    const schema = Schema.Struct({ value: Schema.String })
    const decode = SchemaParser.decodeUnknownSync(schema)

    deepStrictEqual(decode({ value: "a", extra: true }), { value: "a" })
    throws(() => decode({ value: 1 }), (error) => {
      assertSchemaIssueError(
        error,
        `Expected string
  at ["value"]`
      )
    })
    throws(() => decode({ value: "a", extra: true }, { onExcessProperty: "error" }), (error) => {
      assertSchemaIssueError(
        error,
        `Expected no excess property
  at ["extra"]`
      )
    })
  })

  it("executes transformations and middleware once", () => {
    let transformations = 0
    const transformed = Schema.String.pipe(
      Schema.decodeTo(
        Schema.String.check(Schema.isMinLength(2)),
        SchemaTransformation.transform({
          decode: (value) => {
            transformations++
            return value.trim()
          },
          encode: (value) => value
        })
      )
    )
    const decodeTransformed = SchemaParser.decodeUnknownSync(transformed)

    strictEqual(decodeTransformed("  valid  "), "valid")
    strictEqual(transformations, 1)
    throws(() => decodeTransformed(" x "))
    strictEqual(transformations, 2)

    let middlewareRuns = 0
    const middleware = Schema.Struct({ value: Schema.String }).pipe(
      Schema.middlewareDecoding((effect) => {
        middlewareRuns++
        return effect
      })
    )

    deepStrictEqual(SchemaParser.decodeUnknownSync(middleware)({ value: "valid" }), { value: "valid" })
    strictEqual(middlewareRuns, 1)
  })

  it("decodes transformed Struct properties with runtime options", () => {
    const schema = Schema.Struct({
      first: Schema.FiniteFromString,
      second: Schema.FiniteFromString
    })

    const decode = SchemaParser.decodeUnknownSync(schema)
    for (
      const options of [
        undefined,
        {},
        { errors: "first" },
        { onExcessProperty: "ignore" },
        { reportInput: true },
        { disableChecks: true }
      ] as const
    ) {
      deepStrictEqual(decode({ first: "1", second: "2" }, options), { first: 1, second: 2 })
    }
  })

  it("does not replay inlined Struct transformations", () => {
    let transformations = 0
    const transformed = Schema.String.pipe(
      Schema.decodeTo(
        Schema.Number,
        SchemaTransformation.transform({
          decode: (value) => {
            transformations++
            return value === "invalid" ? "invalid" as any : Number(value)
          },
          encode: String
        })
      )
    )
    const decode = SchemaParser.decodeUnknownSync(Schema.Struct({ value: transformed }))

    deepStrictEqual(decode({ value: "1" }), { value: 1 })
    strictEqual(transformations, 1)
    throws(() => decode({ value: false }))
    strictEqual(transformations, 1)
    throws(() => decode({ value: "invalid" }))
    strictEqual(transformations, 2)
  })

  it("applies Struct output and encoding checks after compiled fields without replay", () => {
    let transformations = 0
    let checks = 0
    const schema = Schema.Struct({
      value: Schema.String.pipe(Schema.decodeTo(
        Schema.Number,
        SchemaTransformation.transform({
          decode: (value) => {
            transformations++
            return Number(value)
          },
          encode: String
        })
      ))
    }).check(Schema.makeFilter((output) => {
      checks++
      deepStrictEqual(Object.keys(output), ["value"])
      return output.value > 0
    })).pipe(
      Schema.flip,
      Schema.check(Schema.makeFilter((input) => input.value !== "01")),
      Schema.flip
    )
    const decode = SchemaParser.decodeUnknownSync(schema)
    deepStrictEqual(decode({ value: "1", extra: true }), { value: 1 })
    throws(() => decode({ value: "-1", extra: true }))
    strictEqual(transformations, 2)
    strictEqual(checks, 2)

    deepStrictEqual(decode({ value: "-1" }, { disableChecks: true }), { value: -1 })
    strictEqual(checks, 2)
    throws(() => decode({ value: "-1" }, { errors: "all" }))
    strictEqual(transformations, 4)
    strictEqual(checks, 3)
    throws(() => decode({ value: "01" }))
    strictEqual(transformations, 5)
    strictEqual(checks, 3)
  })

  it("replaces the parser used by the other decoding adapters", () => {
    let checks = 0
    const schema = Schema.String.check(Schema.makeFilter(() => {
      checks++
      return false
    }))

    assert(Result.isFailure(SchemaParser.decodeUnknownResult(schema)("value")))
    strictEqual(checks, 2)
  })

  it("replaces the parser used by encoding adapters", () => {
    let checks = 0
    const schema = Schema.String.check(Schema.makeFilter(() => {
      checks++
      return false
    }))

    assert(Result.isFailure(SchemaParser.encodeUnknownResult(schema)("value")))
    strictEqual(checks, 2)
  })

  it("does not replay defects", () => {
    const defect = new Error("boom")
    let reads = 0
    const input = {
      get name(): string {
        reads++
        throw defect
      },
      count: 1,
      active: true,
      nested: { value: "b" }
    }

    throws(() => decode(input), (error) => {
      assert(error instanceof Error)
      strictEqual(error.message, "Sync adapter can only throw schema issues")
      assert(Cause.hasDies(error.cause as Cause.Cause<never>))
    })
    strictEqual(reads, 1)
  })

  it("honors explicit ParseOptions in the compiled diagnostic phase", () => {
    throws(() =>
      decode({
        name: "a",
        count: 1,
        active: true,
        nested: { value: "b", nestedExtra: true },
        extra: true
      }, { onExcessProperty: "error", errors: "all" }), (error) => {
      assertSchemaIssueError(
        error,
        `Expected no excess property
  at ["extra"]
Expected no excess property
  at ["nested"]["nestedExtra"]`
      )
    })
  })

  it("compiles symbol-keyed Struct properties", () => {
    const key = Symbol("key")
    const decode = SchemaParser.decodeUnknownSync(Schema.Struct({
      text: Schema.String,
      [key]: Schema.Number
    }))
    const output = decode({ text: "value", [key]: 1, extra: true })

    strictEqual(output.text, "value")
    strictEqual(output[key], 1)
    deepStrictEqual(Reflect.ownKeys(output), ["text", key])
  })

  it("uses the interpreter for unsupported schemas", () => {
    const date = new Date(0)
    const decode = SchemaParser.decodeUnknownSync(Schema.instanceOf(Date))
    strictEqual(decode(date), date)
  })

  it("uses the interpreter when dynamic function generation is unavailable", () => {
    const Function = globalThis.Function
    try {
      globalThis.Function = (() => {
        throw new Error("dynamic function generation unavailable")
      }) as any
      const schema = Schema.Struct({ value: Schema.String })
      const getParser = schema.ast.getParser.bind(schema.ast)
      let interpreterConstructions = 0
      Object.defineProperty(schema.ast, "getParser", {
        configurable: true,
        value(...args: Parameters<typeof getParser>) {
          interpreterConstructions++
          return getParser(...args)
        }
      })
      const decode = SchemaParser.decodeUnknownSync(schema)

      deepStrictEqual(decode({ value: "a" }), { value: "a" })
      strictEqual(interpreterConstructions, 1)
      throws(() => decode({ value: 1 }), (error) => {
        assertSchemaIssueError(
          error,
          `Expected string
  at ["value"]`
        )
      })
    } finally {
      globalThis.Function = Function
    }
  })

  it("compiles primitive leaves without confusing undefined with a missing key", () => {
    const decode = SchemaParser.decodeUnknownSync(Schema.Struct({
      undefined: Schema.Undefined,
      unknown: Schema.Unknown,
      bigint: Schema.BigInt,
      symbol: Schema.Symbol,
      literal: Schema.Literal("a")
    }))
    const symbol = globalThis.Symbol("a")

    deepStrictEqual(
      decode({ undefined, unknown: undefined, bigint: 1n, symbol, literal: "a", extra: true }),
      { undefined, unknown: undefined, bigint: 1n, symbol, literal: "a" }
    )
    throws(() => decode({ unknown: undefined, bigint: 1n, symbol, literal: "a" }), (error) => {
      assertSchemaIssueError(error, `Missing key\n  at ["undefined"]`)
    })
  })

  it("compiles arrays and tuples with rest and tail elements", () => {
    const decodeArray = SchemaParser.decodeUnknownSync(Schema.Array(Schema.String))
    deepStrictEqual(decodeArray(["a", "b"]), ["a", "b"])

    const decodeTuple = SchemaParser.decodeUnknownSync(
      Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number, Schema.Boolean])
    )
    deepStrictEqual(decodeTuple(["a", 1, 2, true]), ["a", 1, 2, true])
    throws(() => decodeTuple(["a", 1, 2]), (error) => {
      assertSchemaIssueError(error, `Expected boolean\n  at [2]`)
    })
  })

  it("compiles optional tuple elements", () => {
    const schema = Schema.Tuple([Schema.optionalKey(Schema.String)])
    const decode = SchemaParser.decodeUnknownSync(schema)
    const is = SchemaParser.is(schema)

    deepStrictEqual(decode([]), [])
    deepStrictEqual(decode(["a"]), ["a"])
    strictEqual(is([]), true)
    strictEqual(is(["a"]), true)
    strictEqual(is([1]), false)
  })

  it("preserves the input sign for signed-zero literals", () => {
    const decode = SchemaParser.decodeUnknownSync(Schema.Struct({
      negative: Schema.Literal(-0),
      positive: Schema.Union([Schema.Literal(0), Schema.Literal(1)]),
      union: Schema.Union([Schema.Literal(-0), Schema.Literal(1)])
    }))
    const output = decode({ negative: 0, positive: -0, union: 0 })

    strictEqual(Object.is(output.negative, 0), true)
    strictEqual(Object.is(output.positive, -0), true)
    strictEqual(Object.is(output.union, 0), true)
  })

  it("compiles primitive anyOf and oneOf unions", () => {
    const decodeAnyOf = SchemaParser.decodeUnknownSync(
      Schema.Union([Schema.Literal("a"), Schema.Literal("b"), Schema.Number])
    )
    strictEqual(decodeAnyOf("b"), "b")
    strictEqual(decodeAnyOf(1), 1)
    throws(() => decodeAnyOf(true), (error) => {
      assertSchemaIssueError(error, "Expected \"a\" | \"b\" | number")
    })

    const decodeOneOf = SchemaParser.decodeUnknownSync(
      Schema.Union([Schema.String, Schema.Literal("a")], { mode: "oneOf" })
    )
    strictEqual(decodeOneOf("b"), "b")
    throws(() => decodeOneOf("a"), (error) => {
      assertSchemaIssueError(error, "Expected exactly one member to match")
    })
  })

  it("compiles structural unions through canonical candidate selection", () => {
    const decodeTagged = SchemaParser.decodeUnknownSync(Schema.Union([
      Schema.Struct({ kind: Schema.Literal("a"), value: Schema.String }),
      Schema.Struct({ kind: Schema.Literal("b"), value: Schema.Number })
    ]))
    deepStrictEqual(
      decodeTagged({ kind: "b", value: 1, extra: true }),
      { kind: "b", value: 1 }
    )

    const decodeUntagged = SchemaParser.decodeUnknownSync(Schema.Union([
      Schema.Struct({ first: Schema.String }),
      Schema.Struct({ second: Schema.String })
    ]))
    deepStrictEqual(
      decodeUntagged({ first: "a", second: "b" }),
      { first: "a" }
    )

    const decodeOneOf = SchemaParser.decodeUnknownSync(Schema.Union([
      Schema.Struct({ first: Schema.String }),
      Schema.Struct({ second: Schema.String })
    ], { mode: "oneOf" }))
    throws(() => decodeOneOf({ first: "a", second: "b" }), (error) => {
      assertSchemaIssueError(error, "Expected exactly one member to match")
    })
  })

  it("compiles optional object properties", () => {
    const decode = SchemaParser.decodeUnknownSync(Schema.Struct({
      required: Schema.String,
      optional: Schema.optionalKey(Schema.Number),
      undefined: Schema.optionalKey(Schema.Undefined)
    }))

    deepStrictEqual(decode({ required: "a" }), { required: "a" })
    deepStrictEqual(
      decode({ required: "a", optional: 1, undefined, extra: true }),
      { required: "a", optional: 1, undefined }
    )
    throws(() => decode({ required: "a", optional: "invalid" }), (error) => {
      assertSchemaIssueError(error, `Expected number\n  at ["optional"]`)
    })
  })

  it("compiles string records", () => {
    const decode = SchemaParser.decodeUnknownSync(
      Schema.Record(Schema.String, Schema.Struct({ count: Schema.Number }))
    )
    deepStrictEqual(
      decode({ a: { count: 1 }, b: { count: 2 }, extra: { count: 3, ignored: true } }),
      { a: { count: 1 }, b: { count: 2 }, extra: { count: 3 } }
    )
    throws(() => decode({ a: { count: "invalid" } }), (error) => {
      assertSchemaIssueError(error, `Expected number\n  at ["a"]["count"]`)
    })
  })

  it("compiles symbol and template-literal records", () => {
    const symbol = Symbol("key")
    const decodeSymbols = SchemaParser.decodeUnknownSync(Schema.Record(Schema.Symbol, Schema.Number))
    const symbolOutput = decodeSymbols({ text: "ignored", [symbol]: 1 })
    strictEqual(symbolOutput[symbol], 1)
    deepStrictEqual(Reflect.ownKeys(symbolOutput), [symbol])

    const decodeTemplates = SchemaParser.decodeUnknownSync(
      Schema.Record(Schema.TemplateLiteral(["data-", Schema.String]), Schema.Number)
    )
    deepStrictEqual(
      decodeTemplates({ "data-a": 1, ignored: 2, "data-b": 3 }),
      { "data-a": 1, "data-b": 3 }
    )
  })

  it("compiles fixed properties with index signatures", () => {
    const decode = SchemaParser.decodeUnknownSync(
      Schema.StructWithRest(
        Schema.Struct({ fixed: Schema.Trim }),
        [Schema.Record(Schema.String, Schema.String)]
      )
    )
    deepStrictEqual(decode({ fixed: "  value  ", other: "other" }), { fixed: "value", other: "other" })
  })

  it("compiles decoded index keys", () => {
    const decodeNumbers = SchemaParser.decodeUnknownSync(Schema.Record(Schema.Number, Schema.Number))
    deepStrictEqual(decodeNumbers({ 1: 1, other: "ignored" }), { 1: 1 })

    const decodeCamelCase = SchemaParser.decodeUnknownSync(
      Schema.Record(
        Schema.String.pipe(Schema.decodeTo(Schema.String, SchemaTransformation.toUpperCase())),
        Schema.Number
      )
    )
    deepStrictEqual(decodeCamelCase({ a: 1, b: 2 }), { A: 1, B: 2 })
  })

  it("compiles encoding checks", () => {
    const checked = Schema.Struct({ value: Schema.String }).pipe(
      Schema.flip,
      Schema.check(Schema.makeFilter((input) => input.value.length > 1)),
      Schema.flip
    )
    const decode = SchemaParser.decodeUnknownSync(checked)
    deepStrictEqual(decode({ value: "valid" }), { value: "valid" })
    throws(() => decode({ value: "" }))
  })

  it("runs checks against decoded output", () => {
    const decodeString = SchemaParser.decodeUnknownSync(
      Schema.String.check(Schema.isMinLength(2))
    )
    strictEqual(decodeString("ab"), "ab")
    throws(() => decodeString("a"), (error) => {
      assertSchemaIssueError(error, "Expected a value with a length of at least 2")
    })

    const decodeObject = SchemaParser.decodeUnknownSync(
      Schema.Struct({ value: Schema.String }).check(Schema.isMaxProperties(1))
    )
    deepStrictEqual(decodeObject({ value: "a", extra: true }), { value: "a" })
  })

  it("runs compiled type guard checks against decoded output", () => {
    const checked = Schema.Struct({ value: Schema.String }).check(Schema.isMaxProperties(1))
    const isRoot = SchemaParser.is(checked)
    const isNested = SchemaParser.is(Schema.Struct({ nested: checked }))

    strictEqual(isRoot({ value: "a", extra: true }), true)
    strictEqual(isNested({ nested: { value: "a", extra: true }, extra: true }), true)
    strictEqual(isNested({ nested: { value: 1 } }), false)
  })

  it("uses compiled checkpoints around interpreted declarations and transformations", () => {
    const date = new Date(0)
    const decode = SchemaParser.decodeUnknownSync(Schema.Struct({
      date: Schema.instanceOf(Date),
      count: Schema.FiniteFromString
    }))

    const output = decode({ date, count: "1", extra: true })
    strictEqual(output.date, date)
    strictEqual(output.count, 1)
    deepStrictEqual(Reflect.ownKeys(output), ["date", "count"])
  })

  it("uses compiled checkpoints inside root encoding chains", () => {
    const decodeNumber = SchemaParser.decodeUnknownSync(Schema.FiniteFromString)
    strictEqual(decodeNumber("1"), 1)
    throws(() => decodeNumber("invalid"), (error) => {
      assertSchemaIssueError(error, "Expected a finite number")
    })

    const decodeJson = SchemaParser.decodeUnknownSync(
      Schema.fromJsonString(Schema.Struct({ value: Schema.Number }))
    )
    deepStrictEqual(decodeJson("{\"value\":1,\"extra\":true}"), { value: 1 })
  })

  it("does not replay transformations when a compiled checkpoint fails", () => {
    let sourceChecks = 0
    let firstTransformations = 0
    let secondTransformations = 0
    let checks = 0
    const schema = Schema.Struct({
      value: Schema.String.check(Schema.makeFilter((value) => {
        sourceChecks++
        return value !== "blocked"
      })).pipe(
        Schema.decodeTo(
          Schema.Number.check(Schema.makeFilter((value) => {
            checks++
            return value > 0
          })),
          SchemaTransformation.transform({
            decode: (value) => {
              firstTransformations++
              return Number(value)
            },
            encode: String
          })
        ),
        Schema.decodeTo(
          Schema.String,
          SchemaTransformation.transform({
            decode: (value) => {
              secondTransformations++
              return String(value)
            },
            encode: Number
          })
        )
      )
    })

    throws(() => SchemaParser.decodeUnknownSync(schema)({ value: "blocked" }))
    strictEqual(sourceChecks, 1)
    strictEqual(firstTransformations, 0)
    strictEqual(secondTransformations, 0)

    sourceChecks = 0
    throws(() => SchemaParser.decodeUnknownSync(schema)({ value: "-1" }))
    strictEqual(sourceChecks, 1)
    strictEqual(firstTransformations, 1)
    strictEqual(secondTransformations, 0)
    strictEqual(checks, 1)
  })

  it("preserves mixed causes from interpreted encoding chains", () => {
    const cause = Cause.combine(
      Cause.fail(new SchemaIssue.InvalidValue({ message: "schema issue" })),
      Cause.die(new Error("defect"))
    )
    const schema = Schema.String.pipe(Schema.decode({
      decode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(cause)),
      encode: SchemaGetter.passthrough()
    }))

    throws(() => SchemaParser.decodeUnknownSync(schema)("value"), (error) => {
      assert(error instanceof Error)
      strictEqual(error.message, "Sync adapter can only throw schema issues")
      const issue = Cause.findError(error.cause as Cause.Cause<SchemaIssue.Issue>)
      assert(Result.isSuccess(issue))
      strictEqual(issue.success._tag, "Encoding")
      assert(Cause.hasDies(error.cause as Cause.Cause<never>))
    })
  })

  it("keeps Suspend parsers lazy", () => {
    interface Category {
      readonly value: string
      readonly children: ReadonlyArray<Category>
    }
    let evaluations = 0
    const schema: Schema.Codec<Category> = Schema.Struct({
      value: Schema.String,
      children: Schema.Array(Schema.suspend((): Schema.Codec<Category> => {
        evaluations++
        return schema
      }))
    })
    const decode = SchemaParser.decodeUnknownSync(schema)

    deepStrictEqual(decode({ value: "root", children: [] }), { value: "root", children: [] })
    strictEqual(evaluations, 0)
    deepStrictEqual(
      decode({ value: "root", children: [{ value: "child", children: [] }] }),
      { value: "root", children: [{ value: "child", children: [] }] }
    )
    strictEqual(evaluations, 1)
  })

  it("does not replay declaration defects", () => {
    const defect = new Error("declaration defect")
    let runs = 0
    const declaration = Schema.declareConstructor<unknown>()([], () => () => {
      runs++
      return Effect.die(defect)
    })
    const decode = SchemaParser.decodeUnknownSync(Schema.Struct({ declaration }))

    throws(() => decode({ declaration: "value" }), (error) => {
      assert(error instanceof Error)
      strictEqual(error.message, "Sync adapter can only throw schema issues")
      assert(Cause.hasDies(error.cause as Cause.Cause<never>))
    })
    strictEqual(runs, 1)
  })
})
