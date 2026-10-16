import { MysqlClient } from "@effect/sql-mysql2"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import * as Mysql from "mysql2"
import { vi } from "vitest"

import { MysqlContainer } from "./utils.ts"

vi.mock("mysql2", { spy: true })

describe("MysqlClient", () => {
  it.effect("stream returns same rows as direct execution", () =>
    Effect.gen(function*() {
      const sql = yield* MysqlClient.MysqlClient

      yield* sql`DROP TABLE IF EXISTS stream_regression_test`
      yield* sql`CREATE TABLE stream_regression_test (id INT PRIMARY KEY AUTO_INCREMENT, value VARCHAR(255))`

      const testData = Array.from({ length: 100 }, (_, i) => ({ value: `row_${i}` }))
      yield* sql`INSERT INTO stream_regression_test ${sql.insert(testData)}`

      const directResults = yield* sql`SELECT * FROM stream_regression_test`

      const streamResults = yield* Stream.runCollect(
        sql`SELECT * FROM stream_regression_test`.stream
      )

      yield* sql`DROP TABLE stream_regression_test`

      assert.strictEqual(
        streamResults.length,
        directResults.length,
        `Stream returned ${streamResults.length} rows, expected ${directResults.length}`
      )
    }).pipe(
      Effect.provide(MysqlContainer.layerClient),
      Effect.catchTag("ContainerError", () => Effect.void)
    ), { timeout: 60_000 })

  it.effect("uses query when prepared statements are disabled", () =>
    Effect.gen(function*() {
      const calls: Array<"execute" | "query"> = []
      vi.mocked(Mysql.createPool).mockReturnValueOnce({
        query: (options: string | object, callback: (cause: null, rows?: Array<unknown>) => void) => {
          if (typeof options !== "string") {
            calls.push("query")
          }
          callback(null, [])
        },
        execute: (_options: object, callback: (cause: null, rows: Array<unknown>) => void) => {
          calls.push("execute")
          callback(null, [])
        },
        end: (callback: () => void) => callback()
      } as unknown as Mysql.Pool)

      yield* Effect.gen(function*() {
        const sql = yield* MysqlClient.MysqlClient
        yield* sql`SELECT ${1}`
        yield* sql`SELECT ${1}`.values
        yield* sql.unsafe("SELECT ?", [1]).raw
      }).pipe(Effect.provide(MysqlClient.layer({ disablePreparedStatements: true })))

      assert.deepStrictEqual(calls, ["query", "query", "query"])
    }))
})
