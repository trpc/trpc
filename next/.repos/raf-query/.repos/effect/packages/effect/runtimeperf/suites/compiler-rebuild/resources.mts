import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as v8 from "node:v8"

const implementations = [
  "effect-interpreted",
  "effect-jit",
  "effect-aot",
  "valibot",
  "zod-jitless",
  "zod-compiled"
] as const
type Implementation = typeof implementations[number]

const cases = [
  "struct-decode",
  "struct-invalid",
  "struct-is",
  "array-decode",
  "union-decode",
  "transform-decode",
  "default-make"
] as const
type CaseName = typeof cases[number]

type BuiltCase = {
  readonly schema: unknown
  input: unknown
  expected: unknown
  readonly invalid?: boolean
  readonly ast?: unknown
}

type Parser = (input: unknown) => unknown

const [command, root, implementationArgument, caseArgument, countArgument, output] = process.argv.slice(2)
const includes = <A extends string>(values: ReadonlyArray<A>, value: string | undefined): value is A =>
  value !== undefined && values.includes(value as A)

if (command !== "measure" && command !== "generate") {
  throw new Error("command must be measure or generate")
}
if (root === undefined) throw new Error("root is required")
if (!includes(implementations, implementationArgument)) {
  throw new Error(`implementation must be one of: ${implementations.join(", ")}`)
}
if (!includes(cases, caseArgument)) {
  throw new Error(`case must be one of: ${cases.join(", ")}`)
}
const implementation: Implementation = implementationArgument
const caseName: CaseName = caseArgument
const count = Number(countArgument)
if (!Number.isSafeInteger(count) || count <= 0) throw new Error("count must be a positive integer")

const forceGc = () => {
  assert.equal(typeof globalThis.gc, "function", "run this probe with --expose-gc")
  for (let i = 0; i < 5; i++) globalThis.gc!()
}

type CpuSample = {
  readonly cpuMicros: number
  readonly systemMicros: number
  readonly userMicros: number
  readonly wallNanos: number
}

const measureCpu = async <A,>(f: () => A | Promise<A>): Promise<readonly [A, CpuSample]> => {
  const cpuStart = process.cpuUsage()
  const wallStart = process.hrtime.bigint()
  const value = await f()
  const wallNanos = Number(process.hrtime.bigint() - wallStart)
  const cpu = process.cpuUsage(cpuStart)
  return [value, {
    cpuMicros: cpu.user + cpu.system,
    systemMicros: cpu.system,
    userMicros: cpu.user,
    wallNanos
  }]
}

type MemorySample = {
  readonly bytecodeBytes: number
  readonly codeBytes: number
  readonly externalSourceBytes: number
  readonly heapBytes: number
  readonly maxRssBytes: number
  readonly rssBytes: number
}

const memory = (): MemorySample => {
  const usage = process.memoryUsage()
  const code = v8.getHeapCodeStatistics()
  return {
    bytecodeBytes: code.bytecode_and_metadata_size,
    codeBytes: code.code_and_metadata_size,
    externalSourceBytes: code.external_script_source_size,
    heapBytes: usage.heapUsed,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
    rssBytes: usage.rss
  }
}

const delta = (after: MemorySample, before: MemorySample) => ({
  bytecodeBytes: after.bytecodeBytes - before.bytecodeBytes,
  codeBytes: after.codeBytes - before.codeBytes,
  externalSourceBytes: after.externalSourceBytes - before.externalSourceBytes,
  heapBytes: after.heapBytes - before.heapBytes,
  maxRssBytes: after.maxRssBytes - before.maxRssBytes,
  rssBytes: after.rssBytes - before.rssBytes
})

const perSchema = (sample: ReturnType<typeof delta>) => ({
  bytecodeBytes: sample.bytecodeBytes / count,
  codeBytes: sample.codeBytes / count,
  externalSourceBytes: sample.externalSourceBytes / count,
  heapBytes: sample.heapBytes / count,
  maxRssBytes: sample.maxRssBytes / count,
  rssBytes: sample.rssBytes / count
})

const loadEffectModule = (path: string) =>
  import(pathToFileURL(join(root, "packages/effect/src", `${path}.ts`)).href)

const loadEffectSchemaModules = async () => ({
  Effect: await loadEffectModule("Effect"),
  Schema: await loadEffectModule("Schema"),
  SchemaAST: await loadEffectModule("SchemaAST")
})

