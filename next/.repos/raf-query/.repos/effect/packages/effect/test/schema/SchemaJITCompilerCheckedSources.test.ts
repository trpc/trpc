import { assert, describe, it } from "@effect/vitest"
import { Effect, Result, Schema, SchemaAST, SchemaGetter, SchemaParser, SchemaTransformation } from "effect"
import * as Codegen from "effect/internal/schema/codegen"
import * as Registry from "effect/internal/schema/compilerRegistry"
import { SchemaJITCompiler } from "effect/schema"
import * as SchemaAOTCompiler from "effect/schema/SchemaAOTCompiler"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { deepStrictEqual } from "../utils/assert.ts"

type Options = Parameters<ReturnType<typeof SchemaParser.decodeUnknownResult>>[1]

const optionSets: ReadonlyArray<Options> = [
  undefined,
  { reportInput: true },
  { errors: "all", reportInput: true },
  { onExcessProperty: "error", reportInput: true },
  { disableChecks: true, reportInput: true }
]

const counters = { checks: 0, transforms: 0 }

// Every case builds its own schemas: the compiler registry is global, so a
// shared child AST enabled by an earlier case would make a later "interpreted"
// snapshot use compiled children.
const makeFixtures = () => {
  const counted = <A, B>(f: (a: A) => B) => (a: A): B => {
    counters.transforms++
    return f(a)
  }
  // Every source check is counted.
  const countedFilter = (predicate: (s: string) => boolean, expected: string) =>
    Schema.makeFilter((s: string) => {
      counters.checks++
      return predicate(s)
    }, { expected })
  const Digits = Schema.String.check(countedFilter((s) => /^[0-9]{1,6}$/.test(s), "digits"))
  const Short = Schema.String.check(
    countedFilter((s) => s.length >= 1, "non-empty"),
    countedFilter((s) => s.length <= 3, "short")
  )
  const Checked = Schema.String.check(Schema.isPattern(/^[a-z ]*$/))
  // "13" transforms into a value that fails the target type.
  const toNumber = {
    decode: SchemaGetter.transform(counted((s: string) => s === "13" ? "thirteen" as unknown as number : Number(s))),
    encode: SchemaGetter.transform((n: number) => String(n))
  }
  const prefixed = SchemaTransformation.transform({
    decode: counted((s: string) => s === "7" ? 7 as unknown as string : `#${s}`),
    encode: (s: string) => s.slice(1)
  })
  return {
    Digits,
    Checked,
    OneOf: Schema.TemplateLiteral([Schema.Union([Schema.String, Schema.Literal("x")], { mode: "oneOf" })]),
    identity: SchemaTransformation.transform({ decode: counted((s: string) => s), encode: (s: string) => s }),
    DigitsToNumber: Digits.pipe(Schema.decodeTo(Schema.Number, toNumber)),
    ShortToNumber: Short.pipe(Schema.decodeTo(Schema.Number, toNumber)),
    StringToNumber: Schema.String.pipe(Schema.decodeTo(Schema.Number, toNumber)),
    DigitsToString: Digits.pipe(Schema.decodeTo(Schema.String, prefixed)),
    DigitsPassthrough: Digits.pipe(Schema.decodeTo(Schema.String)),
    // Two links: Digits -> String (prefixed) -> Number (toNumber, after dropping the prefix).
    TwoLinks: Digits.pipe(Schema.decodeTo(
      Schema.String.pipe(Schema.decodeTo(
        Schema.Number,
        {
          decode: SchemaGetter.transform(
            counted((s: string) => s === "#13" ? "thirteen" as unknown as number : Number(s.slice(1)))
          ),
          encode: SchemaGetter.transform((n: number) => `#${n}`)
        }
      )),
      prefixed
    )),
    countedFilter,
    toNumber,
    prefixed
  }
}
type Fixtures = ReturnType<typeof makeFixtures>

const values: ReadonlyArray<unknown> = ["1", "123456", "13", "7", "", "abc", "1234567", 1, null, undefined]

