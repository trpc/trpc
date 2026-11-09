import type * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import type { SqlError } from "effect/sql/SqlError"

/** @internal */
export const internalsKey = "~@effect/sql-pg/PgConnection/internals" as const

/** @internal */
export interface ConnectionInternals {
  /** The pool item identity: the unpinned base connection. */
  readonly base: object
  readonly deadError: () => SqlError | undefined
  /** Fired when a pool must stop reusing the connection. */
  readonly retireHooks: Set<() => void>
  /**
   * Installed by a multiplexed pool so that pinning the session also takes it
   * out of shared circulation for as long as the pin lasts. Every route to an
   * exclusive session goes through `pin`, including `stream` and `listen`, so
   * this is the one place that covers them all.
   */
  reserve?: Effect.Effect<void, never, Scope.Scope> | undefined
}

/** @internal */
export const connectionInternals = (connection: object): ConnectionInternals =>
  (connection as Record<typeof internalsKey, ConnectionInternals>)[internalsKey]
