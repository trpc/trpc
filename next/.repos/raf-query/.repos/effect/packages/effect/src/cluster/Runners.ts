/**
 * Handles communication between Effect Cluster runners.
 *
 * `Runners` sits between sharding decisions and runner execution. It can ping a
 * runner, send requests or control envelopes, notify a runner that persisted
 * work is available, and record that a runner address is unavailable. This
 * module defines the runner communication service, its RPC protocol, no-op and
 * RPC-backed implementations, local persistence support, reply recovery, and
 * the protocol service used by transport-specific runner layers.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Latch from "../Latch.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Queue from "../Queue.ts"
import * as RcMap from "../RcMap.ts"
import * as Rpc from "../rpc/Rpc.ts"
import * as RpcClient_ from "../rpc/RpcClient.ts"
import type { RpcClientError } from "../rpc/RpcClientError.ts"
import * as RpcGroup from "../rpc/RpcGroup.ts"
import * as RpcSchema from "../rpc/RpcSchema.ts"
import type * as RpcSerialization from "../rpc/RpcSerialization.ts"
import * as Schema from "../Schema.ts"
import type { Scope } from "../Scope.ts"
import type { MalformedMessage, PersistenceError } from "./ClusterError.ts"
import { AlreadyProcessingMessage, EntityNotAssignedToRunner, MailboxFull, RunnerUnavailable } from "./ClusterError.ts"
import { Persisted } from "./ClusterSchema.ts"
import * as Envelope from "./Envelope.ts"
import * as Message from "./Message.ts"
import * as MessageStorage from "./MessageStorage.ts"
import * as Reply from "./Reply.ts"
import type { RunnerAddress } from "./RunnerAddress.ts"
import { ShardingConfig } from "./ShardingConfig.ts"
import * as Snowflake from "./Snowflake.ts"

/**
 * Service for communicating with cluster runners, including pinging runners,
 * sending and notifying messages, coordinating persisted replies, and marking
 * runners unavailable.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Runners extends Context.Service<Runners, {
  /**
   * Checks whether a Runner is responsive.
   */
  readonly ping: (address: RunnerAddress) => Effect.Effect<void, RunnerUnavailable>

  /**
   * Send a message locally.
   *
   * This ensures that the message hits storage before being sent to the local
   * entity.
   */
  readonly sendLocal: <R extends Rpc.Any>(
    options: {
      readonly message: Message.Outgoing<R>
      readonly send: <Rpc extends Rpc.Any>(
        message: Message.IncomingLocal<Rpc>
      ) => Effect.Effect<
        void,
        EntityNotAssignedToRunner | MailboxFull | AlreadyProcessingMessage
      >
      readonly simulateRemoteSerialization: boolean
    }
  ) => Effect.Effect<
    void,
    EntityNotAssignedToRunner | MailboxFull | AlreadyProcessingMessage | PersistenceError
  >

  /**
   * Send a message to a Runner.
   */
  readonly send: <R extends Rpc.Any>(
    options: {
      readonly address: RunnerAddress
      readonly message: Message.Outgoing<R>
    }
  ) => Effect.Effect<
    void,
    | EntityNotAssignedToRunner
    | RunnerUnavailable
    | MailboxFull
    | AlreadyProcessingMessage
    | PersistenceError
  >

  /**
   * Notify a Runner that a message is available. Persisted messages recover
   * replies from storage, while volatile messages complete after delivery.
   */
  readonly notify: <R extends Rpc.Any>(
    options: {
      readonly address: Option.Option<RunnerAddress>
      readonly message: Message.Outgoing<R>
      readonly discard: boolean
    }
  ) => Effect.Effect<
    void,
    | EntityNotAssignedToRunner
    | RunnerUnavailable
    | MailboxFull
    | AlreadyProcessingMessage
    | PersistenceError
  >

  /**
   * Notify the current Runner that a message is available, then read replies from
   * storage.
   *
   * This ensures that the message hits storage before being sent to the local
   * entity.
   */
  readonly notifyLocal: <R extends Rpc.Any>(
    options: {
      readonly message: Message.Outgoing<R>
      readonly notify: (
        options: Message.IncomingLocal<any>
      ) => Effect.Effect<void, EntityNotAssignedToRunner>
      readonly discard: boolean
      readonly storageOnly?: boolean | undefined
    }
  ) => Effect.Effect<void, PersistenceError>

  /**
   * Mark a Runner as unavailable.
   */
  readonly onRunnerUnavailable: (address: RunnerAddress) => Effect.Effect<void>
}>()("effect/cluster/Runners") {}

