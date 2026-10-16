/**
 * libSQL migration support for Effect SQL applications.
 *
 * This module adapts the shared SQL migrator to libSQL. It re-exports the
 * common migration loaders and errors, then provides {@link run} and
 * {@link layer} helpers that apply pending migrations with the current
 * libSQL-backed `SqlClient`. `run` returns the applied migration IDs and names,
 * while `layer` runs migrations during layer construction and provides no
 * services.
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
