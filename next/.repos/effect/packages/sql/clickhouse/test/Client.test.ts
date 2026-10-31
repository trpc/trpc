import * as Clickhouse from "@clickhouse/client"
import { ClickhouseClient, ClickhouseMigrator } from "@effect/sql-clickhouse"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import * as Statement from "effect/sql/Statement"
import { TestClock } from "effect/testing"
import { Readable } from "node:stream"
import { vi } from "vitest"

let closeCalls = 0
let connectImmediately = false
const commandCalls: Array<Record<string, unknown>> = []
const insertCalls: Array<Record<string, unknown>> = []
let insertImpl: ((options: Record<string, unknown>) => Promise<unknown>) | undefined
let queryImpl: ((options: Record<string, unknown>) => Promise<unknown>) | undefined

vi.mock("@clickhouse/client", () => ({
  createClient: vi.fn(() => ({
    ping: () => connectImmediately ? Promise.resolve({ success: true }) : new Promise(() => {}),
    query: (options: Record<string, unknown>) => queryImpl ? queryImpl(options) : new Promise(() => {}),
    insert: (options: Record<string, unknown>) => {
      insertCalls.push(options)
      return insertImpl ? insertImpl(options) : new Promise(() => {})
    },
    command: (options: Record<string, unknown>) => {
      commandCalls.push(options)
      return Promise.resolve({})
    },
    close: () => {
      closeCalls++
      return Promise.resolve()
    }
  }))
}))

