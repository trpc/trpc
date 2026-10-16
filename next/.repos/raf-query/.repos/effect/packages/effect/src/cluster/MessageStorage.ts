/**
 * Stores Effect Cluster messages and replies behind a pluggable backend.
 *
 * `MessageStorage` is the boundary between cluster runner logic and the storage
 * system that keeps mailbox state recoverable. It saves requests, control
 * envelopes, and replies; finds unprocessed messages for assigned shards;
 * tracks duplicate requests; and manages reply handlers waiting for responses.
 * This module also includes the encoded storage-driver contract and no-op or
 * in-memory implementations for local use and tests.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import { Clock } from "../Clock.ts"
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import { constFalse, identity } from "../Function.ts"
import * as Latch from "../Latch.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import type { Predicate } from "../Predicate.ts"
import type * as Rpc from "../rpc/Rpc.ts"
import type * as RpcSerialization from "../rpc/RpcSerialization.ts"
import * as Schema from "../Schema.ts"
import { EntityNotAssignedToRunner, MalformedMessage, type PersistenceError } from "./ClusterError.ts"
import * as DeliverAt from "./DeliverAt.ts"
import type { EntityAddress } from "./EntityAddress.ts"
import * as Envelope from "./Envelope.ts"
import * as ClusterAbandon from "./internal/clusterAbandon.ts"
import * as Message from "./Message.ts"
import * as Reply from "./Reply.ts"
import * as ShardId from "./ShardId.ts"
import type { ShardingConfig } from "./ShardingConfig.ts"
import * as Snowflake from "./Snowflake.ts"

const codecForJson = Schema.toCodecJson as RpcSerialization.CodecFor

/**
 * Service for cluster mailbox persistence and reply delivery.
 *
 * **Details**
 *
 * It stores outgoing requests, control envelopes, and replies; reads unprocessed
 * messages; manages reply handlers; and provides transaction wrapping for storage
 * operations.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class MessageStorage extends Context.Service<MessageStorage, {
  /**
   * Save the provided message and its associated metadata.
   */
  readonly saveRequest: <R extends Rpc.Any>(
    envelope: Message.OutgoingRequest<R>
  ) => Effect.Effect<SaveResult<R>, PersistenceError | MalformedMessage>

  /**
   * Save the provided message and its associated metadata.
   */
  readonly saveEnvelope: (
    envelope: Message.OutgoingEnvelope
  ) => Effect.Effect<void, PersistenceError | MalformedMessage>

  /**
   * Save the provided `Reply` and its associated metadata.
   */
  readonly saveReply: <R extends Rpc.Any>(
    reply: Reply.ReplyWithContext<R>
  ) => Effect.Effect<void, PersistenceError | MalformedMessage>

  /**
   * Clear replies for the given request id. When options.expectedReplyId is
   * provided, clear only if it is still the latest reply at the storage boundary.
   * Without it, clear unconditionally.
   * Custom storage implementations must honor this condition to protect
   * workflows from stale concurrent resumes.
   */
  readonly clearReplies: (
    requestId: Snowflake.Snowflake,
    options?: { readonly expectedReplyId?: Snowflake.Snowflake | undefined }
  ) => Effect.Effect<void, PersistenceError>

  /**
   * Retrieves the replies for the specified requests.
   *
   * **Details**
   *
   * This returns:
   *
   * - Un-acknowledged chunk replies
   * - `WithExit` replies
   */
  readonly repliesFor: <R extends Rpc.Any>(
    requests: Iterable<Message.OutgoingRequest<R>>
  ) => Effect.Effect<Array<Reply.Reply<R>>, PersistenceError | MalformedMessage>

  /**
   * Retrieves the encoded replies for the specified request ids.
   */
  readonly repliesForUnfiltered: (
    requestIds: Iterable<Snowflake.Snowflake>
  ) => Effect.Effect<Array<Reply.Encoded>, PersistenceError | MalformedMessage>

  /**
   * Retrieves the request id for the specified primary key.
   */
  readonly requestIdForPrimaryKey: (
    options: {
      readonly address: EntityAddress
      readonly tag: string
      readonly id: string
    }
  ) => Effect.Effect<Option.Option<Snowflake.Snowflake>, PersistenceError>

  /**
   * For locally sent messages, register a handler to process the replies.
   */
  readonly registerReplyHandler: <R extends Rpc.Any>(
    message: Message.OutgoingRequest<R> | Message.IncomingRequest<R>
  ) => Effect.Effect<void, EntityNotAssignedToRunner>

  /**
   * Unregister the reply handler for the specified message.
   */
  readonly unregisterReplyHandler: (requestId: Snowflake.Snowflake) => Effect.Effect<void>

  /**
   * Unregister the reply handlers for the specified ShardId.
   *
   * By default the waiters are resumed with `EntityNotAssignedToRunner`, so
   * they can re-route the wait. With `interrupt: true` the waiters are
   * interrupted with a cluster-abandon annotation instead, for when the runner
   * is shutting down and the reply can never be observed here.
   */
  readonly unregisterShardReplyHandlers: (
    shardId: ShardId.ShardId,
    options?: { readonly interrupt?: boolean | undefined }
  ) => Effect.Effect<void>

  /**
   * Retrieves the unprocessed messages for the specified shards.
   *
   * **Details**
   *
   * A message is unprocessed when:
   *
   * - Requests that have no `WithExit` replies or no unacknowledged chunk replies
   * - The latest `AckChunk` envelope
   * - All `Interrupt` envelopes for unprocessed requests
   *
   * The `limit` option bounds the number of messages returned in a single
   * read, and the `addresses` option restricts the read to the provided
   * entity addresses. Only the returned messages are claimed; other messages
   * stay eligible for later reads.
   */
  readonly unprocessedMessages: (
    shardIds: Iterable<ShardId.ShardId>,
    options?: {
      readonly limit?: number | undefined
      readonly addresses?: ReadonlyArray<EntityAddress> | undefined
    } | undefined
  ) => Effect.Effect<Array<Message.Incoming<any>>, PersistenceError>

  /**
   * Retrieves the unprocessed messages by id.
   */
  readonly unprocessedMessagesById: <R extends Rpc.Any>(
    messageIds: Iterable<Snowflake.Snowflake>
  ) => Effect.Effect<Array<Message.Incoming<R>>, PersistenceError>

  /**
   * Reset the mailbox state for the provided shards.
   */
  readonly resetShards: (
    shardIds: Iterable<ShardId.ShardId>
  ) => Effect.Effect<void, PersistenceError>

  /**
   * Reset the mailbox state for the provided address.
   */
  readonly resetAddress: (
    address: EntityAddress
  ) => Effect.Effect<void, PersistenceError>

  /** Release request claims without changing replies or processed state. */
  readonly resetRequests: (
    requestIds: ReadonlyArray<Snowflake.Snowflake>
  ) => Effect.Effect<void, PersistenceError>

  /**
   * Reset the mailbox state for the provided addresses.
   */
  readonly resetAddresses: (
    addresses: ReadonlyArray<EntityAddress>
  ) => Effect.Effect<void, PersistenceError>

  /**
   * Clear all messages and replies for the provided address.
   */
  readonly clearAddress: (
    address: EntityAddress
  ) => Effect.Effect<void, PersistenceError>

  /**
   * Used to wrap requests with transactions.
   */
  readonly withTransaction: <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>
}>()("effect/cluster/MessageStorage") {}

