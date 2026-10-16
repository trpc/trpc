import { ClickhouseClient } from "@effect/sql-clickhouse"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Statement from "effect/sql/Statement"
import { TestClock } from "effect/testing"
import { vi } from "vitest"

let closeCalls = 0
let connectImmediately = false
const commandCalls: Array<Record<string, unknown>> = []
const insertCalls: Array<Record<string, unknown>> = []
let insertImpl: ((options: Record<string, unknown>) => Promise<unknown>) | undefined

vi.mock("@clickhouse/client", () => ({
  createClient: () => ({
    ping: () => connectImmediately ? Promise.resolve({ success: true }) : new Promise(() => {}),
    query: () => new Promise(() => {}),
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
  })
}))

describe("ClickhouseClient", { concurrent: false }, () => {
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
})
