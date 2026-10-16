import { assert, describe, expect, it } from "@effect/vitest"
import { Cause, Context, Effect, Exit, Fiber, Latch, Layer, Option, Schema } from "effect"
import {
  ClusterError,
  ClusterSchema,
  EntityAddress,
  EntityId,
  EntityType,
  Envelope,
  Message,
  MessageStorage,
  Reply,
  ShardId,
  ShardingConfig,
  Snowflake
} from "effect/cluster"
import { Headers } from "effect/http"
import { Rpc, RpcSchema } from "effect/rpc"
import { TestClock } from "effect/testing"

const MemoryLayer = MessageStorage.layerMemory.pipe(
  Layer.provideMerge(Snowflake.layerGenerator),
  Layer.provide(ShardingConfig.layerDefaults)
)

describe("MessageStorage", () => {
  describe("memory", () => {
    it.effect("removes the primary-key index when clearing an address", () =>
      Effect.gen(function*() {
        const driver = yield* MessageStorage.MemoryDriver
        const address = EntityAddress.make({
          shardId: ShardId.make("default", 1),
          entityType: EntityType.make("Repro"),
          entityId: EntityId.make("one")
        })
        const envelope: Envelope.PartialRequestEncoded = {
          _tag: "Request",
          requestId: "1",
          address: { shardId: { group: "default", id: 1 }, entityType: "Repro", entityId: "one" },
          tag: "Repro",
          payload: {},
          headers: {}
        }
        yield* driver.encoded.saveEnvelope({ envelope, primaryKey: "dedup-key", deliverAt: null })
        yield* driver.encoded.clearAddress(address)
        const result = yield* driver.encoded.saveEnvelope({
          envelope: { ...envelope, requestId: "2" },
          primaryKey: "dedup-key",
          deliverAt: null
        })
        expect(result._tag).toEqual("Success")
      }).pipe(Effect.provide(MessageStorage.MemoryDriver.layer)))

    it.effect("removes a queued Interrupt when clearing an address", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const snowflake = yield* Snowflake.Generator
        const request = yield* makeRequest()
        yield* storage.saveRequest(request)
        yield* storage.saveEnvelope(Message.OutgoingEnvelope.interrupt({
          id: snowflake.nextUnsafe(),
          requestId: request.envelope.requestId,
          address: request.envelope.address
        }))

        yield* storage.clearAddress(request.envelope.address)

        const messages = yield* storage.unprocessedMessages([request.envelope.address.shardId])
        expect(messages.map(({ envelope }) => envelope._tag)).toEqual([])
      }).pipe(Effect.provide(MemoryLayer)))

    it.effect("encoded unprocessedMessages fails closed for an empty address filter", () =>
      Effect.gen(function*() {
        const driver = yield* MessageStorage.MemoryDriver
        const envelope: Envelope.PartialRequestEncoded = {
          _tag: "Request",
          requestId: "1",
          address: { shardId: { group: "default", id: 1 }, entityType: "Repro", entityId: "one" },
          tag: "Repro",
          payload: {},
          headers: {}
        }
        yield* driver.encoded.saveEnvelope({ envelope, primaryKey: null, deliverAt: null })
        const messages = yield* driver.encoded.unprocessedMessages(["default:1"], 0, { addresses: [] })
        expect(messages).toHaveLength(0)
      }).pipe(Effect.provide(MessageStorage.MemoryDriver.layer)))

    it.effect("encoded resetAddresses fails closed for an empty address list", () =>
      Effect.gen(function*() {
        const driver = yield* MessageStorage.MemoryDriver
        const envelope: Envelope.PartialRequestEncoded = {
          _tag: "Request",
          requestId: "1",
          address: { shardId: { group: "default", id: 1 }, entityType: "Repro", entityId: "one" },
          tag: "Repro",
          payload: {},
          headers: {}
        }
        yield* driver.encoded.saveEnvelope({ envelope, primaryKey: null, deliverAt: null })
        const claimed = yield* driver.encoded.unprocessedMessages(["default:1"], 0)
        expect(claimed).toHaveLength(1)
        yield* driver.encoded.resetAddresses([])
        const messages = yield* driver.encoded.unprocessedMessages(["default:1"], 1)
        expect(messages).toHaveLength(0)
      }).pipe(Effect.provide(MessageStorage.MemoryDriver.layer)))

    it.effect("resetRequests with no IDs leaves existing claims untouched", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeRequest()
        yield* storage.saveRequest(request)
        expect(yield* storage.unprocessedMessages([request.envelope.address.shardId])).toHaveLength(1)
        yield* storage.resetRequests([])
        const driver = yield* MessageStorage.MemoryDriver
        yield* driver.encoded.resetRequests([])
        expect(yield* storage.unprocessedMessages([request.envelope.address.shardId])).toHaveLength(0)
      }).pipe(Effect.provide(MemoryLayer)))

    it.effect("resetRequests releases only the selected request at a shared address", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const selected = yield* makeRequest()
        const unrelated = yield* makeRequest()
        yield* storage.saveRequest(selected)
        yield* storage.saveRequest(unrelated)
        const shards = [selected.envelope.address.shardId]
        expect(yield* storage.unprocessedMessages(shards)).toHaveLength(2)
        yield* storage.resetRequests([selected.envelope.requestId])
        const messages = yield* storage.unprocessedMessages(shards)
        expect(messages.map((message) => message.envelope.requestId)).toEqual([selected.envelope.requestId])
        expect(yield* storage.unprocessedMessages(shards)).toHaveLength(0)
      }).pipe(Effect.provide(MemoryLayer)))

    it.effect("resetRequests preserves chunk replies, exit replies, and completed state", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const streaming = yield* makeRequest({ rpc: StreamRpc, payload: StreamRpc.payloadSchema.make({ id: 123 }) })
        const completed = yield* makeRequest()
        yield* storage.saveRequest(streaming)
        yield* storage.saveRequest(completed)
        yield* storage.saveReply(yield* makeChunkReply(streaming))
        yield* storage.saveReply(yield* makeReply(completed))
        const replies = yield* storage.repliesFor([streaming, completed])
        expect(replies).toHaveLength(2)
        const shards = [streaming.envelope.address.shardId]
        expect(yield* storage.unprocessedMessages(shards)).toHaveLength(1)
        yield* storage.resetRequests([streaming.envelope.requestId, completed.envelope.requestId])
        const messages = yield* storage.unprocessedMessages(shards)
        expect(messages.map((message) => message.envelope.requestId)).toEqual([streaming.envelope.requestId])
        expect(yield* storage.repliesFor([streaming, completed])).toEqual(replies)
      }).pipe(Effect.provide(MemoryLayer)))

    it.effect("saves a request", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeRequest()
        const result = yield* storage.saveRequest(request)
        expect(result._tag).toEqual("Success")
        const messages = yield* storage.unprocessedMessages([request.envelope.address.shardId])
        expect(messages).toHaveLength(1)
      }).pipe(Effect.provide(MemoryLayer)))

    it.effect("detects duplicates", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        yield* storage.saveRequest(
          yield* makeRequest({
            rpc: PrimaryKeyTest,
            payload: PrimaryKeyTest.payloadSchema.make({ id: 123 })
          })
        )
        const result = yield* storage.saveRequest(
          yield* makeRequest({
            rpc: PrimaryKeyTest,
            payload: PrimaryKeyTest.payloadSchema.make({ id: 123 })
          })
        )
        expect(result._tag).toEqual("Duplicate")
      }).pipe(Effect.provide(MemoryLayer)))

    it.effect("unprocessedMessages excludes complete requests", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeRequest()
        yield* storage.saveRequest(request)
        yield* storage.saveReply(yield* makeReply(request))
        const messages = yield* storage.unprocessedMessages([request.envelope.address.shardId])
        expect(messages).toHaveLength(0)
      }).pipe(Effect.provide(MemoryLayer)))
    it.effect("unprocessedMessages honors the limit option", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        for (let i = 1; i <= 5; i++) {
          yield* storage.saveRequest(yield* makeRequest({ payload: { id: i }, entityId: String(i) }))
        }
        const shardId = ShardId.make("default", 1)
        const messages = yield* storage.unprocessedMessages([shardId], { limit: 3 })
        expect(messages).toHaveLength(3)
        expect(messages.map((m: any) => m.envelope.payload.id)).toEqual([1, 2, 3])
        const remaining = yield* storage.unprocessedMessages([shardId])
        expect(remaining.map((m: any) => m.envelope.payload.id)).toEqual([4, 5])
      }).pipe(Effect.provide(MemoryLayer)))

    it.effect("unprocessedMessages filters by address", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        for (let i = 1; i <= 4; i++) {
          yield* storage.saveRequest(yield* makeRequest({ payload: { id: i }, entityId: String(i) }))
        }
        const shardId = ShardId.make("default", 1)
        const address = (entityId: string) =>
          EntityAddress.make({
            shardId,
            entityType: EntityType.make("test"),
            entityId: EntityId.make(entityId)
          })
        const messages = yield* storage.unprocessedMessages([shardId], {
          addresses: [address("2"), address("4")]
        })
        expect(messages.map((m: any) => m.envelope.payload.id)).toEqual([2, 4])
        // an empty address filter returns nothing
        const none = yield* storage.unprocessedMessages([shardId], { addresses: [] })
        expect(none).toHaveLength(0)
      }).pipe(Effect.provide(MemoryLayer)))

    it.effect("resetAddresses makes claimed messages eligible again", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        for (let i = 1; i <= 4; i++) {
          yield* storage.saveRequest(yield* makeRequest({ payload: { id: i }, entityId: String(i) }))
        }
        const shardId = ShardId.make("default", 1)
        yield* storage.unprocessedMessages([shardId], { limit: 3 })
        yield* storage.resetAddresses(["1", "3"].map((entityId) =>
          EntityAddress.make({
            shardId,
            entityType: EntityType.make("test"),
            entityId: EntityId.make(entityId)
          })
        ))

        const messages = yield* storage.unprocessedMessages([shardId])
        expect(messages.map((m: any) => m.envelope.payload.id)).toEqual([1, 3, 4])
      }).pipe(Effect.provide(MemoryLayer)))

    it.effect("repliesFor", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeRequest()
        yield* storage.saveRequest(request)
        let replies = yield* storage.repliesFor([request])
        expect(replies).toHaveLength(0)
        yield* storage.saveReply(yield* makeReply(request))
        replies = yield* storage.repliesFor([request])
        expect(replies).toHaveLength(1)
        expect(replies[0].requestId).toEqual(request.envelope.requestId)
      }).pipe(Effect.provide(MemoryLayer)))

    it.effect("registerReplyHandler", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const latch = yield* Latch.make()
        const request = yield* makeRequest()
        yield* storage.saveRequest(request)
        const fiber = yield* storage.registerReplyHandler(
          new Message.OutgoingRequest({
            ...request,
            respond: () => latch.open
          })
        ).pipe(Effect.forkChild)
        yield* TestClock.adjust(1)
        yield* storage.saveReply(yield* makeReply(request))
        yield* latch.await
        yield* Fiber.await(fiber)
      }).pipe(Effect.provide(MemoryLayer)))

    it.effect("unregisterShardReplyHandlers fails parked waiters during rebalance", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeRequest()
        const fiber = yield* storage.registerReplyHandler(
          new Message.OutgoingRequest({
            ...request,
            respond: () => Effect.void
          })
        ).pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust(1)

        yield* storage.unregisterShardReplyHandlers(request.envelope.address.shardId)
        const exit = yield* Fiber.await(fiber)

        assert(Exit.isFailure(exit))
        const error = Cause.findErrorOption(exit.cause)
        assert(Option.isSome(error))
        assert(error.value instanceof ClusterError.EntityNotAssignedToRunner)
      }).pipe(Effect.provide(MemoryLayer)))

    it.effect("unregisterShardReplyHandlers annotates parked waiters during shutdown", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const request = yield* makeRequest()
        const fiber = yield* storage.registerReplyHandler(
          new Message.OutgoingRequest({
            ...request,
            respond: () => Effect.void
          })
        ).pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust(1)

        yield* storage.unregisterShardReplyHandlers(request.envelope.address.shardId, { interrupt: true })
        const exit = yield* Fiber.await(fiber)

        assert(Exit.isFailure(exit))
        assert(Cause.hasInterruptsOnly(exit.cause))
        assert(exit.cause.reasons.some((reason) =>
          reason._tag === "Interrupt" && reason.annotations.has(ClusterSchema.Abandon.key)
        ))
      }).pipe(Effect.provide(MemoryLayer)))

    it.effect("reply handlers receive the persisted defect fallback for unencodable replies", () =>
      Effect.gen(function*() {
        const storage = yield* MessageStorage.MessageStorage
        const snowflake = yield* Snowflake.Generator
        const latch = yield* Latch.make()
        const request = yield* makeRequest({ rpc: UnknownSuccessRpc })
        yield* storage.saveRequest(request)
        let received: Reply.Reply<any> | undefined
        const fiber = yield* storage.registerReplyHandler(
          new Message.OutgoingRequest({
            ...request,
            respond: (reply) => {
              received = reply
              return latch.open
            }
          })
        ).pipe(Effect.forkChild)
        yield* TestClock.adjust(1)
        yield* storage.saveReply(
          new Reply.ReplyWithContext({
            reply: new Reply.WithExit({
              id: snowflake.nextUnsafe(),
              requestId: request.envelope.requestId,
              exit: Exit.succeed(new Error("not json encodable")) as any
            }),
            context: request.context,
            rpc: request.rpc
          })
        )
        yield* latch.await
        yield* Fiber.await(fiber)
        expect(received?._tag).toEqual("WithExit")
        const exit = (received as Reply.WithExit<any>).exit
        expect(Exit.isFailure(exit)).toBe(true)
        expect(JSON.stringify(exit)).toContain("MalformedMessage")
        const stored = yield* storage.repliesForUnfiltered([request.envelope.requestId])
        expect(JSON.stringify(stored)).toContain("MalformedMessage")
      }).pipe(Effect.provide(MemoryLayer)))
  })
})