type EffectSchemaModules = Awaited<ReturnType<typeof loadEffectSchemaModules>>

const buildEffectCase = ({ Effect, Schema, SchemaAST }: EffectSchemaModules, index: number): BuiltCase => {
  const suffix = String(index)
  const name = `name${suffix}`
  const age = `age${suffix}`
  const active = `active${suffix}`
  const person = () => Schema.Struct({ [name]: Schema.String, [age]: Schema.Number, [active]: Schema.Boolean })
  const value = { [name]: "Ada", [age]: 37, [active]: true }
  switch (caseName) {
    case "struct-decode": {
      const schema = person()
      return { schema, ast: schema.ast, input: value, expected: value }
    }
    case "struct-invalid": {
      const schema = person()
      return { schema, ast: schema.ast, input: { ...value, [age]: "bad" }, expected: true, invalid: true }
    }
    case "struct-is": {
      const schema = person()
      return { schema, ast: SchemaAST.toType(schema.ast), input: value, expected: true }
    }
    case "array-decode": {
      const schema = Schema.Array(person())
      const input = Array.from({ length: 32 }, () => ({ ...value }))
      return { schema, ast: schema.ast, input, expected: input }
    }
    case "union-decode": {
      const tag = `tag${suffix}`
      const schema = Schema.Union(
        Array.from({ length: 8 }, (_, member) =>
          Schema.Struct({ [tag]: Schema.Literal(member), [`value${suffix}`]: Schema.Number }))
      )
      const input = { [tag]: 7, [`value${suffix}`]: 1 }
      return { schema, ast: schema.ast, input, expected: input }
    }
    case "transform-decode": {
      const schema = Schema.Struct(
        Object.fromEntries(Array.from({ length: 32 }, (_, field) => [`v${suffix}_${field}`, Schema.NumberFromString]))
      )
      const input = Object.fromEntries(Array.from({ length: 32 }, (_, field) => [`v${suffix}_${field}`, String(field)]))
      const expected = Object.fromEntries(Array.from({ length: 32 }, (_, field) => [`v${suffix}_${field}`, field]))
      return { schema, ast: schema.ast, input, expected }
    }
    case "default-make": {
      const schema = Schema.Struct(
        Object.fromEntries(
          Array.from(
            { length: 32 },
            (_, field) => [
              `v${suffix}_${field}`,
              Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(field)))
            ]
          )
        )
      )
      const expected = Object.fromEntries(Array.from({ length: 32 }, (_, field) => [`v${suffix}_${field}`, field]))
      return { schema, ast: SchemaAST.toType(schema.ast), input: {}, expected }
    }
  }
}

const loadEffect = async (jit: boolean) => {
  const modules = await loadEffectSchemaModules()
  const SchemaParser = await loadEffectModule("SchemaParser")
  const enable = jit ? (await loadEffectModule("schema/SchemaJITCompiler")).enable : undefined

  const prepare = (built: ReadonlyArray<BuiltCase>): ReadonlyArray<Parser> => {
    return built.map(({ ast, schema }) => {
      if (enable !== undefined) enable(ast)
      if (caseName === "struct-is") return SchemaParser.is(schema)
      if (caseName === "default-make") return SchemaParser.make(schema)
      return SchemaParser.decodeUnknownSync(schema)
    })
  }

  return { build: (index: number) => buildEffectCase(modules, index), prepare }
}

