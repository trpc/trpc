import * as Arr from "../../Array.ts"
import * as Cause from "../../Cause.ts"
import { Clock } from "../../Clock.ts"
import * as Context from "../../Context.ts"
import * as Duration from "../../Duration.ts"
import type { Input } from "../../Duration.ts"
import * as Effect from "../../Effect.ts"
import * as Equal from "../../Equal.ts"
import * as Exit from "../../Exit.ts"
import * as Fiber from "../../Fiber.ts"
import { constVoid, identity } from "../../Function.ts"
import { scopeAddFinalizerUnsafe, scopeRemoveFinalizerUnsafe } from "../../internal/effect.ts"
import * as Latch from "../../Latch.ts"
import * as Metric from "../../Metric.ts"
import * as Option from "../../Option.ts"
import { CurrentLogAnnotations } from "../../References.ts"
import type * as Rpc from "../../rpc/Rpc.ts"
import * as RpcServer from "../../rpc/RpcServer.ts"
import * as Schedule from "../../Schedule.ts"
import * as Schema from "../../Schema.ts"
import * as SchemaIssue from "../../SchemaIssue.ts"
import * as Scope from "../../Scope.ts"
import type { PersistenceError } from "../ClusterError.ts"
import { AlreadyProcessingMessage, EntityNotAssignedToRunner, MailboxFull, MalformedMessage } from "../ClusterError.ts"
import * as ClusterMetrics from "../ClusterMetrics.ts"
import { isUninterruptibleForServer, Persisted, WithTransaction } from "../ClusterSchema.ts"
import * as ClusterSchema from "../ClusterSchema.ts"
import type { Entity, HandlersFrom } from "../Entity.ts"
import { CurrentAddress, CurrentRunnerAddress, KeepAliveLatch, KeepAliveRpc, Request } from "../Entity.ts"
import type { EntityAddress } from "../EntityAddress.ts"
import type { EntityId } from "../EntityId.ts"
import type * as Envelope from "../Envelope.ts"
import * as Message from "../Message.ts"
import * as MessageStorage from "../MessageStorage.ts"
import * as Reply from "../Reply.ts"
import type { RunnerAddress } from "../RunnerAddress.ts"
import type { ShardId } from "../ShardId.ts"
import type { Sharding } from "../Sharding.ts"
import { ShardingConfig } from "../ShardingConfig.ts"
import * as Snowflake from "../Snowflake.ts"
import * as ClusterAbandon from "./clusterAbandon.ts"
import { CurrentActivationScope } from "./entityActivation.ts"
import { EntityReaper } from "./entityReaper.ts"
import { acquireEntity, releaseEntity } from "./interruptors.ts"
import { ResourceMap } from "./resourceMap.ts"
import { ResourceRef } from "./resourceRef.ts"

/**
 * @internal
 */
export interface EntityManager {
  readonly sendLocal: <R extends Rpc.Any>(
    message: Message.IncomingLocal<R>
  ) => Effect.Effect<void, EntityNotAssignedToRunner | MailboxFull | AlreadyProcessingMessage>

  readonly send: (
    message: Message.Incoming<any>
  ) => Effect.Effect<void, EntityNotAssignedToRunner | MailboxFull | AlreadyProcessingMessage>

  readonly isProcessingFor: (message: Message.Incoming<any>, options?: {
    readonly excludeReplies?: boolean
    readonly excludeCompleted?: boolean
  }) => boolean
  readonly clearProcessed: () => void

  readonly isResidentUnsafe: (address: EntityAddress) => boolean
  readonly residentAddressesUnsafe: () => Array<EntityAddress>

  readonly interruptShard: (shardId: ShardId, options?: {
    readonly force?: boolean
  }) => Effect.Effect<void>
  // Whether any of the shard's entities are still open, including those that
  // `interruptShard` is waiting on
  readonly hasServersUnsafe: (shardId: ShardId) => boolean

  readonly activeEntityCount: Effect.Effect<number>
}

// Tracks how many entities are resident on the runner across all entity
// managers, so the spawn of new entities can be gated by
// `ShardingConfig.maxResidentEntities`.
/**
 * @internal
 */
export interface Residency {
  /**
   * Reserve a slot for a new entity. Returns `false` when the runner is at
   * capacity.
   */
  readonly admitUnsafe: () => boolean
  readonly releaseUnsafe: () => void
}

interface RequestTransaction {
  settle?: ((outcome: Exit.Exit<unknown, unknown>) => Effect.Effect<void>) | undefined
}

// Represents the entities managed by this entity manager
/**
 * @internal
 */
