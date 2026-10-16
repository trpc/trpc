import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Logger } from "effect"
import { SqlClient, Statement } from "effect/sql"
import { MysqlContainer } from "./utils.ts"

const SqlLogger = Layer.succeed(Statement.CurrentTransformer)((statement) => {
  const [query, params] = statement.compile()
  return Effect.log("executing sql").pipe(
    Effect.annotateLogs({ query, params }),
    Effect.as(statement)
  )
})

describe("sql", () => {
  it.effect("releases completed nested savepoints", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
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
    }).pipe(Effect.provide(MysqlContainer.layerClient)), { timeout: 60_000 })

  it.effect("tranformers", () =>
    Effect.gen(function*() {
      const logs: Array<unknown> = []
      const sql = yield* SqlClient.SqlClient
      const result = yield* sql<{ result: number }>`SELECT 1 + 1 AS result`.pipe(
        Effect.provide(Logger.layer([
          Logger.make((log) => {
            logs.push(log.message)
          })
        ]))
      )
      assert.deepStrictEqual(result, [{ result: 2 }])
      assert.deepStrictEqual(logs, [["executing sql"]])
    }).pipe(
      Effect.provide(MysqlContainer.layerClient.pipe(
        Layer.provideMerge(SqlLogger)
      )),
      Effect.catchTag("ContainerError", () => Effect.void)
    ), { timeout: 60_000 })
})
