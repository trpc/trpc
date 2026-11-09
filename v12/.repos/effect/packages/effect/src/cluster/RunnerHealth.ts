/**
 * Checks whether cluster runners should be treated as alive.
 *
 * `RunnerHealth` is used by sharding when deciding whether assigned shards can
 * stay on a runner or need to move elsewhere. This module includes the
 * health-check service, a no-op layer that always reports runners as alive, a
 * ping-based checker, and a Kubernetes-based checker that looks at pod readiness
 * for the runner host.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as Schedule from "../Schedule.ts"
import type * as Scope from "../Scope.ts"
import * as K8s from "./K8sHttpClient.ts"
import type { RunnerAddress } from "./RunnerAddress.ts"
import * as Runners from "./Runners.ts"

/**
 * Represents the service used to check if a Runner is healthy.
 *
 * **Details**
 *
 * If a Runner is responsive, shards will not be re-assigned because the Runner may
 * still be processing messages. If a Runner is not responsive, then its
 * associated shards can and will be re-assigned to a different Runner.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class RunnerHealth extends Context.Service<
  RunnerHealth,
  {
    readonly isAlive: (address: RunnerAddress) => Effect.Effect<boolean>
  }
>()("effect/cluster/RunnerHealth") {}

/**
 * Layer that always considers a runner healthy.
 *
 * **When to use**
 *
 * Use when you need a runner-health layer for tests or local development where
 * active health checks are unnecessary.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerNoop = Layer.succeed(RunnerHealth, {
  isAlive: () => Effect.succeed(true)
})

/**
 * Creates a `RunnerHealth` service that pings runners through `Runners`, retrying
 * failed pings on a short schedule and treating a successful ping within the
 * timeout as healthy.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makePing: Effect.Effect<
  RunnerHealth["Service"],
  never,
  Runners.Runners | Scope.Scope
> = Effect.gen(function*() {
  const runners = yield* Runners.Runners
  const schedule = Schedule.spaced(500)

  function isAlive(address: RunnerAddress): Effect.Effect<boolean> {
    return runners.ping(address).pipe(
      Effect.timeout(10_000),
      Effect.retry({ times: 5, schedule }),
      Effect.isSuccess
    )
  }

  return RunnerHealth.of({ isAlive })
})

/**
 * Layer that pings runners directly to check whether they are healthy.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerPing: Layer.Layer<
  RunnerHealth,
  never,
  Runners.Runners
> = Layer.effect(RunnerHealth, makePing)

/**
 * Creates a `RunnerHealth` service that checks Kubernetes pod readiness for a
 * runner host, optionally scoped by namespace and label selector.
 *
 * **Gotchas**
 *
 * If the Kubernetes API check fails, the runner is treated as healthy.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeK8s = Effect.fnUntraced(function*(options?: {
  readonly namespace?: string | undefined
  readonly labelSelector?: string | undefined
}) {
  const allPods = yield* K8s.makeGetPods(options)

  return RunnerHealth.of({
    isAlive: (address) =>
      allPods.pipe(
        Effect.map((pods) => pods.get(address.host)?.isReadyOrInitializing ?? false),
        Effect.catchCause(() => Effect.succeed(true))
      )
  })
})

/**
 * Layer that checks Kubernetes pod readiness to determine whether a runner is
 * healthy.
 *
 * **Details**
 *
 * The provided `HttpClient` must trust the pod CA certificate and the pod service
 * account must be allowed to list pods.
 *
 * **Gotchas**
 *
 * If the Kubernetes API check fails, the runner is treated as healthy.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerK8s = (
  options?: {
    readonly namespace?: string | undefined
    readonly labelSelector?: string | undefined
  } | undefined
): Layer.Layer<
  RunnerHealth,
  never,
  K8s.K8sHttpClient
> => Layer.effect(RunnerHealth, makeK8s(options))
