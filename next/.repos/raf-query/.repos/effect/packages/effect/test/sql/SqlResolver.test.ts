import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import * as Schema from "effect/Schema"
import { SqlResolver } from "effect/sql"

describe("SqlResolver", () => {
  describe("grouped", () => {
    it.effect("does not execute a batch when every request fails encoding", () =>
      Effect.gen(function*() {
        let executions = 0
        const resolver = SqlResolver.grouped({
          Request: Schema.Number.check(Schema.isGreaterThan(0)),
          RequestGroupKey: (request) => request,
          Result: Schema.Number,
          ResultGroupKey: (result) => result,
          execute: (inputs) => {
            executions++
            return Effect.succeed(inputs)
          }
        })

        const error = yield* Effect.flip(SqlResolver.request(-1, resolver))

        assert.strictEqual(error._tag, "SchemaError")
        assert.strictEqual(executions, 0)
      }))
  })

  describe("findById", () => {
    it.effect("does not execute a batch when every request fails encoding", () =>
      Effect.gen(function*() {
        let executions = 0
        const resolver = SqlResolver.findById({
          Id: Schema.Number.check(Schema.isGreaterThan(0)),
          Result: Schema.Struct({ id: Schema.Number }),
          ResultId: (result) => result.id,
          execute: (inputs) => {
            executions++
            return Effect.succeed(inputs.map((id) => ({ id })))
          }
        })

        const error = yield* Effect.flip(SqlResolver.request(-1, resolver))

        assert.strictEqual(error._tag, "SchemaError")
        assert.strictEqual(executions, 0)
      }))

    it.effect("completes duplicate requests when id encoding fails", () =>
      Effect.gen(function*() {
        const resolver = SqlResolver.findById({
          Id: Schema.Number.check(Schema.isGreaterThan(0)),
          Result: Schema.Struct({ id: Schema.Number }),
          ResultId: (result) => result.id,
          execute: (inputs) => Effect.succeed(inputs.map((id) => ({ id })))
        })
        const execute = SqlResolver.request(resolver)

        const errors = yield* Effect.all([
          Effect.flip(execute(-1)),
          Effect.flip(execute(-1))
        ], { concurrency: "unbounded" })

        assert.deepStrictEqual(errors.map((error) => error._tag), ["SchemaError", "SchemaError"])
      }))

    it.effect("deduplicates requests by id", () =>
      Effect.gen(function*() {
        const batches: Array<Array<number>> = []
        const FindById = SqlResolver.findById({
          Id: Schema.Number,
          Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
          ResultId: (result) => result.id,
          execute: (ids) => {
            batches.push([...ids])
            return Effect.succeed(ids.map((id) => ({ id, name: `name${id}` })))
          }
        })
        const execute = SqlResolver.request(FindById)

        assert.deepStrictEqual(
          yield* Effect.all({
            one: execute(1),
            oneAgain: execute(1),
            two: execute(2)
          }, { concurrency: "unbounded" }),
          {
            one: { id: 1, name: "name1" },
            oneAgain: { id: 1, name: "name1" },
            two: { id: 2, name: "name2" }
          }
        )
        assert.deepStrictEqual(batches, [[1, 2]])
      }))
  })

  describe("ordered", () => {
    it.effect("does not execute a batch when every request fails encoding", () =>
      Effect.gen(function*() {
        let executions = 0
        const resolver = SqlResolver.ordered({
          Request: Schema.Number.check(Schema.isGreaterThan(0)),
          Result: Schema.String,
          execute: (inputs) => {
            executions++
            return Effect.succeed(inputs.map(String))
          }
        })

        const error = yield* Effect.flip(SqlResolver.request(-1, resolver))

        assert.strictEqual(error._tag, "SchemaError")
        assert.strictEqual(executions, 0)
      }))

    it.effect("keeps valid results aligned when another request fails encoding", () =>
      Effect.gen(function*() {
        const resolver = SqlResolver.ordered({
          Request: Schema.Number.check(Schema.isGreaterThan(0)),
          Result: Schema.String,
          execute: (inputs) => Effect.succeed(inputs.map((input) => `value-${input}`))
        })
        const execute = SqlResolver.request(resolver)
        const [invalid, valid] = yield* Effect.all([
          Effect.exit(execute(-1)),
          Effect.exit(execute(2))
        ], { concurrency: "unbounded" })

        assert(Exit.isFailure(invalid))
        assert(Exit.isSuccess(valid))
        assert.strictEqual(valid.value, "value-2")
      }))
  })

  describe("void", () => {
    it.effect("does not execute a batch when every request fails encoding", () =>
      Effect.gen(function*() {
        let executions = 0
        const resolver = SqlResolver.void({
          Request: Schema.Number.check(Schema.isGreaterThan(0)),
          execute: (inputs) => {
            executions++
            return Effect.succeed(inputs)
          }
        })

        const error = yield* Effect.flip(SqlResolver.request(-1, resolver))

        assert.strictEqual(error._tag, "SchemaError")
        assert.strictEqual(executions, 0)
      }))
  })
})
