import { assert, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Layer, Option, PubSub, Queue, Schema, Scope, Stream } from "effect"
import {
  ClusterSchema,
  Entity,
  EntityAddress,
  EntityId,
  EntityType,
  Envelope,
  Message,
  MessageStorage,
  RunnerHealth,
  Runners,
  RunnerServer,
  RunnerStorage,
  Sharding,
  ShardingConfig,
  Snowflake
} from "effect/cluster"
import { Headers } from "effect/http"
import { Rpc, RpcMessage, type RpcSerialization, RpcServer, RpcTest } from "effect/rpc"
import { TestClock } from "effect/testing"

const ReproEntity = Entity.make("ReproRunnerServer", [
  Rpc.make("ReproStream", { success: Schema.Int, payload: { id: Schema.Number }, stream: true })
]).annotateRpcs(ClusterSchema.Persisted, false)

const HoleCodecEntity = Entity.make("HoleCodecEntity", [
  Rpc.make("Double", { success: Schema.Int, payload: { id: Schema.Number } })
]).annotateRpcs(ClusterSchema.Persisted, false)

const jsonCodec = Schema.toCodecJson as RpcSerialization.CodecFor

// A hole codec that is observably different from `Schema.toCodecJson`: the
// entity payload and the replies become JSON strings on the wire.
const codecForJsonString =
  (<S extends Schema.Top>(schema: S) =>
    Schema.fromJsonString(Schema.toCodecJson(schema as any))) as RpcSerialization.CodecFor

const layerProtocol = (codecFor: RpcSerialization.CodecFor) =>
  Layer.effect(RpcServer.Protocol)(
    Effect.map(Queue.unbounded<number>(), (disconnects) =>
      RpcServer.Protocol.of({
        run: () => Effect.never,
        disconnects,
        send: () => Effect.void,
        end: () => Effect.void,
        clientIds: Effect.succeed(new Set()),
        initialMessage: Effect.succeedNone,
        supportsAck: false,
        supportsTransferables: false,
        supportsSpanPropagation: false,
        supportsNotifications: false,
        codecFor
      }))
  )

const makeHandlers = (
  entities: Layer.Layer<never, never, any>,
  codecFor: RpcSerialization.CodecFor = jsonCodec
) =>
  RunnerServer.layerHandlers.pipe(
    Layer.provide(layerProtocol(codecFor)),
    Layer.provideMerge(entities),
    Layer.provideMerge(Sharding.layer),
    Layer.provideMerge(Snowflake.layerGenerator),
    Layer.provide(RunnerStorage.layerMemory),
    Layer.provide(RunnerHealth.layerNoop),
    Layer.provide(Runners.layerNoop),
    Layer.provideMerge(MessageStorage.layerMemory),
    Layer.provide(ShardingConfig.layer({
      entityMailboxCapacity: 10,
      entityTerminationTimeout: 0,
      entityMessagePollInterval: 5000,
      sendRetryInterval: 100,
      refreshAssignmentsInterval: 0
    }))
  )

const holeCodecHandlers = makeHandlers(
  HoleCodecEntity.toLayer({ Double: ({ payload }) => Effect.succeed(payload.id * 2) }),
  codecForJsonString
)

// A request for `entity`'s single RPC, addressed the way a sending runner would.
const makeRequest = (
  entity: Pick<Entity.Any, "type" | "getShardGroup">,
  entityId: string,
  options?: { readonly tag?: string; readonly payload?: unknown }
) =>
  Effect.gen(function*() {
    const sharding = yield* Sharding.Sharding
    const snowflake = yield* Snowflake.Generator
    const id = EntityId.make(entityId)
    const request: Envelope.PartialRequest = {
      _tag: "Request",
      requestId: snowflake.nextUnsafe(),
      address: EntityAddress.make({
        shardId: sharding.getShardId(id, entity.getShardGroup(id)),
        entityType: EntityType.make(entity.type),
        entityId: id
      }),
      tag: options?.tag ?? "ReproStream",
      payload: options?.payload ?? { id: 1 },
      headers: Headers.empty
    }
    return request
  })

