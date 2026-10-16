/**
 * Register effects that should have one active owner in an Effect cluster.
 *
 * `Singleton.make` wraps `Sharding.registerSingleton` in a `Layer`. When the
 * local runner owns the shard for the singleton's name and shard group,
 * sharding starts the effect; when ownership moves or the layer scope closes,
 * the running fiber is interrupted and the registration is removed.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import type { Scope } from "../Scope.ts"
import { Sharding } from "./Sharding.ts"

/**
 * Creates a layer that registers a singleton effect with `Sharding` under the
 * specified name and optional shard group.
 *
 * **When to use**
 *
 * Use to register a cluster-wide background effect as a `Layer`, so the effect
 * is started only by the runner that currently owns the singleton's shard.
 *
 * **Details**
 *
 * The returned layer requires `Sharding` and the services needed by `run`,
 * except for `Scope`. The registration is scoped to the layer; closing the
 * layer removes the singleton registration and stops the singleton fiber if it
 * is running.
 *
 * **Gotchas**
 *
 * - Registering the same singleton name in the same shard group more than once
 *   dies during registration.
 * - A `run` effect that completes normally is kept alive until the registration
 *   scope closes or shard ownership moves.
 * - Failures from `run` are converted to defects, so handle expected failures
 *   inside `run` when the singleton should keep running.
 *
 * @see {@link Sharding} for the lower-level service that registers singletons and manages shard ownership
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <E, R>(
  name: string,
  run: Effect.Effect<void, E, R>,
  options?: {
    readonly shardGroup?: string | undefined
  }
): Layer.Layer<never, never, Sharding | Exclude<R, Scope>> =>
  Layer.effectDiscard(Effect.gen(function*() {
    const sharding = yield* Sharding
    yield* sharding.registerSingleton(name, run, options)
  }))
