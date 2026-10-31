import { NodeFileSystem } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Context, Effect, Fiber, FileSystem, Iterable, Schema } from "effect"
import * as Arr from "effect/Array"
import { Reactivity } from "effect/reactivity"
import { SqlClient, SqlError, SqlResolver } from "effect/sql"

const makeClient = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  return yield* SqliteClient.make({
    filename: dir + "/test.db"
  })
}).pipe(Effect.provide([NodeFileSystem.layer, Reactivity.layer]))

const seededClient = Effect.gen(function*() {
  const sql = yield* makeClient
  yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`
  const rows = Array.from(Iterable.range(1, 100), (id) => ({ id, name: `name${id}` }))
  assert(Arr.isArrayNonEmpty(rows))
  yield* sql`INSERT INTO test ${sql.insert(rows)}`
  return sql
})

describe("Resolver", () => {
  describe("ordered", () => {
    it.effect("insert", () =>
      Effect.gen(function*() {
        const batches: Array<Array<string>> = []
        const sql = yield* seededClient
        const Insert = SqlResolver.ordered({
          Request: Schema.String,
          Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
          execute: (names) => {
            batches.push(names)
            return sql`INSERT INTO test ${sql.insert(Arr.map(names, (name) => ({ name })))} RETURNING *`
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
        ], { concurrency: "unbounded" })
          .pipe(Effect.flip)
        assert(error instanceof SqlError.ResultLengthMismatch)
        assert.strictEqual(error.actual, 3)
        assert.strictEqual(error.expected, 4)
        assert.deepStrictEqual(batches, [[1, 2, 3, 101]])
      }))
  })

  describe("grouped", () => {
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

  describe("findById", () => {
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

  describe("void", () => {
    it.effect("keeps requests outside a transaction out of its batch", () =>
      Effect.gen(function*() {
        const batches: Array<Array<number>> = []
        const sql = yield* makeClient
        const other = yield* makeClient
        yield* sql`CREATE TABLE writes (id INTEGER PRIMARY KEY)`
        const insert = SqlResolver.request(SqlResolver.void({
          Request: Schema.Number,
          execute: (ids) => {
            batches.push(ids)
            return sql`INSERT INTO writes ${sql.insert(Arr.map(ids, (id) => ({ id })))}`
          }
        }))
        yield* Effect.all([
          Effect.exit(sql.withTransaction(
            Effect.andThen(
              Effect.all([insert(1), insert(3)], { concurrency: "unbounded" }),
              Effect.fail("rollback")
            )
          )),
          insert(2)
        ], { concurrency: "unbounded" }).pipe(Effect.provideService(SqlClient.SqlClient, other))
        assert.deepStrictEqual(batches, [[1, 3], [2]])
        assert.deepStrictEqual(yield* sql`SELECT * FROM writes`, [{ id: 2 }])
      }))

    it.effect("keeps requests in another client's transaction out of its batch", () =>
      Effect.gen(function*() {
        const batches: Array<Array<number>> = []
        const sql = yield* makeClient
        const other = yield* makeClient
        yield* sql`CREATE TABLE writes (id INTEGER PRIMARY KEY)`
        const insert = SqlResolver.request(SqlResolver.void({
          Request: Schema.Number,
          execute: (ids) => {
            batches.push(ids)
            return sql`INSERT INTO writes ${sql.insert(Arr.map(ids, (id) => ({ id })))}`
          }
        }))
        yield* other.withTransaction(Effect.all([
          Effect.exit(sql.withTransaction(Effect.andThen(insert(1), Effect.fail("rollback")))).pipe(
            Effect.provideService(SqlClient.SqlClient, other)
          ),
          insert(2)
        ], { concurrency: "unbounded" }))
        assert.deepStrictEqual(batches, [[1], [2]])
        assert.deepStrictEqual(yield* sql`SELECT * FROM writes`, [{ id: 2 }])
      }))

    it.effect("keeps requests without the transaction service out of its batch", () =>
      Effect.gen(function*() {
        const batches: Array<Array<number>> = []
        const sql = yield* makeClient
        yield* sql`CREATE TABLE writes (id INTEGER PRIMARY KEY)`
        const insert = SqlResolver.request(SqlResolver.void({
          Request: Schema.Number,
          execute: (ids) => {
            batches.push(ids)
            return sql`INSERT INTO writes ${sql.insert(Arr.map(ids, (id) => ({ id })))}`
          }
        }))
        let outside: Fiber.Fiber<void, unknown> | undefined
        yield* Effect.exit(sql.withTransaction(Effect.gen(function*() {
          outside = yield* Effect.forkChild(
            insert(2).pipe(
              Effect.updateContext((context: Context.Context<never>) => Context.omit(sql.transactionService)(context))
            )
          )
          yield* insert(1)
          return yield* Effect.fail("rollback")
        })))
        yield* Fiber.join(outside!)
        assert.deepStrictEqual(batches, [[1], [2]])
        assert.deepStrictEqual(yield* sql`SELECT * FROM writes`, [{ id: 2 }])
      }))
  })
})
