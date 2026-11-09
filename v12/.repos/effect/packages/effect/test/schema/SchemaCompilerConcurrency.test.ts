import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Schema, SchemaParser } from "effect"
import { SchemaJITCompiler } from "effect/schema"

describe("compiled construction concurrency", () => {
  it.effect("isolates concurrent executions without replaying the eager prefix", () =>
    Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      let prefixReads = 0
      let ids = 0
      let tails = 0
      const schema = Schema.Struct({
        prefix: Schema.String,
        id: Schema.Number.pipe(Schema.withConstructorDefault(Effect.gen(function*() {
          const id = ++ids
          if (id === 2) yield* Deferred.succeed(started, undefined)
          yield* Deferred.await(started)
          return id
        }))),
        tail: Schema.String.pipe(Schema.withConstructorDefault(Effect.sync(() => {
          tails++
          return "tail"
        })))
      })
      SchemaJITCompiler.enable(schema.ast)
      const program = SchemaParser.makeEffect(schema)({
        get prefix() {
          prefixReads++
          return "prefix"
        }
      })
      assert.strictEqual(prefixReads, 1)
      const results = yield* Effect.all([program, program], { concurrency: "unbounded" })
      assert.deepStrictEqual(results, [
        { prefix: "prefix", id: 1, tail: "tail" },
        { prefix: "prefix", id: 2, tail: "tail" }
      ])
      assert.notStrictEqual(results[0], results[1])
      assert.strictEqual(prefixReads, 1)
      assert.strictEqual(ids, 2)
      assert.strictEqual(tails, 2)
    }))

  for (const product of ["Struct", "Tuple"] as const) {
    it.effect(`${product} preserves bounded concurrency and runs defaults once`, () =>
      Effect.gen(function*() {
        const started = yield* Effect.forEach([0, 1, 2], () => Deferred.make<void>())
        const releases = yield* Effect.forEach([0, 1, 2], () => Deferred.make<void>())
        const calls = [0, 0, 0]
        const fields = [0, 1, 2].map((index) =>
          Schema.Number.pipe(Schema.withConstructorDefault(Effect.gen(function*() {
            calls[index]++
            yield* Deferred.succeed(started[index], undefined)
            yield* Deferred.await(releases[index])
            return index
          })))
        )
        const schema: Schema.Codec<unknown> = product === "Struct"
          ? Schema.Struct({ a: fields[0], b: fields[1], c: fields[2] })
          : Schema.Tuple(fields)
        SchemaJITCompiler.enable(schema.ast)
        const fiber = yield* SchemaParser.makeEffect(schema)(product === "Struct" ? {} : [], {
          parseOptions: { concurrency: 2 }
        }).pipe(Effect.forkChild)
        yield* Deferred.await(started[0])
        yield* Deferred.await(started[1])
        assert.strictEqual(yield* Deferred.isDone(started[2]), false)
        yield* Deferred.succeed(releases[0], undefined)
        yield* Deferred.await(started[2])
        yield* Deferred.succeed(releases[1], undefined)
        yield* Deferred.succeed(releases[2], undefined)
        assert.deepStrictEqual(yield* Fiber.join(fiber), product === "Struct" ? { a: 0, b: 1, c: 2 } : [0, 1, 2])
        assert.deepStrictEqual(calls, [1, 1, 1])
      }))
  }
})
