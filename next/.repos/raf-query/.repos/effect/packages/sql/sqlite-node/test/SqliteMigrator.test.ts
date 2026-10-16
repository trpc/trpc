import { NodeFileSystem } from "@effect/platform-node"
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, FileSystem } from "effect"
import { Reactivity } from "effect/reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import * as SqlError from "effect/sql/SqlError"

const makeClients = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  const filename = dir + "/test.db"

  return {
    lockClient: yield* SqliteClient.make({ filename }),
    migratorClient: yield* SqliteClient.make({ filename })
  }
}).pipe(Effect.provide([NodeFileSystem.layer, Reactivity.layer]))

describe("SqliteMigrator", () => {
  it.effect("fails on lock errors", () =>
    Effect.gen(function*() {
      const { lockClient, migratorClient } = yield* makeClients

      yield* migratorClient`PRAGMA busy_timeout = 1`

      yield* SqliteMigrator.run({
        loader: SqliteMigrator.fromRecord({})
      }).pipe(Effect.provideService(SqlClient.SqlClient, migratorClient))

      yield* Effect.acquireRelease(
        lockClient`BEGIN IMMEDIATE`,
        () => lockClient`ROLLBACK`.pipe(Effect.ignore)
      )

      const error = yield* Effect.flip(
        SqliteMigrator.run({
          loader: SqliteMigrator.fromRecord({
            "1_test": Effect.void
          })
        }).pipe(Effect.provideService(SqlClient.SqlClient, migratorClient))
      )

      assert.strictEqual(error._tag, "SqlError")
      assert(SqlError.isSqlError(error))
      assert.strictEqual(error.reason._tag, "LockTimeoutError")
    }))
})
