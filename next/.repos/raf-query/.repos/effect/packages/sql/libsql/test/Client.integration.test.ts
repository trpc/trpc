import { LibsqlClient } from "@effect/sql-libsql"
import { assert, describe, it, layer } from "@effect/vitest"
import { Effect, Exit, Layer, Option } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import { LibsqlContainer } from "./util.ts"

const Migrations = Layer.effectDiscard(
  LibsqlClient.LibsqlClient.pipe(
    Effect.andThen((sql) =>
      Effect.acquireRelease(
        sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`,
        () => sql`DROP TABLE test;`.pipe(Effect.ignore)
      )
    )
  )
)

describe("Client", () => {
  it.effect("exposes the active transaction service for each client", () =>
    Effect.gen(function*() {
      const a = yield* LibsqlClient.make({ url: ":memory:" })
      const b = yield* LibsqlClient.make({ url: ":memory:" })
      const active = Effect.all([
        Effect.map(Effect.serviceOption(a.transactionService), Option.isSome),
        Effect.map(Effect.serviceOption(b.transactionService), Option.isSome)
      ])

      assert.deepStrictEqual(yield* active, [false, false])
      yield* a.withTransaction(Effect.gen(function*() {
        assert.deepStrictEqual(yield* active, [true, false])
        assert.deepStrictEqual(yield* b.withTransaction(active), [true, true])
        assert.deepStrictEqual(yield* active, [true, false])
      }))
      assert.deepStrictEqual(yield* active, [false, false])
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("releases completed nested savepoints", () =>
    Effect.gen(function*() {
      const sql = yield* LibsqlClient.make({ url: ":memory:" })
      yield* sql`CREATE TABLE savepoint_release (value INTEGER)`
      yield* sql.withTransaction(Effect.gen(function*() {
        for (const rollback of [false, true]) {
          yield* sql.withTransaction(
            sql`INSERT INTO savepoint_release VALUES (1)`.pipe(
              Effect.andThen(rollback ? Effect.fail("rollback") : Effect.void)
            )
          ).pipe(Effect.ignore)
          const error = yield* sql`RELEASE SAVEPOINT effect_sql_1`.unprepared.pipe(Effect.flip)
          assert.strictEqual(error._tag, "SqlError")
        }
      }))
      assert.deepStrictEqual(yield* sql`SELECT value FROM savepoint_release`, [{ value: 1 }])
      const error = yield* sql.withTransaction(
        sql.withTransaction(sql`INSERT INTO savepoint_release VALUES (2)`).pipe(
          Effect.andThen(Effect.fail("outer rollback"))
        )
      ).pipe(Effect.flip)
      assert.strictEqual(error, "outer rollback")
      assert.deepStrictEqual(yield* sql`SELECT value FROM savepoint_release`, [{ value: 1 }])
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("keeps transactions isolated between clients", () =>
    Effect.gen(function*() {
      const a = yield* LibsqlClient.make({ url: ":memory:" })
      const b = yield* LibsqlClient.make({ url: ":memory:" })

      yield* a`CREATE TABLE marker (owner TEXT NOT NULL)`
      yield* b`CREATE TABLE marker (owner TEXT NOT NULL)`
      yield* a`INSERT INTO marker VALUES ('A')`
      yield* b`INSERT INTO marker VALUES ('B')`

      const rows = yield* a.withTransaction(b`SELECT owner FROM marker`)
      assert.deepStrictEqual(rows, [{ owner: "B" }])
    }).pipe(
      Effect.scoped,
      Effect.provide(Reactivity.layer)
    ))

  it.effect("releases transaction serialization after begin fails", () => {
    let transactionCalls = 0
    const transaction = {
      execute: () => Promise.resolve({ rows: [] }),
      commit: () => Promise.resolve(),
      rollback: () => Promise.resolve()
    }
    const liveClient = {
      execute: () => Promise.resolve({ rows: [] }),
      transaction: () => {
        transactionCalls++
        return transactionCalls === 1
          ? Promise.reject(new Error("transient begin failure"))
          : Promise.resolve(transaction)
      }
    }

    return Effect.gen(function*() {
      const client = yield* LibsqlClient.make({ liveClient: liveClient as any })
      const first = yield* Effect.exit(client.withTransaction(Effect.void))
      assert.isTrue(Exit.isFailure(first))

      yield* Effect.forkChild(client.withTransaction(Effect.void))
      yield* Effect.yieldNow

      assert.strictEqual(transactionCalls, 2)
    }).pipe(
      Effect.scoped,
      Effect.provide(Reactivity.layer)
    )
  })

  // Each test recreates the same tables.
  layer(LibsqlContainer.layerClient, { timeout: "30 seconds", concurrent: false })("shared tables", (it) => {
    it.effect("should work", () =>
      Effect.gen(function*() {
        const sql = yield* LibsqlClient.LibsqlClient
        let response = yield* sql`INSERT INTO test (name) VALUES ('hello')`
        assert.deepStrictEqual(response, [])
        response = yield* sql`SELECT * FROM test`
        assert.deepStrictEqual(response, [{ id: 1, name: "hello" }])
        response = yield* sql`SELECT * FROM test`
        assert.deepStrictEqual(yield* sql`select * from test`.values, [
          [1, "hello"]
        ])
      }).pipe(Effect.provide(Migrations)))

    it.effect("should work with raw", () =>
      Effect.gen(function*() {
        const sql = yield* LibsqlClient.LibsqlClient
        let response: any
        response = yield* sql`CREATE TABLE test2 (id INTEGER PRIMARY KEY, name TEXT)`.raw
        yield* Effect.addFinalizer(() => sql`DROP TABLE test2;`.pipe(Effect.ignore))
        assert.deepStrictEqual(response.toJSON(), {
          columnTypes: [],
          columns: [],
          lastInsertRowid: null,
          rows: [],
          rowsAffected: 0
        })
        response = yield* sql`INSERT INTO test (name) VALUES ('hello')`.raw
        assert.deepStrictEqual(response.toJSON(), {
          columnTypes: [],
          columns: [],
          lastInsertRowid: "1",
          rows: [],
          rowsAffected: 1
        })
        response = yield* sql`SELECT * FROM test`.raw
        assert.deepStrictEqual(response.toJSON(), {
          columnTypes: ["INTEGER", "TEXT"],
          columns: ["id", "name"],
          lastInsertRowid: null,
          rows: [[1, "hello"]],
          rowsAffected: 0
        })
      }).pipe(Effect.provide(Migrations)))

    it.effect("withTransaction", () =>
      Effect.gen(function*() {
        const sql = yield* LibsqlClient.LibsqlClient
        yield* sql.withTransaction(sql`INSERT INTO test (name) VALUES ('hello')`)
        const rows = yield* sql`SELECT * FROM test`
        assert.deepStrictEqual(rows, [{ id: 1, name: "hello" }])
      }).pipe(Effect.provide(Migrations)))

    it.effect("withTransaction rollback", () =>
      Effect.gen(function*() {
        const sql = yield* LibsqlClient.LibsqlClient
        yield* sql`INSERT INTO test (name) VALUES ('hello')`.pipe(
          Effect.andThen(Effect.fail("boom")),
          sql.withTransaction,
          Effect.ignore
        )
        const rows = yield* sql`SELECT * FROM test`
        assert.deepStrictEqual(rows, [])
      }).pipe(Effect.provide(Migrations)))

    it.effect("withTransaction nested", () =>
      Effect.gen(function*() {
        const sql = yield* LibsqlClient.LibsqlClient
        const stmt = sql`INSERT INTO test (name) VALUES ('hello')`

        yield* stmt.pipe(Effect.andThen(() => stmt.pipe(sql.withTransaction)), sql.withTransaction)
        const rows = yield* sql<{ total_rows: number }>`select count(*) as total_rows FROM test`
        assert.deepStrictEqual(rows.at(0)?.total_rows, 2)
      }).pipe(Effect.provide(Migrations)))

    it.effect("withTransaction nested rollback", () =>
      Effect.gen(function*() {
        const sql = yield* LibsqlClient.LibsqlClient
        const stmt = sql`INSERT INTO test (name) VALUES ('hello')`

        yield* stmt.pipe(
          Effect.andThen(() => stmt.pipe(Effect.andThen(Effect.fail("boom")), sql.withTransaction, Effect.ignore)),
          sql.withTransaction
        )
        const rows = yield* sql<{ total_rows: number }>`select count(*) as total_rows FROM test`
        assert.deepStrictEqual(rows.at(0)?.total_rows, 1)
      }).pipe(Effect.provide(Migrations)))
  })
})
