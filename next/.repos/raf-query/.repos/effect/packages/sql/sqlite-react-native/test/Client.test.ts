import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Reactivity } from "effect/reactivity"
import { vi } from "vitest"

const state = vi.hoisted(() => ({
  database: {
    close() {},
    execute: async () => ({ rowsAffected: 0, rows: [{ value: 1 }] }),
    executeRaw: async () => ({ rowsAffected: 0, rawRows: [[1]], columnNames: ["value"] }),
    executeRawSync: () => ({ rowsAffected: 0, rawRows: [[1]], columnNames: ["value"] }),
    executeSync: () => ({ rowsAffected: 0, rows: [{ value: 1 }] })
  }
}))

vi.mock("@op-engineering/op-sqlite", () => ({
  open: () => state.database
}))

import { SqliteClient } from "@effect/sql-sqlite-react-native"

describe("Client", () => {
  it.effect("should work", () => Effect.void)

  it.effect("returns array rows from synchronous values queries", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: "test.db" })
      const rows = yield* sql`SELECT 1 AS value`.values
      const unpreparedRows = yield* sql`SELECT 1 AS value`.valuesUnprepared
      assert.deepStrictEqual(rows, [[1]])
      assert.deepStrictEqual(unpreparedRows, [[1]])
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("returns array rows from asynchronous values queries", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: "test.db" })
      const rows = yield* SqliteClient.withAsyncQuery(sql`SELECT 1 AS value`.values)
      const unpreparedRows = yield* SqliteClient.withAsyncQuery(sql`SELECT 1 AS value`.valuesUnprepared)
      assert.deepStrictEqual(rows, [[1]])
      assert.deepStrictEqual(unpreparedRows, [[1]])
    }).pipe(Effect.provide(Reactivity.layer)))
})
