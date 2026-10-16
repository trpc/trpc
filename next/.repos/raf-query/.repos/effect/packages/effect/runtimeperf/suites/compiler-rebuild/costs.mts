import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const [command, root, mode, operation, shape = "struct", countString = "500"] = process.argv.slice(2)
const count = Number(countString)
const includes = (values: ReadonlyArray<string>, value: string | undefined) =>
  value !== undefined && values.includes(value)
if (command !== "heap" && command !== "cold" && command !== "generate") {
  throw new Error("command must be heap, cold or generate")
}
if (root === undefined) throw new Error("root is required")
if (!includes(["interpreted", "jit", "aot"], mode)) {
  throw new Error("mode must be interpreted, jit or aot")
}
if (!includes(["decode", "invalid", "is", "make"], operation)) {
  throw new Error("operation must be decode, invalid, is or make")
}
if (!includes(["struct", "array", "transform", "default"], shape)) {
  throw new Error("shape must be struct, array, transform or default")
}
if (!Number.isSafeInteger(count) || count <= 0) throw new Error("count must be a positive integer")
const load = (path: string) => import(pathToFileURL(join(root, "packages/effect/src", path + ".ts")).href)
const Schema = await load("Schema")
const Parser = await load("SchemaParser")
const AST = await load("SchemaAST")
const Effect = await load("Effect")
const create = () => {
  const struct = Schema.Struct({ name: Schema.String, age: Schema.Number, active: Schema.Boolean })
  return shape === "array" ? Schema.Array(struct)
    : shape === "transform" ? Schema.Struct({ value: Schema.NumberFromString })
    : shape === "default" ? Schema.Struct({ value: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(1))) })
    : struct
}
const valid = shape === "array" ? Array.from({ length: 32 }, () => ({ name: "Ada", age: 37, active: true }))
  : shape === "transform" ? { value: "1" }
  : shape === "default" ? { value: 1 }
  : { name: "Ada", age: 37, active: true }
const typeValid = shape === "transform" ? { value: 1 } : valid
const input = operation === "invalid" ? { name: "Ada", age: "bad", active: true }
  : operation === "make" && shape === "default" ? {}
  : operation === "make" || operation === "is" ? typeValid
  : valid
const expected = shape === "transform" || shape === "default" ? { value: 1 } : valid

if (command === "generate") {
  const AOT = await load("schema/SchemaAOTCompiler")
  const schema = create()
  const targetOperation = operation === "make" ? "make" : operation === "is" ? "is" : "decode"
  const ast = targetOperation === "decode" ? schema.ast : AST.toType(schema.ast)
  writeFileSync(process.argv[8], AOT.compile([{ ast, operations: [targetOperation] }]))
} else {
  for (let i = 0; i < 5; i++) globalThis.gc?.()
  const beforeImport = process.memoryUsage().heapUsed
  let enable: ((ast: unknown) => void) | undefined
  let install: ((asts: Array<unknown>) => void) | undefined
  let directory: string | undefined
  if (mode === "jit") {
    enable = (await load("schema/SchemaJITCompiler")).enable
  } else if (mode === "aot") {
    directory = mkdtempSync(join(root, "packages/effect/.compiler-memory-"))
    const generated = join(directory, "generated.mjs")
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), "generate", root, mode, operation, shape, countString, generated])
    install = (await import(pathToFileURL(generated).href)).install
  }
  for (let i = 0; i < 5; i++) globalThis.gc?.()
  const moduleBytes = process.memoryUsage().heapUsed - beforeImport
  const prepare = (schema: any) => {
    const ast = operation === "make" || operation === "is" ? AST.toType(schema.ast) : schema.ast
    if (enable) enable(ast)
    if (install) install([ast])
    return operation === "make" ? Parser.make(schema)
      : operation === "is" ? Parser.is(schema)
      : Parser.decodeUnknownSync(schema)
  }
  const run = (parse: (input: unknown) => unknown) => {
    try {
      return parse(input)
    } catch (error) {
      if (operation !== "invalid") throw error
      return error
    }
  }
  const validate = (value: unknown) => {
    if (operation === "invalid") {
      assert.ok(value instanceof Error)
      assert.equal(value.message, "Schema validation failed")
      assert.equal("cause" in value, true)
    }
    else if (operation === "is") assert.equal(value, true)
    else assert.deepEqual(value, expected)
  }
  try {
    for (let i = 0; i < 20; i++) validate(run(prepare(create())))
    if (command === "heap") {
      assert.equal(typeof globalThis.gc, "function")
      const schemas = Array.from({ length: count }, create)
      for (let i = 0; i < 5; i++) globalThis.gc!()
      const before = process.memoryUsage().heapUsed
      const parsers = schemas.map((schema) => {
        const parse = prepare(schema)
        validate(run(parse))
        return parse
      })
      for (let i = 0; i < 5; i++) globalThis.gc!()
      const after = process.memoryUsage().heapUsed
      // Keep schemas and adapters alive across the measurement.
      assert.equal(parsers.length, count)
      assert.equal(schemas.length, count)
      process.stdout.write(JSON.stringify({ mode, operation, shape, count, moduleBytes, bytesPerSchema: (after - before) / count }))
    } else if (command === "cold") {
      const samples = []
      for (let round = 0; round < 7; round++) {
        let value: unknown
        const start = process.hrtime.bigint()
        for (let i = 0; i < count; i++) value = run(prepare(create()))
        samples.push(Number(process.hrtime.bigint() - start) / count)
        validate(value)
      }
      process.stdout.write(JSON.stringify({ mode, operation, shape, count, nsPerSchema: samples }))
    }
  } finally {
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
}
