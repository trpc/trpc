import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Latch, Schema } from "effect"
import { ClusterSchema, Entity } from "effect/cluster"
import { Rpc } from "effect/rpc"
import { type Backend, make } from "./harness.ts"

const ResidencyEntity = Entity.make("ClusterIntegrationResidency", [
  Rpc.make("Ping", {
    payload: { id: Schema.String },
    success: Schema.String
  }),
  Rpc.make("Hold", {
    payload: { id: Schema.String }
  })
]).annotateRpcs(ClusterSchema.Persisted, true)

let holdGate = Latch.makeUnsafe()

const ResidencyEntityLayer = ResidencyEntity.toLayer({
  Ping: ({ payload }) => Effect.succeed(payload.id),
  Hold: () => holdGate.await
}, { maxIdleTime: "1 second", concurrency: 2 })

describe("cluster residency integration", () => {
  for (const backend of ["pg", "mysql"] satisfies ReadonlyArray<Backend>) {
    it.live(`${backend}: stays at the entity cap and keeps residents moving`, () =>
      Effect.gen(function*() {
        holdGate = Latch.makeUnsafe()
        const cluster = yield* make({
          backend,
          entities: ResidencyEntityLayer,
          config: { maxResidentEntities: 3 }
        })
        const [runner] = yield* cluster.start(1)
        yield* cluster.waitForStableAssignments()
        const client = yield* cluster.getClient(ResidencyEntity)

        // fill every entity slot with a held request
        const held = yield* Effect.forEach(
          ["held-1", "held-2", "held-3"],
          (id) => client(id).Hold({ id }).pipe(Effect.forkChild({ startImmediately: true }))
        )
        yield* cluster.waitUntil(
          "The held entities did not become resident",
          Effect.map(runner.sharding.activeEntityCount, (count) => count === 3)
        )

        // a backlog of messages for new entity ids stays in storage
        for (let i = 1; i <= 8; i++) {
          yield* client(`backlog-${i}`).Ping({ id: `backlog-${i}` }, { discard: true })
        }

        // resident entities keep receiving messages while at the cap
        assert.strictEqual(yield* client("held-1").Ping({ id: "first" }), "first")
        assert.strictEqual(yield* client("held-2").Ping({ id: "second" }), "second")

        // the runner never spawned entities for the backlog
        assert.strictEqual(yield* runner.sharding.activeEntityCount, 3)
        assert.isAtLeast(yield* cluster.unprocessedMessageCount, 8)

        // release the held entities: as slots free up, the backlog drains in
        // waves without ever exceeding the cap
        holdGate.openUnsafe()
        yield* Fiber.joinAll(held)
        yield* cluster.waitUntil(
          "The backlog did not drain after entity slots freed up",
          Effect.gen(function*() {
            assert.isAtMost(yield* runner.sharding.activeEntityCount, 3)
            const counts = yield* cluster.messageCounts()
            return counts.unprocessed === 0 && counts.failed === 0
          }),
          "45 seconds"
        )
      }))
  }
})
