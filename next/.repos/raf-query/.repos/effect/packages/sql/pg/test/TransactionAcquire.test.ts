import { PgClient } from "@effect/sql-pg"
import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import { Duplex } from "node:stream"

it.effect("withTransaction surfaces stream factory failures instead of defecting", () =>
  Effect.gen(function*() {
    const sql = yield* PgClient.make({
      username: "test",
      stream: () => {
        throw new Error("stream factory failed")
      }
    })

    const error = yield* Effect.flip(sql.withTransaction(sql`SELECT 1`))

    assert.strictEqual(error.reason._tag, "ConnectionError")
    assert.strictEqual(error.reason.operation, "connect")
  }).pipe(
    Effect.scoped,
    Effect.provide(Reactivity.layer)
  ))

it.effect("withTransaction surfaces startup transport failures instead of defecting", () =>
  Effect.gen(function*() {
    const sql = yield* PgClient.make({
      username: "test",
      stream: () =>
        new Duplex({
          read() {},
          write(_chunk, _encoding, callback) {
            callback(new Error("startup write failed"))
          }
        })
    })

    const error = yield* Effect.flip(sql.withTransaction(sql`SELECT 1`))

    assert.strictEqual(error.reason._tag, "ConnectionError")
    assert.strictEqual(error.reason.operation, "connect")
  }).pipe(
    Effect.scoped,
    Effect.provide(Reactivity.layer)
  ))
