import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Schema, SchemaGetter, SchemaParser } from "effect"
import { SchemaCompiler, SchemaJITCompiler } from "effect/schema"

describe("compiled homogeneous Array traversal", () => {
  it.effect("keeps detailed errors and sparse input behavior", () =>
    Effect.gen(function*() {
      const schema = Schema.Array(Schema.NumberFromString)
      const inputs = [["1", "2"], ["bad", "2"], ["1", "bad", "bad"], new Array(2)]
      const snapshot = Effect.fnUntraced(function*() {
        const parse = SchemaParser.decodeUnknownEffect(schema)
        const results = []
        for (const errors of ["first", "all"] as const) {
          for (const input of inputs) {
            results.push(yield* Effect.result(parse(input, { errors })))
          }
        }
        return results
      })
      const interpreted = yield* snapshot()
      SchemaJITCompiler.enable(schema.ast)
      assert.deepStrictEqual(yield* snapshot(), interpreted)
    }))

  it.effect("resumes without replaying the pending element or rereading its accessor", () =>
    Effect.gen(function*() {
      const events: Array<string> = []
      const element = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformEffect((value) =>
          Effect.gen(function*() {
            events.push(value)
            yield* Effect.yieldNow
            return value.toUpperCase()
          })
        ),
        encode: SchemaGetter.passthrough()
      }))
      const schema = Schema.Array(element)
      let reads = 0
      const input = ["a", "b"]
      Object.defineProperty(input, "0", {
        get() {
          reads++
          return "a"
        }
      })
      SchemaJITCompiler.enable(schema.ast)
      assert.deepStrictEqual(yield* SchemaParser.decodeUnknownEffect(schema)(input), ["A", "B"])
      assert.deepStrictEqual(events, ["a", "b"])
      assert.strictEqual(reads, 1)
    }))

  it("passes missing constructor results to the shared element step", () => {
    for (const optional of [false, true]) {
      const required = Schema.String.annotate({ title: "Array constructor element" })
      const element = optional ? Schema.optionalKey(required) : required
      SchemaCompiler.set(element.ast, {
        decodeEffect: Effect.succeed,
        makeEffect: () => Effect.succeed(SchemaCompiler.missing)
      })
      const schema = Schema.Array(element)
      SchemaJITCompiler.enable(schema.ast)
      const make = SchemaParser.make(schema)
      if (optional) {
        const output = make(["a"])
        assert.strictEqual(output.length, 1)
        assert.strictEqual(0 in output, false)
      } else {
        assert.throws(() => make(["a"]), /Schema validation failed/)
      }
    }
  })

  it.effect("keeps bounded concurrency on the interpreter's concurrent traversal", () =>
    Effect.gen(function*() {
      const started = yield* Effect.forEach([0, 1, 2], () => Deferred.make<void>())
      const releases = yield* Effect.forEach([0, 1, 2], () => Deferred.make<void>())
      const calls = [0, 0, 0]
      const element = Schema.Number.pipe(Schema.decode({
        decode: SchemaGetter.transformEffect((index) =>
          Effect.gen(function*() {
            calls[index]++
            yield* Deferred.succeed(started[index], undefined)
            yield* Deferred.await(releases[index])
            return index
          })
        ),
        encode: SchemaGetter.passthrough()
      }))
      const schema = Schema.Array(element)
      SchemaJITCompiler.enable(schema.ast)
      const fiber = yield* SchemaParser.decodeUnknownEffect(schema)([0, 1, 2], { concurrency: 2 }).pipe(
        Effect.forkChild
      )
      yield* Deferred.await(started[0])
      yield* Deferred.await(started[1])
      assert.strictEqual(yield* Deferred.isDone(started[2]), false)
      yield* Deferred.succeed(releases[0], undefined)
      yield* Deferred.await(started[2])
      yield* Deferred.succeed(releases[1], undefined)
      yield* Deferred.succeed(releases[2], undefined)
      assert.deepStrictEqual(yield* Fiber.join(fiber), [0, 1, 2])
      assert.deepStrictEqual(calls, [1, 1, 1])
    }))
})