interface Case {
  readonly name: string
  readonly schema: (f: Fixtures) => Schema.Codec<unknown, unknown>
  readonly inputs: ReadonlyArray<unknown>
  readonly make?: ReadonlyArray<unknown>
  // Compiled parsers may run a failing check a second time in their
  // diagnostic pass. That is only allowed on paths this change does not
  // inline: "always" for schemas that keep their previous parser, "fallback"
  // when a Struct delegates to its fallback (`errors: "all"` or
  // `onExcessProperty`) and a field's own parser is not inlined. Everywhere
  // else each check must run exactly as often as in the interpreter.
  readonly replay?: "always" | "fallback" | undefined
}

const fallbackOptions = (options: Options): boolean =>
  options?.errors === "all" || options?.onExcessProperty !== undefined

// A field alone, in a Struct of its own, and in a Struct with a valid checked
// sibling (per-property layout), so that no earlier failure hides the field.
const inLayouts = (
  name: string,
  field: (f: Fixtures) => Schema.Codec<unknown, unknown>,
  inputs: ReadonlyArray<unknown>,
  options: Pick<Case, "replay"> & { readonly ownParserReplays?: boolean } = {}
): ReadonlyArray<Case> => [
  {
    name,
    schema: field,
    inputs,
    replay: options.replay ?? (options.ownParserReplays ? "always" : undefined)
  },
  {
    name: `${name} in a Struct`,
    schema: (f) => Schema.Struct({ n: field(f) }),
    inputs: inputs.map((n) => ({ n })),
    replay: options.replay ?? (options.ownParserReplays ? "fallback" : undefined)
  },
  {
    name: `${name} next to a checked field`,
    schema: (f) => Schema.Struct({ s: f.Checked, n: field(f) }),
    inputs: inputs.map((n) => ({ s: "ok", n })),
    replay: options.replay ?? (options.ownParserReplays ? "fallback" : undefined)
  }
]

