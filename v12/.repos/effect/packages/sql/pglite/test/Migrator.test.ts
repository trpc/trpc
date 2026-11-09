import { PgliteClient, PgliteMigrator } from "@effect/sql-pglite"
import { assert, describe, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import * as Migrator from "effect/sql/Migrator"
import { SqlClient } from "effect/sql/SqlClient"
import * as Statement from "effect/sql/Statement"

const ClientLayer = PgliteClient.layer({})

const loader = Effect.succeed([
  [
    1,
    "init",
    Effect.succeed(Effect.gen(function*() {
      const sql = yield* SqlClient
      yield* sql`CREATE TABLE migrator_test (id SERIAL PRIMARY KEY, value TEXT)`
    }))
  ] as const,
  [
    2,
    "insert",
    Effect.succeed(Effect.gen(function*() {
      const sql = yield* SqlClient
      yield* sql`INSERT INTO migrator_test (value) VALUES ('hello')`
    }))
  ] as const
])

const MigratorLayer = PgliteMigrator.layer({ loader }).pipe(Layer.provide(ClientLayer))

describe("PgliteMigrator", () => {
  layer(Layer.merge(ClientLayer, MigratorLayer), { timeout: "30 seconds" })((it) => {
    it.effect("runs migrations and records them", () =>
      Effect.gen(function*() {
        const sql = yield* PgliteClient.PgliteClient
        const rows = yield* sql<{ value: string }>`SELECT value FROM migrator_test`
        assert.deepStrictEqual(rows, [{ value: "hello" }])
        const migrations = yield* sql<
          { migration_id: number; name: string }
        >`SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id`
        assert.deepStrictEqual(
          migrations.map((m) => [m.migration_id, m.name]),
          [[1, "init"], [2, "insert"]]
        )
      }))
  })
})

describe("Migrator.make", () => {
  layer(ClientLayer, { timeout: "30 seconds" })((it) => {
    it.effect("reuses a migrations table whose name needs quoting", () =>
      Effect.gen(function*() {
        const table = "MixedCase_make_migrations"
        const loader = Migrator.fromRecord({ "1_first": Effect.void })
        yield* PgliteMigrator.run({ loader, table })

        const completed = yield* PgliteMigrator.run({ loader, table })

        assert.deepStrictEqual(completed, [])
      }))

    it.effect("transforms only the migrations table writes", () =>
      Effect.gen(function*() {
        const transformed: Array<string> = []
        const run = Migrator.make({
          transformWrites: (effect) =>
            Effect.provideService(effect, Statement.CurrentTransformer, (statement) =>
              Effect.sync(() => {
                transformed.push(statement.compile()[0])
                return statement
              }))
        })

        yield* run({ loader: Migrator.fromRecord({ "1_first": Effect.void }), table: "transformed_make_migrations" })

        assert.deepStrictEqual(transformed.map((sql) => sql.split(" ")[0]), ["CREATE", "INSERT"])
      }))
  })
})
