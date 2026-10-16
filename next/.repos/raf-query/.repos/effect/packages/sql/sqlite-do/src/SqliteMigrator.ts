/**
 * Runs database migrations for Durable Object SQLite storage that uses Effect
 * SQL.
 *
 * This module re-exports the shared `Migrator` loaders and error types, then
 * provides `run` and `layer` helpers that execute ordered migrations through the
 * current Durable Object SQLite `SqlClient`. Use it when a Durable
 * Object needs to create or upgrade its local schema during construction, before
 * repositories or request handlers use the object storage, or in tests that
 * exercise Durable Object persistence.
 *
 * Migrations are recorded in `effect_sql_migrations` by default and are loaded
 * using the shared `<id>_<name>` file or record-key convention. The underlying
 * storage is scoped to a Durable Object id, so running migrations for one object
 * does not update any other object instance; run the migrator against the same
 * `DurableObjectStorage`-backed client that the object uses for normal queries
 * so migrations can run in Cloudflare-managed transactions. These SQL
 * migrations are separate from Cloudflare's Durable Object class migrations, and
 * the Durable Object must already be configured with SQLite storage before this
 * module can apply schema changes. Repeated startup runs are expected and are
 * guarded by the migrations table, but request handling should wait until the
 * migration layer has finished. This adapter does not currently write SQLite
 * schema dumps for `schemaDirectory`.
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
