import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import * as K8sHttpClient from "effect/cluster/K8sHttpClient"

describe.concurrent("K8sHttpClient", () => {
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
