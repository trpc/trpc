/**
 * Keeps resources available across cluster entity restarts.
 *
 * `EntityResource` is useful for long-lived resources tied to an entity
 * address, such as external processes, network clients, Kubernetes Pods, or
 * other handles that should survive routine shard movement. This module
 * includes the resource wrapper, a close scope that survives normal entity
 * restarts, a generic resource constructor, and a Kubernetes Pod resource
 * helper built on `K8sHttpClient`.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import { identity } from "../Function.ts"
import * as RcRef from "../RcRef.ts"
import * as Scope from "../Scope.ts"
import * as Entity from "./Entity.ts"
import * as K8sHttpClient from "./K8sHttpClient.ts"
import type { Pod as K8sPod } from "./K8sTypes.ts"
import type { Sharding } from "./Sharding.ts"

/**
 * Type identifier used to brand `EntityResource` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/cluster/EntityResource"

/**
 * Literal type of the `EntityResource` type identifier.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/cluster/EntityResource"

/**
 * A resource acquired inside a cluster entity and kept alive across restarts.
 *
 * **Details**
 *
 * `get` acquires or reuses the resource in the caller's scope, while `close`
 * invalidates it so its close scope can be released.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EntityResource<out A, out E = never> {
  readonly [TypeId]: TypeId
  readonly get: Effect.Effect<A, E, Scope.Scope>
  readonly close: Effect.Effect<void>
}

/**
 * Context service for a Scope that is only closed when the resource is explicitly closed.
 *
 * **When to use**
 *
 * Use when a cluster entity resource needs a scope that survives restarts and
 * closes only through the resource lifecycle.
 *
 * **Gotchas**
 *
 * It is not closed during restarts, due to shard movement or node shutdowns.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class CloseScope extends Context.Service<
  CloseScope,
  Scope.Scope
>()("effect/cluster/EntityResource/CloseScope") {}

/**
 * Creates an `EntityResource` that can be acquired inside a cluster entity.
 *
 * **When to use**
 *
 * Use when a cluster entity should lazily share an acquired resource across
 * messages and release it only on idle timeout or explicit close.
 *
 * **Details**
 *
 * The resource will only be fully released when the idle time to live is
 * reached, or when the `close` effect is called.
 *
 * **Gotchas**
 *
 * By default, the `idleTimeToLive` is infinite, meaning the resource will only
 * be released when `close` is called.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: <A, E, R>(options: {
  readonly acquire: Effect.Effect<A, E, R>
  readonly idleTimeToLive?: Duration.Input | undefined
  readonly acquireEagerly?: boolean | undefined
}) => Effect.Effect<
  EntityResource<A, E>,
  E,
  Scope.Scope | Exclude<R, CloseScope> | Sharding | Entity.CurrentAddress
> = Effect.fnUntraced(function*<A, E, R>(options: {
  readonly acquire: Effect.Effect<A, E, R>
  readonly idleTimeToLive?: Duration.Input | undefined
  readonly acquireEagerly?: boolean | undefined
}) {
  let shuttingDown = false

  const ref = yield* RcRef.make({
    acquire: Effect.gen(function*() {
      yield* Entity.keepAlive(true)

      const closeable = yield* Scope.make()

      yield* Effect.addFinalizer(
        Effect.fnUntraced(function*(exit) {
          if (shuttingDown) return
          yield* Scope.close(closeable, exit)
          yield* Entity.keepAlive(false)
        })
      )

      return yield* options.acquire.pipe(
        Effect.provideService(CloseScope, closeable)
      )
    }),
    idleTimeToLive: options.idleTimeToLive ?? Duration.infinity
  })

  yield* Effect.addFinalizer(() => {
    shuttingDown = true
    return Effect.void
  })

  if (options.acquireEagerly) {
    // Initialize the resource
    yield* Effect.scoped(RcRef.get(ref))
  }

  return identity<EntityResource<A, E>>({
    [TypeId]: TypeId,
    get: RcRef.get(ref),
    close: RcRef.invalidate(ref)
  })
})

/**
 * Creates an `EntityResource` backed by a Kubernetes Pod.
 *
 * **Details**
 *
 * The pod is created and waited on through `K8sHttpClient`, and is kept alive
 * until the resource is closed or its idle time to live expires.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeK8sPod: (
  spec: K8sPod,
  options?: {
    readonly idleTimeToLive?: Duration.Input | undefined
  } | undefined
) => Effect.Effect<
  EntityResource<K8sHttpClient.PodStatus>,
  never,
  Scope.Scope | Sharding | Entity.CurrentAddress | K8sHttpClient.K8sHttpClient
> = Effect.fnUntraced(function*(spec: K8sPod, options?: {
  readonly idleTimeToLive?: Duration.Input | undefined
}) {
  const createPod = yield* K8sHttpClient.makeCreatePod
  return yield* make({
    ...options,
    acquire: Effect.gen(function*() {
      const scope = yield* CloseScope
      return yield* createPod(spec).pipe(
        Scope.provide(scope)
      )
    })
  })
})
