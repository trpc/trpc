import { assert, describe, it } from "@effect/vitest"
import { Effect, FileSystem, Schema } from "effect"
import * as K8sHttpClient from "effect/cluster/K8sHttpClient"
import { HttpClient, HttpClientResponse } from "effect/http"
import { TestClock } from "effect/testing"

describe.concurrent("K8sHttpClient", () => {
  it.effect("uses the rotated token after the token cache expires", () => {
    let token = "token-1"
    const authorization: Array<string | undefined> = []

    return Effect.gen(function*() {
      const client = yield* K8sHttpClient.K8sHttpClient
      const request = client.get("/v1/pods")
      yield* request
      token = "token-2"
      yield* TestClock.adjust("61 seconds")
      yield* request
      assert.deepStrictEqual(authorization, ["Bearer token-1", "Bearer token-2"])
    }).pipe(
      Effect.provide(K8sHttpClient.layer),
      Effect.provideService(
        FileSystem.FileSystem,
        FileSystem.makeNoop({
          readFileString: () => Effect.sync(() => token)
        })
      ),
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.sync(() => {
            authorization.push(request.headers.authorization)
            return HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }))
          })
        )
      )
    )
  })

  describe("Pod", () => {
    it.effect("decodes null condition lastTransitionTime values", () =>
      Effect.gen(function*() {
        const pod = yield* Schema.decodeUnknownEffect(K8sHttpClient.Pod)({
          status: {
            phase: "Running",
            podIP: "10.0.0.1",
            hostIP: "10.0.0.2",
            conditions: [
              {
                type: "Initialized",
                status: "True",
                lastTransitionTime: null
              },
              {
                type: "Ready",
                status: "False",
                lastTransitionTime: null
              }
            ]
          }
        })

        assert.strictEqual(pod.status.conditions[0].lastTransitionTime, null)
        assert.strictEqual(pod.isReady, false)
        assert.strictEqual(pod.isReadyOrInitializing, true)
      }))
  })
})