const loadZod = async (compiled: boolean) => {
  const z = await import("zod/v4")

  const build = (index: number): BuiltCase => {
    const suffix = String(index)
    const name = `name${suffix}`
    const age = `age${suffix}`
    const active = `active${suffix}`
    const person = () => z.object({ [name]: z.string(), [age]: z.number(), [active]: z.boolean() })
    const value = { [name]: "Ada", [age]: 37, [active]: true }
    switch (caseName) {
      case "struct-decode":
        return { schema: person(), input: value, expected: value }
      case "struct-invalid":
        return { schema: person(), input: { ...value, [age]: "bad" }, expected: true, invalid: true }
      case "struct-is":
        return { schema: person(), input: value, expected: true }
      case "array-decode": {
        const input = Array.from({ length: 32 }, () => ({ ...value }))
        return { schema: z.array(person()), input, expected: input }
      }
      case "union-decode": {
        const tag = `tag${suffix}`
        const schema = z.union(
          Array.from({ length: 8 }, (_, member) =>
            z.object({ [tag]: z.literal(member), [`value${suffix}`]: z.number() })) as [
              ReturnType<typeof person>,
              ReturnType<typeof person>,
              ...Array<ReturnType<typeof person>>
            ]
        )
        const input = { [tag]: 7, [`value${suffix}`]: 1 }
        return { schema, input, expected: input }
      }
      case "transform-decode": {
        const schema = z.object(
          Object.fromEntries(
            Array.from({ length: 32 }, (_, field) => [`v${suffix}_${field}`, z.string().transform(Number)])
          )
        )
        const input = Object.fromEntries(Array.from({ length: 32 }, (_, field) => [`v${suffix}_${field}`, String(field)]))
        const expected = Object.fromEntries(Array.from({ length: 32 }, (_, field) => [`v${suffix}_${field}`, field]))
        return { schema, input, expected }
      }
      case "default-make": {
        const schema = z.object(
          Object.fromEntries(
            Array.from({ length: 32 }, (_, field) => [`v${suffix}_${field}`, z.number().default(field)])
          )
        )
        const expected = Object.fromEntries(Array.from({ length: 32 }, (_, field) => [`v${suffix}_${field}`, field]))
        return { schema, input: {}, expected }
      }
    }
  }

  const prepare = (built: ReadonlyArray<BuiltCase>): ReadonlyArray<Parser> => {
    return built.map(({ schema }) => {
      const target = compiled ? z.compile(schema, { strict: true }) : schema
      if (caseName === "struct-is") {
        return compiled
          ? (input: unknown) => z.validate(target, input)
          : (input: unknown) => z.validate(target, input, { jitless: true })
      }
      return compiled
        ? (input: unknown) => target.parse(input)
        : (input: unknown) => target.parse(input, { jitless: true })
    })
  }

  return { build, prepare }
}

const loadValibot = async () => {
  const v = await import("valibot")

  const build = (index: number): BuiltCase => {
    const suffix = String(index)
    const name = `name${suffix}`
    const age = `age${suffix}`
    const active = `active${suffix}`
    const person = () => v.object({ [name]: v.string(), [age]: v.number(), [active]: v.boolean() })
    const value = { [name]: "Ada", [age]: 37, [active]: true }
    switch (caseName) {
      case "struct-decode":
        return { schema: person(), input: value, expected: value }
      case "struct-invalid":
        return { schema: person(), input: { ...value, [age]: "bad" }, expected: true, invalid: true }
      case "struct-is":
        return { schema: person(), input: value, expected: true }
      case "array-decode": {
        const input = Array.from({ length: 32 }, () => ({ ...value }))
        return { schema: v.array(person()), input, expected: input }
      }
      case "union-decode": {
        const tag = `tag${suffix}`
        const schema = v.variant(
          tag,
          Array.from({ length: 8 }, (_, member) =>
            v.object({ [tag]: v.literal(member), [`value${suffix}`]: v.number() }))
        )
        const input = { [tag]: 7, [`value${suffix}`]: 1 }
        return { schema, input, expected: input }
      }
      case "transform-decode": {
        const schema = v.object(
          Object.fromEntries(
            Array.from({ length: 32 }, (_, field) => [
              `v${suffix}_${field}`,
              v.pipe(v.string(), v.transform(Number))
            ])
          )
        )
        const input = Object.fromEntries(Array.from({ length: 32 }, (_, field) => [`v${suffix}_${field}`, String(field)]))
        const expected = Object.fromEntries(Array.from({ length: 32 }, (_, field) => [`v${suffix}_${field}`, field]))
        return { schema, input, expected }
      }
      case "default-make": {
        const schema = v.object(
          Object.fromEntries(
            Array.from({ length: 32 }, (_, field) => [`v${suffix}_${field}`, v.optional(v.number(), field)])
          )
        )
        const expected = Object.fromEntries(Array.from({ length: 32 }, (_, field) => [`v${suffix}_${field}`, field]))
        return { schema, input: {}, expected }
      }
    }
  }

  const prepare = (built: ReadonlyArray<BuiltCase>): ReadonlyArray<Parser> => {
    return built.map(({ schema }) =>
      caseName === "struct-is"
        ? (input: unknown) => v.is(schema, input)
        : (input: unknown) => v.parse(schema, input))
  }

  return { build, prepare }
}

