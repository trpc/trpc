import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Latch, PrimaryKey, Schema } from "effect"
import { ClusterSchema, Entity } from "effect/cluster"
import { Rpc } from "effect/rpc"
import { type Backend, make } from "./harness.ts"

class Request extends Schema.Class<Request>("ClusterTransportRequest")({
  id: Schema.String
}) {
  [PrimaryKey.symbol]() {
    return this.id
  }
}

const TransportEntity = Entity.make("ClusterIntegrationTransport", [
  Rpc.make("Persisted", {
    payload: Request,
    success: Schema.String
  }),
  Rpc.make("Volatile", {
    payload: Request,
    success: Schema.String
  }).annotate(ClusterSchema.Persisted, false)
]).annotateRpcs(ClusterSchema.Persisted, true)

describe("cluster transport integration", () => {
  for (const backend of ["pg", "mysql"] satisfies ReadonlyArray<Backend>) {
    it.live(`${backend}: treats a directional socket cut as RunnerUnavailable for volatile and recovers persisted`, () =>
      Effect.gen(function*() {
        const volatileEntered = Latch.makeUnsafe()
        const volatileGate = Latch.makeUnsafe()
        const persistedEntered = Latch.makeUnsafe()
        const persistedGate = Latch.makeUnsafe()
        let volatileAttempts = 0
        let persistedAttempts = 0

        const TransportEntityLayer = TransportEntity.toLayer({
          Persisted: Effect.fnUntraced(function*({ payload }) {
            persistedAttempts++
            persistedEntered.openUnsafe()
            yield* persistedGate.await
            return `persisted:${payload.id}`
          }),
          Volatile: Effect.fnUntraced(function*({ payload }) {
            volatileAttempts++
            volatileEntered.openUnsafe()
            yield* volatileGate.await
            return `volatile:${payload.id}`
          })
        })
        const cluster = yield* make({ backend, entities: TransportEntityLayer })
        const [runner] = yield* cluster.start(1)
        yield* cluster.waitForStableAssignments()
        const client = yield* cluster.getClient(TransportEntity)

        const volatile = yield* client("volatile").Volatile(
          new Request({ id: `${backend}-volatile` })
        ).pipe(Effect.forkChild({ startImmediately: true }))
        const persisted = yield* client("persisted").Persisted(
          new Request({ id: `${backend}-persisted` })
        ).pipe(Effect.forkChild({ startImmediately: true }))
        yield* cluster.waitUntil(
          "The volatile request did not enter the runner before the socket cut",
          Effect.as(volatileEntered.await, true)
        )
        yield* cluster.waitUntil(
          "The persisted request did not enter the runner before the socket cut",
          Effect.as(persistedEntered.await, true)
        )
        yield* cluster.cutSocket(runner, { peer: "client", direction: "inbound" })
        volatileGate.openUnsafe()
        persistedGate.openUnsafe()

        assert.strictEqual(yield* Fiber.join(volatile), `volatile:${backend}-volatile`)
        assert.strictEqual(yield* Fiber.join(persisted), `persisted:${backend}-persisted`)
        assert.strictEqual(runner.state(), "running")
        // Volatile requests have no storage fallback, so the second attempt
        // proves the cut surfaced as RunnerUnavailable and was retried.
        assert.strictEqual(volatileAttempts, 2)
        // The persisted caller instead recovered the stored reply.
        assert.strictEqual(persistedAttempts, 1)
      }))
  }
})
