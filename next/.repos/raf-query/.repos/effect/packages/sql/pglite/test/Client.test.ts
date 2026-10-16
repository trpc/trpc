import { PgliteClient } from "@effect/sql-pglite"
import { assert, describe, layer } from "@effect/vitest"
import * as Pglite from "@electric-sql/pglite"
import { Effect, Exit, Layer, Queue, Scope } from "effect"
import { SqlClient } from "effect/sql/SqlClient"

const ClientLayer = PgliteClient.layer()

const Migrations = Layer.effectDiscard(
  Effect.gen(function*() {
    const sql = yield* SqlClient
    yield* sql`DROP TABLE test`.pipe(Effect.ignore)
    yield* sql`CREATE TABLE test (id SERIAL PRIMARY KEY, name TEXT)`
  })
)

// Avoid overlapping PGlite startup with SQL assertions in other tests.
describe("PgliteClient", { concurrent: false }, () => {
  layer(ClientLayer, { timeout: "30 seconds" })((it) => {
    it.effect("basic insert/select", () =>
      Effect.gen(function*() {
        const sql = yield* PgliteClient.PgliteClient
        yield* sql`INSERT INTO test (name) VALUES ('hello')`
        const rows = yield* sql<{ id: number; name: string }>`SELECT * FROM test`
        assert.deepStrictEqual(rows, [{ id: 1, name: "hello" }])
        const values = yield* sql`SELECT * FROM test`.values
        assert.deepStrictEqual(values, [[1, "hello"]])
      }).pipe(Effect.provide(Migrations)))

    it.effect("insert helper", () =>
      Effect.gen(function*() {
        const sql = yield* PgliteClient.PgliteClient
        const [query, params] = sql`INSERT INTO people ${sql.insert({ name: "Tim", age: 10 })}`.compile()
        assert.strictEqual(query, `INSERT INTO people ("name","age") VALUES ($1,$2)`)
        assert.deepStrictEqual(params, ["Tim", 10])
      }))

    it.effect("update helper", () =>
      Effect.gen(function*() {
        const sql = yield* PgliteClient.PgliteClient
        const [query, params] = sql`UPDATE people SET ${sql.update({ name: "Tim" })}`.compile()
        assert.strictEqual(query, `UPDATE people SET "name" = $1`)
        assert.deepStrictEqual(params, ["Tim"])
      }))

    it.effect("updateValues helper", () =>
      Effect.gen(function*() {
        const sql = yield* PgliteClient.PgliteClient
        const [query, params] = sql`UPDATE people SET name = data.name FROM ${
          sql.updateValues([{ name: "Tim" }, { name: "John" }], "data")
        }`.compile()
        assert.strictEqual(
          query,
          `UPDATE people SET name = data.name FROM (values ($1),($2)) AS data("name")`
        )
        assert.deepStrictEqual(params, ["Tim", "John"])
      }))

    it.effect("in helper", () =>
      Effect.gen(function*() {
        const sql = yield* PgliteClient.PgliteClient
        const [query, params] = sql`SELECT * FROM ${sql("people")} WHERE id IN ${sql.in([1, 2, "x"])}`.compile()
        assert.strictEqual(query, `SELECT * FROM "people" WHERE id IN ($1,$2,$3)`)
        assert.deepStrictEqual(params, [1, 2, "x"])
      }))

    it.effect("and helper", () =>
      Effect.gen(function*() {
        const sql = yield* PgliteClient.PgliteClient
        const now = new Date()
        const [query, params] = sql`SELECT * FROM ${sql("people")} WHERE ${
          sql.and([sql.in("name", ["Tim", "John"]), sql`created_at < ${now}`])
        }`.compile()
        assert.strictEqual(query, `SELECT * FROM "people" WHERE ("name" IN ($1,$2) AND created_at < $3)`)
        assert.deepStrictEqual(params, ["Tim", "John", now])
      }))

    it.effect("identifier transform", () =>
      Effect.gen(function*() {
        const sql = yield* PgliteClient.PgliteClient
        const compiler = PgliteClient.makeCompiler((s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`))
        const [query] = compiler.compile(sql`SELECT * FROM ${sql("peopleTest")}`, false)
        assert.strictEqual(query, `SELECT * FROM "people_test"`)
      }))

    it.effect("json fragment", () =>
      Effect.gen(function*() {
        const sql = yield* PgliteClient.PgliteClient
        const rows = yield* sql<{ json: unknown }>`SELECT ${sql.json({ a: 1 })}::jsonb AS json`
        assert.deepStrictEqual(rows[0].json, { a: 1 })
      }))

    it.effect("listen + notify", () =>
      Effect.gen(function*() {
        const sql = yield* PgliteClient.PgliteClient
        const notifications = yield* sql.listen("ch1")

        yield* sql.notify("ch1", "hello")
        assert.strictEqual(yield* Queue.take(notifications), "hello")

        yield* sql.notify("ch1", "")
        assert.strictEqual(yield* Queue.take(notifications), "")
      }), { timeout: 15_000 })

    it.effect("listen shuts down with its scope", () =>
      Effect.gen(function*() {
        const sql = yield* PgliteClient.PgliteClient
        const scope = yield* Scope.make()
        const notifications = yield* sql.listen("ch1").pipe(Scope.provide(scope))

        yield* Scope.close(scope, Exit.void)

        assert.isTrue(Exit.hasInterrupts(yield* Queue.take(notifications).pipe(Effect.exit)))
      }), { timeout: 15_000 })

    it.effect("provider extras", () =>
      Effect.gen(function*() {
        const sql = yield* PgliteClient.PgliteClient
        const dump = yield* sql.dumpDataDir("none")
        assert.isAbove((dump as Blob).size, 0)
      }))
  })

  describe("fromClient", () => {
    layer(
      PgliteClient.layerFrom(Effect.gen(function*() {
        const pg = yield* Effect.acquireRelease(
          Effect.sync(() => new Pglite.PGlite()),
          (pg) => Effect.promise(() => pg.close())
        )
        // Charge startup to the layer hook timeout, not the first query's test timeout.
        yield* Effect.promise(() => pg.waitReady)
        return yield* PgliteClient.fromClient({ liveClient: pg })
      })),
      { timeout: "30 seconds" }
    )((it) => {
      it.effect("works", () =>
        Effect.gen(function*() {
          const sql = yield* PgliteClient.PgliteClient
          const rows = yield* sql<{ value: number }>`SELECT 1 AS value`
          assert.deepStrictEqual(rows, [{ value: 1 }])
        }))
    })

    layer(
      Layer.effectDiscard(Effect.gen(function*() {
        const sql = yield* PgliteClient.PgliteClient
        yield* sql`CREATE TYPE mood AS ENUM ('sad', 'happy')`
        yield* sql`CREATE TABLE test_moods (id SERIAL PRIMARY KEY, name TEXT, moods mood[])`
        yield* sql.refreshArrayTypes
      })).pipe(
        Layer.provideMerge(ClientLayer)
      ),
      { timeout: "30 seconds" }
    )((it) => {
      it.effect("refreshArrayTypes", () =>
        Effect.gen(function*() {
          const sql = yield* PgliteClient.PgliteClient
          yield* sql`INSERT INTO test_moods (name, moods) VALUES (${"test2"}, ${["sad", "happy"]})`
          const rows = yield* sql<{ moods: ReadonlyArray<string> }>`SELECT moods FROM test_moods`
          assert.deepStrictEqual(rows, [{ moods: ["sad", "happy"] }])
        }))
    })
  })
})