const runParser = (parser: Parser, built: BuiltCase): unknown => {
  if (!built.invalid) return parser(built.input)
  try {
    parser(built.input)
    return false
  } catch {
    return true
  }
}

const validate = (actual: unknown, built: BuiltCase) => assert.deepEqual(actual, built.expected)

if (command === "generate") {
  if (output === undefined) throw new Error("output is required for generate")
  const [modules, moduleCpu] = await measureCpu(async () => {
    return {
      ...await loadEffectSchemaModules(),
      AOT: await loadEffectModule("schema/SchemaAOTCompiler")
    }
  })
  const [built, schemaCpu] = await measureCpu(() =>
    Array.from({ length: count }, (_, index) => buildEffectCase(modules, index).ast)
  )
  const operation = caseName === "struct-is" ? "is" : caseName === "default-make" ? "make" : "decode"
  const [source, generateCpu] = await measureCpu(() =>
    modules.AOT.compile(built.map((ast) => ({ ast, operations: [operation] }))))
  writeFileSync(output, source)
  process.stdout.write(JSON.stringify({
    generateCpu,
    heapBytes: process.memoryUsage().heapUsed,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
    moduleCpu,
    schemaCpu,
    sourceBytes: Buffer.byteLength(source)
  }))
} else {
  forceGc()
  const beforeModule = memory()
  const [library, moduleCpu] = await measureCpu(() => {
    switch (implementation) {
      case "effect-interpreted":
        return loadEffect(false)
      case "effect-jit":
      case "effect-aot":
        return loadEffect(implementation === "effect-jit")
      case "zod-jitless":
      case "zod-compiled":
        return loadZod(implementation === "zod-compiled")
      case "valibot":
        return loadValibot()
    }
  })
  forceGc()
  const afterModule = memory()

  const [built, schemaCpu] = await measureCpu(() => Array.from({ length: count }, (_, index) => library.build(index)))
  forceGc()
  const afterSchemas = memory()

  let aotBuild: unknown
  let aotModuleCpu: CpuSample | undefined
  let directory: string | undefined
  let parsers: ReadonlyArray<Parser>
  let prepareCpu: CpuSample
  try {
    if (implementation === "effect-aot") {
      directory = mkdtempSync(join(root, "packages/effect/.compiler-resources-"))
      const generated = join(directory, "generated.mjs")
      aotBuild = JSON.parse(execFileSync(
        process.execPath,
        ["--expose-gc", fileURLToPath(import.meta.url), "generate", root, implementation, caseName, String(count), generated],
        { encoding: "utf8" }
      ))
      const [installed, measuredModuleCpu] = await measureCpu(async () => {
        const generatedModule = await import(pathToFileURL(generated).href)
        generatedModule.install(built.map((value) => value.ast))
      })
      void installed
      aotModuleCpu = measuredModuleCpu
    }
    const prepared = await measureCpu(() => library.prepare(built))
    parsers = prepared[0]
    prepareCpu = prepared[1]
    forceGc()
    const afterPrepare = memory()

    const [results, firstCallCpu] = await measureCpu(() => parsers.map((parser, index) => runParser(parser, built[index])))
    results.forEach((actual, index) => validate(actual, built[index]))
    results.length = 0
    forceGc()
    const afterFirstCall = memory()

    for (const value of built) {
      value.input = undefined
      value.expected = undefined
    }
    forceGc()
    const afterRelease = memory()

    assert.equal(built.length, count)
    assert.equal(parsers.length, count)
    process.stdout.write(JSON.stringify({
      aotBuild,
      case: caseName,
      count,
      cpu: {
        aotModule: aotModuleCpu,
        firstCall: firstCallCpu,
        module: moduleCpu,
        prepare: prepareCpu,
        schema: schemaCpu
      },
      implementation,
      memory: {
        compilerPerSchema: perSchema(delta(afterFirstCall, afterSchemas)),
        firstCallPerSchema: perSchema(delta(afterFirstCall, afterPrepare)),
        module: delta(afterModule, beforeModule),
        preparePerSchema: perSchema(delta(afterPrepare, afterSchemas)),
        retainedLibraryPerSchema: perSchema(delta(afterRelease, afterModule)),
        schemaPerSchema: perSchema(delta(afterSchemas, afterModule)),
        totalWithFixturePerSchema: perSchema(delta(afterFirstCall, afterModule))
      }
    }))
  } finally {
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true })
    }
  }
}