export const GetUserRpc = Rpc.make("GetUser", {
  payload: { id: Schema.Number }
})

const UnknownSuccessRpc = Rpc.make("UnknownSuccess", {
  payload: { id: Schema.Number },
  success: Schema.Unknown
})

export const makeRequest = Effect.fnUntraced(function*(options?: {
  readonly rpc?: Rpc.AnyWithProps
  readonly payload?: any
  readonly entityId?: string
}) {
  const snowflake = yield* Snowflake.Generator
  const rpc = options?.rpc ?? GetUserRpc
  return new Message.OutgoingRequest({
    envelope: Envelope.makeRequest<any>({
      requestId: snowflake.nextUnsafe(),
      address: EntityAddress.make({
        shardId: ShardId.make("default", 1),
        entityType: EntityType.make("test"),
        entityId: EntityId.make(options?.entityId ?? "1")
      }),
      tag: rpc._tag,
      payload: options?.payload ?? { id: 123 },
      traceId: "noop",
      spanId: "noop",
      sampled: false,
      headers: Headers.empty
    }),
    annotations: rpc.annotations,
    context: Context.empty() as any,
    rpc,
    lastReceivedReply: Option.none(),
    respond() {
      return Effect.void
    }
  })
})

export class PrimaryKeyTest extends Rpc.make("PrimaryKeyTest", {
  payload: {
    id: Schema.Number
  },
  primaryKey: (value) => value.id.toString()
}) {}