// A runner RPC server whose replies are discarded.
const makeServer = RpcServer.makeNoSerialization(Runners.Rpcs, { onFromServer: () => Effect.void })

const writeRequest = (
  server: RpcServer.RpcServer<any>,
  tag: "Effect" | "Stream",
  request: Envelope.PartialRequest,
  options?: { readonly persisted?: boolean; readonly clientId?: number }
) =>
  server.write(options?.clientId ?? 0, {
    _tag: "Request",
    id: RpcMessage.RequestId(String(request.requestId)),
    tag,
    payload: { request, persisted: options?.persisted ?? false },
    headers: Headers.empty
  })

const incomingRequest = (envelope: Envelope.PartialRequest, callerScope?: Scope.Scope) =>
  new Message.IncomingRequest({
    envelope,
    lastSentReply: Option.none(),
    respond: () => Effect.void,
    codecFor: jsonCodec,
    callerScope
  })

it.effect("completes a successful runner stream", () =>
  Effect.gen(function*() {
    yield* TestClock.adjust(1)
    const snowflake = yield* Snowflake.Generator
    const request = yield* makeRequest(ReproEntity, "one")
    const client = yield* RpcTest.makeClient(Runners.Rpcs)
    const queue = yield* client.Stream({ request, persisted: false }, { asQueue: true })
    const first = yield* Queue.take(queue).pipe(Effect.timeout("1 second"), TestClock.withLive)
    if (first._tag !== "Chunk") return assert.fail("expected the stream value before the terminal reply")
    assert.deepStrictEqual(first.values, [1])
    yield* client.Envelope({
      envelope: new Envelope.AckChunk({
        id: snowflake.nextUnsafe(),
        address: request.address,
        requestId: request.requestId,
        replyId: Snowflake.Snowflake(first.id)
      }),
      persisted: false
    })
    const completion = yield* Effect.gen(function*() {
      const last = yield* Queue.take(queue)
      yield* Queue.take(queue).pipe(Effect.catchTag("Done", () => Effect.void))
      return last
    }).pipe(Effect.timeout("1 second"), TestClock.withLive)
    assert.strictEqual(completion._tag, "WithExit")
  }).pipe(Effect.provide(makeHandlers(
    ReproEntity.toLayer({ ReproStream: () => Stream.make(1) })
  ))))

it.effect("releases a non-persisted Effect handler when the runner caller disconnects", () =>
  Effect.gen(function*() {
    const started = yield* Deferred.make<void>()
    const stopped = yield* Deferred.make<void>()
    yield* Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const request = yield* makeRequest(HoleCodecEntity, "effect-disconnect", { tag: "Double" })
      const server = yield* makeServer
      yield* writeRequest(server, "Effect", request)
      yield* TestClock.adjust(1)
      assert.isTrue(yield* Deferred.isDone(started))
      assert.isFalse(yield* Deferred.isDone(stopped))
      yield* server.disconnect(0)
      yield* TestClock.adjust(1)
      assert.isTrue(yield* Deferred.isDone(stopped))
    }).pipe(Effect.provide(makeHandlers(
      HoleCodecEntity.toLayer({
        Double: () =>
          Rpc.fork(
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(Deferred.succeed(stopped, undefined))
            )
          )
      })
    )))
  }))