describe("ClickhouseClient", { concurrent: false }, () => {
  it("infers DateTime parameters without empty parentheses", () => {
    const sql = Statement.make(Effect.void as any, ClickhouseClient.makeCompiler(), [], undefined)
    const date = new Date("2024-01-15T14:30:00Z")

    assert.deepStrictEqual(sql`SELECT ${date}`.compile(), ["SELECT {p1: DateTime}", [date]])
  })

  it.effect("preserves an explicit nullable parameter type and null value", () =>
    Effect.gen(function*() {
      connectImmediately = true
      const sql = yield* ClickhouseClient.make({ url: "http://localhost:8123" })

      assert.deepStrictEqual(sql`SELECT ${sql.param("Nullable(Int32)", null)}`.compile(), [
        "SELECT {p1: Nullable(Int32)}",
        [null]
      ])
    }).pipe(Effect.provide(Reactivity.layer)))

  it("binds plain objects shaped like ClickHouse params as String parameters", () => {
    const sql = Statement.make(Effect.void as any, ClickhouseClient.makeCompiler(), [], undefined)
    const paramLike = { _tag: "Custom", kind: "ClickhouseParam", paramA: "Int32", paramB: 1 }

    assert.deepStrictEqual(sql`SELECT ${paramLike}`.compile(), ["SELECT {p1: String}", [paramLike]])
  })

  it("preserves fractional JavaScript numbers in inferred parameters", () => {
    const sql = Statement.make(Effect.void as any, ClickhouseClient.makeCompiler(), [], undefined)
    const [query] = sql`SELECT ${1.5}`.compile()

    assert.strictEqual(query, "SELECT {p1: Float64}")
  })

  it("uses the ClickHouse dialect for dialect-specific fragments", () => {
    const sql = Statement.make(Effect.void as any, ClickhouseClient.makeCompiler(), [], undefined)

    assert.strictEqual(
      sql.onDialect({
        sqlite: () => "sqlite",
        pg: () => "pg",
        mysql: () => "mysql",
        mssql: () => "mssql",
        clickhouse: () => "clickhouse"
      }),
      "clickhouse"
    )
  })

  it.effect("exposes the underlying ClickHouse client", () =>
    Effect.gen(function*() {
      connectImmediately = true
      const createClient = vi.mocked(Clickhouse.createClient)
      createClient.mockClear()
      const sql = yield* ClickhouseClient.make({ url: "http://localhost:8123" })

      assert.strictEqual(createClient.mock.results.length, 1)
      assert.strictEqual(sql.client, createClient.mock.results[0].value)
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("closes the client when the connection check times out", () =>
    Effect.gen(function*() {
      connectImmediately = false
      closeCalls = 0
      const fiber = yield* Effect.forkDetach(
        ClickhouseClient.make({ url: "http://localhost:8123" }).pipe(Effect.scoped)
      )
      yield* Effect.yieldNow
      yield* TestClock.adjust("5 seconds")
      const result = fiber.pollUnsafe()

      assert.isDefined(result)
      assert.strictEqual(closeCalls, 1)
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("parameterizes the query id when cancelling a query", () =>
    Effect.gen(function*() {
      connectImmediately = true
      commandCalls.length = 0
      const queryId = "id' OR 1 = 1 --"
      const client = yield* ClickhouseClient.make({ url: "http://localhost:8123" })
      const fiber = yield* client.withQueryId(client.unsafe("SELECT 1"), queryId).pipe(Effect.forkScoped)
      yield* Effect.yieldNow

      yield* Fiber.interrupt(fiber)

      assert.deepStrictEqual(commandCalls, [{
        query: "KILL QUERY WHERE query_id = {queryId:String}",
        query_params: { queryId }
      }])
    }).pipe(
      Effect.scoped,
      Effect.provide(Reactivity.layer)
    ))

  it.effect("parameterizes the query id when cancelling an insert", () =>
    Effect.gen(function*() {
      connectImmediately = true
      commandCalls.length = 0
      const queryId = "id' OR 1 = 1 --"
      const client = yield* ClickhouseClient.make({ url: "http://localhost:8123" })
      const fiber = yield* client.withQueryId(
        client.insertQuery({ table: "test", values: [] }),
        queryId
      ).pipe(Effect.forkScoped)
      yield* Effect.yieldNow

      yield* Fiber.interrupt(fiber)

      assert.deepStrictEqual(commandCalls, [{
        query: "KILL QUERY WHERE query_id = {queryId:String}",
        query_params: { queryId }
      }])
    }).pipe(
      Effect.scoped,
      Effect.provide(Reactivity.layer)
    ))

  it.effect("passes column selection to insertQuery", () =>
    Effect.gen(function*() {
      connectImmediately = true
      insertCalls.length = 0
      insertImpl = () => Promise.resolve({ executed: true, query_id: "" })
      const client = yield* ClickhouseClient.make({ url: "http://localhost:8123" })

      yield* client.insertQuery({ table: "people", values: [{ name: "Alice" }], columns: ["name"] })
      yield* client.insertQuery({ table: "people", values: [{ name: "Bob" }], columns: { except: ["id"] } })

      assert.strictEqual(insertCalls.length, 2)
      assert.strictEqual(insertCalls[0].table, "people")
      assert.strictEqual(insertCalls[0].format, "JSONEachRow")
      assert.deepStrictEqual(insertCalls[0].columns, ["name"])
      assert.deepStrictEqual(insertCalls[1].columns, { except: ["id"] })
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("writes the ledger with commands and runs migrations as queries", () =>
    Effect.gen(function*() {
      connectImmediately = true
      commandCalls.length = 0
      const queries: Array<string> = []
      queryImpl = (options) => {
        queries.push(String(options.query))
        return Promise.resolve({ json: () => Promise.resolve({ data: [] }) })
      }
      const client = yield* ClickhouseClient.make({ url: "http://localhost:8123" })
      const applied = yield* ClickhouseMigrator.run({
        loader: ClickhouseMigrator.fromRecord({
          "1_init": client`CREATE TABLE init`
        })
      }).pipe(Effect.provideService(SqlClient.SqlClient, client))

      const select = `SELECT migration_id, name, created_at FROM "effect_sql_migrations" ORDER BY migration_id DESC`
      assert.deepStrictEqual(applied, [[1, "init"]])
      assert.deepStrictEqual(queries, [select, "CREATE TABLE init", select])
      assert.strictEqual(commandCalls.length, 2)
      assert.match(String(commandCalls[0].query), /ENGINE = MergeTree/)
      assert.match(String(commandCalls[1].query), /^INSERT INTO "effect_sql_migrations"/)
    }).pipe(
      Effect.ensuring(Effect.sync(() => {
        queryImpl = undefined
      })),
      Effect.provide(Reactivity.layer)
    ))

  it.effect("retries a failed migration and the ones after it on the next run", () =>
    Effect.gen(function*() {
      connectImmediately = true
      commandCalls.length = 0
      queryImpl = (options) => {
        const ledger: Array<{ migration_id: unknown; name: unknown }> = []
        for (const command of commandCalls) {
          if (String(command.query).startsWith(`INSERT INTO "effect_sql_migrations"`)) {
            const params = Object.values(command.query_params as Record<string, unknown>)
            for (let i = 0; i < params.length; i += 2) {
              ledger.unshift({ migration_id: params[i], name: params[i + 1] })
            }
          }
        }
        const data = String(options.query).startsWith("SELECT migration_id") ? ledger : []
        return Promise.resolve({ json: () => Promise.resolve({ data }) })
      }
      const client = yield* ClickhouseClient.make({ url: "http://localhost:8123" })
      let attempts = 0
      const run = ClickhouseMigrator.run({
        loader: ClickhouseMigrator.fromRecord({
          "1_first": client`CREATE TABLE first`,
          "2_second": Effect.suspend(() => attempts++ === 0 ? Effect.fail("rejected") : Effect.void),
          "3_third": client`CREATE TABLE third`
        })
      }).pipe(Effect.provideService(SqlClient.SqlClient, client))

      const error = yield* Effect.flip(run)
      assert.strictEqual(error.message, `Migration "2_second" failed`)
      assert.deepStrictEqual(yield* run, [[2, "second"], [3, "third"]])
    }).pipe(
      Effect.ensuring(Effect.sync(() => {
        queryImpl = undefined
      })),
      Effect.provide(Reactivity.layer)
    ))

  it.effect("kills a streamed query only when the stream is not read to the end", () =>
    Effect.gen(function*() {
      connectImmediately = true
      commandCalls.length = 0
      // A minimal stand-in for the row batches emitted by `ResultSet.stream()`
      queryImpl = () =>
        Promise.resolve({
          stream: () =>
            Readable.from(
              [[{ a: 1 }], [{ a: 2 }]].map((rows) => rows.map((row) => ({ json: () => Promise.resolve(row) }))),
              { objectMode: true }
            )
        })
      const client = yield* ClickhouseClient.make({ url: "http://localhost:8123" })

      const all = yield* Stream.runCollect(client`SELECT a FROM t`.stream).pipe(client.withQueryId("full-id"))
      const first = yield* Stream.runCollect(client`SELECT a FROM t`.stream.pipe(Stream.take(1))).pipe(
        client.withQueryId("take-id")
      )

      assert.deepStrictEqual(all, [{ a: 1 }, { a: 2 }])
      assert.deepStrictEqual(first, [{ a: 1 }])
      assert.deepStrictEqual(commandCalls, [{
        query: "KILL QUERY WHERE query_id = {queryId:String}",
        query_params: { queryId: "take-id" }
      }])
    }).pipe(
      Effect.ensuring(Effect.sync(() => {
        queryImpl = undefined
      })),
      Effect.provide(Reactivity.layer)
    ))
})
