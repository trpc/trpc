import { assert, describe, it } from "@effect/vitest"
import { Effect, PrimaryKey, Schema } from "effect"
import { ClusterSchema, Entity } from "effect/cluster"
import { Rpc } from "effect/rpc"
import { type Backend, make } from "./harness.ts"

class Ping extends Schema.Class<Ping>("Ping")({
  id: Schema.String
}) {
  [PrimaryKey.symbol]() {
    return this.id
  }
}

const TestEntity = Entity.make("ClusterIntegrationSmoke", [
  Rpc.make("Ping", {
    payload: Ping,
    success: Schema.String
  })
]).annotateRpcs(ClusterSchema.Persisted, true)

const TestEntityLayer = TestEntity.toLayer({
  Ping: ({ payload }) => Effect.succeed(`pong:${payload.id}`)
})

describe("cluster integration smoke", () => {
  for (const backend of ["pg", "mysql"] satisfies ReadonlyArray<Backend>) {
    it.live(`${backend}: persists messages and rebalances after an abrupt runner death`, () =>
      Effect.gen(function*() {
        const cluster = yield* make({ backend, entities: TestEntityLayer })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()

        const client = yield* cluster.getClient(TestEntity)
        assert.strictEqual(
          yield* client("entity-1").Ping(new Ping({ id: "request-1" })),
          "pong:request-1"
        )

        yield* cluster.waitUntil(
          "The smoke entity had no active owner",
          Effect.map(cluster.ownerOfEntity(TestEntity, "entity-1"), (owner) => owner !== undefined)
        )
        const owner = yield* cluster.ownerOfEntity(TestEntity, "entity-1")
        yield* cluster.kill(owner!)
        yield* cluster.waitForStableAssignments()

        assert.strictEqual(
          yield* client("entity-1").Ping(new Ping({ id: "request-2" })),
          "pong:request-2"
        )
        assert.strictEqual(yield* cluster.repliedMessageCount, 2)
      }))
  }
})
