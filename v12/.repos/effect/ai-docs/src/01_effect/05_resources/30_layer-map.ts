/**
 * @title Dynamic resources with LayerMap
 *
 * Use `LayerMap.Service` to dynamically build and manage resources that are
 * keyed by some identifier, such as a tenant ID.
 */
import { Context, Effect, Layer, LayerMap, Schema } from "effect"

class DatabaseQueryError extends Schema.TaggedError<DatabaseQueryError>()("DatabaseQueryError", {
  tenantId: Schema.String,
  cause: Schema.Defect()
}) {}

type UserRecord = {
  readonly id: number
  readonly email: string
}

let nextConnectionId = 0

export class DatabasePool extends Context.Service<DatabasePool, {
  readonly tenantId: string
  readonly connectionId: number
  readonly query: (sql: string) => Effect.Effect<ReadonlyArray<UserRecord>, DatabaseQueryError>
}>()("app/DatabasePool") {
  // A layer factory that builds one pool per tenant.
  static readonly layer = (tenantId: string) =>
    Layer.effect(
      DatabasePool,
      Effect.acquireRelease(
        Effect.sync(() => {
          const connectionId = ++nextConnectionId

          return DatabasePool.of({
            tenantId,
            connectionId,
            query: Effect.fn("DatabasePool.query")((_sql: string) =>
              Effect.succeed([
                { id: 1, email: `admin@${tenantId}.example.com` },
                { id: 2, email: `ops@${tenantId}.example.com` }
              ])
            )
          })
        }),
        (pool) => Effect.logInfo(`Closing tenant pool ${pool.tenantId}#${pool.connectionId}`)
      )
    )
}

// extend `LayerMap.Service` to create a `LayerMap` service
export class PoolMap extends LayerMap.Service<PoolMap>()("app/PoolMap", {
  // `lookup` tells LayerMap how to build a layer for each tenant key.
  lookup: (tenantId: string) => DatabasePool.layer(tenantId),

  // You can also use the layers option for a static set of layers
  // layers: {
  //   acme: DatabasePool.layer("acme"),
  //   globex: DatabasePool.layer("globex")
  // },

  // If a pool is not used for this duration, it is released automatically.
  idleTimeToLive: "1 minute"
}) {}

const queryUsersForCurrentTenant = Effect.gen(function*() {
  // Run a query agnostic of the tenant. The correct pool will be provided by
  // the LayerMap.
  const pool = yield* DatabasePool
  return yield* pool.query("SELECT id, email FROM users ORDER BY id")
})

export const program = Effect.gen(function*() {
  yield* queryUsersForCurrentTenant.pipe(
    // Use `PoolMap.get` to access the pool for a specific tenant. The first
    // time this is called for a tenant, the pool will be built using the
    // `lookup` function defined in `PoolMap`. Subsequent calls will reuse the
    // cached pool until it is idle for too long or invalidated.
    Effect.provide(PoolMap.get("acme"))
  )

  // `PoolMap.invalidate` forces a key to rebuild on the next access.
  yield* PoolMap.invalidate("acme")
}).pipe(
  // Provide the `PoolMap` layer to the entire program.
  Effect.provide(PoolMap.layer)
)
