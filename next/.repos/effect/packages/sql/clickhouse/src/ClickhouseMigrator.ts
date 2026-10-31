/**
 * ClickHouse adapter for the shared Effect SQL migration runner.
 *
 * This module re-exports the common `Migrator` loaders and error types, then
 * provides `run` and `layer` helpers that apply ordered migrations through the
 * current ClickHouse `SqlClient`. `run` returns the applied migration IDs and
 * names, while `layer` runs the migrations during layer construction and
 * provides no services.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Migrator from "effect/sql/Migrator"
import type * as Client from "effect/sql/SqlClient"
import type { SqlError } from "effect/sql/SqlError"
import { ClientMethod } from "./ClickhouseClient.ts"

/**
 * @since 4.0.0
 */
export * from "effect/sql/Migrator"
export {
  /**
   * @stability unstable
   * @category loaders
   * @since 4.0.0
   */
  fromFileSystem
} from "effect/sql/MigratorFileSystem"

/**
 * Runs SQL migrations for ClickHouse using the supplied migrator options and
 * returns the applied migration IDs and names.
 *
 * @stability unstable
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
  transformWrites: (effect) => Effect.provideService(effect, ClientMethod, "command")
})

/**
 * Creates a layer that runs the configured ClickHouse migrations during layer
 * construction and provides no services.
 *
 * @stability unstable
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
