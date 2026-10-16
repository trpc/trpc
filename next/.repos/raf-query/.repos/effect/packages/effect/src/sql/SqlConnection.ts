/**
 * Low-level SQL connection contract used by driver integrations.
 *
 * A `Connection` is the driver-facing layer under `SqlClient`. It executes
 * already-compiled SQL with positional parameters and can return transformed
 * rows, raw driver results, streams, value arrays, or unprepared statement
 * results. This module also defines the scoped connection acquirer type, the
 * connection service tag, and the generic row shape.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import type { Effect } from "../Effect.ts"
import type { Scope } from "../Scope.ts"
import type { Stream } from "../Stream.ts"
import type { SqlError } from "./SqlError.ts"

/**
 * Low-level SQL driver connection capable of executing compiled SQL as
 * transformed rows, raw results, streams, value arrays, or unprepared
 * statements.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Connection {
  readonly execute: (
    sql: string,
    params: ReadonlyArray<unknown>,
    transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
  ) => Effect<ReadonlyArray<any>, SqlError>

  /**
   * Execute the specified SQL query and return the raw results directly from
   * underlying SQL client.
   */
  readonly executeRaw: (
    sql: string,
    params: ReadonlyArray<unknown>
  ) => Effect<unknown, SqlError>

  readonly executeStream: (
    sql: string,
    params: ReadonlyArray<unknown>,
    transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
  ) => Stream<any, SqlError>

  readonly executeValues: (
    sql: string,
    params: ReadonlyArray<unknown>
  ) => Effect<ReadonlyArray<ReadonlyArray<unknown>>, SqlError>

  readonly executeValuesUnprepared: (
    sql: string,
    params: ReadonlyArray<unknown>
  ) => Effect<ReadonlyArray<ReadonlyArray<unknown>>, SqlError>

  readonly executeUnprepared: (
    sql: string,
    params: ReadonlyArray<unknown>,
    transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
  ) => Effect<ReadonlyArray<any>, SqlError>
}

/**
 * Scoped effect that acquires a `Connection`, may fail with `SqlError`, and
 * requires a `Scope` for release.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Acquirer = Effect<Connection, SqlError, Scope>

/**
 * Lends a connection for the duration of one effect and takes it back on any
 * exit, without the caller opening a scope for it.
 *
 * **Details**
 *
 * A client that can do this offers it alongside its `Acquirer`, for statements
 * that finish with the effect that runs them. Long-lived work such as `stream`
 * still goes through the `Acquirer`, whose lease has to outlive the effect
 * that starts it.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Borrower = <A, E, R>(
  f: (connection: Connection) => Effect<A, E, R>
) => Effect<A, E | SqlError, R>

/**
 * Service tag for a low-level SQL `Connection`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Connection = Context.Service<Connection>("effect/sql/SqlConnection")

/**
 * Generic SQL row shape mapping column names to unknown values.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Row = { readonly [column: string]: unknown }
