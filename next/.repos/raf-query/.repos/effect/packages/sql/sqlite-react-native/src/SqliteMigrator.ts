/**
 * Utilities for applying Effect SQL migrations to React Native SQLite databases.
 *
 * This module re-exports the shared `Migrator` loaders and error types, then
 * provides `run` and `layer` helpers that execute ordered migrations through the
 * current React Native SQLite `SqlClient`. Use it when a mobile app needs to
 * bring its on-device database schema up to date during startup, before opening
 * repositories or sync services, or in integration tests that create app-local
 * database files.
 *
 * React Native SQLite databases are scoped by the client configuration, so the
 * migrator should be run with the same `filename`, `location`, and encryption
 * key as the rest of the application. Migrations run through the package's
 * single serialized connection; by default statements use the synchronous
 * driver API and can block the JS thread, so long migration sets may want to run
 * under `SqliteClient.withAsyncQuery`. Mobile upgrades can be interrupted by app
 * suspension or process death, so keep migrations transaction-aware and avoid
 * assuming a fresh database on every launch.
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
 * Runs SQL migrations for a React Native SQLite database using the shared `Migrator` implementation and the current `SqlClient`.
 *
 * @category running
 * @since 4.0.0
 */
export const run: <R>(
  options: Migrator.MigratorOptions<R>
) => Effect.Effect<
  ReadonlyArray<readonly [id: number, name: string]>,
  SqlError | Migrator.MigrationError,
  Client.SqlClient | R
> = Migrator.make({})

/**
 * Creates a layer that runs the configured React Native SQLite migrations during layer construction and provides no services.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = <R>(
  options: Migrator.MigratorOptions<R>
): Layer.Layer<never, SqlError | Migrator.MigrationError, R | Client.SqlClient> => Layer.effectDiscard(run(options))