/**
 * Result of saving a request or envelope into message storage.
 *
 * **Details**
 *
 * A duplicate result carries the original request ID and the last reply already
 * received for the duplicated request.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type SaveResult<R extends Rpc.Any> = SaveResult.Success | SaveResult.Duplicate<R>

/**
 * Constructors and matchers for decoded save results.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const SaveResult = Data.taggedEnum<SaveResult.Constructor>()

/**
 * Constructors and matchers for encoded save results returned by storage
 * drivers.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const SaveResultEncoded = Data.taggedEnum<SaveResult.Encoded>()

/**
 * Variants and helper types for `SaveResult`.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace SaveResult {
  /**
   * Encoded storage-driver form of `SaveResult`.
   *
   * **Details**
   *
   * Duplicate results contain an encoded last received reply instead of a decoded
   * reply.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Encoded = SaveResult.Success | SaveResult.DuplicateEncoded

  /**
   * Variant indicating that the message was saved as a new storage entry.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Success {
    readonly _tag: "Success"
  }

  /**
   * Variant indicating that the request duplicates an existing stored request.
   *
   * **Details**
   *
   * It carries the original request ID and the latest decoded reply, when one is
   * available.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Duplicate<R extends Rpc.Any> {
    readonly _tag: "Duplicate"
    readonly originalId: Snowflake.Snowflake
    readonly lastReceivedReply: Option.Option<Reply.Reply<R>>
  }

  /**
   * Encoded duplicate-save variant returned by lower-level storage drivers.
   *
   * **Details**
   *
   * It carries the original request ID and the latest encoded reply, when one is
   * available.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface DuplicateEncoded {
    readonly _tag: "Duplicate"
    readonly originalId: Snowflake.Snowflake
    readonly lastReceivedReply: Option.Option<Reply.Encoded>
  }

  /**
   * Generic tagged enum constructor type for `SaveResult`.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export interface Constructor extends Data.TaggedEnum.WithGenerics<1> {
    readonly taggedEnum: SaveResult<this["A"] extends Rpc.Any ? this["A"] : never>
  }
}

/**
 * Low-level storage-driver contract for encoded envelopes and replies.
 *
 * **Details**
 *
 * Implementations persist encoded messages, track primary keys and delayed
 * delivery, read unprocessed messages, and provide transaction wrapping.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export type Encoded = {
  /**
   * Save the provided message and its associated metadata.
   */
  readonly saveEnvelope: (
    options: {
      readonly envelope: Envelope.Encoded
      readonly primaryKey: string | null
      readonly deliverAt: number | null
    }
  ) => Effect.Effect<SaveResult.Encoded, PersistenceError>

  /**
   * Save the provided `Reply` and its associated metadata.
   */
  readonly saveReply: (reply: Reply.Encoded) => Effect.Effect<void, PersistenceError>

  /**
   * Remove the replies for the specified request. If options.expectedReplyId
   * is provided, compare it with the latest reply atomically before clearing.
   * Without it, clear unconditionally.
   * Custom storage implementations must honor this condition to protect
   * workflows from stale concurrent resumes.
   */
  readonly clearReplies: (
    requestId: Snowflake.Snowflake,
    options?: { readonly expectedReplyId?: Snowflake.Snowflake | undefined }
  ) => Effect.Effect<void, PersistenceError>

  /**
   * Retrieves the request id for the specified primary key.
   */
  readonly requestIdForPrimaryKey: (
    primaryKey: string
  ) => Effect.Effect<Option.Option<Snowflake.Snowflake>, PersistenceError>

  /**
   * Retrieves the replies for the specified requests.
   *
   * **Details**
   *
   * This returns:
   *
   * - Un-acknowledged chunk replies
   * - `WithExit` replies
   */
  readonly repliesFor: (requestIds: Arr.NonEmptyArray<string>) => Effect.Effect<
    Array<Reply.Encoded>,
    PersistenceError
  >

  /**
   * Retrieves the replies for the specified request ids.
   */
  readonly repliesForUnfiltered: (requestIds: Arr.NonEmptyArray<string>) => Effect.Effect<
    Array<Reply.Encoded>,
    PersistenceError
  >

  /**
   * Retrieves the unprocessed messages for the given shards.
   *
   * **Details**
   *
   * A message is unprocessed when:
   *
   * - Requests that have no `WithExit` replies or no unacknowledged chunk replies
   * - The latest `AckChunk` envelope
   * - All `Interrupt` envelopes for unprocessed requests
   *
   * The `limit` option bounds the number of rows returned by a single read,
   * and the `addresses` option restricts the read to the provided entity
   * addresses. Only the returned rows are claimed; other rows stay eligible
   * for later reads.
   */
  readonly unprocessedMessages: (
    shardIds: Arr.NonEmptyArray<string>,
    now: number,
    options?: {
      readonly limit?: number | undefined
      readonly addresses?: ReadonlyArray<EntityAddress> | undefined
    } | undefined
  ) => Effect.Effect<
    Array<{
      readonly envelope: Envelope.Encoded
      readonly lastSentReply: Option.Option<Reply.Encoded>
    }>,
    PersistenceError
  >

  /**
   * Retrieves the unprocessed messages by id.
   */
  readonly unprocessedMessagesById: (
    messageIds: Arr.NonEmptyArray<Snowflake.Snowflake>,
    now: number
  ) => Effect.Effect<
    Array<{
      readonly envelope: Envelope.Encoded
      readonly lastSentReply: Option.Option<Reply.Encoded>
    }>,
    PersistenceError
  >

  /** Release request claims without changing replies or processed state. */
  readonly resetRequests: (
    requestIds: ReadonlyArray<Snowflake.Snowflake>
  ) => Effect.Effect<void, PersistenceError>

  /**
   * Reset the mailbox state for the provided addresses.
   */
  readonly resetAddresses: (
    addresses: ReadonlyArray<EntityAddress>
  ) => Effect.Effect<void, PersistenceError>

  /**
   * Clear all messages and replies for the provided address.
   */
  readonly clearAddress: (
    address: EntityAddress
  ) => Effect.Effect<void, PersistenceError>

  /**
   * Reset the mailbox state for the provided shards.
   */
  readonly resetShards: (
    shardIds: Arr.NonEmptyArray<string>
  ) => Effect.Effect<void, PersistenceError>

  /**
   * Used to wrap requests with transactions.
   */
  readonly withTransaction: <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>
}