const cases: ReadonlyArray<Case> = [
  ...inLayouts(
    "TemplateLiteral with overlapping oneOf parts",
    (f) => f.OneOf,
    ["x", "y", "", 1]
  ),
  ...inLayouts(
    "nested TemplateLiteral with overlapping oneOf parts",
    (f) => Schema.TemplateLiteral(["nested:", f.OneOf]),
    ["nested:x", "nested:y", "wrong", 1]
  ),
  ...inLayouts(
    "TemplateLiteral with oneOf inside anyOf",
    () =>
      Schema.TemplateLiteral([Schema.Union([
        Schema.Union([Schema.String, Schema.Literal("x")], { mode: "oneOf" }),
        Schema.Literal("z")
      ])]),
    ["x", "y", "z", 1]
  ),
  ...inLayouts(
    "TemplateLiteral with overlapping numeric oneOf parts",
    () => Schema.TemplateLiteral([Schema.Union([Schema.Number, Schema.Literal("1")], { mode: "oneOf" })]),
    ["1", "2", "wrong", 1]
  ),
  ...inLayouts(
    "TemplateLiteral transformation target",
    (f) =>
      Schema.String.pipe(Schema.decodeTo(
        Schema.TemplateLiteral(["x-", Schema.String]),
        f.identity as SchemaTransformation.Transformation<`x-${string}`, string>
      )),
    ["x-a", "wrong", 1]
  ),
  ...inLayouts(
    "TemplateLiteral transformation target with overlapping oneOf parts",
    (f) => Schema.String.pipe(Schema.decodeTo(f.OneOf, f.identity)),
    ["x", "y", 1]
  ),
  ...inLayouts(
    "checked source with a oneOf TemplateLiteral target",
    (f) => f.Checked.pipe(Schema.decodeTo(f.OneOf, f.identity)),
    ["x", "y", "INVALID", 1]
  ),
  ...inLayouts(
    "TemplateLiteral transformation source",
    (f) =>
      Schema.TemplateLiteral(["x-", Schema.String]).pipe(Schema.decodeTo(
        Schema.String,
        f.identity as SchemaTransformation.Transformation<string, `x-${string}`>
      )),
    ["x-a", "wrong", 1]
  ),
  ...inLayouts(
    "TemplateLiteral intermediate transformation",
    (f) =>
      Schema.String.pipe(Schema.decodeTo(
        Schema.TemplateLiteral(["x-", Schema.String]).pipe(Schema.decodeTo(
          Schema.String,
          f.identity as SchemaTransformation.Transformation<string, `x-${string}`>
        )),
        f.identity as SchemaTransformation.Transformation<`x-${string}`, string>
      )),
    ["x-a", "wrong", 1]
  ),
  ...inLayouts("checked source", (f) => f.DigitsToNumber, values),
  ...inLayouts("several source checks", (f) => f.ShortToNumber, values),
  ...inLayouts("string target", (f) => f.DigitsToString, values),
  // emitEncoding only compiles a single Transform link, so these fields keep
  // their previous parser on their own; inside a Struct they are inlined.
  ...inLayouts("passthrough", (f) => f.DigitsPassthrough, values, { ownParserReplays: true }),
  ...inLayouts("two-link chain", (f) => f.TwoLinks, values, { ownParserReplays: true }),
  {
    name: "Struct with only transformed fields",
    // Passthrough fields have their own layout cases, which allow their
    // fallback replay; here every field is inlined, so counts are exact.
    schema: (f) => Schema.Struct({ a: f.DigitsToNumber, b: f.StringToNumber, c: f.DigitsToString }),
    inputs: [
      ...values.map((a) => ({ a, b: "2", c: "3" })),
      ...values.map((c) => ({ a: "1", b: "2", c })),
      { b: "2", c: "3" },
      { a: "1", c: "3" },
      { a: "abc", b: 2, c: "3" },
      { a: "1", b: "2", c: "3", d: "4" },
      null,
      []
    ]
  },
  {
    name: "Struct mixing checked and transformed fields",
    schema: (f) => Schema.Struct({ s: f.Checked, n: f.DigitsToNumber, m: f.ShortToNumber }),
    inputs: [
      ...values.map((n) => ({ s: "ok", n, m: "12" })),
      ...values.map((m) => ({ s: "ok", n: "1", m })),
      { s: "NOT OK", n: "abc", m: "1234" },
      { s: "ok", m: "12" },
      { s: "ok", n: "1", m: "12", extra: true }
    ]
  },
  {
    name: "Struct with several checked transformations",
    schema: (f) => Schema.Struct({ a: f.DigitsToNumber, b: f.DigitsToNumber, c: f.DigitsToString }),
    inputs: [
      { a: "1", b: "2", c: "3" },
      { a: "x", b: "y", c: "z" },
      { a: "1", b: "13", c: "3" },
      { a: "1", b: "2", c: "7" },
      { a: "1", b: "2", c: 3 }
    ]
  },
  {
    name: "optional keys",
    schema: (f) => Schema.Struct({ a: Schema.optionalKey(f.DigitsToNumber), b: Schema.optional(f.DigitsToNumber) }),
    inputs: [{}, { a: "1" }, { a: "x" }, { b: undefined }, { b: "1" }, { b: "x" }, { a: undefined }]
  },
  {
    name: "constructor defaults",
    schema: (f) => Schema.Struct({ n: f.DigitsToNumber.pipe(Schema.withConstructorDefault(Effect.succeed(0))) }),
    inputs: [{}, { n: undefined }, { n: "1" }, { n: "x" }],
    make: [{}, { n: undefined }, { n: 5 }, { n: "x" }]
  },
  {
    name: "__proto__ key",
    schema: (f) => Schema.Struct({ ["__proto__"]: f.DigitsToNumber, a: f.DigitsToNumber }),
    inputs: [
      JSON.parse(`{"__proto__":"1","a":"2"}`),
      JSON.parse(`{"__proto__":"x","a":"2"}`),
      JSON.parse(`{"a":"2"}`),
      { a: "2" }
    ]
  },
  {
    name: "symbol key",
    schema: (f) => Schema.Struct({ [Symbol.for("n")]: f.DigitsToNumber, a: f.DigitsToNumber }),
    inputs: [{ [Symbol.for("n")]: "1", a: "2" }, { [Symbol.for("n")]: "x", a: "2" }, { a: "2" }]
  },
  {
    name: "nested Struct",
    schema: (f) => Schema.Struct({ outer: Schema.Struct({ s: f.Checked, n: f.DigitsToNumber }), n: f.DigitsToNumber }),
    inputs: [
      { outer: { s: "ok", n: "1" }, n: "2" },
      { outer: { s: "ok", n: "x" }, n: "2" },
      { outer: { s: "ok", n: "1" }, n: "x" },
      { outer: { s: "OK", n: "x" }, n: "x" }
    ]
  },
  {
    name: "Array of Structs",
    schema: (f) => Schema.Array(Schema.Struct({ s: f.Checked, n: f.DigitsToNumber })),
    inputs: [[{ s: "ok", n: "1" }, { s: "ok", n: "2" }], [{ s: "ok", n: "1" }, { s: "ok", n: "x" }, {
      s: "OK",
      n: "y"
    }]]
  },
  {
    name: "target checks",
    schema: (f) =>
      Schema.Struct({ n: f.Digits.pipe(Schema.decodeTo(Schema.Number.check(Schema.isLessThan(100)), f.toNumber)) }),
    inputs: [{ n: "1" }, { n: "100" }, { n: "x" }]
  },
  // TemplateLiteral chains retain their parsers for structured diagnostics.
  ...inLayouts(
    "checked TemplateLiteral source",
    (f) =>
      Schema.TemplateLiteral(["x-", Schema.String]).check(f.countedFilter((s) => s.length <= 4, "short")).pipe(
        Schema.decodeTo(
          Schema.String,
          f.prefixed as unknown as SchemaTransformation.Transformation<string, `x-${string}`>
        )
      ),
    ["x-a", "x-abc", "wrong", 1],
    { replay: "always" }
  ),
  ...inLayouts(
    "checked source with a TemplateLiteral target",
    (f) =>
      f.Digits.pipe(Schema.decodeTo(
        Schema.TemplateLiteral(["#", Schema.String]),
        f.prefixed as unknown as SchemaTransformation.Transformation<`#${string}`, string>
      )),
    ["1", "7", "x"],
    { replay: "always" }
  ),
  ...inLayouts(
    "checked TemplateLiteral source with a oneOf part",
    (f) =>
      f.OneOf
        .check(f.countedFilter((s) => s.length >= 1, "non-empty")).pipe(Schema.decodeTo(Schema.String, f.prefixed)),
    ["x", "y"],
    { replay: "always" }
  )
]

