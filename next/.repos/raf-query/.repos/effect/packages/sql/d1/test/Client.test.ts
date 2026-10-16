import type { D1Result } from "@cloudflare/workers-types"
import { D1Client } from "@effect/sql-d1"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import { Statement } from "effect/sql"
import { D1Miniflare } from "./utils.ts"

describe("Client", () => {
  it.effect("raw preserves the native result envelope", () =>
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      yield* sql`CREATE TABLE raw_test (id INTEGER PRIMARY KEY, name TEXT)`
      const raw = (yield* sql`INSERT INTO raw_test (name) VALUES (${"effect"})`.raw) as D1Result
      assert.strictEqual(raw.success, true)
      assert.deepStrictEqual(raw.results, [])
      assert.strictEqual(raw.meta.changes, 1)
      assert.strictEqual(raw.meta.last_row_id, 1)
    }).pipe(Effect.provide(D1Miniflare.layerClient)))

  it.effect("classifies native errors without stable sqlite codes as UnknownError", () =>
    Effect.gen(function*() {
      const failingDb = {
        prepare: () => ({
          bind: () => ({
            all: async () => {
              throw new Error("boom")
            }
          })
        })
      } as any

      const client = yield* D1Client.make({ db: failingDb })
      const error = yield* Effect.flip(client`SELECT 1`)
      assert.strictEqual(error.reason._tag, "UnknownError")
    }).pipe(
      Effect.scoped,
      Effect.provide(Reactivity.layer)
    ))

  it.effect("should handle queries without transactions", () =>
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`
      yield* sql`INSERT INTO test (name) VALUES ('hello')`
      let rows = yield* sql`SELECT * FROM test`
      assert.deepStrictEqual(rows, [{ id: 1, name: "hello" }])
      yield* sql`INSERT INTO test (name) VALUES ('world')`
      rows = yield* sql`SELECT * FROM test`
      assert.deepStrictEqual(rows, [
        { id: 1, name: "hello" },
        { id: 2, name: "world" }
      ])
    }).pipe(Effect.provide(D1Miniflare.layerClient)))

  it.effect("should handle queries with params without transactions", () =>
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`
      yield* sql`INSERT INTO test ${sql.insert({ name: "hello" })}`
      const rows = yield* sql`SELECT * FROM test WHERE name = ${"hello"}`
      assert.deepStrictEqual(rows, [{ id: 1, name: "hello" }])
    }).pipe(Effect.provide(D1Miniflare.layerClient)))

  it.effect("should execute statements in a batch", () =>
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`

      const results: readonly [
        ReadonlyArray<{ id: number; name: string }>,
        ReadonlyArray<{ id: number; name: string }>,
        ReadonlyArray<{ count: number }>
      ] = yield* sql.batch(
        [
          sql<{ id: number; name: string }>`INSERT INTO test (name) VALUES (${"hello"}) RETURNING *`,
          sql<{ id: number; name: string }>`INSERT INTO test (name) VALUES (${"world"}) RETURNING *`,
          sql<{ count: number }>`SELECT COUNT(*) AS count FROM test`
        ] as const
      )

      assert.deepStrictEqual(results, [
        [{ id: 1, name: "hello" }],
        [{ id: 2, name: "world" }],
        [{ count: 2 }]
      ])
    }).pipe(Effect.provide(D1Miniflare.layerClient)))

  it.effect("should apply result transforms to batch results", () =>
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      yield* sql`CREATE TABLE test (first_name TEXT, "firstName" TEXT)`
      yield* sql`INSERT INTO test (first_name, "firstName") VALUES ('John', 'Jane')`

      yield* Effect.gen(function*() {
        const transformed = yield* D1Client.make({
          db: sql.config.db,
          transformQueryNames: (name) => name === "firstName" ? "first_name" : name,
          transformResultNames: (name) => name === "first_name" ? "firstName" : name
        })
        const [rows] = yield* transformed.batch([
          transformed<{ firstName: string }>`SELECT ${transformed("firstName")} FROM test`
        ])
        assert.deepStrictEqual(rows, [{ firstName: "John" }])

        const withoutTransforms = transformed.withoutTransforms()
        const [rawRows] = yield* withoutTransforms.batch([
          withoutTransforms<{ firstName: string }>`SELECT ${withoutTransforms("firstName")} FROM test`
        ])
        assert.deepStrictEqual(rawRows, [{ firstName: "Jane" }])

        const [rawRowsFromTransformedBatch] = yield* transformed.batch([
          withoutTransforms<{ first_name: string }>`SELECT ${withoutTransforms("first_name")} FROM test`
        ])
        assert.deepStrictEqual(rawRowsFromTransformedBatch, [{ first_name: "John" }])

        const [transformedRowsFromRawBatch] = yield* withoutTransforms.batch([
          transformed<{ firstName: string }>`SELECT ${transformed("firstName")} FROM test`
        ])
        assert.deepStrictEqual(transformedRowsFromRawBatch, [{ firstName: "John" }])
      }).pipe(
        Effect.scoped,
        Effect.provide(Reactivity.layer)
      )
    }).pipe(Effect.provide(D1Miniflare.layerClient)))

  it.effect("should disable query-only transforms", () =>
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      yield* sql`CREATE TABLE test (first_name TEXT, "firstName" TEXT)`
      yield* sql`INSERT INTO test (first_name, "firstName") VALUES ('John', 'Jane')`

      yield* Effect.gen(function*() {
        const transformed = yield* D1Client.make({
          db: sql.config.db,
          transformQueryNames: (name) => name === "firstName" ? "first_name" : name
        })
        const [transformedRows] = yield* transformed.batch([
          transformed<{ first_name: string }>`SELECT ${transformed("firstName")} FROM test`
        ])
        assert.deepStrictEqual(transformedRows, [{ first_name: "John" }])

        const withoutTransforms = transformed.withoutTransforms()
        const [rawRows] = yield* withoutTransforms.batch([
          withoutTransforms<{ firstName: string }>`SELECT ${withoutTransforms("firstName")} FROM test`
        ])
        assert.deepStrictEqual(rawRows, [{ firstName: "Jane" }])
      }).pipe(
        Effect.scoped,
        Effect.provide(Reactivity.layer)
      )
    }).pipe(Effect.provide(D1Miniflare.layerClient)))

  it.effect("should roll back a failed batch", () =>
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT UNIQUE)`

      const error = yield* sql.batch([
        sql`INSERT INTO test (name) VALUES (${"duplicate"})`,
        sql`INSERT INTO test (name) VALUES (${"duplicate"})`
      ]).pipe(Effect.flip)

      assert.strictEqual(error.reason._tag, "UnknownError")
      assert.strictEqual(error.reason.operation, "execute")
      const rows = yield* sql`SELECT * FROM test`
      assert.deepStrictEqual(rows, [])
    }).pipe(Effect.provide(D1Miniflare.layerClient)))

  it.effect("should support an empty batch", () =>
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      const results: readonly [] = yield* sql.batch([])
      assert.deepStrictEqual(results, [])
    }).pipe(Effect.provide(D1Miniflare.layerClient)))

  it.effect("should apply statement transformers in a batch", () =>
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      const queries: Array<string> = []

      const results = yield* sql.batch([
        sql`SELECT ${1} AS value`,
        sql`SELECT ${2} AS value`
      ]).pipe(
        Effect.provideService(Statement.CurrentTransformer, (statement, sql) =>
          Effect.sync(() => {
            queries.push(statement.compile()[0])
          }).pipe(Effect.as(sql`SELECT ${3} AS value`)))
      )

      assert.deepStrictEqual(queries, ["SELECT ? AS value", "SELECT ? AS value"])
      assert.deepStrictEqual(results, [[{ value: 3 }], [{ value: 3 }]])
    }).pipe(Effect.provide(D1Miniflare.layerClient)))

  it.effect("should defect on transactions", () =>
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`
      const res = yield* sql`INSERT INTO test ${sql.insert({ name: "hello" })}`.pipe(
        sql.withTransaction,
        Effect.sandbox,
        Effect.flip
      )
      const rows = yield* sql`SELECT * FROM test`
      assert.deepStrictEqual(rows, [])
      assert.equal(Cause.hasDies(res), true)
    }).pipe(Effect.provide(D1Miniflare.layerClient)))

  it.effect("should defect when batching in a transaction", () =>
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`
      const res = yield* sql.batch([
        sql`INSERT INTO test ${sql.insert({ name: "hello" })}`
      ]).pipe(
        sql.withTransaction,
        Effect.sandbox,
        Effect.flip
      )
      const rows = yield* sql`SELECT * FROM test`
      assert.deepStrictEqual(rows, [])
      assert.equal(Cause.hasDies(res), true)
    }).pipe(Effect.provide(D1Miniflare.layerClient)))
})
