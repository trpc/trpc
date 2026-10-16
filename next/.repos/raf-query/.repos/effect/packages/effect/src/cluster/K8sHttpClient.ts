/**
 * HTTP client support for talking to the Kubernetes API from code running
 * inside a cluster. The module builds a `K8sHttpClient` service on top of the
 * shared HTTP client, points requests at the in-cluster API endpoint, and uses
 * the mounted service-account token when one is available.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as FileSystem from "../FileSystem.ts"
import { identity } from "../Function.ts"
import * as HttpClient from "../http/HttpClient.ts"
import * as HttpClientError from "../http/HttpClientError.ts"
import * as HttpClientRequest from "../http/HttpClientRequest.ts"
import * as HttpClientResponse from "../http/HttpClientResponse.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Result from "../Result.ts"
import * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import type { Pod as K8sPod } from "./K8sTypes.ts"

/**
 * Service tag for the HTTP client used to call the Kubernetes API.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class K8sHttpClient extends Context.Service<
  K8sHttpClient,
  HttpClient.HttpClient
>()("effect/cluster/K8sHttpClient") {}

/**
 * Layer that configures `K8sHttpClient` for the in-cluster Kubernetes API.
 *
 * **Details**
 *
 * It targets `https://kubernetes.default.svc/api`, adds the service-account
 * bearer token when available, requires successful HTTP statuses, and retries
 * transient failures.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<
  K8sHttpClient,
  never,
  HttpClient.HttpClient | FileSystem.FileSystem
> = Layer.effect(
  K8sHttpClient,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const token = yield* fs.readFileString("/var/run/secrets/kubernetes.io/serviceaccount/token").pipe(
      Effect.option
    )
    return (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl("https://kubernetes.default.svc/api")),
      token._tag === "Some" ? HttpClient.mapRequest(HttpClientRequest.bearerToken(token.value.trim())) : identity,
      HttpClient.filterStatusOk,
      HttpClient.retryTransient({
        schedule: Schedule.spaced(5000)
      })
    )
  })
)

/**
 * Creates a cached effect that fetches running Kubernetes pods.
 *
 * **Details**
 *
 * The request can be limited by namespace and label selector, and the result is a
 * map keyed by pod IP address.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeGetPods: (
  options?: {
    readonly namespace?: string | undefined
    readonly labelSelector?: string | undefined
  } | undefined
) => Effect.Effect<
  Effect.Effect<Map<string, Pod>, HttpClientError.HttpClientError | Schema.SchemaError, never>,
  never,
  K8sHttpClient
> = Effect.fnUntraced(function*(options?: {
  readonly namespace?: string | undefined
  readonly labelSelector?: string | undefined
}) {
  const client = yield* K8sHttpClient

  const getPods = HttpClientRequest.get(
    options?.namespace ? `/v1/namespaces/${options.namespace}/pods` : "/v1/pods"
  ).pipe(
    HttpClientRequest.setUrlParam("fieldSelector", "status.phase=Running"),
    options?.labelSelector ? HttpClientRequest.setUrlParam("labelSelector", options.labelSelector) : identity
  )

  return yield* client.execute(getPods).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(PodList)),
    Effect.map((list) => {
      const pods = new Map<string, Pod>()
      for (let i = 0; i < list.items.length; i++) {
        const pod = list.items[i]
        pods.set(pod.status.podIP, pod)
      }
      return pods
    }),
    Effect.tapCause((cause) => Effect.logWarning("Failed to fetch pods from Kubernetes API", cause)),
    Effect.cachedWithTTL("10 seconds")
  )
})

/**
 * Creates a scoped function that ensures a Kubernetes pod exists and waits until
 * it is ready.
 *
 * **Details**
 *
 * The pod defaults to the `default` namespace and is deleted when the surrounding
 * scope closes.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeCreatePod = Effect.gen(function*() {
  const client = yield* K8sHttpClient

  return Effect.fnUntraced(function*(spec: K8sPod) {
    spec = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        namespace: "default",
        ...spec.metadata
      },
      ...spec
    }
    const namespace = spec.metadata?.namespace ?? "default"
    const name = spec.metadata!.name!
    const readPodRaw = HttpClientRequest.get(`/v1/namespaces/${namespace}/pods/${name}`).pipe(
      client.execute
    )
    const readPod = readPodRaw.pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Pod)),
      Effect.asSome,
      Effect.retry({
        while: (e) => e._tag === "SchemaError",
        schedule: Schedule.spaced("1 seconds")
      }),
      Effect.catchFilter(
        (err) =>
          HttpClientError.isHttpClientError(err) && err.reason._tag === "StatusCodeError" &&
            err.reason.response.status === 404
            ? Result.succeed(err)
            : Result.fail(err),
        () => Effect.succeedNone
      ),
      Effect.orDie
    )
    const isPodFound = readPodRaw.pipe(
      Effect.as(true),
      Effect.catchFilter(
        (err) =>
          HttpClientError.isHttpClientError(err) && err.reason._tag === "StatusCodeError" &&
            err.reason.response.status === 404
            ? Result.succeed(err)
            : Result.fail(err),
        () => Effect.succeed(false)
      )
    )
    const createPod = HttpClientRequest.post(`/v1/namespaces/${namespace}/pods`).pipe(
      HttpClientRequest.bodyJsonUnsafe(spec),
      client.execute,
      Effect.catchFilter(
        (err) =>
          HttpClientError.isHttpClientError(err) && err.reason._tag === "StatusCodeError" &&
            err.reason.response.status === 409
            ? Result.succeed(err)
            : Result.fail(err),
        () => readPod
      ),
      Effect.tapCause(Effect.logInfo),
      Effect.orDie
    )
    const deletePod = HttpClientRequest.delete(`/v1/namespaces/${namespace}/pods/${name}`).pipe(
      client.execute,
      Effect.flatMap((res) => res.json),
      Effect.catchFilter(
        (err) =>
          HttpClientError.isHttpClientError(err) && err.reason._tag === "StatusCodeError" &&
            err.reason.response.status === 404
            ? Result.succeed(err)
            : Result.fail(err),
        () => Effect.void
      ),
      Effect.tapCause(Effect.logInfo),
      Effect.orDie,
      Effect.asVoid
    )
    yield* Effect.addFinalizer(Effect.fnUntraced(function*() {
      yield* deletePod
      yield* isPodFound.pipe(
        Effect.repeat({
          until: (found) => !found,
          schedule: Schedule.spaced("3 seconds")
        }),
        Effect.orDie
      )
    }))

    let opod = Option.none<Pod>()
    while (Option.isNone(opod) || !opod.value.isReady) {
      if (Option.isNone(opod)) {
        yield* createPod
      }
      yield* Effect.sleep("3 seconds")
      opod = yield* readPod
    }
    return opod.value.status
  }, Effect.withSpan("K8sHttpClient.createPod"))
})

/**
 * Schema for the subset of Kubernetes Pod status used by cluster helpers.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class PodStatus extends Schema.Class<PodStatus>("@effect/cluster/K8sHttpClient/PodStatus")({
  phase: Schema.String,
  conditions: Schema.Array(Schema.Struct({
    type: Schema.String,
    status: Schema.String,
    lastTransitionTime: Schema.NullOr(Schema.String)
  })),
  podIP: Schema.String,
  hostIP: Schema.String
}) {}

/**
 * Schema for Kubernetes Pod values used by cluster helpers.
 *
 * **Details**
 *
 * The model exposes readiness helpers derived from the pod status conditions.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class Pod extends Schema.Class<Pod>("@effect/cluster/K8sHttpClient/Pod")({
  status: PodStatus
}) {
  get isReady(): boolean {
    for (let i = 0; i < this.status.conditions.length; i++) {
      const condition = this.status.conditions[i]
      if (condition.type === "Ready") {
        return condition.status === "True"
      }
    }
    return false
  }

  get isReadyOrInitializing(): boolean {
    let initializedAt: string | null | undefined
    let readyAt: string | null | undefined
    for (let i = 0; i < this.status.conditions.length; i++) {
      const condition = this.status.conditions[i]
      switch (condition.type) {
        case "Initialized": {
          if (condition.status !== "True") {
            return true
          }
          initializedAt = condition.lastTransitionTime
          break
        }
        case "Ready": {
          if (condition.status === "True") {
            return true
          }
          readyAt = condition.lastTransitionTime
          break
        }
      }
    }
    // if the pod is still booting up, consider it ready as it would have
    // already registered itself with RunnerStorage by now
    return initializedAt === readyAt
  }
}

const PodList = Schema.Struct({
  items: Schema.Array(Pod)
})
