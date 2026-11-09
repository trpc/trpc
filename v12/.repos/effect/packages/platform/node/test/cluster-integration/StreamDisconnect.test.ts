import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Queue, Schema, Stream } from "effect"
import { ClusterSchema, Entity, EntityAddress, EntityId, EntityType, type Envelope, Snowflake } from "effect/cluster"
import { Headers } from "effect/http"
import { Rpc } from "effect/rpc"
import { make, makeRawRunnerClient } from "./harness.ts"

const WatchRpc = Rpc.make("Watch", { payload: { id: Schema.String }, success: Schema.Int, stream: true })
const WatchEntity = Entity.make("ClusterIntegrationStreamDisconnect", [WatchRpc])
  .annotateRpcs(ClusterSchema.Persisted, false)

const setup = Effect.fnUntraced(function*() {
  const counts = { starts: 0, stops: 0 }
  const layer = WatchEntity.toLayer({
    Watch: () => {
      counts.starts++
      return Rpc.fork(Stream.never.pipe(Stream.ensuring(Effect.sync(() => {
        counts.stops++
      }))))
    }
  })
  const cluster = yield* make({ backend: "pg", entities: layer })
  const [owner] = yield* cluster.start(1)
  yield* cluster.waitForStableAssignments()
  const entityId = "watch-1"
  return { cluster, counts, owner, entityId }
})

describe("cross-runner disconnect cleanup", () => {
  it.live("dead caller: socket closed with no further messages", () =>
    Effect.gen(function*() {
      const { cluster, counts, owner, entityId } = yield* setup()
      const raw = yield* makeRawRunnerClient(owner)
      const id = EntityId.make(entityId)
      const snowflake = yield* Snowflake.Generator.pipe(Effect.provide(Snowflake.layerGenerator))
      const request: Envelope.PartialRequest = {
        _tag: "Request",
        requestId: snowflake.nextUnsafe(),
        address: EntityAddress.make({
          shardId: owner.sharding.getShardId(id, WatchEntity.getShardGroup(id)),
          entityType: EntityType.make(WatchEntity.type),
          entityId: id
        }),
        tag: "Watch",
        payload: yield* Schema.encodeEffect(raw.codecFor(WatchRpc.payloadSchema))({ id: "x" }),
        headers: Headers.empty
      }
      const caller = yield* raw.client.Stream({ request, persisted: false }, { asQueue: true }).pipe(
        Effect.flatMap((queue) => Effect.forever(Queue.take(queue))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      yield* cluster.waitUntil("host handler did not start", Effect.sync(() => counts.starts === 1))
      assert.deepStrictEqual(counts, { starts: 1, stops: 0 })

      // The caller "dies": its socket closes and nothing else is ever sent.
      yield* raw.disconnect
      yield* cluster.waitUntil("host handler did not stop after the caller died", Effect.sync(() => counts.stops === 1))
      assert.deepStrictEqual(counts, { starts: 1, stops: 1 })
      yield* Fiber.interrupt(caller)
    }))
})
