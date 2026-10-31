import { Effect, hole } from "effect"
import type { SqlClient } from "effect/sql"
import { describe, expect, it } from "tstyche"

describe("SqlClient", () => {
  it("reactive queries accept any keys when no keys are declared", () => {
    const sql = hole<SqlClient.SqlClient>()
    const effect = Effect.succeed(1)
    const keys = hole<ReadonlyArray<unknown>>()

    expect(sql.reactive).type.toBeCallableWith(keys, effect)
    expect(sql.reactiveMailbox).type.toBeCallableWith({ anything: [1, { id: 1 }] }, effect)
  })
})
