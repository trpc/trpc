import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Schema, SchemaParser } from "effect"
import { SchemaJITCompiler } from "effect/schema"

describe("compiled construction concurrency", () => {
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
