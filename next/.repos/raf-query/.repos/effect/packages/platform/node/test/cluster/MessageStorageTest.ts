import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Exit, Fiber, Latch, Layer, Option, Schema } from "effect"
import {
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
  })
})

export const GetUserRpc = Rpc.make("GetUser", {
  payload: { id: Schema.Number }
})

export const makeRequest = Effect.fnUntraced(function*(options?: {
  readonly rpc?: Rpc.AnyWithProps
  readonly payload?: any
  readonly entityId?: string
  readonly shardId?: ShardId.ShardId
}) {
  const snowflake = yield* Snowflake.Generator
  const rpc = options?.rpc ?? GetUserRpc
  return new Message.OutgoingRequest({
    envelope: Envelope.makeRequest<any>({
      requestId: snowflake.nextUnsafe(),
      address: EntityAddress.make({
        shardId: options?.shardId ?? ShardId.make("default", 1),
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

export class LongKeyRpc extends Rpc.make("LongKeyRpc", {
  payload: {
    id: Schema.String
  },
  primaryKey: (value) => value.id
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
