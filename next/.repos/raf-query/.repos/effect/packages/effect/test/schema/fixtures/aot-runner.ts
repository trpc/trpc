import { Effect, Result, type SchemaAST, SchemaParser } from "effect"
import type * as CompilerRegistryModule from "effect/internal/schema/compilerRegistry"
import assert from "node:assert/strict"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { asyncFixture, events, lazy, proof, roots, schemas, suspendEvaluations, synchronous } from "./aot.ts"
import {
  Constructed,
  constructionCases,
  constructionEvents,
  constructionOptions,
  constructionSchemas
} from "./construction.ts"

const CompilerRegistry: typeof CompilerRegistryModule = await import(
  new URL("../../../src/internal/schema/compilerRegistry.ts", import.meta.url).href
)

const options: ReadonlyArray<SchemaAST.ParseOptions | undefined> = [
  undefined,
  { errors: "all", reportInput: true },
  { onExcessProperty: "error" },
  { disableChecks: true }
]

const snapshot = () =>
  Object.fromEntries(
    Object.entries(synchronous).map(([name, { inputs, schema }]) => {
      const is = SchemaParser.is(schema)
      const results = options.map((option) => {
        const decode = SchemaParser.decodeUnknownResult(schema, option)
        return inputs.map((input) => {
          events.length = 0
          const result = decode(input)
          const calls = [...events]
          return {
            // Template diagnostics construct internal ASTs with fresh functions.
            result: name === "templateLiteral" || name === "templateLiteralParser"
              ? Result.mapError(result, (issue) => JSON.stringify(issue))
              : result,
            calls,
            is: is(input)
          }
        })
      })
      return [name, results]
    })
  )

const snapshotAsync = async () => {
  const results = []
  const decode = SchemaParser.decodeUnknownEffect(asyncFixture.schema)
  for (const input of asyncFixture.inputs) {
    events.length = 0
    const result = await Effect.runPromise(Effect.result(decode(input)))
    results.push({ result, calls: [...events] })
  }
  return results
}

assert.throws(() => new Function("return true"), EvalError)
const interpreted = snapshot()
const interpretedAsync = await snapshotAsync()
const snapshotConstruction = async () => {
  const out = []
  for (const fixture of Object.values(constructionCases)) {
    const make = SchemaParser.makeEffect(fixture.schema)
    for (const parseOptions of constructionOptions) {
      for (const input of fixture.inputs) {
        constructionEvents.length = 0
        const result = await Effect.runPromise(Effect.result(make(input as never, { parseOptions })))
        out.push({ result, events: [...constructionEvents] })
      }
    }
  }
  return out
}
const interpretedConstruction = await snapshotConstruction()
assert.equal(suspendEvaluations, 0)

const before = CompilerRegistry.resolve(schemas.struct.ast)
const empty = await import(pathToFileURL(join(process.argv[2], "empty.mjs")).href)
assert.equal(empty.install([]), undefined)
assert.equal(CompilerRegistry.resolve(schemas.struct.ast), before)

if (process.argv[3] === "multiple") {
  const generated = await import(pathToFileURL(join(process.argv[2], "all.mjs")).href)
  assert.equal(CompilerRegistry.resolve(schemas.struct.ast), before)
  assert.equal(generated.install(roots), undefined)
} else {
  for (const [name, schema] of Object.entries(schemas)) {
    const before = name === "struct" ? CompilerRegistry.resolve(schema.ast) : undefined
    const generated = await import(pathToFileURL(join(process.argv[2], `${name}.mjs`)).href)
    if (before !== undefined) assert.equal(CompilerRegistry.resolve(schema.ast), before)
    assert.equal(generated.install([schema.ast]), undefined)
  }
}
assert.equal(suspendEvaluations, 0)

for (
  const name of [
    "struct",
    "array",
    "tuple",
    "tagged",
    "sentinel",
    "sentinelLookup",
    "record",
    "transformed",
    "transformedStruct",
    "pureTransformedStruct",
    "checkedTransformedStruct",
    "encodingCheckedTransformedStruct",
    "asynchronous",
    "middleware"
  ]
) {
  assert.equal(typeof CompilerRegistry.resolve(schemas[name].ast).compiled, "function", name)
}

assert.deepEqual(snapshot(), interpreted)
assert.deepEqual(await snapshotAsync(), interpretedAsync)
for (const [name, schema] of Object.entries(constructionSchemas)) {
  if (name === "construct-declaration") continue
  assert.equal(typeof CompilerRegistry.resolve(schema.ast).compiled, "function", name)
}
assert.deepEqual(await snapshotConstruction(), interpretedConstruction)
const instance = Constructed.make({})
constructionEvents.length = 0
assert.equal(Constructed.make(instance), instance)
assert.equal(await Effect.runPromise(Constructed.makeEffect(instance)), instance)
assert.deepEqual(constructionEvents, [])

const transform = SchemaParser.decodeUnknownResult(schemas.transformed)
events.length = 0
assert.deepEqual(transform("2"), Result.succeed(2))
assert.deepEqual(events, ["transform"])
events.length = 0
assert.ok(Result.isFailure(transform("-1")))
assert.deepEqual(events, ["transform"])

events.length = 0
assert.deepEqual(SchemaParser.decodeUnknownResult(schemas.middleware)("-1"), Result.succeed(1))
assert.deepEqual(events, ["transform", "middleware", "recover"])

assert.deepEqual(SchemaParser.decodeUnknownSync(proof)({ value: "a", extra: true }), { value: "a" })
assert.deepEqual(SchemaParser.make(proof)({ value: "constructed" }), { value: "constructed" })
assert.ok(Result.isFailure(SchemaParser.decodeUnknownResult(proof)({ value: 1 })))
assert.equal(SchemaParser.is(proof)({ value: "a" }), true)
assert.equal(SchemaParser.is(proof)({ value: 1 }), false)
assert.deepEqual(SchemaParser.decodeUnknownSync(schemas.proofArray)([{ value: "a", extra: true }]), [{ value: "a" }])
assert.ok(Result.isFailure(SchemaParser.decodeUnknownResult(schemas.proofArray)([{ value: 1 }])))
let invalidReads = 0
assert.ok(Result.isFailure(
  SchemaParser.decodeUnknownResult(schemas.proofArray)([{
    get value() {
      invalidReads++
      return 1
    }
  }])
))
assert.equal(invalidReads, 2)

assert.deepEqual(SchemaParser.decodeUnknownSync(lazy)({ value: "lazy" }), { value: "lazy" })
assert.equal(suspendEvaluations, 1)
process.stdout.write("AOT integration passed\n")