export type EntityState = {
  readonly address: EntityAddress
  readonly scope: Scope.Scope
  readonly activeRequests: Map<Snowflake.Snowflake, {
    readonly rpc: Rpc.AnyWithProps
    readonly message: Message.IncomingRequestLocal<any>
    sentReply: boolean
    /** Excludes requests awaiting their first dispatch from replay. */
    delivered: boolean
    sentExit: boolean
    /** Treat early termination interrupts like shutdown interrupts. */
    terminating?: boolean | undefined
    lastSentChunk: Option.Option<Reply.Chunk<Rpc.Any>>
    sequence: number
    /** Set when the request should not outlive its caller. */
    callerScope?: Scope.Scope | undefined
    transaction?: RequestTransaction | undefined
  }>
  lastActiveCheck: number
  write: RpcServer.RpcServer<any>["write"]
  readonly keepAliveLatch: Latch.Latch
  keepAliveEnabled: boolean
}

/**
 * @internal
 */
export const make = Effect.fnUntraced(function*<
  Type extends string,
  Rpcs extends Rpc.Any,
  Handlers extends HandlersFrom<Rpcs>,
  RX
>(
  entity: Entity<Type, Rpcs>,
  buildHandlers: Effect.Effect<Handlers, never, RX>,
  options: {
    readonly sharding: Sharding["Service"]
    readonly storage: MessageStorage.MessageStorage["Service"]
    readonly runnerAddress: RunnerAddress
    readonly residency: Residency
    readonly maxIdleTime?: Input | undefined
    readonly concurrency?: number | "unbounded" | undefined
    readonly mailboxCapacity?: number | "unbounded" | undefined
    readonly mailboxMetrics?: boolean | undefined
    readonly disableFatalDefects?: boolean | undefined
    readonly defectRetryPolicy?: Schedule.Schedule<any, unknown, never, never> | undefined
    readonly spanAttributes?: Record<string, string> | undefined
    /**
     * Called once a retiring entity stops accepting requests, so callers
     * waiting on requests it has not started can be released.
     */
    readonly abandonUndelivered: (
      address: EntityAddress,
      isDelivered: (requestId: Snowflake.Snowflake) => boolean
    ) => Effect.Effect<void>
    /**
     * Whether this runner still owns the shard, checked before storing the
     * final reply of a persisted request.
     */
    readonly isShardOwned: (shardId: ShardId) => Effect.Effect<boolean>
  }
) {
  const config = yield* ShardingConfig
  const snowflakeGen = yield* Snowflake.Generator
  const managerScope = yield* Effect.scope
  const storageEnabled = options.storage !== MessageStorage.noop
  const mailboxCapacity = options.mailboxCapacity ?? config.entityMailboxCapacity
  const mailboxMetrics = options.mailboxMetrics ?? config.entityMailboxMetrics
  const clock = yield* Clock
  const context = yield* Effect.context<Rpc.Services<Rpcs> | Rpc.Middleware<Rpcs> | RX>()
  const defectRetryPolicy = options.defectRetryPolicy
    ? Schedule.concat(options.defectRetryPolicy, defaultRetryPolicy)
    : defaultRetryPolicy
  const retryDriver = yield* Schedule.toStepWithSleep(defectRetryPolicy)
  const entityRpcs = new Map(entity.protocol.requests)

  // The series reads the mailbox size on snapshot, so delivery does no extra work.
  const registerMailboxSize = (address: EntityAddress, activeRequests: EntityState["activeRequests"]) =>
    Metric.registerUnsafe(
      Metric.withAttributes(ClusterMetrics.entityMailboxSize, {
        type: entity.type,
        id: address.entityId,
        shard: address.shardId.toString()
      }),
      context as Context.Context<never>,
      {
        get: () => ({ value: BigInt(activeRequests.size) }),
        update: constVoid,
        modify: constVoid
      }
    )

  // add internal rpcs
  entityRpcs.set(KeepAliveRpc._tag, KeepAliveRpc as any)

  const activeServers = new Map<EntityId, EntityState>()
  // Entities finishing their in-flight requests after removal, which still
  // accept interrupts and acks
  const drainingServers = new Map<EntityId, EntityState>()
  // Mailboxes of every resident entity, including draining ones. Unlike the
  // server maps it is not keyed by entity id, which can be resident on several
  // shards at once.
  const residentMailboxes = new Set<EntityState["activeRequests"]>()

  // Registered before the entities resource map, so the series is removed
  // only after every entity has drained on shutdown.
  yield* Effect.acquireRelease(
    Effect.sync(() =>
      Metric.registerUnsafe(
        Metric.withAttributes(ClusterMetrics.entityMailboxSizeMax, { type: entity.type }),
        context as Context.Context<never>,
        {
          get: () => {
            let max = 0
            for (const mailbox of residentMailboxes) {
              if (mailbox.size > max) max = mailbox.size
            }
            return { value: BigInt(max) }
          },
          update: constVoid,
          modify: constVoid
        }
      )
    ),
    (registration) => Effect.sync(registration.remove)
  )

  const serverCloseLatches = new Map<EntityAddress, {
    readonly closed: Latch.Latch
    readonly force: Latch.Latch
    closing: boolean
  }>()
  const processedRequestIds = new Set<Snowflake.Snowflake>()

  const entities: ResourceMap<
    EntityAddress,
    EntityState,
    EntityNotAssignedToRunner | MailboxFull
  > = yield* ResourceMap.make(Effect.fnUntraced(function*(address: EntityAddress) {
    if (!options.sharding.hasShardId(address.shardId)) {
      return yield* new EntityNotAssignedToRunner({ address })
    }

    const scope = yield* Effect.scope

    // Gate the spawn on the runner-wide entity cap. Registering the release
    // must be atomic with taking the slot, otherwise an interrupt in between
    // would leak it.
    yield* Effect.uninterruptible(Effect.suspend(() =>
      options.residency.admitUnsafe()
        ? Scope.addFinalizer(scope, Effect.sync(options.residency.releaseUnsafe))
        : Effect.fail(new MailboxFull({ address }))
    ))
    const endLatch = Latch.makeUnsafe()
    const keepAliveLatch = Latch.makeUnsafe()
    const closeLatches = {
      closed: Latch.makeUnsafe(),
      force: Latch.makeUnsafe(),
      closing: false
    }

    // Finalizers run in reverse, so the mailbox series and the resident
    // mailbox are removed only after the drain finalizer below has finished.
    const activeRequests: EntityState["activeRequests"] = new Map()
    // Drops a request that has left this entity, starting the idle timer when
    // it was the last one.
    const removeActiveRequest = (requestId: Snowflake.Snowflake) => {
      activeRequests.delete(requestId)
      if (activeRequests.size === 0) {
        state.lastActiveCheck = clock.currentTimeMillisUnsafe()
      }
    }
    let mailboxSeries: Metric.Registration | undefined
    yield* Scope.addFinalizer(
      scope,
      Effect.sync(() => {
        releaseEntity(address)
        mailboxSeries?.remove()
        residentMailboxes.delete(activeRequests)
      })
    )

    // on shutdown, reset the storage for the entity
    yield* Scope.addFinalizerExit(
      scope,
      () => {
        serverCloseLatches.get(address)?.closed.openUnsafe()
        serverCloseLatches.delete(address)
        return Effect.void
      }
    )

    const retired = Latch.makeUnsafe()
    const isActive = () => !retired.isOpen()

    // Replay previously dispatched requests before admitting new work.
    const replay = Effect.fnUntraced(function*(write: EntityState["write"]) {
      if (!isActive()) return
      for (const request of activeRequests.values()) {
        if (!request.delivered) continue
        request.sentExit = false
        yield* write(0, requestEnvelope(request), requestWriteOptions(request))
      }
    })

    const writeRef = yield* ResourceRef.from(
      scope,
      Effect.fnUntraced(function*(handlerScope) {
        let isShuttingDown = false

        const handlerContext = context.pipe(
          Context.add(CurrentAddress, address),
          Context.add(CurrentRunnerAddress, options.runnerAddress),
          Context.add(KeepAliveLatch, keepAliveLatch),
          Context.add(CurrentActivationScope, scope),
          Context.add(Scope.Scope, handlerScope),
          Context.add(CurrentLogAnnotations, {})
        )

        // Initiate the behavior for the entity
        const handlers = yield* (entity.protocol.toHandlers(buildHandlers as any).pipe(
          Effect.setContext(handlerContext as Context.Context<any>),
          Effect.sandbox,
          Effect.tapError((cause) => Effect.logError("Defect building entity handlers", cause)),
          Effect.retry(defectRetryPolicy)
        ) as Effect.Effect<Context.Context<Rpc.ToHandler<Rpcs>>>)

        const server = yield* RpcServer.makeNoSerialization(entity.protocol, {
          spanPrefix: entity.type,
          spanAttributes: {
            ...options.spanAttributes,
            "entity.type": entity.type,
            "entity.id": address.entityId
          },
          concurrency: options.concurrency ?? 1,
          disableFatalDefects: options.disableFatalDefects,
          onFromServer(response): Effect.Effect<void> {
            switch (response._tag) {
              case "Exit": {
                const request = activeRequests.get(Snowflake.Snowflake(response.requestId))
                if (!request) return Effect.void

                request.sentReply = true
                request.sentExit = true

                // Rebuild interrupts are not replies; replacement handlers replay the request.
                if (isShuttingDown && Exit.hasInterrupts(response.exit) && isActive()) {
                  return Effect.void
                }

                const persisted = storageEnabled && Context.get(request.message.annotations, Persisted)
                if (persisted && Exit.isFailure(response.exit) && Cause.hasInterrupts(response.exit.cause)) {
                  // A durable request interrupted by shutdown, or abandoned
                  // because this owner can no longer serve it, is left for
                  // replay instead of being answered.
                  const abandoned = ClusterAbandon.isCause(response.exit.cause) &&
                    (!isActive() || !options.sharding.hasShardId(address.shardId))
                  if (isShuttingDown || request.terminating || abandoned) {
                    removeActiveRequest(Snowflake.Snowflake(response.requestId))
                    return options.storage.unregisterReplyHandler(request.message.envelope.requestId)
                  }
                  // An uninterruptible request ignores the interrupt and runs again.
                  if (isUninterruptibleForServer(request.message.annotations)) {
                    request.sentExit = false
                    return server.write(0, requestEnvelope(request), requestWriteOptions(request)).pipe(
                      Effect.setContext(handlerContext),
                      Effect.forkIn(handlerScope)
                    )
                  }
                }
                // A failed save can abort the request transaction, so a retry
                // could store a success outside it. Save once and let the
                // failed transaction replay the request.
                const write = retryRespond(
                  persisted && request.transaction && Exit.isSuccess(response.exit) ? 0 : 4,
                  Effect.suspend(() =>
                    request.message.respond(
                      new Reply.WithExit({
                        requestId: Snowflake.Snowflake(response.requestId),
                        id: snowflakeGen.nextUnsafe(),
                        exit: response.exit
                      })
                    )
                  )
                )
                // A runner that lost the shard must not decide the stored
                // result. A rejection is not retried.
                let fenced = false
                const save = !persisted ? write : Effect.flatMap(
                  options.isShardOwned(address.shardId),
                  (owned): Effect.Effect<void, MalformedMessage | PersistenceError | EntityNotAssignedToRunner> => {
                    if (owned) return write
                    fenced = true
                    return Effect.fail(new EntityNotAssignedToRunner({ address }))
                  }
                )
                // Leave the request for the shard's owner: release the claim
                // so its next poll sees it, and let local callers re-route.
                const abandonFenced = Effect.suspend(() => {
                  removeActiveRequest(Snowflake.Snowflake(response.requestId))
                  return Effect.logDebug("Abandoning a request whose shard this runner no longer owns").pipe(
                    Effect.andThen(options.storage.unregisterReplyHandler(request.message.envelope.requestId)),
                    Effect.andThen(Effect.ignore(options.storage.resetRequests([request.message.envelope.requestId])))
                  )
                })
                const complete = Effect.sync(() => {
                  if (storageEnabled) {
                    processedRequestIds.add(request.message.envelope.requestId)
                  }
                  removeActiveRequest(Snowflake.Snowflake(response.requestId))
                })
                // Let callers read the saved reply instead of waiting on a
                // handler that will never be resumed.
                const completeFromStorage = Effect.andThen(
                  complete,
                  options.storage.unregisterReplyHandler(request.message.envelope.requestId)
                )
                const respond = Effect.andThen(save, complete).pipe(
                  Effect.catchTag("EntityNotAssignedToRunner", () => abandonFenced),
                  // A save can commit and still fail, e.g. when the COMMIT
                  // acknowledgement is lost. Volatile requests skip the lookup:
                  // their replies are never stored, and a storage read could
                  // stall a custom responder's failure.
                  Effect.catchTag("PersistenceError", (error) =>
                    persisted
                      ? Effect.flatMap(
                        hasStoredExit(request.message.envelope.requestId),
                        (committed) => committed ? completeFromStorage : Effect.fail(error)
                      )
                      : Effect.fail(error)),
                  Effect.orDie
                )
                const transaction = request.transaction
                if (!transaction) return respond
                const exit = response.exit

                if (!persisted) {
                  if (Exit.isSuccess(exit)) return respond
                  transaction.settle = () => respond
                  return Effect.void
                }

                if (Exit.isSuccess(exit)) {
                  transaction.settle = (outcome) => {
                    if (Exit.isSuccess(outcome)) return complete
                    // A rejected save failed the transaction, rolling back the
                    // handler's writes; the request is left for the owner.
                    if (fenced) return abandonFenced
                    // The commit can succeed despite the error.
                    return Effect.flatMap(
                      hasStoredExit(request.message.envelope.requestId),
                      (committed) => committed ? completeFromStorage : restartFrom(outcome.cause)
                    )
                  }
                  return Effect.orDie(save)
                }
                transaction.settle = (outcome) =>
                  // Transaction wrappers can add defects, but not typed errors; interrupts may be repeated.
                  Exit.isSuccess(outcome) || !outcome.cause.reasons.some((reason) =>
                      Cause.isDieReason(reason) &&
                      !exit.cause.reasons.some((r) => Cause.isDieReason(r) && r.defect === reason.defect)
                    )
                    ? respond
                    : restartFrom(outcome.cause)
                return Effect.void
              }
              case "Chunk": {
                const request = activeRequests.get(Snowflake.Snowflake(response.requestId))
                if (!request) return Effect.void
                const sequence = request.sequence
                request.sequence++
                if (!request.sentReply) {
                  request.sentReply = true
                }
                return Effect.orDie(retryRespond(
                  4,
                  Effect.suspend(() => {
                    const reply = new Reply.Chunk({
                      requestId: Snowflake.Snowflake(response.requestId),
                      id: snowflakeGen.nextUnsafe(),
                      sequence,
                      values: response.values
                    })
                    request.lastSentChunk = Option.some(reply)
                    return request.message.respond(reply)
                  })
                ))
              }
              case "Defect": {
                return restartFrom(Cause.die(response.defect))
              }
              case "ClientEnd": {
                return endLatch.open
              }
            }
          }
        }).pipe(
          Scope.provide(handlerScope),
          Effect.setContext(Context.merge(handlerContext, handlers))
        )

        // Replay if the stored reply cannot be read.
        const hasStoredExit = (requestId: Snowflake.Snowflake): Effect.Effect<boolean> =>
          options.storage.repliesForUnfiltered([requestId]).pipe(
            Effect.map((replies) => replies.some((reply) => reply._tag === "WithExit")),
            Effect.catchCause(() => Effect.succeed(false))
          )

        // Do not inherit the failed handler's transaction context.
        const restartFrom = (cause: Cause.Cause<unknown>): Effect.Effect<void> => {
          if (!isActive()) return endLatch.open
          const rebuild = writeRef.rebuildUnsafe({ from: server.write, prepare: replay })
          if (!rebuild) return Effect.void
          return Effect.forkIn(Effect.setContext(restart(cause, rebuild), handlerContext), managerScope)
        }

        yield* Scope.addFinalizer(
          handlerScope,
          Effect.sync(() => {
            isShuttingDown = true
          })
        )

        return server.write
      }),
      address
    )

    function restart(cause: Cause.Cause<unknown>, rebuild: Effect.Effect<void>): Effect.Effect<void> {
      return Effect.logError("Defect in entity, restarting", cause).pipe(
        Effect.andThen(Effect.ignore(retryDriver(void 0))),
        Effect.flatMap(() => isActive() ? rebuild : endLatch.open),
        Effect.annotateLogs({
          module: "EntityManager",
          address,
          runner: options.runnerAddress
        }),
        Effect.catchCause((cause) => {
          if (Cause.hasInterruptsOnly(cause)) return Effect.void
          const retry = isActive() ? writeRef.rebuildUnsafe({ prepare: replay }) : undefined
          return retry ? restart(cause, retry) : Effect.void
        })
      )
    }

    const state: EntityState = {
      scope,
      address,
      write(clientId, message, writeOptions) {
        return Effect.suspend(() => {
          if (message._tag !== "Request") {
            // Interrupts, acks and EOF reach the handlers even during shutdown.
            const write = writeRef.getUnsafe()
            return write
              ? write(clientId, message, writeOptions)
              : Effect.flatMap(writeRef.await, (write) => write(clientId, message, writeOptions))
          }
          if (!isActive()) return Effect.interrupt
          const write = writeRef.getUnsafe()
          if (write === undefined) {
            return Effect.flatMap(
              Effect.raceFirst(writeRef.await, retired.await),
              () => state.write(clientId, message, writeOptions)
            )
          }
          const request = activeRequests.get(Snowflake.Snowflake(message.id))
          if (!request) return Effect.void
          request.delivered = true
          return write(clientId, message, writeOptions)
        })
      },
      activeRequests,
      lastActiveCheck: clock.currentTimeMillisUnsafe(),
      keepAliveLatch,
      keepAliveEnabled: false
    }

    // During shutdown, signal that no more messages will be processed
    // and wait for the fiber to complete.
    //
    // If the termination timeout is reached, let the server clean itself up
    yield* Scope.addFinalizer(
      scope,
      Effect.suspend(() => {
        activeServers.delete(address.entityId)
        retired.openUnsafe()
        closeLatches.closing = true
        acquireEntity(address)
        drainingServers.set(address.entityId, state)
        return Effect.raceFirst(
          Effect.gen(function*() {
            for (const [requestId, request] of activeRequests) {
              if (
                !request.delivered || request.sentExit ||
                !Context.get(request.message.annotations, ClusterSchema.InterruptOnTermination) ||
                isUninterruptibleForServer(request.message.annotations)
              ) continue
              request.terminating = true
              yield* state.write(0, { _tag: "Interrupt", requestId: requestId as any, interruptors: [] })
            }
            // A handler this drain waits for may be parked on a request the
            // retired entity will never start, such as its own queued request.
            // Release callers before `Eof`, which waits for handler acquisition.
            yield* options.abandonUndelivered(
              address,
              (requestId) => activeRequests.get(requestId)?.delivered === true
            )
            yield* state.write(0, { _tag: "Eof" })
          }).pipe(
            Effect.andThen(endLatch.await),
            // A defect restart that finds the entity retired opens `endLatch`
            // without building handlers, so the writes above may never land.
            Effect.raceFirst(endLatch.await),
            Effect.timeoutOption(config.entityTerminationTimeout),
            Effect.interruptible
          ),
          Effect.interruptible(closeLatches.force.await)
        ).pipe(Effect.ensuring(Effect.sync(() => {
          if (drainingServers.get(address.entityId) === state) {
            drainingServers.delete(address.entityId)
          }
        })))
      })
    )
    if (!options.sharding.hasShardId(address.shardId)) {
      return yield* new EntityNotAssignedToRunner({ address })
    }
    // Do not make shard interruption wait for an entity that is still building.
    serverCloseLatches.set(address, closeLatches)
    activeServers.set(address.entityId, state)
    residentMailboxes.add(activeRequests)
    if (mailboxMetrics) {
      mailboxSeries = registerMailboxSize(address, activeRequests)
    }

    return state
  }, Effect.provideService(CurrentLogAnnotations, {})))

  const reaper = yield* EntityReaper
  const maxIdleTime = Duration.toMillis(
    Duration.fromInputUnsafe(options.maxIdleTime ?? config.entityMaxIdleTime)
  )
  if (Number.isFinite(maxIdleTime)) {
    yield* reaper.register({
      maxIdleTime,
      servers: activeServers,
      entities
    })
  }

  // The series reads the active entity count on snapshot, so an idle runner
  // does no work.
  const entitiesSeries = Metric.registerUnsafe(
    Metric.withAttributes(ClusterMetrics.entities, { type: entity.type }),
    context as Context.Context<never>,
    {
      get: () => ({ value: BigInt(activeServers.size) }),
      update: constVoid,
      modify: constVoid
    }
  )
  yield* Scope.addFinalizer(managerScope, Effect.sync(entitiesSeries.remove))

  function sendEnvelope(server: EntityState, message: Message.IncomingEnvelope): Effect.Effect<void> {
    const entry = server.activeRequests.get(message.envelope.requestId)
    if (!entry) {
      return Effect.void
    } else if (
      message.envelope._tag === "AckChunk" &&
      Option.isSome(entry.lastSentChunk) &&
      message.envelope.replyId !== entry.lastSentChunk.value.id
    ) {
      return Effect.void
    }
    return server.write(
      0,
      message.envelope._tag === "AckChunk"
        ? { _tag: "Ack", requestId: message.envelope.requestId as any }
        : {
          _tag: "Interrupt",
          requestId: message.envelope.requestId as any,
          interruptors: []
        }
    )
  }

  function sendLocal<R extends Rpc.Any>(
    message: Message.IncomingLocal<R>
  ): Effect.Effect<void, EntityNotAssignedToRunner | MailboxFull | AlreadyProcessingMessage> {
    if (message._tag === "IncomingEnvelope") {
      const draining = drainingServers.get(message.envelope.address.entityId)
      if (draining?.activeRequests.has(message.envelope.requestId)) {
        return sendEnvelope(draining, message)
      }
    }
    return Effect.provideService(
      Effect.flatMap(
        entities.get(message.envelope.address),
        (server): Effect.Effect<void, EntityNotAssignedToRunner | MailboxFull | AlreadyProcessingMessage> => {
          switch (message._tag) {
            case "IncomingRequestLocal": {
              // If the request is already running, then we might have more than
              // one sender for the same request. In this case, the other senders
              // should resume from storage only.
              let entry = server.activeRequests.get(message.envelope.requestId)
              if (entry || processedRequestIds.has(message.envelope.requestId)) {
                return Effect.fail(
                  new AlreadyProcessingMessage({
                    envelopeId: message.envelope.requestId,
                    address: message.envelope.address
                  })
                )
              }

              const rpc = entityRpcs.get(message.envelope.tag)! as any as Rpc.AnyWithProps
              if (!storageEnabled && Context.get(message.annotations, Persisted)) {
                return Effect.die(
                  "EntityManager.sendLocal: Cannot process a persisted message without MessageStorage"
                )
              }

              // Cluster internal RPCs

              // keep-alive RPC
              if (rpc._tag === KeepAliveRpc._tag) {
                const msg = message as unknown as Message.IncomingRequestLocal<typeof KeepAliveRpc>
                const reply = Effect.suspend(() =>
                  Effect.orDie(retryRespond(
                    4,
                    msg.respond(
                      new Reply.WithExit<typeof KeepAliveRpc>({
                        requestId: message.envelope.requestId,
                        id: snowflakeGen.nextUnsafe(),
                        exit: Exit.void
                      })
                    )
                  ))
                )

                if (server.keepAliveEnabled) return reply
                server.keepAliveEnabled = true
                return server.keepAliveLatch.whenOpen(Effect.suspend(() => {
                  server.keepAliveEnabled = false
                  return reply
                })).pipe(
                  Effect.forkIn(server.scope, { startImmediately: true }),
                  Effect.asVoid
                )
              }

              if (mailboxCapacity !== "unbounded" && server.activeRequests.size >= mailboxCapacity) {
                return Effect.fail(new MailboxFull({ address: message.envelope.address }))
              }

              const callerScope = message.callerScope !== undefined &&
                  !Context.get(message.annotations, Persisted) &&
                  Context.get(message.annotations, ClusterSchema.Uninterruptible) === false
                ? message.callerScope
                : undefined
              if (callerScope?.state._tag === "Closed") {
                return Effect.void
              }
              entry = {
                rpc,
                message,
                sentReply: false,
                delivered: false,
                sentExit: false,
                lastSentChunk: Option.filter(
                  message.lastSentReply,
                  (reply): reply is Reply.Chunk<Rpc.Any> => reply._tag === "Chunk"
                ),
                sequence: Option.match(message.lastSentReply, {
                  onNone: () => 0,
                  onSome: (reply) => reply._tag === "Chunk" ? reply.sequence + 1 : 0
                }),
                callerScope
              }
              server.activeRequests.set(message.envelope.requestId, entry)
              if (callerScope !== undefined) {
                // Register cleanup atomically with admission, including requests awaiting delivery.
                scopeAddFinalizerUnsafe(callerScope, {}, () =>
                  Effect.sync(() => {
                    if (server.activeRequests.delete(message.envelope.requestId) && server.activeRequests.size === 0) {
                      server.lastActiveCheck = clock.currentTimeMillisUnsafe()
                    }
                  }))
              }
              return server.write(0, requestEnvelope(entry), requestWriteOptions(entry))
            }
            case "IncomingEnvelope": {
              return sendEnvelope(server, message)
            }
          }
        }
      ),
      CurrentLogAnnotations,
      {}
    )
  }

  // Bind each handler fiber, including replays, before its body runs.
  const bindToCaller = (callerScope: Scope.Scope) => <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.withFiber<A, E, R>((fiber) => {
      if (callerScope.state._tag === "Closed") return Effect.interrupt
      const key = {}
      scopeAddFinalizerUnsafe(callerScope, key, () => Effect.sync(() => fiber.interruptUnsafe(fiber.id)))
      return Effect.ensuring(effect, Effect.sync(() => scopeRemoveFinalizerUnsafe(callerScope, key)))
    })

  const requestWriteOptions = (
    entry: {
      readonly message: Message.IncomingRequestLocal<any>
      readonly callerScope?: Scope.Scope | undefined
      transaction?: RequestTransaction | undefined
    }
  ): Parameters<EntityState["write"]>[2] => {
    const onTransaction = !Context.get(entry.message.annotations, WithTransaction)
      ? undefined
      : <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        // Interrupts during commit must not hide the outcome from settle.
        Effect.uninterruptibleMask((restore) => {
          const transaction: RequestTransaction = {}
          entry.transaction = transaction
          return Effect.onExit(options.storage.withTransaction(restore(effect)), (outcome) => {
            if (entry.transaction === transaction) entry.transaction = undefined
            return transaction.settle ? transaction.settle(outcome) : Effect.void
          })
        })
    const onCaller = entry.callerScope && bindToCaller(entry.callerScope)
    if (!onCaller) return onTransaction && { onRequest: onTransaction }
    return { onRequest: onTransaction ? (effect) => onCaller(onTransaction(effect)) : onCaller }
  }

  const decodeMessage = makeMessageDecode(entityRpcs)

  const runFork = Effect.runForkWith(context)

  return identity<EntityManager>({
    interruptShard: (shardId: ShardId, options) =>
      Effect.suspend(function loop(): Effect.Effect<void> {
        const fibers = Arr.empty<Fiber.Fiber<void>>()
        if (options?.force === true) {
          serverCloseLatches.forEach((latches, address) => {
            if (shardId[Equal.symbol](address.shardId)) {
              latches.force.openUnsafe()
            }
          })
        }
        // Look entities up by address: `activeServers` is keyed by entity id,
        // so an entity with the same id on another shard can hide this one.
        serverCloseLatches.forEach((latches, address) => {
          if (shardId[Equal.symbol](address.shardId)) {
            if (!latches.closing) {
              fibers.push(runFork(entities.removeIgnore(address)))
            }
            fibers.push(runFork(latches.closed.await))
          }
        })
        if (fibers.length === 0) return Effect.void
        return Effect.flatMap(Fiber.joinAll(fibers), loop)
      }),
    isProcessingFor(message, options) {
      if (
        options?.excludeReplies !== true && options?.excludeCompleted !== true &&
        processedRequestIds.has(message.envelope.requestId)
      ) {
        return true
      }
      const state = activeServers.get(message.envelope.address.entityId)
      if (!state) return false
      const request = state.activeRequests.get(message.envelope.requestId)
      if (request === undefined) {
        return false
      } else if (options?.excludeReplies && request.sentReply) {
        return false
      } else if (options?.excludeCompleted && request.sentExit) {
        return false
      }
      return true
    },
    clearProcessed() {
      processedRequestIds.clear()
    },
    hasServersUnsafe(shardId) {
      for (const address of serverCloseLatches.keys()) {
        if (shardId[Equal.symbol](address.shardId)) return true
      }
      return false
    },
    isResidentUnsafe: (address) => entities.hasUnsafe(address),
    residentAddressesUnsafe: () => entities.keysUnsafe(),
    sendLocal,
    send: (message) =>
      decodeMessage(message).pipe(
        Effect.matchEffect({
          onFailure: (cause) => {
            if (message._tag === "IncomingEnvelope") {
              return Effect.die(new MalformedMessage({ cause }))
            }
            return Effect.orDie(message.respond(
              new Reply.ReplyWithContext({
                reply: new Reply.WithExit({
                  id: snowflakeGen.nextUnsafe(),
                  requestId: message.envelope.requestId,
                  exit: Exit.die(new MalformedMessage({ cause }))
                }),
                rpc: entityRpcs.get(message.envelope.tag)!,
                context: context as any
              })
            ))
          },
          onSuccess: (decoded) => {
            if (decoded._tag === "IncomingEnvelope") {
              return sendLocal(decoded)
            }
            const request = message as Message.IncomingRequest<any>
            const rpc = entityRpcs.get(decoded.envelope.tag)!
            return sendLocal(
              new Message.IncomingRequestLocal({
                annotations: Context.get(rpc.annotations, ClusterSchema.Dynamic)(
                  rpc.annotations,
                  decoded.envelope as any
                ),
                envelope: decoded.envelope,
                lastSentReply: decoded.lastSentReply,
                callerScope: request.callerScope,
                respond: (reply) =>
                  request.respond(
                    new Reply.ReplyWithContext({
                      reply,
                      rpc,
                      context: context as any
                    })
                  )
              })
            )
          }
        }),
        Effect.provideContext(context as Context.Context<unknown>)
      ),
    activeEntityCount: Effect.sync(() => activeServers.size)
  })
})