// Objects that belong to the schema (AST nodes, filters) or to the inputs are
// compared by identity; issues and objects built while parsing (for example the
// ASTs a TemplateLiteral builds for its diagnostics) are compared by structure.
const collectKnown = (root: unknown, inputs: ReadonlyArray<unknown>): Set<unknown> => {
  const known = new Set<unknown>()
  const visit = (value: unknown): void => {
    if ((typeof value !== "object" && typeof value !== "function") || value === null || known.has(value)) return
    known.add(value)
    for (const key of Reflect.ownKeys(value)) visit((value as any)[key])
  }
  visit(root)
  inputs.forEach(visit)
  return known
}

const makeDescriber = (known: Set<unknown>) => {
  const identities = new Map<unknown, string>()
  const identity = (value: unknown): string => {
    let id = identities.get(value)
    if (id === undefined) {
      id = `#${identities.size}`
      identities.set(value, id)
    }
    return id
  }
  const describeValue = (value: unknown, depth = 0): unknown => {
    if (known.has(value)) return identity(value)
    if (typeof value === "function") return "<function>"
    if (typeof value !== "object" || value === null) {
      return typeof value === "number" && Number.isNaN(value) ? "NaN" : value
    }
    if (depth > 32) return "<deep>"
    if (Array.isArray(value)) return value.map((item) => describeValue(item, depth + 1))
    return Reflect.ownKeys(value).map((key) => [describeKey(key), describeValue((value as any)[key], depth + 1)])
  }
  // Symbol keys keep their identity, so that they differ from their string form
  // and from other symbols with the same description.
  const describeKey = (key: PropertyKey) => typeof key === "symbol" ? { symbol: identity(key) } : key
  const describeOutput = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(describeOutput)
      : typeof value === "object" && value !== null && !known.has(value)
      ? Reflect.ownKeys(value).map((key) => [describeKey(key), describeOutput((value as any)[key])])
      : describeValue(value)
  const describeResult = (result: Result.Result<unknown, unknown>) =>
    Result.isSuccess(result) ? { success: describeOutput(result.success) } : { failure: describeValue(result.failure) }
  return { describeResult, describeOutput }
}

