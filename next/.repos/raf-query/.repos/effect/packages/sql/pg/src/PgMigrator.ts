/**
 * Runs database migrations for PostgreSQL projects that use Effect SQL.
 *
 * This module reuses the shared SQL migrator and connects it to PostgreSQL. It
 * exposes the common migration helpers and adds `run` and `layer` functions
 * that apply pending migration files with the current SQL client. When schema
 * dumps are requested, it uses `pg_dump` and the usual process and filesystem
 * services.
 *
 * @since 4.0.0
 */
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Migrator from "effect/sql/Migrator"
import type { SqlClient } from "effect/sql/SqlClient"
import type { SqlError } from "effect/sql/SqlError"
import * as Password from "./internal/password.ts"
import { PgClient } from "./PgClient.ts"

/**
 * @since 4.0.0
 */
export * from "effect/sql/Migrator"

/**
 * Runs PostgreSQL SQL migrations using the configured clients. Schema dumps use `pg_dump` and require child process, filesystem, and path services.
 *
 * @category running
 * @since 4.0.0
 */
export const run: <R2 = never>(
  options: Migrator.MigratorOptions<R2>
) => Effect.Effect<
  ReadonlyArray<readonly [id: number, name: string]>,
  Migrator.MigrationError | SqlError,
  | SqlClient
  | PgClient
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path
  | R2
> = Migrator.make({
  dumpSchema(path, table) {
    const pgDump = (args: Array<string>, password: string | undefined) =>
      Effect.gen(function*() {
        const sql = yield* PgClient
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
        const dump = yield* ChildProcess.make("pg_dump", [...args, "--no-owner", "--no-privileges"], {
          env: {
            PATH: (globalThis as any).process?.env.PATH,
            PGHOST: sql.config.host,
            PGPORT: sql.config.port?.toString(),
            PGUSER: sql.config.username,
            PGPASSWORD: password,
            PGDATABASE: sql.config.database,
            PGSSLMODE: sql.config.ssl ? "require" : "prefer"
          }
        }).pipe(spawner.string)

        return dump.replace(/^--.*$/gm, "")
          .replace(/^SET .*$/gm, "")
          .replace(/^SELECT pg_catalog\..*$/gm, "")
          .replace(/\n{2,}/gm, "\n\n")
          .trim()
      }).pipe(
        Effect.mapError((error) =>
          new Migrator.MigrationError({ kind: "Failed", message: error.message, cause: error })
        )
      )

    const pgDumpAll = Effect.gen(function*() {
      const sql = yield* PgClient
      const password = yield* Password.resolve(sql.config.password)
      const [schema, migrations] = yield* Effect.all([
        pgDump(["--schema-only"], password),
        pgDump(["--column-inserts", "--data-only", `--table=${table}`], password)
      ], { concurrency: 2 })
      return schema + "\n\n" + migrations
    })

    const pgDumpFile = (path: string) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path_ = yield* Path.Path
        const dump = yield* pgDumpAll
        yield* fs.makeDirectory(path_.dirname(path), { recursive: true })
        yield* fs.writeFileString(path, dump)
      }).pipe(
        Effect.mapError((error) =>
          new Migrator.MigrationError({ kind: "Failed", message: error.message, cause: error })
        )
      )

    return pgDumpFile(path)
  }
})

/**
 * Creates a layer that runs PostgreSQL migrations during layer construction, including `pg_dump`-based schema dump support when requested.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = <R>(
  options: Migrator.MigratorOptions<R>
): Layer.Layer<
  never,
  Migrator.MigrationError | SqlError,
  | SqlClient
  | PgClient
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path
  | R
> => Layer.effectDiscard(run(options))