const defaultRetryPolicy = Schedule.min([
  Schedule.exponential(500, 1.5),
  Schedule.spaced("10 seconds")
])

const makeMessageDecode = <Rpcs extends Rpc.Any>(entityRpcs: Map<string, Rpcs>) => {
  const decodeRequest = Effect.fnUntracedEager(function*(
    message: Message.IncomingRequest<Rpcs>,
    rpc: Rpc.AnyWithProps
  ) {
    const codecFor = message.codecFor
    const payload = yield* Schema.decodeEffect(codecFor(rpc.payloadSchema))(message.envelope.payload)
    const lastSentReply = Option.isNone(message.lastSentReply) ?
      message.lastSentReply :
      Option.some(yield* Schema.decodeEffect(Reply.Reply(rpc, codecFor))(message.lastSentReply.value))
    return {
      _tag: "IncomingRequest",
      envelope: {
        ...message.envelope,
        payload
      } as Envelope.Request.Any,
      lastSentReply
    } as const
  })

  return (message: Message.Incoming<Rpcs>): Effect.Effect<
    {
      readonly _tag: "IncomingRequest"
      readonly envelope: Envelope.Request.Any
      readonly lastSentReply: Option.Option<Reply.Reply<Rpcs>>
    } | Message.IncomingEnvelope,
    Schema.SchemaError,
    Rpc.ServicesServer<Rpcs>
  > => {
    if (message._tag === "IncomingEnvelope") {
      return Effect.succeed(message)
    }
    const rpc = entityRpcs.get(message.envelope.tag) as any as Rpc.AnyWithProps
    if (!rpc) {
      return Effect.fail(
        new Schema.SchemaError(
          new SchemaIssue.InvalidValue({
            message: "Expected a known entity RPC tag"
          })
        )
      )
    }
    return decodeRequest(message, rpc) as any as Effect.Effect<
      {
        readonly _tag: "IncomingRequest"
        readonly envelope: Envelope.Request.Any
        readonly lastSentReply: Option.Option<Reply.Reply<Rpcs>>
      },
      Schema.SchemaError,
      Rpc.ServicesServer<Rpcs>
    >
  }
}

const requestEnvelope = (entry: {
  readonly message: Message.IncomingRequestLocal<any>
  readonly lastSentChunk: Option.Option<Reply.Chunk<Rpc.Any>>
}): Parameters<EntityState["write"]>[1] => ({
  ...entry.message.envelope,
  id: entry.message.envelope.requestId as any,
  tag: entry.message.envelope.tag as any,
  payload: new Request({
    ...entry.message.envelope,
    lastSentChunk: entry.lastSentChunk
  } as any) as any
})

const retryRespond = <A, E, R>(times: number, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  times === 0 ?
    effect :
    Effect.catch(effect, () => Effect.delay(retryRespond(times - 1, effect), 200))