const snapshot = (
  schema: Schema.Codec<unknown, unknown>,
  { inputs, make = [] }: Case,
  describeResult: ReturnType<typeof makeDescriber>["describeResult"],
  checks: Array<{ readonly count: number; readonly fallback: boolean }>
) => {
  const decode = SchemaParser.decodeUnknownResult(schema)
  const construct = SchemaParser.make(schema as Schema.Codec<unknown, unknown> & Schema.Top)
  const run = (fallback: boolean, f: () => Result.Result<unknown, unknown>) => {
    counters.checks = 0
    counters.transforms = 0
    const result = describeResult(f())
    checks.push({ count: counters.checks, fallback })
    return { result, transforms: counters.transforms }
  }
  return [
    ...optionSets.flatMap((options) =>
      inputs.map((input) => run(fallbackOptions(options), () => decode(input, options)))
    ),
    ...make.map((input) =>
      run(false, () => {
        try {
          return Result.succeed(construct(input as never))
        } catch (error) {
          // Construction throws an Error whose cause is the schema issue.
          const cause = error instanceof Error ? error.cause : undefined
          if (typeof cause !== "object" || cause === null || !("~effect/SchemaIssue/Issue" in cause)) throw error
          return Result.fail(cause)
        }
      })
    )
  ]
}

