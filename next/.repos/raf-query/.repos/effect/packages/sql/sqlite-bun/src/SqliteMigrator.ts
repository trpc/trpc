/**
 * Runs database migrations for Bun SQLite projects that use Effect SQL.
 *
 * This module re-exports the shared migration loaders and errors, then provides
 * `run` and `layer` helpers that apply pending migration files with the current
 * `SqlClient`. It does not add Bun-specific schema dump support; migration
 * execution is handled by the shared SQL migrator.
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
  options: Migrator.MigratorOptions<R2>
) => Effect.Effect<
  ReadonlyArray<readonly [id: number, name: string]>,
  Migrator.MigrationError | SqlError,
  Client.SqlClient | R2
> = Migrator.make({
  // dumpSchema(path, table) {
  //   const dump = (args: Array<string>) =>
  //     Effect.gen(function*() {
  //       const sql = yield* SqliteClient
  //       const dump = yield* pipe(
  //         Command.make("sqlite3", (sql as SqliteClient).config.filename, ...args),
  //         Command.string
  //       )
  //       return dump.replace(/^create table sqlite_sequence\(.*$/im, "")
  //         .replace(/\n{2,}/gm, "\n\n")
  //         .trim()
  //     }).pipe(
  //       Effect.mapError((error) => new Migrator.MigrationError({ kind: "Failed", message: error.message }))
  //     )
  //
  //   const dumpSchema = dump([".schema"])
  //
  //   const dumpMigrations = dump([
  //     "--cmd",
  //     `.mode insert ${table}`,
  //     `select * from ${table}`
  //   ])
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
  SqlError | Migrator.MigrationError,
  Client.SqlClient | R
> => Layer.effectDiscard(run(options))
