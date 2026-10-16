import { PgliteClient } from "@effect/sql-pglite"
import { assert, describe, layer } from "@effect/vitest"
import { Effect } from "effect"
import { PersistedQueue } from "effect/persistence"
import { SqlClient } from "effect/sql"

const ClientLayer = PgliteClient.layer({})

describe("PersistedQueue SQL migrations", () => {
  layer(ClientLayer, { timeout: "30 seconds" })((it) => {
    it.effect("runs fresh-install migrations once", () =>
      Effect.gen(function*() {
        const sql = (yield* SqlClient.SqlClient).withoutTransforms()
        const tableName = "persisted_queue_migration_test"

        yield* PersistedQueue.makeStoreSql({ tableName })
        yield* PersistedQueue.makeStoreSql({ tableName })

        const migrations = yield* sql<{
          readonly migration_id: number
          readonly name: string
        }>`SELECT migration_id, name FROM ${sql(`${tableName}_migrations`)} ORDER BY migration_id`
        assert.deepStrictEqual(migrations, [
          { migration_id: 1, name: "create_table" },
          { migration_id: 2, name: "upgrade_schema" }
        ])

        const indexes = yield* sql<{ readonly indexname: string }>`
          SELECT indexname FROM pg_indexes
          WHERE tablename = ${tableName}
          ORDER BY indexname
        `
        assert.deepStrictEqual(indexes.map((row) => row.indexname), [
          `idx_${tableName}_id`,
          `idx_${tableName}_take`,
          `idx_${tableName}_update`,
          `${tableName}_pkey`
        ])
      }))
  })
})