const install = {
  jit: async (schema: Schema.Top) => {
    SchemaJITCompiler.enable(schema.ast)
    SchemaJITCompiler.enable(SchemaAST.toType(schema.ast))
  },
  aot: async (schema: Schema.Top) => {
    const asts = [schema.ast, SchemaAST.toType(schema.ast)]
    const directory = mkdtempSync(fileURLToPath(new URL("../../.schema-aot-checked-sources-", import.meta.url)))
    try {
      const file = join(directory, "module.mjs")
      writeFileSync(file, SchemaAOTCompiler.compile(asts.map((ast) => ({ ast, operations: ["decode", "is", "make"] }))))
      const generated = await import(pathToFileURL(file).href)
      generated.install(asts)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

describe("Schema compilers: transformations with checked sources", { concurrent: false }, () => {
  for (const compiler of ["jit", "aot"] as const) {
    it(`${compiler} preserves oneOf TemplateLiteral guards and constructors`, async () => {
      const shapes: ReadonlyArray<(f: Fixtures) => readonly [Schema.Top, (value: string) => unknown]> = [
        (f) => [f.OneOf, (value) => value],
        (f) => [Schema.Struct({ value: f.OneOf }), (value) => ({ value })],
        (f) => [Schema.Array(f.OneOf), (value) => [value]],
        (f) => [Schema.TemplateLiteral(["nested:", f.OneOf]), (value) => `nested:${value}`]
      ]
      for (const shape of shapes) {
        const [schema, input] = shape(makeFixtures())
        for (const compiled of [false, true]) {
          if (compiled) await install[compiler](schema)
          const is = SchemaParser.is(schema)
          const make = SchemaParser.make(schema)
          assert.isFalse(is(input("x")))
          assert.isTrue(is(input("y")))
          assert.throws(() => make(input("x") as never))
          deepStrictEqual(make(input("y") as never), input("y"))
        }
      }
    })

    for (const testCase of cases) {
      it(`${compiler} matches the interpreter: ${testCase.name}`, async () => {
        const schema = testCase.schema(makeFixtures()) as Schema.Codec<unknown, unknown> & Schema.Top
        const { describeResult } = makeDescriber(
          collectKnown([schema.ast, SchemaAST.toType(schema.ast)], [...testCase.inputs, ...testCase.make ?? []])
        )
        assert.isUndefined(Registry.resolve(schema.ast).compiled)
        const interpretedChecks: Array<{ readonly count: number; readonly fallback: boolean }> = []
        const compiledChecks: Array<{ readonly count: number; readonly fallback: boolean }> = []
        const interpreted = snapshot(schema, testCase, describeResult, interpretedChecks)
        await install[compiler](schema)
        assert.isDefined(Registry.resolve(schema.ast).compiled)
        const compiled = snapshot(schema, testCase, describeResult, compiledChecks)
        deepStrictEqual(compiled, interpreted)
        compiledChecks.forEach(({ count, fallback }, index) => {
          const expected = interpretedChecks[index].count
          if (testCase.replay === "always" || testCase.replay === "fallback" && fallback) {
            assert.isAtLeast(count, expected)
            assert.isAtMost(count, 2 * expected)
          } else {
            assert.strictEqual(count, expected, `check runs for decode #${index}`)
          }
        })
      })
    }
  }

  it("inlines a transformation whose source has checks", () => {
    const f = makeFixtures()
    const field = Codegen.generate(f.DigitsToNumber.ast, "decodeEffect")
    assert.isDefined(field)
    assert.notInclude(field, "R.decode(")
    assert.include(field, "R.getCheckIssues(")

    const struct = Codegen.generate(Schema.Struct({ a: f.DigitsToNumber, b: f.StringToNumber }).ast, "decodeEffect")
    assert.isDefined(struct)
    // Every property is inlined, so the properties are resolved lazily.
    assert.include(struct, "const p=i=>getProperties()[i]")
    assert.include(struct, "invalidSource(")

    const mixed = Codegen.generate(Schema.Struct({ s: f.Checked, n: f.TwoLinks }).ast, "decodeEffect")
    assert.isDefined(mixed)
    assert.include(mixed, "R.invalidEncodingChecks(p1.type,v1,")
  })

  for (const compiler of ["jit", "aot"] as const) {
    it(`${compiler} runs inlined source checks once`, async () => {
      const shapes: ReadonlyArray<(f: Fixtures) => readonly [Schema.Top, (n: string) => unknown]> = [
        (f) => [f.DigitsToNumber, (n) => n],
        (f) => [Schema.Struct({ n: f.DigitsToNumber }), (n) => ({ n })],
        (f) => [Schema.Struct({ s: f.Checked, n: f.DigitsToNumber }), (n) => ({ s: "ok", n })],
        (f) => [Schema.Struct({ n: f.TwoLinks }), (n) => ({ n })],
        (f) => [Schema.Struct({ s: f.Checked, n: f.TwoLinks }), (n) => ({ s: "ok", n })],
        (f) => [Schema.Struct({ n: f.DigitsPassthrough }), (n) => ({ n })]
      ]
      for (const shape of shapes) {
        const [schema, input] = shape(makeFixtures())
        await install[compiler](schema)
        const decode = SchemaParser.decodeUnknownResult(schema as Schema.Codec<unknown>)
        for (const [value, succeeds] of [["1", true], ["x", false]] as const) {
          counters.checks = 0
          assert.strictEqual(Result.isSuccess(decode(input(value))), succeeds)
          assert.strictEqual(counters.checks, 1)
        }
      }
    })
  }

  it("distinguishes symbol keys in snapshots", () => {
    const { describeOutput } = makeDescriber(new Set())
    const a = Symbol("n")
    const b = Symbol("n")
    assert.notDeepEqual(describeOutput({ [Symbol.for("n")]: 1 }), describeOutput({ "Symbol(n)": 1 }))
    assert.notDeepEqual(describeOutput({ [a]: 1 }), describeOutput({ [b]: 1 }))
    assert.deepEqual(describeOutput({ [a]: 1 }), describeOutput({ [a]: 1 }))
  })

  it("uses TemplateLiteral parsers for transformation diagnostics", () => {
    const f = makeFixtures()
    const source = Schema.TemplateLiteral(["x-", Schema.String]).check(Schema.isMaxLength(4)).pipe(
      Schema.decodeTo(
        Schema.String,
        f.prefixed as unknown as SchemaTransformation.Transformation<string, `x-${string}`>
      )
    )
    const target = f.Digits.pipe(Schema.decodeTo(
      Schema.TemplateLiteral(["#", Schema.String]),
      f.prefixed as unknown as SchemaTransformation.Transformation<`#${string}`, string>
    ))
    const unchecked = Schema.String.pipe(Schema.decodeTo(
      Schema.TemplateLiteral(["#", Schema.String]),
      f.prefixed as SchemaTransformation.Transformation<`#${string}`, string>
    ))
    for (const schema of [source, target, unchecked]) {
      assert.include(Codegen.generate(schema.ast, "decodeEffect"), "R.decode(")
      assert.notInclude(Codegen.generate(Schema.Struct({ n: schema }).ast, "decodeEffect"), "R.getCheckIssues(")
    }
  })
})
