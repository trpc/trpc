/**
 * MySQL adapter for the shared Effect SQL migration runner.
 *
 * This module re-exports the shared `Migrator` loaders and error types, then
 * provides `run` and `layer` helpers that apply ordered migrations through the
 * current mysql2-backed `SqlClient`. `run` returns the applied migration IDs
 * and names, while `layer` runs migrations during layer construction and
 * provides no services.
 *
 * @since 4.0.0
 */
import type * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Migrator from "effect/sql/Migrator"
import type * as Client from "effect/sql/SqlClient"
import type { SqlError } from "effect/sql/SqlError"

/**
 * @since 4.0.0
 */
export * from "effect/sql/Migrator"

/**
 * Runs SQL migrations using the configured `SqlClient`, returning the migrations that were applied.
 *
 * @category running
 * @since 4.0.0
 */
export const run: <R2 = never>(
  { loader, schemaDirectory, table }: Migrator.MigratorOptions<R2>
) => Effect.Effect<
  ReadonlyArray<readonly [id: number, name: string]>,
  Migrator.MigrationError | SqlError,
  Client.SqlClient | R2
> = Migrator.make({
  // TODO: re-add when Command module is available
  // dumpSchema(path, table) {
  //   const mysqlDump = (args: Array<string>) =>
  //     Effect.gen(function*() {
  //       const sql = yield* MysqlClient
  //       const dump = yield* pipe(
  //         Command.make(
  //           "mysqldump",
  //           ...(sql.config.host ? ["-h", sql.config.host] : []),
  //           ...(sql.config.port ? ["-P", sql.config.port.toString()] : []),
  //           ...(sql.config.username ? ["-u", sql.config.username] : []),
  //           ...(sql.config.password ? [`-p${Redacted.value(sql.config.password)}`] : []),
  //           ...(sql.config.database ? [sql.config.database] : []),
  //           "--skip-comments",
  //           "--compact",
  //           ...args
  //         ),
  //         Command.env({
  //           PATH: (globalThis as any).process?.env.PATH
  //         }),
  //         Command.string
  //       )
  //
  //       return dump.replace(/^\/\*.*$/gm, "")
  //         .replace(/\n{2,}/gm, "\n\n")
  //         .trim()
  //     }).pipe(
  //       Effect.mapError((error) => new Migrator.MigrationError({ kind: "Failed", message: error.message }))
  //     )
  //
  //   const dumpSchema = mysqlDump(["--no-data"])
  //
  //   const dumpMigrations = mysqlDump(["--no-create-info", "--tables", table])
  //
  //   const dumpAll = Effect.map(
  //     Effect.all([dumpSchema, dumpMigrations], { concurrency: 2 }),
  //     ([schema, migrations]) => schema + "\n\n" + migrations
  //   )
  //
  //   const dumpFile = (file: string) =>
  //     Effect.gen(function*() {
  //       const fs = yield* FileSystem
  //       const path = yield* Path
  //       const dump = yield* dumpAll
  //       yield* fs.makeDirectory(path.dirname(file), { recursive: true })
  //       yield* fs.writeFileString(file, dump)
  //     }).pipe(
  //       Effect.mapError((error) => new Migrator.MigrationError({ kind: "Failed", message: error.message }))
  //     )
  //
  //   return dumpFile(path)
  // }
})

/**
 * Creates a layer that runs the configured SQL migrations during layer construction.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = <R>(
  options: Migrator.MigratorOptions<R>
): Layer.Layer<
  never,
  Migrator.MigrationError | SqlError,
  Client.SqlClient | R
> => Layer.effectDiscard(run(options))