it.effect("forgets departed callers during rebuild without replaying or retaining mailbox slots", () =>
  Effect.gen(function*() {
    const rebuilding = yield* Deferred.make<void>()
    const releaseBuild = yield* Deferred.make<void>()
    const starts: Array<number> = []
    let builds = 0
    const entityLayer = ReproEntity.toLayer(
      Effect.gen(function*() {
        builds++
        if (builds === 2) {
          yield* Deferred.succeed(rebuilding, undefined)
          yield* Deferred.await(releaseBuild)
        }
        return {
          ReproStream: ({ payload }) => {
            starts.push(payload.id)
            return Rpc.fork(starts.length === 1 ? Stream.die("trigger entity rebuild") : Stream.never)
          }
        }
      }),
      { mailboxCapacity: 2 }
    )
    yield* Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const sharding = yield* Sharding.Sharding
      const server = yield* makeServer
      const request = (id: number) => makeRequest(ReproEntity, "mailbox-during-rebuild", { payload: { id } })
      const send = (clientId: number, id: number) =>
        Effect.flatMap(request(id), (request) => writeRequest(server, "Stream", request, { clientId }))
      yield* send(0, 1)
      yield* TestClock.adjust("5 seconds")
      assert.isTrue(yield* Deferred.isDone(rebuilding))
      yield* send(1, 2)
      yield* TestClock.adjust(1)
      assert.deepStrictEqual(starts, [1])

      const probe = (id: number) => Effect.flatMap(request(id), (request) => sharding.send(incomingRequest(request)))
      // A and B fill both slots, proving B was admitted before its disconnect.
      const full = yield* probe(3).pipe(Effect.flip)
      assert.strictEqual(full._tag, "MailboxFull")
      yield* server.disconnect(0).pipe(Effect.timeout("1 second"), TestClock.withLive)
      yield* server.disconnect(1).pipe(Effect.timeout("1 second"), TestClock.withLive)
      assert.isFalse(yield* Deferred.isDone(releaseBuild))
      yield* Deferred.succeed(releaseBuild, undefined)
      yield* TestClock.adjust(1)
      assert.deepStrictEqual(starts, [1])

      // Both the interrupted handler and the never-delivered request release
      // their slots. Neither may run again when the rebuild finishes.
      yield* probe(3)
      yield* probe(4)
      yield* TestClock.adjust(1)
      assert.deepStrictEqual(starts, [1, 3, 4])
    }).pipe(Effect.provide(makeHandlers(entityLayer)))
  }))

it.effect("releases a replayed handler when its caller disconnects during acquisition", () =>
  Effect.gen(function*() {
    const callerScope = yield* Effect.acquireRelease(Scope.make(), (scope) => Scope.close(scope, Exit.void))
    const crash = yield* Deferred.make<void>()
    const replaying = yield* Deferred.make<void>()
    const disconnected = yield* Deferred.make<void>()
    let starts = 0
    let stops = 0
    let crashes = 0
    const entityLayer = ReproEntity.toLayer({
      ReproStream: ({ payload }) => {
        if (payload.id === 1) {
          const invocation = ++starts
          return Rpc.fork(
            Stream.fromEffect(Effect.gen(function*() {
              if (invocation === 2) yield* Deferred.succeed(replaying, undefined)
              return yield* Effect.never
            })).pipe(Stream.ensuring(Effect.sync(() => {
              stops++
            })))
          )
        }
        return Rpc.fork(
          ++crashes === 1
            ? Stream.fromEffect(Deferred.await(crash).pipe(Effect.andThen(Effect.die("trigger entity rebuild"))))
            : Stream.never
        )
      }
    })
    yield* Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const sharding = yield* Sharding.Sharding
      const request = (id: number) => makeRequest(ReproEntity, "disconnect-during-replay", { payload: { id } })
      yield* sharding.send(incomingRequest(yield* request(1), callerScope))
      yield* sharding.send(incomingRequest(yield* request(2)))
      yield* TestClock.adjust(1)
      assert.strictEqual(starts, 1)
      assert.strictEqual(stops, 0)

      // Close from another fiber as soon as the replacement handler starts,
      // while the entity is still acquiring and replaying its requests.
      yield* Deferred.await(replaying).pipe(
        Effect.andThen(Scope.close(callerScope, Exit.void)),
        Effect.andThen(Deferred.succeed(disconnected, undefined)),
        Effect.forkChild({ startImmediately: true })
      )
      yield* Deferred.succeed(crash, undefined)
      yield* TestClock.adjust("5 seconds")
      assert.strictEqual(starts, 2)
      assert.isTrue(yield* Deferred.isDone(disconnected))
      // Both the original handler and its replacement must release resources.
      assert.strictEqual(stops, 2)
    }).pipe(Effect.provide(makeHandlers(entityLayer)))
  }))