export class StreamRpc extends Rpc.make("StreamTest", {
  success: RpcSchema.Stream(Schema.Void, Schema.Never),
  payload: {
    id: Schema.Number
  },
  primaryKey: (value) => value.id.toString()
}) {}

export const makeReply = Effect.fnUntraced(function*(request: Message.OutgoingRequest<any>) {
  const snowflake = yield* Snowflake.Generator
  return new Reply.ReplyWithContext({
    reply: new Reply.WithExit({
      id: snowflake.nextUnsafe(),
      requestId: request.envelope.requestId,
      exit: Exit.void as any
    }),
    context: request.context,
    rpc: request.rpc
  })
})

export const makeAckChunk = Effect.fnUntraced(function*(
  request: Message.OutgoingRequest<any>,
  chunk: Reply.ReplyWithContext<any>
) {
  const snowflake = yield* Snowflake.Generator
  return new Message.OutgoingEnvelope({
    envelope: new Envelope.AckChunk({
      id: snowflake.nextUnsafe(),
      address: request.envelope.address,
      requestId: chunk.reply.requestId,
      replyId: chunk.reply.id
    }),
    rpc: request.rpc
  })
})

export const makeChunkReply = Effect.fnUntraced(function*(request: Message.OutgoingRequest<any>, sequence = 0) {
  const snowflake = yield* Snowflake.Generator
  return new Reply.ReplyWithContext({
    reply: new Reply.Chunk({
      id: snowflake.nextUnsafe(),
      requestId: request.envelope.requestId,
      sequence,
      values: [undefined]
    }),
    context: request.context,
    rpc: request.rpc
  })
})

export const makeEmptyReply = (request: Message.OutgoingRequest<any>) => {
  return new Reply.ReplyWithContext({
    reply: Reply.Chunk.emptyFrom(request.envelope.requestId),
    context: request.context,
    rpc: request.rpc
  })
}
