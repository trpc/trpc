/**
 * Runs database migrations for PGlite projects that use Effect SQL.
 *
 * This module re-exports the shared migration loaders and errors, then provides
 * `run` and `layer` helpers that apply pending migration files with the current
 * `SqlClient`. It does not require a separate PGlite service; the active SQL
 * client supplies the database connection.
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
> = Migrator.make({})

/**
 * Creates a layer that runs the configured SQL migrations during layer construction.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = <R>(
  options: Migrator.MigratorOptions<R>
): Layer.Layer<never, Migrator.MigrationError | SqlError, Client.SqlClient | R> => Layer.effectDiscard(run(options))
