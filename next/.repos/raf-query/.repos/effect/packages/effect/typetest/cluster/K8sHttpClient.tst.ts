import type { Effect } from "effect"
import type { K8sTypes as K8sTypesFromCluster } from "effect/cluster"
import * as EntityResource from "effect/cluster/EntityResource"
import type * as K8sHttpClient from "effect/cluster/K8sHttpClient"
import type * as K8sTypes from "effect/cluster/K8sTypes"
import { describe, expect, it } from "tstyche"

declare const createPod: Effect.Success<typeof K8sHttpClient.makeCreatePod>

describe("K8sHttpClient", () => {
  it("exports Kubernetes pod types for consumers", () => {
    const pod: K8sTypes.Pod = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "worker",
        namespace: "default",
        labels: { app: "worker" }
      },
      spec: {
        containers: [{
          name: "worker",
          image: "example/worker:latest",
          env: [{ name: "MODE", value: "cluster" }],
          ports: [{ containerPort: 8080 }],
          resources: {
            limits: { cpu: "1", memory: "128Mi" }
          }
        }],
        restartPolicy: "Never",
        volumes: [{
          name: "config",
          configMap: { name: "worker-config" }
        }]
      }
    }

    expect(pod).type.toBe<K8sTypesFromCluster.Pod>()
    expect(createPod).type.toBeCallableWith(pod)
  })

  it("retains pod specifications on EntityResource.makeK8sPod", () => {
    expect(EntityResource.makeK8sPod).type.toBeCallableWith({
      metadata: { name: "worker" },
      spec: { containers: [{ name: "worker" }] }
    })
  })

  it("rejects containers without a name", () => {
    expect(createPod).type.not.toBeCallableWith({
      metadata: { name: "worker" },
      spec: { containers: [{ image: "example/worker:latest" }] }
    })
  })
})