it.effect("does not admit a request with an already-closed caller scope", () =>
  Effect.gen(function*() {
    let starts = 0
    yield* Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const sharding = yield* Sharding.Sharding
      const callerScope = yield* Scope.make()
      yield* Scope.close(callerScope, Exit.void)
      const closed = incomingRequest(yield* makeRequest(ReproEntity, "closed-scope"), callerScope)
      yield* Effect.exit(sharding.send(closed))
      yield* TestClock.adjust(1)
      assert.strictEqual(starts, 0)
      // A live request must still fit in the only mailbox slot.
      const live = incomingRequest(yield* makeRequest(ReproEntity, "closed-scope"))
      const admitted = yield* Effect.exit(sharding.send(live))
      assert.strictEqual(admitted._tag, "Success")
      yield* TestClock.adjust(1)
      assert.strictEqual(starts, 1)
    }).pipe(Effect.provide(makeHandlers(
      ReproEntity.toLayer({
        ReproStream: () => {
          starts++
          return Rpc.fork(Stream.never)
        }
      }, { mailboxCapacity: 1 })
    )))
  }))

for (const persisted of [false, true]) {
  it.effect(`caller disconnect preserves ${persisted ? "persisted" : "Uninterruptible"} streams`, () =>
    Effect.gen(function*() {
      const pubsub = yield* Effect.acquireRelease(PubSub.unbounded<number>(), PubSub.shutdown)
      const entity = persisted
        ? ReproEntity.annotateRpcs(ClusterSchema.Persisted, true)
        : ReproEntity.annotateRpcs(ClusterSchema.Uninterruptible, true)
      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const request = yield* makeRequest(entity, "protected-caller")
        if (persisted) {
          const driver = yield* MessageStorage.MemoryDriver
          yield* driver.encoded.saveEnvelope({
            envelope: yield* Schema.encodeEffect(Envelope.PartialJson)(request),
            primaryKey: null,
            deliverAt: null
          })
        }
        const server = yield* makeServer
        yield* writeRequest(server, "Stream", request, { persisted })
        yield* TestClock.adjust(1)
        assert.strictEqual(pubsub.subscribers.size, 1)
        yield* server.disconnect(0)
        yield* TestClock.adjust(1)
        assert.strictEqual(pubsub.subscribers.size, 1)

        if (!persisted) {
          // An exemption from caller cleanup must not block explicit interrupts.
          const sharding = yield* Sharding.Sharding
          const snowflake = yield* Snowflake.Generator
          yield* sharding.send(
            new Message.IncomingEnvelope({
              envelope: new Envelope.Interrupt({
                id: snowflake.nextUnsafe(),
                address: request.address,
                requestId: request.requestId
              })
            })
          )
          yield* TestClock.adjust(1)
          assert.strictEqual(pubsub.subscribers.size, 0)
        }
      }).pipe(Effect.provide(makeHandlers(
        entity.toLayer({ ReproStream: () => Rpc.fork(Stream.fromPubSub(pubsub)) })
      )))
    }))
}

it.effect("fills the entity payload and reply holes with the serialization's codec", () =>
  Effect.gen(function*() {
    yield* TestClock.adjust(1)
    // already encoded by the sender with the same hole codec
    const request = yield* makeRequest(HoleCodecEntity, "hole", { tag: "Double", payload: JSON.stringify({ id: 21 }) })

    const client = yield* RpcTest.makeClient(Runners.Rpcs)
    const reply = yield* client.Effect({ request, persisted: false }).pipe(
      Effect.timeout("1 second"),
      TestClock.withLive
    )

    assert.strictEqual(typeof reply, "string", "the reply hole must carry the codec's output")
    const decoded = JSON.parse(reply as any)
    assert.strictEqual(decoded._tag, "WithExit")
    assert.deepStrictEqual(decoded.exit, { _tag: "Success", value: 42 })
  }).pipe(Effect.provide(holeCodecHandlers)))
