import { LibsqlClient } from "@effect/sql-libsql"
import { assert, describe, layer } from "@effect/vitest"
import { Cause, Effect } from "effect"
import * as Schema from "effect/Schema"
import { SqlError, SqlResolver } from "effect/sql"
import { LibsqlContainer } from "./util.ts"

const seededClient = Effect.gen(function*() {
  const sql = yield* LibsqlClient.LibsqlClient
  yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`
  yield* sql`INSERT INTO test ${
    sql.insert([
      { id: 1, name: "name1" },
      { id: 2, name: "name2" },
      { id: 3, name: "name3" },
      { id: 100, name: "name100" }
    ])
  }`
  yield* Effect.addFinalizer(() => sql`DROP TABLE test;`.pipe(Effect.orDie))
  return sql
})

layer(LibsqlContainer.layerClient, { timeout: "30 seconds" })("Resolver", (it) => {
  describe("ordered", { concurrent: false }, () => {
    it.effect("insert", () =>
      Effect.gen(function*() {
        const batches: Array<Array<string>> = []
        const sql = yield* seededClient
        const Insert = SqlResolver.ordered({
          Request: Schema.String,
          Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
          execute: (names) => {
            batches.push(names)
            return sql`INSERT INTO test ${sql.insert(names.map((name) => ({ name })))} RETURNING *`
          }
        })
        const execute = SqlResolver.request(Insert)
        assert.deepStrictEqual(
          yield* Effect.all({
            one: execute("one"),
            two: execute("two")
          }, { concurrency: "unbounded" }),
          {
            one: { id: 101, name: "one" },
            two: { id: 102, name: "two" }
          }
        )
        assert.deepStrictEqual(batches, [["one", "two"]])
      }))

    it.effect("result length mismatch", () =>
      Effect.gen(function*() {
        const batches: Array<Array<number>> = []
        const sql = yield* seededClient
        const Select = SqlResolver.ordered({
          Request: Schema.Number,
          Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
          execute: (ids) => {
            batches.push(ids)
            return sql`SELECT * FROM test WHERE id IN ${sql.in(ids)}`
          }
        })
        const execute = SqlResolver.request(Select)
        const error = yield* Effect.all([
          execute(1),
          execute(2),
          execute(3),
          execute(101)
        ], { concurrency: "unbounded" }).pipe(
          Effect.flip
        )
        assert(error instanceof SqlError.ResultLengthMismatch)
        assert.strictEqual(error.actual, 3)
        assert.strictEqual(error.expected, 4)
        assert.deepStrictEqual(batches, [[1, 2, 3, 101]])
      }))
  })

  describe("grouped", { concurrent: false }, () => {
    it.effect("find by name", () =>
      Effect.gen(function*() {
        const sql = yield* seededClient
        const FindByName = SqlResolver.grouped({
          Request: Schema.String,
          RequestGroupKey: (name) => name,
          Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
          ResultGroupKey: (result) => result.name,
          execute: (names) => sql`SELECT * FROM test WHERE name IN ${sql.in(names)}`
        })
        yield* sql`INSERT INTO test ${sql.insert({ name: "name1" })}`
        const execute = SqlResolver.request(FindByName)
        assert.deepStrictEqual(
          yield* Effect.all({
            one: execute("name1"),
            two: execute("name2"),
            three: Effect.flip(execute("name0"))
          }, { concurrency: "unbounded" }),
          {
            one: [{ id: 1, name: "name1" }, { id: 101, name: "name1" }],
            two: [{ id: 2, name: "name2" }],
            three: new Cause.NoSuchElementError()
          }
        )
      }))

    it.effect("using raw rows", () =>
      Effect.gen(function*() {
        const sql = yield* seededClient
        const FindByName = SqlResolver.grouped({
          Request: Schema.String,
          RequestGroupKey: (name) => name,
          Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
          ResultGroupKey: (_, result: any) => result.name,
          execute: (names) => sql`SELECT * FROM test WHERE name IN ${sql.in(names)}`
        })
        yield* sql`INSERT INTO test ${sql.insert({ name: "name1" })}`
        const execute = SqlResolver.request(FindByName)
        assert.deepStrictEqual(
          yield* Effect.all({
            one: execute("name1"),
            two: execute("name2"),
            three: Effect.flip(execute("name0"))
          }, { concurrency: "unbounded" }),
          {
            one: [{ id: 1, name: "name1" }, { id: 101, name: "name1" }],
            two: [{ id: 2, name: "name2" }],
            three: new Cause.NoSuchElementError()
          }
        )
      }))
  })

  describe("findById", { concurrent: false }, () => {
    it.effect("find by id", () =>
      Effect.gen(function*() {
        const sql = yield* seededClient
        const FindById = SqlResolver.findById({
          Id: Schema.Number,
          Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
          ResultId: (result) => result.id,
          execute: (ids) => sql`SELECT * FROM test WHERE id IN ${sql.in(ids)}`
        })
        const execute = SqlResolver.request(FindById)
        assert.deepStrictEqual(
          yield* Effect.all({
            one: execute(1),
            two: execute(2),
            three: Effect.flip(execute(101))
          }, { concurrency: "unbounded" }),
          {
            one: { id: 1, name: "name1" },
            two: { id: 2, name: "name2" },
            three: new Cause.NoSuchElementError()
          }
        )
      }))

    it.effect("using raw rows", () =>
      Effect.gen(function*() {
        const sql = yield* seededClient
        const FindById = SqlResolver.findById({
          Id: Schema.Number,
          Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
          ResultId: (_, result: any) => result.id,
          execute: (ids) => sql`SELECT * FROM test WHERE id IN ${sql.in(ids)}`
        })
        const execute = SqlResolver.request(FindById)
        assert.deepStrictEqual(
          yield* Effect.all({
            one: execute(1),
            two: execute(2),
            three: Effect.flip(execute(101))
          }, { concurrency: "unbounded" }),
          {
            one: { id: 1, name: "name1" },
            two: { id: 2, name: "name2" },
            three: new Cause.NoSuchElementError()
          }
        )
      }))
  })
})