/**
 * Builds the `Runners` service from remote runner callbacks and adds local
 * message persistence, duplicate request handling, optional local serialization
 * simulation, and polling for persisted replies.
 *
 * **When to use**
 *
 * Use when you need a custom `Runners` service around remote `ping`, `send`,
 * `notify`, and `onRunnerUnavailable` callbacks, with standard local
 * persistence and reply recovery behavior.
 *
 * **Details**
 *
 * `make` uses the supplied remote callbacks for runner communication and
 * derives `sendLocal` and `notifyLocal`. Local sends can optionally simulate
 * remote serialization with the supplied transport codec, persisted notifications are saved through
 * `MessageStorage`, duplicate requests are resumed from stored replies when
 * possible, and pending replies are polled according to
 * `ShardingConfig.entityReplyPollInterval`.
 *
 * @see {@link makeRpc} for the RPC-backed implementation built on top of this constructor
 * @see {@link makeNoop} for a no-op implementation when remote runner communication is not needed
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: (
  options: Omit<Runners["Service"], "sendLocal" | "notifyLocal"> & {
    readonly codecFor: RpcSerialization.CodecFor
  }
) => Effect.Effect<
  Runners["Service"],
  never,
  MessageStorage.MessageStorage | Snowflake.Generator | ShardingConfig | Scope
> = Effect.fnUntraced(function*(options) {
  const storage = yield* MessageStorage.MessageStorage
  const runnersScope = yield* Effect.scope
  const snowflakeGen = yield* Snowflake.Generator
  const config = yield* ShardingConfig
  const { codecFor, ...serviceOptions } = options

  const requestIdRewrites = new Map<Snowflake.Snowflake, Snowflake.Snowflake>()

  function notifyWith<E>(
    message: Message.Outgoing<any>,
    afterPersist: (message: Message.Outgoing<any>, isDuplicate: boolean) => Effect.Effect<void, E>
  ): Effect.Effect<void, E | PersistenceError> {
    const rpc = message.rpc as any as Rpc.AnyWithProps
    const persisted = Context.get(rpc.annotations, Persisted)
    if (!persisted) {
      return afterPersist(message, false)
    }

    if (message._tag === "OutgoingEnvelope") {
      const rewriteId = requestIdRewrites.get(message.envelope.requestId)
      const requestId = rewriteId ?? message.envelope.requestId
      const entry = storageRequests.get(requestId)
      if (rewriteId) {
        message = new Message.OutgoingEnvelope({
          ...message,
          envelope: message.envelope.withRequestId(rewriteId)
        })
      }
      return storage.saveEnvelope(message).pipe(
        Effect.catchTag("MalformedMessage", Effect.die),
        Effect.andThen(
          entry ? Effect.andThen(entry.latch.open, afterPersist(message, false)) : afterPersist(message, false)
        )
      )
    }

    // For requests, after persisting the request, we need to check if the
    // request is a duplicate. If it is, we need to resume from the last
    // received reply.
    //
    // Otherwise, we notify the remote entity and then reply from storage.
    return Effect.flatMap(
      Effect.catchTag(storage.saveRequest(message), "MalformedMessage", Effect.die),
      MessageStorage.SaveResult.$match({
        Success: () => afterPersist(message, false),
        Duplicate: ({ lastReceivedReply, originalId }) => {
          // If the last received reply is an exit, we can just return it
          // as the response.
          if (Option.isSome(lastReceivedReply) && lastReceivedReply.value._tag === "WithExit") {
            return message.respond(lastReceivedReply.value.withRequestId(message.envelope.requestId))
          }
          requestIdRewrites.set(message.envelope.requestId, originalId)
          return afterPersist(
            new Message.OutgoingRequest({
              ...message,
              lastReceivedReply,
              envelope: Envelope.makeRequest({
                ...message.envelope,
                requestId: originalId
              }),
              respond(reply) {
                if (reply._tag === "WithExit") {
                  requestIdRewrites.delete(message.envelope.requestId)
                }
                return message.respond(reply.withRequestId(message.envelope.requestId))
              }
            }),
            true
          )
        }
      })
    )
  }

  type StorageRequestEntry = {
    readonly latch: Latch.Latch
    doneLatch: Latch.Latch | undefined
    readonly messages: Set<Message.OutgoingRequest<any>>
    replies: Array<Reply.Reply<any>>
  }
  const storageRequests = new Map<Snowflake.Snowflake, StorageRequestEntry>()
  const waitingStorageRequests = new Map<Snowflake.Snowflake, Message.OutgoingRequest<any>>()
  const replyFromStorage = Effect.fnUntraced(
    function*(message: Message.OutgoingRequest<any>) {
      let entry = storageRequests.get(message.envelope.requestId)
      if (entry) {
        entry.messages.add(message)
        entry.doneLatch ??= Latch.makeUnsafe(false)
        return yield* entry.doneLatch.await
      } else {
        entry = {
          latch: Latch.makeUnsafe(false),
          doneLatch: undefined,
          replies: [],
          messages: new Set([message])
        }
        storageRequests.set(message.envelope.requestId, entry)
      }

      while (true) {
        // wait for the storage loop to notify us
        entry.latch.closeUnsafe()
        waitingStorageRequests.set(message.envelope.requestId, message)
        storageLatch.openUnsafe()
        yield* entry.latch.await

        // send the replies back
        for (let i = 0; i < entry.replies.length; i++) {
          const reply = entry.replies[i]
          // we have reached the end
          if (reply._tag === "WithExit") {
            for (const message of entry.messages) {
              yield* message.respond(reply)
            }
            entry.doneLatch?.openUnsafe()
            return
          }

          entry.latch.closeUnsafe()
          for (const message of entry.messages) {
            yield* message.respond(reply)
          }
          // wait for ack
          yield* entry.latch.await
        }
        entry.replies = []
      }
    },
    (effect, message) =>
      Effect.ensuring(
        effect,
        Effect.sync(() => {
          const entry = storageRequests.get(message.envelope.requestId)
          if (!entry || entry.messages.size > 1) {
            entry?.messages.delete(message)
            return
          }
          storageRequests.delete(message.envelope.requestId)
          waitingStorageRequests.delete(message.envelope.requestId)
        })
      )
  )

  const storageLatch = Latch.makeUnsafe(false)
  if (storage !== MessageStorage.noop) {
    yield* Effect.gen(function*() {
      const foundRequests = new Set<StorageRequestEntry>()

      while (true) {
        yield* storageLatch.await
        storageLatch.closeUnsafe()

        const replies = yield* storage.repliesFor(waitingStorageRequests.values()).pipe(
          Effect.catchCause((cause) =>
            Effect.as(
              Effect.annotateLogs(Effect.logDebug(cause), {
                package: "@effect/cluster",
                module: "Runners",
                fiber: "Read replies loop"
              }),
              []
            )
          )
        )

        // put the replies into the storage requests and then open the latches
        for (let i = 0; i < replies.length; i++) {
          const reply = replies[i]
          const entry = storageRequests.get(reply.requestId)
          if (!entry) continue
          entry.replies.push(reply)
          waitingStorageRequests.delete(reply.requestId)
          foundRequests.add(entry)
        }

        foundRequests.forEach((entry) => entry.latch.openUnsafe())
        foundRequests.clear()
      }
    }).pipe(
      Effect.forkIn(runnersScope)
    )

    yield* Effect.suspend(() => {
      if (waitingStorageRequests.size === 0) {
        return storageLatch.await
      }
      return storageLatch.open
    }).pipe(
      Effect.delay(config.entityReplyPollInterval),
      Effect.forever,
      Effect.forkIn(runnersScope)
    )
  }

  return Runners.of({
    ...serviceOptions,
    sendLocal(options) {
      const message = options.message
      if (!options.simulateRemoteSerialization) {
        return options.send(Message.incomingLocalFromOutgoing(message))
      }
      return Message.serialize(message, codecFor).pipe(
        Effect.flatMap((encoded) => Message.deserializeLocal(message, encoded, codecFor)),
        Effect.flatMap(options.send),
        Effect.catchTag("MalformedMessage", (error) => {
          if (message._tag === "OutgoingEnvelope") {
            return Effect.die(error)
          }
          return message.respond(
            new Reply.WithExit({
              id: snowflakeGen.nextUnsafe(),
              requestId: message.envelope.requestId,
              exit: Exit.die(error)
            })
          )
        })
      )
    },
    notify(options_) {
      const { discard, message } = options_
      return notifyWith(message, (message, duplicate) => {
        if (discard || message._tag === "OutgoingEnvelope") {
          return options.notify(options_)
        } else if (!duplicate && Option.isSome(options_.address)) {
          return Effect.catch(
            options.send({
              address: options_.address.value,
              message
            }),
            (_) => replyFromStorage(message)
          )
        }
        return options.notify(options_).pipe(
          Effect.andThen(replyFromStorage(message))
        )
      })
    },
    notifyLocal(options) {
      return notifyWith(options.message, (message, duplicate) => {
        if (options.discard || message._tag === "OutgoingEnvelope") {
          return Effect.catchTag(
            options.notify(Message.incomingLocalFromOutgoing(message)),
            "EntityNotAssignedToRunner",
            () => Effect.void
          )
        } else if (!duplicate && options.storageOnly !== true) {
          return options.notify(Message.incomingLocalFromOutgoing(message)).pipe(
            Effect.andThen(storage.registerReplyHandler(message)),
            Effect.catchTag("EntityNotAssignedToRunner", () => replyFromStorage(message))
          )
        }
        return options.notify(Message.incomingLocalFromOutgoing(message)).pipe(
          Effect.catchTag("EntityNotAssignedToRunner", () => Effect.void),
          Effect.andThen(replyFromStorage(message))
        )
      })
    }
  })
})

/**
 * Creates a no-op `Runners` service that rejects sends with
 * `EntityNotAssignedToRunner` and ignores notifications, pings, and unavailable
 * runner reports.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeNoop: Effect.Effect<
  Runners["Service"],
  never,
  MessageStorage.MessageStorage | Snowflake.Generator | ShardingConfig | Scope
> = make({
  codecFor: Schema.toCodecJson as RpcSerialization.CodecFor,
  send: ({ message }) => Effect.fail(new EntityNotAssignedToRunner({ address: message.envelope.address })),
  notify: () => Effect.void,
  ping: () => Effect.void,
  onRunnerUnavailable: () => Effect.void
})

/**
 * Layer that provides the no-op `Runners` service, using the default snowflake
 * generator.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerNoop: Layer.Layer<
  Runners,
  never,
  ShardingConfig | MessageStorage.MessageStorage
> = Layer.effect(Runners, makeNoop).pipe(Layer.provide([Snowflake.layerGenerator]))

const rpcErrors: Schema.Union<[
  typeof EntityNotAssignedToRunner,
  typeof MailboxFull,
  typeof AlreadyProcessingMessage
]> = Schema.Union([
  EntityNotAssignedToRunner,
  MailboxFull,
  AlreadyProcessingMessage
])

/**
 * RPC group used for runner-to-runner communication, including ping, notify,
 * effect, stream, and envelope messages.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class Rpcs extends RpcGroup.make(
  Rpc.make("Ping"),
  Rpc.make("Notify", {
    payload: {
      envelope: Envelope.Partial,
      persisted: Schema.Boolean
    },
    success: Schema.Void,
    error: rpcErrors
  }),
  Rpc.make("Effect", {
    payload: {
      request: Envelope.PartialRequest,
      persisted: Schema.Boolean
    },
    success: Reply.Encoded,
    error: rpcErrors
  }),
  Rpc.make("Stream", {
    payload: {
      request: Envelope.PartialRequest,
      persisted: Schema.Boolean
    },
    error: rpcErrors,
    success: Reply.Encoded,
    stream: true
  }),
  Rpc.make("Envelope", {
    payload: {
      envelope: Schema.Union([Envelope.AckChunk, Envelope.Interrupt]),
      persisted: Schema.Boolean
    },
    error: rpcErrors
  })
) {}

/**
 * Client interface generated from the runner RPC group.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RpcClient extends RpcClient_.FromGroup<typeof Rpcs, RpcClientError> {}

/**
 * Builds a runner RPC client from the current `RpcClient.Protocol`, using the
 * `Runners` span prefix with tracing disabled.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeRpcClient: Effect.Effect<
  RpcClient,
  never,
  RpcClient_.Protocol | Scope
> = RpcClient_.make(Rpcs, { spanPrefix: "Runners", disableTracing: true })

/**
 * Builds a `Runners` service backed by RPC clients, caching a client per runner
 * address and dispatching ping, notify, effect, stream, and envelope messages over
 * the runner protocol.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeRpc: Effect.Effect<
  Runners["Service"],
  never,
  Scope | RpcClientProtocol | MessageStorage.MessageStorage | Snowflake.Generator | ShardingConfig
> = Effect.gen(function*() {
  const clientProtocol = yield* RpcClientProtocol
  const snowflakeGen = yield* Snowflake.Generator

  const clients = yield* RcMap.make({
    lookup: (address: RunnerAddress) =>
      Effect.flatMap(
        clientProtocol.make(address),
        (protocol) =>
          Effect.map(
            Effect.provideService(makeRpcClient, RpcClient_.Protocol, protocol),
            (client) => ({ client, codecFor: protocol.codecFor })
          )
      ),
    idleTimeToLive: "3 minutes"
  })

  return yield* make({
    codecFor: clientProtocol.codecFor,
    ping(address) {
      return RcMap.get(clients, address).pipe(
        Effect.flatMap(({ client }) => client.Ping()),
        Effect.catchCause(() =>
          Effect.andThen(
            RcMap.invalidate(clients, address),
            Effect.fail(new RunnerUnavailable({ address }))
          )
        ),
        Effect.scoped
      )
    },
    send({ address, message }) {
      const rpc = message.rpc as any as Rpc.AnyWithProps
      const isPersisted = Context.get(rpc.annotations, Persisted)
      if (message._tag === "OutgoingEnvelope") {
        return RcMap.get(clients, address).pipe(
          Effect.flatMap(({ client }) =>
            client.Envelope({
              envelope: message.envelope,
              persisted: isPersisted
            })
          ),
          Effect.scoped,
          Effect.catchTag("RpcClientError", () => Effect.fail(new RunnerUnavailable({ address })))
        )
      }
      // Persisted requests can recover their reply from storage via the
      // `RunnerUnavailable` path, volatile requests receive the defect as their reply.
      const respondDefect = (defect: unknown) =>
        isPersisted
          ? Effect.fail(new RunnerUnavailable({ address }))
          : message.respond(
            new Reply.WithExit({
              id: snowflakeGen.nextUnsafe(),
              requestId: message.envelope.requestId,
              exit: Exit.die(defect)
            })
          )
      const respondMalformed = (error: MalformedMessage) =>
        message.respond(
          new Reply.WithExit({
            id: snowflakeGen.nextUnsafe(),
            requestId: message.envelope.requestId,
            exit: Exit.die(error)
          })
        )
      const isStream = RpcSchema.isStreamSchema(rpc.successSchema)
      if (!isStream) {
        return RcMap.get(clients, address).pipe(
          Effect.flatMap(({ client, codecFor }) =>
            Effect.matchEffect(Message.serializeRequest(message, codecFor), {
              onSuccess: (request) =>
                client.Effect({
                  request,
                  persisted: isPersisted
                }).pipe(
                  Effect.flatMap((reply) =>
                    Schema.decodeEffect(Reply.Reply(message.rpc, codecFor))(reply).pipe(
                      Effect.provideContext(message.context),
                      Effect.orDie
                    )
                  ),
                  Effect.flatMap(message.respond),
                  Effect.catchTag("RpcClientError", () => Effect.fail(new RunnerUnavailable({ address }))),
                  Effect.catchDefect(respondDefect)
                ),
              onFailure: respondMalformed
            })
          ),
          Effect.scoped
        )
      }
      return RcMap.get(clients, address).pipe(
        Effect.flatMap(({ client, codecFor }) =>
          Effect.matchEffect(Message.serializeRequest(message, codecFor), {
            onSuccess: (request) =>
              client.Stream({
                request,
                persisted: isPersisted
              }, { asQueue: true }).pipe(
                Effect.flatMap((queue) => {
                  const decode = Schema.decodeEffect(Reply.Reply(message.rpc, codecFor))
                  return Queue.take(queue).pipe(
                    Effect.flatMap((reply) => Effect.orDie(decode(reply))),
                    Effect.flatMap(message.respond),
                    Effect.forever,
                    Effect.provideContext(message.context),
                    Effect.catchTag("Done", (_) => Effect.void),
                    Effect.catchTag("RpcClientError", () => Effect.fail(new RunnerUnavailable({ address }))),
                    Effect.catchDefect(respondDefect)
                  )
                })
              ),
            onFailure: respondMalformed
          })
        ),
        Effect.scoped
      )
    },
    notify({ address, message }) {
      if (Option.isNone(address)) {
        return Effect.void
      }
      const rpc = message.rpc as any as Rpc.AnyWithProps
      const isPersisted = Context.get(rpc.annotations, Persisted)
      const envelope = message.envelope
      const notify = RcMap.get(clients, address.value).pipe(
        Effect.flatMap(({ client, codecFor }) => {
          const encode: Effect.Effect<Envelope.AckChunk | Envelope.Interrupt | Envelope.PartialRequest> =
            message._tag === "OutgoingRequest"
              ? Effect.orDie(Message.serializeRequest(message, codecFor))
              : Effect.succeed(envelope)
          return Effect.flatMap(encode, (envelope) =>
            client.Notify({
              envelope,
              persisted: isPersisted
            }))
        }),
        Effect.scoped,
        Effect.catchTag("RpcClientError", () => Effect.fail(new RunnerUnavailable({ address: address.value })))
      )
      return isPersisted ? Effect.ignore(notify) : notify
    },
    onRunnerUnavailable: (address) => RcMap.invalidate(clients, address)
  })
})

/**
 * Layer that provides an RPC-backed `Runners` service using `RpcClientProtocol`,
 * message storage, sharding configuration, and the default snowflake generator.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerRpc: Layer.Layer<
  Runners,
  never,
  MessageStorage.MessageStorage | RpcClientProtocol | ShardingConfig
> = Layer.effect(Runners, makeRpc).pipe(
  Layer.provide(Snowflake.layerGenerator)
)

/**
 * Service that creates RPC client protocols for runner addresses and exposes
 * the codec shared by those protocols.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class RpcClientProtocol extends Context.Service<
  RpcClientProtocol,
  {
    readonly make: (address: RunnerAddress) => Effect.Effect<RpcClient_.Protocol["Service"], never, Scope>
    readonly codecFor: RpcSerialization.CodecFor
  }
>()("effect/cluster/Runners/RpcClientProtocol") {}