/**
 * Cursor options for reading encoded unprocessed messages across shard sets.
 *
 * **Details**
 *
 * The fields distinguish existing shards from newly assigned shards and carry the
 * driver-specific pagination cursor.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type EncodedUnprocessedOptions<A> = {
  readonly existingShards: Array<number>
  readonly newShards: Array<number>
  readonly cursor: Option.Option<A>
}

/**
 * Cursor options for reading encoded replies across request sets.
 *
 * **Details**
 *
 * The fields distinguish existing requests from new requests and carry the
 * driver-specific pagination cursor.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type EncodedRepliesOptions<A> = {
  readonly existingRequests: Array<string>
  readonly newRequests: Array<string>
  readonly cursor: Option.Option<A>
}

/**
 * Wraps a concrete message storage implementation with reply-handler management.
 *
 * **Details**
 *
 * The returned service can register waiting reply handlers, notify them when
 * replies are saved, and fail them when a request or shard is unregistered.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  storage:
    & Omit<
      MessageStorage["Service"],
      "saveReply" | "registerReplyHandler" | "unregisterReplyHandler" | "unregisterShardReplyHandlers"
    >
    & {
      /**
       * Save the provided `Reply`, returning the reply as it was persisted.
       *
       * Implementations that persist a different representation, such as a
       * defect reply when the original cannot be encoded, return that fallback
       * so reply handlers deliver exactly what storage recorded.
       */
      readonly saveReply: <R extends Rpc.Any>(
        reply: Reply.ReplyWithContext<R>
      ) => Effect.Effect<Reply.ReplyWithContext<R>, PersistenceError | MalformedMessage>
    }
): Effect.Effect<MessageStorage["Service"]> =>
  Effect.sync(() => {
    type ReplyHandler = {
      readonly message: Message.OutgoingRequest<any> | Message.IncomingRequest<any>
      readonly shardSet: Set<ReplyHandler>
      readonly respond: (reply: Reply.ReplyWithContext<any>) => Effect.Effect<void, PersistenceError | MalformedMessage>
      readonly resume: (effect: Effect.Effect<void, EntityNotAssignedToRunner>) => void
    }
    const replyHandlers = new Map<Snowflake.Snowflake, Array<ReplyHandler>>()
    const replyHandlersShard = new Map<string, Set<ReplyHandler>>()
    return MessageStorage.of({
      ...storage,
      registerReplyHandler: (message) => {
        const requestId = message.envelope.requestId
        return Effect.callback<void, EntityNotAssignedToRunner>((resume) => {
          const shardId = message.envelope.address.shardId.toString()
          let handlers = replyHandlers.get(requestId)
          if (handlers === undefined) {
            handlers = []
            replyHandlers.set(requestId, handlers)
          }
          let shardSet = replyHandlersShard.get(shardId)
          if (!shardSet) {
            shardSet = new Set()
            replyHandlersShard.set(shardId, shardSet)
          }
          const entry: ReplyHandler = {
            message,
            shardSet,
            respond: message._tag === "IncomingRequest" ? message.respond : (reply) => message.respond(reply.reply),
            resume
          }
          handlers.push(entry)
          shardSet.add(entry)
          return Effect.sync(() => {
            const index = handlers.indexOf(entry)
            handlers.splice(index, 1)
            shardSet.delete(entry)
          })
        })
      },
      unregisterReplyHandler: (requestId) =>
        Effect.sync(() => {
          const handlers = replyHandlers.get(requestId)
          if (!handlers) return
          replyHandlers.delete(requestId)
          for (let i = 0; i < handlers.length; i++) {
            const handler = handlers[i]
            handler.shardSet.delete(handler)
            handler.resume(Effect.fail(
              new EntityNotAssignedToRunner({
                address: handler.message.envelope.address
              })
            ))
          }
        }),
      unregisterShardReplyHandlers: (shardId, options) =>
        Effect.sync(() => {
          const id = shardId.toString()
          const shardSet = replyHandlersShard.get(id)
          if (!shardSet) return
          replyHandlersShard.delete(id)
          shardSet.forEach((handler) => {
            replyHandlers.delete(handler.message.envelope.requestId)
            handler.resume(
              options?.interrupt ? ClusterAbandon.interrupt : Effect.fail(
                new EntityNotAssignedToRunner({
                  address: handler.message.envelope.address
                })
              )
            )
          })
        }),
      saveReply(reply) {
        const requestId = reply.reply.requestId
        return Effect.flatMap(storage.saveReply(reply), (persisted) => {
          const handlers = replyHandlers.get(requestId)
          if (!handlers) {
            return Effect.void
          } else if (persisted.reply._tag === "WithExit") {
            replyHandlers.delete(requestId)
            for (let i = 0; i < handlers.length; i++) {
              const handler = handlers[i]
              handler.shardSet.delete(handler)
              handler.resume(Effect.void)
            }
          }
          return handlers.length === 1
            ? handlers[0].respond(persisted)
            : Effect.forEach(handlers, (handler) => handler.respond(persisted))
        })
      }
    })
  })

