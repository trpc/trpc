/**
 * @title Defining cluster entities
 *
 * Define distributed entity RPCs and run them in a cluster.
 */
import { NodeClusterSocket, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Ref, Schema } from "effect"
import { ClusterSchema, Entity, TestRunner } from "effect/cluster"
import { Rpc } from "effect/rpc"
import type { SqlClient } from "effect/sql"

export const Increment = Rpc.make("Increment", {
  payload: { amount: Schema.Int },
  success: Schema.Int
})

export const GetCount = Rpc.make("GetCount", {
  success: Schema.Int
})
  // If you want GetCount messages to be persisted, you can annotate the RPC
  // schema with `ClusterSchema.Persisted`.
  //
  // By default, messages are volatile and only sent over a network.
  .annotate(ClusterSchema.Persisted, true)

// `Entity.make` takes an array of Rpc definitions
export const Counter = Entity.make("Counter", [Increment, GetCount])

// Entity handlers can keep in-memory state while the entity is active.
// `maxIdleTime` controls passivation: if the entity is idle long enough, it is
// stopped and later recreated on demand.
export const CounterEntityLayer = Counter.toLayer(
  Effect.gen(function*() {
    const count = yield* Ref.make(0)

    return Counter.of({
      Increment: ({ payload }) => Ref.updateAndGet(count, (current) => current + payload.amount),
      GetCount: () =>
        Ref.get(count).pipe(
          // Add Rpc.fork to allow the GetCount handler to run concurrently with
          // Increment handlers.
          //
          // This opts-out of the default behavior where all handlers for a
          // given entity run sequentially.
          Rpc.fork
        )
    })
  }),
  { maxIdleTime: "5 minutes" }
)

// If you ever need to access an entity client, you can use the `client`
// property on the entity definition.
export const useCounter = Effect.gen(function*() {
  const clientFor = yield* Counter.client
  const counter = clientFor("counter-123")

  const afterIncrement = yield* counter.Increment({ amount: 1 })
  const currentCount = yield* counter.GetCount()

  console.log(`Count after increment: ${afterIncrement}, current count: ${currentCount}`)
})

// `SingleRunner.layer` is useful for local development / tests where you still
// want the cluster entity runtime model.
declare const SqlClientLayer: Layer.Layer<SqlClient.SqlClient>

// Create the cluster layer using `NodeClusterSocket.layer`
const ClusterLayer = NodeClusterSocket.layer().pipe(
  Layer.provide(SqlClientLayer)
)

// You can also use `TestRunner.layer` to run your entities in a single process,
// without any network communication and in-memory storage. This is useful for testing and
// development.
const ClusterLayerTest = TestRunner.layer

// Merge all your entity layers together and provide the cluster layer to run
// them in a cluster.
const EntitiesLayer = Layer.mergeAll(
  CounterEntityLayer
)

const ProductionLayer = EntitiesLayer.pipe(
  Layer.provide(ClusterLayer)
)

export const TestLayer = EntitiesLayer.pipe(
  // For testing, we can use `Layer.provideMerge` to tests can access storage
  // and other cluster services directly.
  Layer.provideMerge(ClusterLayerTest)
)

// Finally, run your app with the entities layer.
Layer.launch(ProductionLayer).pipe(
  NodeRuntime.runMain
)