/**
 * Builds a `MessageStorage` service from an encoded storage driver.
 *
 * **Details**
 *
 * The adapter handles envelope and reply encoding and decoding, primary-key
 * generation, delayed delivery checks, duplicate decoding, and malformed-message
 * defect replies.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeEncoded: (encoded: Encoded) => Effect.Effect<
  MessageStorage["Service"],
  never,
  Snowflake.Generator
> = Effect.fnUntraced(function*(encoded: Encoded) {
  const snowflakeGen = yield* Snowflake.Generator
  const clock = yield* Clock

  const storage: MessageStorage["Service"] = yield* make({
    saveRequest: (message) =>
      Message.serializeEnvelope(message).pipe(
        Effect.flatMap((envelope) =>
          encoded.saveEnvelope({
            envelope,
            primaryKey: Envelope.primaryKey(message.envelope),
            deliverAt: DeliverAt.toMillis(message.envelope.payload)
          })
        ),
        Effect.flatMap((result) => {
          if (result._tag === "Success" || Option.isNone(result.lastReceivedReply)) {
            return Effect.succeed(result as SaveResult<any>)
          }
          const duplicate = result
          const schema = Reply.Reply(message.rpc, codecForJson)
          return Schema.decodeEffect(schema)(result.lastReceivedReply.value).pipe(
            Effect.provideContext(message.context),
            MalformedMessage.refail,
            Effect.map((reply) =>
              SaveResult.Duplicate({
                originalId: duplicate.originalId,
                lastReceivedReply: Option.some(reply)
              })
            )
          )
        })
      ),
    saveEnvelope: (message) =>
      Message.serializeEnvelope(message).pipe(
        Effect.flatMap((envelope) =>
          encoded.saveEnvelope({
            envelope,
            primaryKey: null,
            deliverAt: null
          })
        ),
        Effect.asVoid
      ),
    saveReply: (reply) =>
      Reply.serialize(reply, codecForJson).pipe(
        Effect.map((encodedReply) => ({ encodedReply, persisted: reply })),
        Effect.catchTag("MalformedMessage", (error) => {
          const persisted = Reply.ReplyWithContext.fromDefect({
            id: reply.reply.id,
            requestId: reply.reply.requestId,
            defect: error
          })
          return Effect.map(
            Effect.orDie(Reply.serialize(persisted, codecForJson)),
            (encodedReply) => ({ encodedReply, persisted })
          )
        }),
        Effect.flatMap(({ encodedReply, persisted }) => Effect.as(encoded.saveReply(encodedReply), persisted))
      ),
    clearReplies: encoded.clearReplies,
    repliesFor: Effect.fnUntraced(function*(messages) {
      const requestIds = Arr.empty<string>()
      const map = new Map<string, Message.OutgoingRequest<any>>()
      for (const message of messages) {
        const id = String(message.envelope.requestId)
        requestIds.push(id)
        map.set(id, message)
      }
      if (!Arr.isArrayNonEmpty(requestIds)) return []
      const encodedReplies = yield* encoded.repliesFor(requestIds)
      return yield* decodeReplies(map, encodedReplies)
    }),
    repliesForUnfiltered: (ids) => {
      const arr = Array.from(ids, String)
      if (!Arr.isArrayNonEmpty(arr)) return Effect.succeed([])
      return encoded.repliesForUnfiltered(arr)
    },
    requestIdForPrimaryKey(options) {
      const primaryKey = Envelope.primaryKeyByAddress(options)
      return encoded.requestIdForPrimaryKey(primaryKey)
    },
    unprocessedMessages(shardIds, options) {
      const storage = this as unknown as MessageStorage["Service"]
      const shards = Array.from(shardIds, (id) => id.toString())
      if (!Arr.isArrayNonEmpty(shards)) return Effect.succeed([])
      if (options?.addresses !== undefined && options.addresses.length === 0) return Effect.succeed([])
      return Effect.flatMap(
        Effect.suspend(() => encoded.unprocessedMessages(shards, clock.currentTimeMillisUnsafe(), options)),
        (messages) => decodeMessages(storage, messages)
      )
    },
    unprocessedMessagesById(messageIds) {
      const storage = this as unknown as MessageStorage["Service"]
      const ids = Array.from(messageIds)
      if (!Arr.isArrayNonEmpty(ids)) return Effect.succeed([])
      return Effect.flatMap(
        Effect.suspend(() => encoded.unprocessedMessagesById(ids, clock.currentTimeMillisUnsafe())),
        (messages) => decodeMessages(storage, messages)
      )
    },
    resetAddress: (address) => encoded.resetAddresses([address]),
    resetRequests: (requestIds) => requestIds.length === 0 ? Effect.void : encoded.resetRequests(requestIds),
    resetAddresses: (addresses) => addresses.length === 0 ? Effect.void : encoded.resetAddresses(addresses),
    clearAddress: encoded.clearAddress,
    resetShards: (shardIds) => {
      const shards = Array.from(shardIds, (id) => id.toString())
      if (!Arr.isArrayNonEmpty(shards)) return Effect.void
      return encoded.resetShards(shards)
    },
    withTransaction: encoded.withTransaction
  })

  const decodeMessages = (
    storage: MessageStorage["Service"],
    envelopes: Array<{
      readonly envelope: Envelope.Encoded
      readonly lastSentReply: Option.Option<Reply.Encoded>
    }>
  ) => {
    const messages: Array<Message.Incoming<any>> = []
    let index = 0

    // if we have a malformed message, we should not return it and update
    // the storage with a defect
    const decodeMessage = Effect.catch(
      Effect.suspend(() => {
        const envelope = envelopes[index]
        if (!envelope) return Effect.undefined
        return decodeEnvelopeWithReply(envelope)
      }),
      (error) => {
        const envelope = envelopes[index]
        return storage.saveReply(Reply.ReplyWithContext.fromDefect({
          id: snowflakeGen.nextUnsafe(),
          requestId: Snowflake.Snowflake(envelope.envelope.requestId),
          defect: error.toString()
        })).pipe(
          Effect.forkDetach,
          Effect.asVoid
        )
      }
    )
    return Effect.as(
      Effect.whileLoop({
        while: () => index < envelopes.length,
        body: () => decodeMessage,
        step: (message) => {
          const envelope = envelopes[index++]
          if (!message) return
          messages.push(
            message.envelope._tag === "Request"
              ? new Message.IncomingRequest({
                envelope: message.envelope,
                lastSentReply: envelope.lastSentReply,
                respond: storage.saveReply,
                codecFor: codecForJson
              })
              : new Message.IncomingEnvelope({
                envelope: message.envelope
              })
          )
        }
      }),
      messages
    )
  }

  const decodeReplies = (
    messages: Map<string, Message.OutgoingRequest<any>>,
    encodedReplies: Array<Reply.Encoded>
  ) => {
    const replies: Array<Reply.Reply<any>> = []
    const ignoredRequests = new Set<string>()
    let index = 0

    const decodeReply: Effect.Effect<void | Reply.Reply<any>> = Effect.catch(
      Effect.suspend(() => {
        const reply = encodedReplies[index]
        if (ignoredRequests.has(reply.requestId)) return Effect.void
        const message = messages.get(reply.requestId)
        if (!message) return Effect.void
        const schema = Reply.Reply(message.rpc, codecForJson)
        return Schema.decodeEffect(schema)(reply).pipe(
          Effect.provideContext(message.context)
        ) as Effect.Effect<Reply.Reply<any>, Schema.SchemaError>
      }),
      (error) => {
        const reply = encodedReplies[index]
        ignoredRequests.add(reply.requestId)
        return Effect.succeed(
          new Reply.WithExit({
            id: snowflakeGen.nextUnsafe(),
            requestId: Snowflake.Snowflake(reply.requestId),
            exit: Exit.die(error)
          })
        )
      }
    )

    return Effect.as(
      Effect.whileLoop({
        while: () => index < encodedReplies.length,
        body: () => decodeReply,
        step: (reply) => {
          index++
          if (reply) replies.push(reply)
        }
      }),
      replies
    )
  }

  return storage
})

/**
 * No-op `MessageStorage` service that does not persist messages or replies.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const noop: MessageStorage["Service"] = Effect.runSync(make({
  saveRequest: () => Effect.succeed(SaveResult.Success()),
  saveEnvelope: () => Effect.void,
  saveReply: (reply) => Effect.succeed(reply),
  clearReplies: () => Effect.void,
  repliesFor: () => Effect.succeed([]),
  repliesForUnfiltered: () => Effect.succeed([]),
  requestIdForPrimaryKey: () => Effect.succeedNone,
  unprocessedMessages: () => Effect.succeed([]),
  unprocessedMessagesById: () => Effect.succeed([]),
  resetAddress: () => Effect.void,
  resetRequests: () => Effect.void,
  resetAddresses: () => Effect.void,
  clearAddress: () => Effect.void,
  resetShards: () => Effect.void,
  withTransaction: identity
}))

/**
 * In-memory storage entry for a request envelope.
 *
 * **Details**
 *
 * It stores the encoded envelope, last acknowledged chunk, accumulated replies,
 * and optional delivery time.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MemoryEntry = {
  readonly envelope: Envelope.Encoded
  lastReceivedChunk: Reply.ChunkEncoded | undefined
  replies: Array<Reply.Encoded>
  deliverAt: number | null
}

/**
 * Provides a context reference used in tests to simulate a transaction.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const MemoryTransaction = Context.Reference<boolean>("effect/cluster/MessageStorage/MemoryTransaction", {
  defaultValue: constFalse
})

// the same claim window the SQL driver uses (`last_read < ten minutes ago`)
const claimExpirationMillis = 10 * 60 * 1000

/**
 * Service that provides an in-memory message storage driver with inspectable backing state.
 *
 * **Details**
 *
 * It provides a `MessageStorage` service, the encoded driver implementation, and
 * maps used to track requests, primary keys, unprocessed envelopes, reply IDs,
 * and the journal.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class MemoryDriver extends Context.Service<MemoryDriver>()("effect/cluster/MessageStorage/MemoryDriver", {
  make: Effect.gen(function*() {
    const clock = yield* Clock
    const requests = new Map<string, MemoryEntry>()
    const requestsByPrimaryKey = new Map<string, MemoryEntry>()
    const unprocessed = new Set<Envelope.Encoded>()
    const replyIds = new Set<string>()
    const lastRead = new Map<Envelope.Encoded, number>()

    const journal: Array<Envelope.Encoded> = []

    const addressKey = (address: Envelope.Encoded["address"] | EntityAddress) =>
      `${address.shardId.group}/${address.shardId.id}/${address.entityType}/${address.entityId}`

    const resetAddresses = (addresses: ReadonlyArray<EntityAddress>) =>
      addresses.length === 0
        ? Effect.void
        : Effect.sync(() => {
          const keys = new Set(addresses.map(addressKey))
          for (const envelope of journal) {
            if (keys.has(addressKey(envelope.address))) {
              lastRead.delete(envelope)
            }
          }
        })

    const cursors = new WeakMap<{}, number>()

    const unprocessedWith = (predicate: Predicate<Envelope.Encoded>) => {
      const messages: Array<{
        readonly envelope: Envelope.Encoded
        readonly lastSentReply: Option.Option<Reply.Encoded>
      }> = []
      const now = clock.currentTimeMillisUnsafe()
      for (const envelope of unprocessed) {
        if (!predicate(envelope)) {
          continue
        }
        if (envelope._tag === "Request") {
          const entry = requests.get(envelope.requestId)
          if (entry?.deliverAt && entry.deliverAt > now) {
            continue
          }
          messages.push({
            envelope,
            lastSentReply: Option.fromNullishOr(entry?.replies[entry.replies.length - 1])
          })
        } else {
          messages.push({
            envelope,
            lastSentReply: Option.none()
          })
        }
      }
      return messages
    }

    const replyLatch = yield* Latch.make()

    function repliesFor(requestIds: Array<string>) {
      const replies = Arr.empty<Reply.Encoded>()
      for (const requestId of requestIds) {
        const request = requests.get(requestId)
        if (!request) continue
        else if (request.lastReceivedChunk === undefined) {
          replies.push(...request.replies)
          continue
        }
        const sequence = request.lastReceivedChunk.sequence
        for (const reply of request.replies) {
          if (reply._tag === "Chunk" && reply.sequence <= sequence) {
            continue
          }
          replies.push(reply)
        }
      }
      return replies
    }

    const encoded: Encoded = {
      saveEnvelope: ({ deliverAt, envelope: envelope_, primaryKey }) =>
        Effect.sync(() => {
          const envelope = JSON.parse(JSON.stringify(envelope_)) as Envelope.Encoded
          const existing = primaryKey
            ? requestsByPrimaryKey.get(primaryKey)
            : envelope._tag === "Request" && requests.get(envelope.requestId)
          if (existing) {
            return SaveResultEncoded.Duplicate({
              originalId: Snowflake.Snowflake(existing.envelope.requestId),
              lastReceivedReply: Option.fromNullishOr(
                existing.replies.length === 1 && existing.replies[0]._tag === "WithExit"
                  ? existing.replies[0]
                  : existing.lastReceivedChunk
              )
            })
          }
          if (envelope._tag === "Request") {
            const entry: MemoryEntry = { envelope, replies: [], lastReceivedChunk: undefined, deliverAt }
            requests.set(envelope.requestId, entry)
            if (primaryKey) {
              requestsByPrimaryKey.set(primaryKey, entry)
            }
          } else if (envelope._tag === "AckChunk") {
            const entry = requests.get(envelope.requestId)
            if (entry) {
              entry.lastReceivedChunk = entry.replies.find((r): r is Reply.ChunkEncoded =>
                r._tag === "Chunk" && r.id === envelope.replyId
              ) ?? entry.lastReceivedChunk
            }
          }
          unprocessed.add(envelope)
          journal.push(envelope)
          return SaveResultEncoded.Success()
        }),
      saveReply: (reply_) =>
        Effect.sync(() => {
          const reply = JSON.parse(JSON.stringify(reply_)) as Reply.Encoded
          const entry = requests.get(reply.requestId)
          if (!entry || replyIds.has(reply.id)) return
          if (reply._tag === "WithExit") {
            unprocessed.delete(entry.envelope)
            lastRead.delete(entry.envelope)
          }
          entry.replies.push(reply)
          replyIds.add(reply.id)
          replyLatch.openUnsafe()
        }),
      clearReplies: (id, options) =>
        Effect.sync(() => {
          const entry = requests.get(String(id))
          if (!entry) return
          if (
            options?.expectedReplyId !== undefined && entry.replies.at(-1)?.id !== String(options.expectedReplyId)
          ) return
          entry.replies = []
          entry.lastReceivedChunk = undefined
          unprocessed.add(entry.envelope)
          lastRead.delete(entry.envelope)
        }),
      requestIdForPrimaryKey: (primaryKey) =>
        Effect.sync(() => {
          const entry = requestsByPrimaryKey.get(primaryKey)
          return Option.map(Option.fromNullishOr(entry?.envelope.requestId), Snowflake.Snowflake)
        }),
      repliesFor: (requestIds) => Effect.sync(() => repliesFor(requestIds)),
      repliesForUnfiltered: (requestIds) =>
        Effect.sync(() => requestIds.flatMap((id) => requests.get(String(id))?.replies ?? [])),
      unprocessedMessages: (shardIds, now, options) =>
        options?.addresses?.length === 0 ? Effect.succeed([]) : Effect.sync(() => {
          if (unprocessed.size === 0) return []
          const limit = options?.limit ?? Infinity
          const addressFilter = options?.addresses && new Set(options.addresses.map(addressKey))
          const messages = Arr.empty<{
            envelope: Envelope.Encoded
            lastSentReply: Option.Option<Reply.Encoded>
          }>()
          for (let index = 0; index < journal.length; index++) {
            if (messages.length >= limit) break
            const envelope = journal[index]
            const shardId = ShardId.make(envelope.address.shardId.group, envelope.address.shardId.id)
            if (!unprocessed.has(envelope as any) || !shardIds.includes(shardId.toString())) {
              continue
            }
            if (addressFilter && !addressFilter.has(addressKey(envelope.address))) {
              continue
            }
            if (envelope._tag === "Request") {
              const entry = requests.get(envelope.requestId)!
              if (entry.deliverAt && entry.deliverAt > now) {
                continue
              }
              const claimedAt = lastRead.get(envelope)
              if (claimedAt !== undefined && claimedAt > now - claimExpirationMillis) {
                continue
              }
              // Memory storage models claim expiry, but not SQL reply filtering or transactions.
              messages.push({
                envelope,
                lastSentReply: Option.fromNullishOr(entry.replies[entry.replies.length - 1])
              })
              lastRead.set(envelope, now)
            } else {
              messages.push({
                envelope,
                lastSentReply: Option.none()
              })
              unprocessed.delete(envelope)
            }
          }
          return messages
        }),
      unprocessedMessagesById: (ids) =>
        Effect.sync(() => {
          const envelopeIds = new Set<string>()
          for (const id of ids) {
            envelopeIds.add(String(id))
          }
          return unprocessedWith((envelope) => envelopeIds.has(envelope.requestId))
        }),
      resetAddresses,
      resetRequests: (requestIds) =>
        Effect.sync(() => {
          for (const id of requestIds) {
            const entry = requests.get(String(id))
            if (entry) lastRead.delete(entry.envelope)
          }
        }),
      clearAddress: (address) =>
        Effect.sync(() => {
          for (const [primaryKey, entry] of requestsByPrimaryKey) {
            const envelope = entry.envelope
            const sameAddress = address.entityType === envelope.address.entityType &&
              address.entityId === envelope.address.entityId
            if (sameAddress) {
              requestsByPrimaryKey.delete(primaryKey)
            }
          }
          for (let i = journal.length - 1; i >= 0; i--) {
            const envelope = journal[i]
            const sameAddress = address.entityType === envelope.address.entityType &&
              address.entityId === envelope.address.entityId
            if (!sameAddress) {
              continue
            }
            unprocessed.delete(envelope)
            lastRead.delete(envelope)
            if (envelope._tag === "Request") {
              requests.delete(envelope.requestId)
            }
            journal.splice(i, 1)
          }
        }),
      resetShards: (shardIds) =>
        Effect.sync(() => {
          const shards = new Set(shardIds)
          for (const envelope of journal) {
            const shardId = ShardId.make(envelope.address.shardId.group, envelope.address.shardId.id)
            if (shards.has(shardId.toString())) {
              lastRead.delete(envelope)
            }
          }
        }),
      withTransaction: Effect.provideService(MemoryTransaction, true)
    }

    const storage = yield* makeEncoded(encoded)

    return {
      storage,
      encoded,
      requests,
      requestsByPrimaryKey,
      unprocessed,
      replyIds,
      journal,
      cursors
    } as const
  })
}) {
  /**
   * Layer that provides the in-memory message storage driver.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static readonly layer: Layer.Layer<MemoryDriver> = Layer.effect(this)(this.make).pipe(
    Layer.provide(Snowflake.layerGenerator)
  )
}

/**
 * Layer that provides the no-op `MessageStorage` service.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerNoop: Layer.Layer<MessageStorage> = Layer.succeed(MessageStorage, noop)

/**
 * Layer that provides in-memory message storage and its backing `MemoryDriver`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerMemory: Layer.Layer<
  MessageStorage | MemoryDriver,
  never,
  ShardingConfig
> = Layer.effect(MessageStorage, Effect.map(MemoryDriver, (_) => _.storage)).pipe(
  Layer.provideMerge(MemoryDriver.layer)
)

// --- internal ---

const EnvelopeWithReply: Schema.Struct<
  {
    readonly envelope: Schema.ConstraintDecoder<Envelope.PartialRequest | Envelope.AckChunk | Envelope.Interrupt>
    readonly lastSentReply: Schema.Option<Schema.Codec<Reply.Encoded>>
  }
> = Schema.Struct({
  envelope: Schema.toCodecJson(Envelope.Partial),
  lastSentReply: Schema.Option(Reply.Encoded)
})

const decodeEnvelopeWithReply = Schema.decodeEffect(EnvelopeWithReply)
