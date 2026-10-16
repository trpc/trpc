/**
 * Runs shard ownership and message routing for Effect Cluster.
 *
 * `Sharding` decides which shard owns an entity id, tracks which shards belong
 * to the local runner, and sends cluster messages to local handlers or remote
 * runners. It also registers entities and singletons, creates clients for
 * entity requests, polls stored messages, and tracks shutdown state. The main
 * layer connects these responsibilities to runner communication, storage,
 * health checks, configuration, and local resources.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Cause from "../Cause.ts"
import { Clock } from "../Clock.ts"
import * as Context from "../Context.ts"
import type { Input } from "../Duration.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Equal from "../Equal.ts"
import type * as Exit from "../Exit.ts"
import * as Fiber from "../Fiber.ts"
import * as FiberMap from "../FiberMap.ts"
import { constant, flow } from "../Function.ts"
import * as HashRing from "../HashRing.ts"
import * as InternalRecord from "../internal/record.ts"
import * as Latch from "../Latch.ts"
import * as Layer from "../Layer.ts"
import * as MutableHashMap from "../MutableHashMap.ts"
import * as MutableHashSet from "../MutableHashSet.ts"
import * as MutableRef from "../MutableRef.ts"
import * as Option from "../Option.ts"
import * as PubSub from "../PubSub.ts"
import { CurrentLogAnnotations } from "../References.ts"
import * as Result from "../Result.ts"
import type * as Rpc from "../rpc/Rpc.ts"
import * as RpcClient from "../rpc/RpcClient.ts"
import type { FromServer } from "../rpc/RpcMessage.ts"
import * as Schedule from "../Schedule.ts"
import * as Scope from "../Scope.ts"
import * as Semaphore from "../Semaphore.ts"
import * as Stream from "../Stream.ts"
import type { MailboxFull, PersistenceError } from "./ClusterError.ts"
import { AlreadyProcessingMessage, EntityNotAssignedToRunner } from "./ClusterError.ts"
import * as ClusterMetrics from "./ClusterMetrics.ts"
import { Persisted } from "./ClusterSchema.ts"
import * as ClusterSchema from "./ClusterSchema.ts"
import { CurrentAddress, type CurrentRunnerAddress, type Entity, type HandlersFrom } from "./Entity.ts"
import type { EntityAddress } from "./EntityAddress.ts"
import { make as makeEntityAddress } from "./EntityAddress.ts"
import type { EntityId } from "./EntityId.ts"
import { make as makeEntityId } from "./EntityId.ts"
import * as Envelope from "./Envelope.ts"
import * as ClusterAbandon from "./internal/clusterAbandon.ts"
import * as EntityManager from "./internal/entityManager.ts"
import { EntityReaper } from "./internal/entityReaper.ts"
import { hashString } from "./internal/hash.ts"
import * as ActiveTeardown from "./internal/interruptors.ts"
import { ResourceMap } from "./internal/resourceMap.ts"
import { effectiveInterval } from "./internal/shardLock.ts"
import * as Message from "./Message.ts"
import * as MessageStorage from "./MessageStorage.ts"
import * as Reply from "./Reply.ts"
import { Runner } from "./Runner.ts"
import type { RunnerAddress } from "./RunnerAddress.ts"
import * as RunnerHealth from "./RunnerHealth.ts"
import { Runners } from "./Runners.ts"
import { RunnerStorage } from "./RunnerStorage.ts"
import type { ShardId } from "./ShardId.ts"
import { make as makeShardId } from "./ShardId.ts"
import { shardGroupConfig, ShardingConfig } from "./ShardingConfig.ts"
import { EntityRegistered, type ShardingRegistrationEvent, SingletonRegistered } from "./ShardingRegistrationEvent.ts"
import { SingletonAddress } from "./SingletonAddress.ts"
import * as Snowflake from "./Snowflake.ts"

/**
 * Service that registers entities and singletons, routes messages to owned
 * shards, generates runner-local snowflake ids, and polls
 * storage for persisted work.
 *
 * **When to use**
 *
 * Use to access or provide cluster routing, shard ownership, entity
 * registration, singleton registration, and persisted-work polling.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Sharding extends Context.Service<Sharding, {
  /**
   * Returns a stream of events that occur when the runner registers entities or
   * singletons.
   */
  readonly getRegistrationEvents: Stream.Stream<ShardingRegistrationEvent>

  /**
   * Returns the `ShardId` of the shard to which the entity at the specified
   * `address` is assigned.
   */
  readonly getShardId: (entityId: EntityId, group: string) => ShardId

  /**
   * Returns `true` if the specified `shardId` is assigned to this runner.
   */
  readonly hasShardId: (shardId: ShardId) => boolean

  /**
   * Generate a Snowflake ID that is unique to this runner.
   */
  readonly getSnowflake: Effect.Effect<Snowflake.Snowflake>

  /**
   * Returns `true` if sharding is shutting down, `false` otherwise.
   */
  readonly isShutdown: Effect.Effect<boolean>

  /**
   * Constructs a `RpcClient` which can be used to send messages to the
   * specified `Entity`.
   */
  readonly makeClient: <Type extends string, Rpcs extends Rpc.Any>(
    entity: Entity<Type, Rpcs>
  ) => Effect.Effect<
    (
      entityId: string
    ) => RpcClient.RpcClient.From<
      Rpcs,
      MailboxFull | AlreadyProcessingMessage | PersistenceError | EntityNotAssignedToRunner
    >
  >

  /**
   * Registers a new entity with the runner.
   */
  readonly registerEntity: <Type extends string, Rpcs extends Rpc.Any, Handlers extends HandlersFrom<Rpcs>, RX>(
    entity: Entity<Type, Rpcs>,
    handlers: Effect.Effect<Handlers, never, RX>,
    options?: {
      readonly maxIdleTime?: Input | undefined
      readonly concurrency?: number | "unbounded" | undefined
      readonly mailboxCapacity?: number | "unbounded" | undefined
      readonly disableFatalDefects?: boolean | undefined
      readonly defectRetryPolicy?: Schedule.Schedule<any, unknown> | undefined
      readonly spanAttributes?: Record<string, string> | undefined
    }
  ) => Effect.Effect<
    void,
    never,
    | Scope.Scope
    | Rpc.ServicesServer<Rpcs>
    | Rpc.Middleware<Rpcs>
    | Exclude<RX, Scope.Scope | CurrentAddress | CurrentRunnerAddress>
  >

  /**
   * Registers a new singleton with the runner.
   */
  readonly registerSingleton: <E, R>(
    name: string,
    run: Effect.Effect<void, E, R>,
    options?: {
      readonly shardGroup?: string | undefined
    }
  ) => Effect.Effect<void, never, R | Scope.Scope>

  /**
   * Sends a message to the specified entity.
   */
  readonly send: (message: Message.Incoming<any>) => Effect.Effect<
    void,
    EntityNotAssignedToRunner | MailboxFull | AlreadyProcessingMessage
  >

  /**
   * Sends an outgoing message
   */
  readonly sendOutgoing: (
    message: Message.Outgoing<any>,
    discard: boolean
  ) => Effect.Effect<
    void,
    MailboxFull | AlreadyProcessingMessage | PersistenceError | EntityNotAssignedToRunner
  >

  /**
   * Notify sharding that a message has been persisted to storage.
   */
  readonly notify: (message: Message.Incoming<any>, options?: {
    readonly waitUntilRead?: boolean | undefined
  }) => Effect.Effect<
    void,
    EntityNotAssignedToRunner | AlreadyProcessingMessage
  >

  /**
   * Reset the state of a message. When options.expectedReplyId is provided,
   * reset only if it is still the latest reply. Otherwise reset unconditionally.
   */
  readonly reset: (
    requestId: Snowflake.Snowflake,
    options?: { readonly expectedReplyId?: Snowflake.Snowflake | undefined }
  ) => Effect.Effect<boolean>

  /**
   * Trigger a storage read, which will read all unprocessed messages.
   */
  readonly pollStorage: Effect.Effect<void>

  /**
   * Retrieves the active entity count for the current runner.
   */
  readonly activeEntityCount: Effect.Effect<number>
}>()("effect/cluster/Sharding") {}

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

interface EntityManagerState {
  readonly entity: Entity<any, any>
  readonly manager: EntityManager.EntityManager
  status: "alive" | "closing" | "closed"
}

const make = Effect.gen(function*() {
  const config = yield* ShardingConfig
  const shardLockInterval = effectiveInterval(config)
  const shardGroups = shardGroupConfig(config)
  const getRunnerAddress = () => Option.getOrUndefined(config.runnerAddress)
  const clock = yield* Clock

  const runnersService = yield* Runners
  const runnerHealth = yield* RunnerHealth.RunnerHealth
  const snowflakeGen = yield* Snowflake.Generator
  const shardingScope = yield* Effect.scope
  const isShutdown = MutableRef.make(false)
  const services = Context.omit(Scope.Scope)(yield* Effect.context<ShardingConfig>())
  const runFork = flow(
    Effect.runForkWith(services),
    Fiber.runIn(shardingScope)
  )

  const storage = yield* MessageStorage.MessageStorage
  const storageEnabled = storage !== MessageStorage.noop
  const runnerStorage = yield* RunnerStorage

  const entityManagers = new Map<string, EntityManagerState>()
  let entityRegistrationStartMillis: number | undefined
  let entityRegistrationFallbackStartMillis: number | undefined
  const entityRegistrationTimeoutMillis = Duration.toMillis(
    Duration.fromInputUnsafe(config.entityRegistrationTimeout)
  )
  const entityRegistrationTimeRemaining = () => {
    const now = clock.currentTimeMillisUnsafe()
    const registrationStarted = entityRegistrationStartMillis !== undefined
    // The first missing entity observed by either the storage read loop or a
    // local send starts the shared fallback registration window.
    const timeoutStartMillis = entityRegistrationStartMillis ??
      (entityRegistrationFallbackStartMillis ??= now)
    // If registration never starts, allow two intervals from the first missing
    // entity before failing.
    const timeoutMillis = registrationStarted
      ? entityRegistrationTimeoutMillis
      : entityRegistrationTimeoutMillis * 2
    return Math.max(0, timeoutMillis - (now - timeoutStartMillis))
  }
  const entityNotRegistered = (entityType: string) =>
    Effect.die(new Error(`Entity type '${entityType}' not registered`))

  const shardAssignments = MutableHashMap.empty<ShardId, RunnerAddress>()
  const selfShards = MutableHashSet.empty<ShardId>()
  // open while shard lock storage is healthy
  const shardLocksHealthyLatch = Latch.makeUnsafe(true)

  // the active shards are the ones that we have acquired the lock for
  const acquiredShards = MutableHashSet.empty<ShardId>()
  const activeShardsLatch = yield* Latch.make(false)

  const events = yield* PubSub.unbounded<ShardingRegistrationEvent>()
  const getRegistrationEvents: Stream.Stream<ShardingRegistrationEvent> = Stream.fromPubSub(events)

  const isLocalRunner = (address: RunnerAddress) => {
    const runnerAddress = getRunnerAddress()
    return runnerAddress !== undefined && Equal.equals(address, runnerAddress)
  }

  function getShardId(entityId: EntityId, group: string): ShardId {
    const id = Math.abs(hashString(entityId) % config.shardsPerGroup) + 1
    return makeShardId(group, id)
  }

  function isEntityOnLocalShards(address: EntityAddress): boolean {
    return MutableHashSet.has(acquiredShards, address.shardId)
  }

  yield* Scope.addFinalizer(
    shardingScope,
    Effect.logDebug("Shutdown complete").pipe(Effect.annotateLogs({
      module: "effect/cluster/Sharding"
    }))
  )

  // --- Shard acquisition ---
  //
  // Responsible for acquiring and releasing shards from RunnerStorage.
  //
  // This should be shutdown last, when all entities have been shutdown, to
  // allow them to move to another runner.

  const releasingShards = MutableHashSet.empty<ShardId>()
  // Shards whose entities must be force interrupted and locks fully released
  // before normal reacquisition.
  const forceReleasingShards = MutableHashSet.empty<ShardId>()
  const initialRunnerAddress = getRunnerAddress()
  if (initialRunnerAddress) {
    const selfAddress = initialRunnerAddress
    yield* Scope.addFinalizerExit(shardingScope, () => {
      // the locks expire over time, so if this fails we ignore it
      return Effect.ignore(runnerStorage.releaseAll(selfAddress))
    })

    const releaseShardsMap = yield* FiberMap.make<ShardId>()
    let forcedShardReleaseRunning = false
    // Interrupt the shards' entities, wait for lock health, run the storage
    // release, then clear the shards' bookkeeping.
    const runShardRelease = Effect.fnUntraced(function*<E>(
      shardIds: ReadonlyArray<ShardId>,
      force: boolean,
      release: Effect.Effect<void, E>
    ) {
      const fibers = Arr.empty<Fiber.Fiber<void>>()
      for (const shardId of shardIds) {
        for (const state of entityManagers.values()) {
          if (state.status === "closed") continue
          fibers.push(yield* Effect.forkScoped(state.manager.interruptShard(shardId, { force })))
        }
      }
      yield* Fiber.joinAll(fibers)
      yield* shardLocksHealthyLatch.await
      yield* release
      for (const shardId of shardIds) {
        MutableHashSet.remove(releasingShards, shardId)
        MutableHashSet.remove(forceReleasingShards, shardId)
        // During shutdown, parked waiters are interrupted: this runner will
        // never observe the reply. During a rebalance the waiters are resumed
        // with `EntityNotAssignedToRunner`, and the client falls back to
        // waiting for the reply via storage while the entity moves.
        yield* storage.unregisterShardReplyHandlers(shardId, {
          interrupt: MutableRef.get(isShutdown)
        })
      }
    })
    const retryShardRelease =
      (annotations: { readonly fiber: string; readonly shardId?: ShardId }) =>
      <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(
          Effect.sandbox,
          Effect.tapError((cause) =>
            Effect.logDebug(`Could not release shards, retrying`, cause).pipe(
              Effect.annotateLogs({
                module: "effect/cluster/Sharding",
                runner: selfAddress,
                ...annotations
              }),
              // Effect.eventually retries immediately, so space failures to
              // avoid hot-looping while storage is unavailable.
              Effect.andThen(Effect.sleep(50))
            )
          ),
          Effect.eventually
        )
    const releaseShard = Effect.fnUntraced(
      function*(shardId: ShardId) {
        yield* runShardRelease(
          [shardId],
          MutableHashSet.has(forceReleasingShards, shardId),
          runnerStorage.release(selfAddress, shardId)
        )
      },
      (effect, shardId) =>
        effect.pipe(
          retryShardRelease({ fiber: "releaseShard", shardId }),
          FiberMap.run(releaseShardsMap, shardId, { onlyIfMissing: true })
        )
    )
    // The forced release ends with `runnerStorage.releaseAll`, which drops
    // every lock held by this runner. Shards must not be reacquired through the
    // normal path while it is pending, otherwise the bulk release wipes a lock
    // the runner already considers acquired.
    const forcedShardReleasePending = () => forcedShardReleaseRunning || MutableHashSet.size(forceReleasingShards) > 0
    const releaseForcedShards = Effect.suspend(() => {
      if (forcedShardReleaseRunning || MutableHashSet.size(forceReleasingShards) === 0) {
        return Effect.void
      }
      forcedShardReleaseRunning = true
      const shardIds = [...forceReleasingShards]
      return runShardRelease(shardIds, true, runnerStorage.releaseAll(selfAddress)).pipe(
        retryShardRelease({ fiber: "releaseForcedShards" }),
        Effect.ensuring(Effect.sync(() => {
          forcedShardReleaseRunning = false
          activeShardsLatch.openUnsafe()
        })),
        Effect.forkIn(shardingScope),
        Effect.asVoid
      )
    })
    const releaseShards = Effect.gen(function*() {
      yield* releaseForcedShards
      for (const shardId of releasingShards) {
        if (MutableHashSet.has(forceReleasingShards, shardId)) continue
        if (FiberMap.hasUnsafe(releaseShardsMap, shardId)) continue
        yield* releaseShard(shardId)
      }
    })

    yield* Effect.gen(function*() {
      activeShardsLatch.openUnsafe()

      while (true) {
        yield* activeShardsLatch.await
        activeShardsLatch.closeUnsafe()

        // if a shard is no longer assigned to this runner, we release it
        for (const shardId of acquiredShards) {
          if (MutableHashSet.has(selfShards, shardId)) continue
          MutableHashSet.remove(acquiredShards, shardId)
          MutableHashSet.add(releasingShards, shardId)
        }

        if (MutableHashSet.size(releasingShards) > 0 || MutableHashSet.size(forceReleasingShards) > 0) {
          yield* Effect.forkIn(syncSingletons, shardingScope)
          yield* releaseShards
        }

        if (!shardLocksHealthyLatch.isOpen()) {
          continue
        }

        // Wait for the pending bulk release before reacquiring, so it cannot
        // drop a lock acquired here. `releaseForcedShards` reopens the latch.
        if (forcedShardReleasePending()) {
          continue
        }

        // if a shard has been assigned to this runner, we acquire it
        const unacquiredShards = MutableHashSet.empty<ShardId>()
        for (const shardId of selfShards) {
          if (MutableHashSet.has(acquiredShards, shardId) || MutableHashSet.has(releasingShards, shardId)) continue
          MutableHashSet.add(unacquiredShards, shardId)
        }

        if (MutableHashSet.size(unacquiredShards) === 0) {
          continue
        }

        const oacquired = yield* runnerStorage.acquire(selfAddress, unacquiredShards).pipe(
          Effect.timeoutOption(shardLockInterval)
        )
        if (Option.isNone(oacquired)) {
          activeShardsLatch.openUnsafe()
          continue
        }

        const acquired = oacquired.value
        yield* storage.resetShards(acquired).pipe(
          Effect.ignore,
          Effect.timeoutOption(shardLockInterval)
        )
        // A forced release can start while `acquire` is in flight, so re-check
        // it here as well as before acquiring.
        const forcedReleasePending = forcedShardReleasePending()
        for (const shardId of acquired) {
          if (
            !shardLocksHealthyLatch.isOpen() ||
            forcedReleasePending ||
            MutableHashSet.has(releasingShards, shardId) ||
            !MutableHashSet.has(selfShards, shardId)
          ) {
            MutableHashSet.add(releasingShards, shardId)
            continue
          }
          MutableHashSet.add(acquiredShards, shardId)
        }
        if (acquired.length > 0) {
          yield* storageReadLatch.open
          yield* Effect.forkIn(syncSingletons, shardingScope)

          // update metrics
          ClusterMetrics.shards.updateUnsafe(BigInt(MutableHashSet.size(acquiredShards)), Context.empty())
        }
        yield* Effect.sleep(1000)
        activeShardsLatch.openUnsafe()
      }
    }).pipe(
      Effect.catchCause((cause) => Effect.logWarning("Could not acquire/release shards", cause)),
      Effect.repeat(Schedule.spaced(config.entityMessagePollInterval)),
      Effect.annotateLogs({
        module: "effect/cluster/Sharding",
        fiber: "Shard acquisition loop",
        runner: selfAddress
      }),
      Effect.forkIn(shardingScope)
    )

    const markShardLocksUnhealthy = (cause: Cause.Cause<unknown>) =>
      Effect.suspend(() => {
        if (!shardLocksHealthyLatch.closeUnsafe()) return Effect.void

        const affectedShards = MutableHashSet.fromIterable([...acquiredShards, ...releasingShards])
        MutableHashSet.clear(selfShards)
        MutableHashSet.clear(acquiredShards)
        for (const shardId of affectedShards) {
          MutableHashSet.add(releasingShards, shardId)
          MutableHashSet.add(forceReleasingShards, shardId)
        }
        ClusterMetrics.shards.updateUnsafe(BigInt(0), Context.empty())
        activeShardsLatch.openUnsafe()

        return Effect.gen(function*() {
          yield* Effect.logError("Shard lock storage is unhealthy", cause)
          yield* Effect.forkIn(syncSingletons, shardingScope, { startImmediately: true })

          for (const shardId of affectedShards) {
            for (const state of entityManagers.values()) {
              if (state.status === "closed") continue
              yield* Effect.forkIn(
                state.manager.interruptShard(shardId, { force: true }),
                shardingScope,
                { startImmediately: true }
              )
            }
          }
          activeShardsLatch.openUnsafe()
        })
      })

    const markShardLocksHealthy = Effect.suspend(() => {
      if (!shardLocksHealthyLatch.openUnsafe()) return Effect.void

      MutableHashSet.clear(selfShards)
      MutableHashMap.forEach(shardAssignments, (runner, shardId) => {
        if (isLocalRunner(runner)) {
          MutableHashSet.add(selfShards, shardId)
        }
      })
      activeShardsLatch.openUnsafe()
      return Effect.logInfo("Shard lock storage has recovered")
    })

    const refreshShardLocks = Effect.gen(function*() {
      const refreshed = [...acquiredShards, ...releasingShards]
      const acquired = yield* runnerStorage.refresh(selfAddress, refreshed)
      // Shards acquired during the request are absent from its response.
      for (const shardId of refreshed) {
        if (MutableHashSet.has(acquiredShards, shardId) && !acquired.includes(shardId)) {
          MutableHashSet.remove(acquiredShards, shardId)
          MutableHashSet.add(releasingShards, shardId)
        }
      }
      for (let i = 0; i < acquired.length; i++) {
        const shardId = acquired[i]
        if (!MutableHashSet.has(selfShards, shardId)) {
          MutableHashSet.remove(acquiredShards, shardId)
          MutableHashSet.add(releasingShards, shardId)
        }
      }
      if (MutableHashSet.size(releasingShards) > 0) {
        yield* activeShardsLatch.open
      }
    }).pipe(
      Effect.retry({
        times: 5,
        schedule: Schedule.spaced(50)
      }),
      Effect.timeout(shardLockInterval),
      Effect.catchCause(markShardLocksUnhealthy)
    )

    const probeShardLocks = runnerStorage.refresh(selfAddress, []).pipe(
      Effect.timeout(shardLockInterval),
      Effect.andThen(markShardLocksHealthy),
      Effect.catchCause((cause) => Effect.logWarning("Shard lock storage is still unhealthy", cause))
    )

    // Refresh shard locks at the lease-safe interval, or probe storage while
    // lock ownership is uncertain.
    yield* Effect.suspend(() => shardLocksHealthyLatch.isOpen() ? refreshShardLocks : probeShardLocks).pipe(
      Effect.repeat(Schedule.fixed(shardLockInterval)),
      Effect.forever,
      Effect.forkIn(shardingScope)
    )

    // open the shard latch every poll interval
    yield* activeShardsLatch.open.pipe(
      Effect.delay(config.entityMessagePollInterval),
      Effect.forever,
      Effect.forkIn(shardingScope)
    )
  }

  // --- Storage inbox ---
  //
  // Responsible for reading unprocessed messages from storage and sending them
  // to the appropriate entity manager.
  //
  // This should be shutdown before shard acquisition, to ensure no messages are
  // being processed before the shards are released.
  //
  // It should also be shutdown after the entity managers, to ensure interrupt
  // & ack envelopes can still be processed.

  const storageReadLatch = yield* Latch.make(true)
  const openStorageReadLatch = constant(Effect.asVoid(storageReadLatch.open))

  const storageReadLock = Semaphore.makeUnsafe(1)
  const withStorageReadLock = storageReadLock.withPermits(1)

  // --- Entity residency ---
  //
  // A runner-wide counter that bounds how many entities can be resident at
  // the same time. Entity managers reserve a slot before spawning an entity,
  // so the sequential storage read loop and concurrent volatile sends share
  // the same cap.

  const maxResidentEntities = config.maxResidentEntities
  let residentEntityCount = 0
  const residencyAtCapacityUnsafe = () =>
    maxResidentEntities !== "unbounded" && residentEntityCount >= maxResidentEntities
  const residency: EntityManager.Residency = {
    admitUnsafe() {
      if (residencyAtCapacityUnsafe()) return false
      residentEntityCount++
      return true
    },
    releaseUnsafe() {
      residentEntityCount--
      // a slot has freed up, so the storage read loop can admit messages for
      // entities it previously had to skip
      if (maxResidentEntities !== "unbounded") {
        storageReadLatch.openUnsafe()
      }
    }
  }

  if (storageEnabled && initialRunnerAddress) {
    const selfAddress = initialRunnerAddress

    yield* Effect.gen(function*() {
      yield* Effect.logDebug("Starting")
      yield* Effect.addFinalizer(() => Effect.logDebug("Shutting down"))

      let index = 0
      let messages: Array<Message.Incoming<any>> = []
      let deliveredThisRead = false
      const removableNotifications = new Set<PendingNotification>()
      const resetAddresses = MutableHashSet.empty<EntityAddress>()
      const resetRequestIds: Array<Snowflake.Snowflake> = []
      const cappedAddresses = MutableHashSet.empty<EntityAddress>()

      const markDelivered = Effect.sync(() => {
        deliveredThisRead = true
      })

      // A completed request may remain deduplicated after storage claims its reset.
      // Release the claim so the reset can be redelivered immediately.
      const releaseCompletedClaim = (message: Message.Incoming<any>) => {
        const state = entityManagers.get(message.envelope.address.entityType)
        if (!state?.manager.isProcessingFor(message, { excludeCompleted: true })) {
          resetRequestIds.push(message.envelope.requestId)
        }
      }

      const processMessages = Effect.whileLoop({
        while: () => index < messages.length,
        step: () => index++,
        body: () => send
      })

      const readAndProcess = Effect.fnUntraced(function*(options?: {
        readonly limit?: number | undefined
        readonly addresses?: ReadonlyArray<EntityAddress> | undefined
      }) {
        messages = yield* storage.unprocessedMessages(acquiredShards, options)
        index = 0
        yield* processMessages
        return messages.length
      })

      const send = Effect.catchCause(
        Effect.suspend(() => {
          const message = messages[index]
          const address = message.envelope.address
          if (!MutableHashSet.has(acquiredShards, address.shardId)) {
            return Effect.void
          }
          const state = entityManagers.get(address.entityType)
          if (!state) {
            if (entityRegistrationTimeRemaining() > 0) {
              // reset address in the case that the entity is slow to register
              MutableHashSet.add(resetAddresses, address)
              return Effect.void
            }
            // if the entity did not register in time, we save a defect reply
            return entityNotRegistered(address.entityType)
          } else if (state.status === "closed") {
            return Effect.void
          }

          const isProcessing = state.manager.isProcessingFor(message)

          if (message._tag === "IncomingEnvelope" && isProcessing) {
            // If the message might affect a currently processing request, we
            // send it to the entity manager to be processed.
            return Effect.tap(state.manager.send(message), markDelivered)
          } else if (isProcessing || state.status === "closing") {
            // If the request is already processing, we skip it.
            // Or if the entity is closing, we skip all incoming messages.
            if (isProcessing) releaseCompletedClaim(message)
            return Effect.void
          } else if (message._tag === "IncomingRequest" && pendingNotifications.has(message.envelope.requestId)) {
            const entry = pendingNotifications.get(message.envelope.requestId)!
            pendingNotifications.delete(message.envelope.requestId)
            removableNotifications.delete(entry)
            entry.resume(Effect.void)
          }

          // The runner is at entity capacity, so messages for entities that
          // are not already resident are skipped. Their claims are released
          // after the read, so they stay eligible for once a slot frees up.
          if (residencyAtCapacityUnsafe() && !state.manager.isResidentUnsafe(address)) {
            MutableHashSet.add(cappedAddresses, address)
            return Effect.void
          }

          // If the entity was resuming in another fiber, we add the message
          // id to the unprocessed set.
          const resumptionState = MutableHashMap.get(entityResumptionState, address)
          if (Option.isSome(resumptionState)) {
            resumptionState.value.unprocessed.add(message.envelope.requestId)
            if (message.envelope._tag === "Interrupt") {
              resumptionState.value.interrupts.set(message.envelope.requestId, message as Message.IncomingEnvelope)
            }
            return Effect.void
          }
          return Effect.tap(state.manager.send(message), markDelivered)
        }),
        (cause) => {
          const message = messages[index]
          const error = Cause.findError(cause)
          // if we get a defect, then update storage
          if (Result.isFailure(error)) {
            if (Cause.hasInterrupts(cause)) {
              return Effect.void
            }
            return storage.saveReply(Reply.ReplyWithContext.fromDefect({
              id: snowflakeGen.nextUnsafe(),
              requestId: message.envelope.requestId,
              defect: Cause.squash(cause)
            }))
          }
          if (error.success._tag === "AlreadyProcessingMessage") {
            // Completion raced with decoding.
            releaseCompletedClaim(message)
            return Effect.void
          }
          if (error.success._tag === "MailboxFull") {
            const address = message.envelope.address
            const state = entityManagers.get(address.entityType)
            // A resident entity has a full per-entity mailbox; its messages
            // are resumed from storage once there is capacity again.
            // MailboxFull can only happen for requests, so this cast is safe
            if (message._tag === "IncomingRequest" && state?.manager.isResidentUnsafe(address)) {
              return resumeEntityFromStorage(message as Message.IncomingRequest<any>)
            }
            // Otherwise the runner ran out of entity slots while the message
            // was in flight; leave it in storage.
            MutableHashSet.add(cappedAddresses, address)
            return Effect.void
          }
          return Effect.void
        }
      )

      const batchSize = Math.max(1, config.unprocessedMessageBatchSize)

      while (true) {
        // wait for the next poll interval, or if we get notified of a change
        yield* storageReadLatch.await

        // if we get notified of a change, ensure we start a read immediately
        // next iteration
        storageReadLatch.closeUnsafe()

        // the lock is used to ensure resuming entities have a garantee that no
        // more items are added to the unprocessed set while the semaphore is
        // acquired.
        yield* storageReadLock.take(1)

        entityManagers.forEach((state) => state.manager.clearProcessed())
        if (pendingNotifications.size > 0) {
          pendingNotifications.forEach((entry) => removableNotifications.add(entry))
        }

        deliveredThisRead = false
        let readCount = 0
        let fullBatch = false
        let exhaustive = false

        // First deliver messages for entities that are already resident, so
        // they keep making progress even when the runner is at entity
        // capacity.
        if (residencyAtCapacityUnsafe()) {
          const residentAddresses: Array<EntityAddress> = []
          for (const state of entityManagers.values()) {
            if (state.status === "closed") continue
            for (const address of state.manager.residentAddressesUnsafe()) {
              residentAddresses.push(address)
            }
          }
          if (residentAddresses.length > 0) {
            readCount = yield* readAndProcess({ limit: batchSize, addresses: residentAddresses })
            fullBatch = readCount >= batchSize
          }
        }

        // Then walk the remaining messages, spawning new entities while the
        // runner has entity slots left.
        if (!residencyAtCapacityUnsafe() && readCount < batchSize) {
          const limit = batchSize - readCount
          const read = yield* readAndProcess({ limit })
          if (read >= limit) {
            fullBatch = true
          } else if (MutableHashSet.size(cappedAddresses) === 0) {
            exhaustive = true
          }
        }

        if (removableNotifications.size > 0) {
          // On an exhaustive read, a message that was not seen is no longer
          // processable by this runner. At the entity cap, the messages are
          // safely persisted and delivered once a slot frees up, so persisted
          // senders succeed instead of failing. Otherwise the read was
          // truncated by the batch size and the notifications stay registered
          // for the immediately following read.
          const capped = MutableHashSet.size(cappedAddresses) > 0 || residencyAtCapacityUnsafe()
          if (exhaustive || capped) {
            removableNotifications.forEach(({ message, resume }) => {
              pendingNotifications.delete(message.envelope.requestId)
              resume(
                exhaustive
                  ? Effect.fail(new EntityNotAssignedToRunner({ address: message.envelope.address }))
                  : Effect.void
              )
            })
          }
          removableNotifications.clear()
        }
        if (MutableHashSet.size(resetAddresses) > 0) {
          for (const address of resetAddresses) {
            yield* Effect.logWarning("Could not find entity manager for address, retrying").pipe(
              Effect.annotateLogs({ address })
            )
            yield* Effect.forkIn(storage.resetAddress(address), shardingScope)
          }
          MutableHashSet.clear(resetAddresses)
        }
        // Capture claims skipped because of the entity cap. They are reset in
        // one storage operation after releasing the read lock.
        let cappedAddressesToReset: Array<EntityAddress> | undefined
        if (MutableHashSet.size(cappedAddresses) > 0) {
          cappedAddressesToReset = Arr.fromIterable(cappedAddresses)
          MutableHashSet.clear(cappedAddresses)
        }

        // let the resuming entities check if they are done
        yield* storageReadLock.release(1)

        if (resetRequestIds.length > 0) {
          yield* Effect.ignore(storage.resetRequests(resetRequestIds))
          resetRequestIds.length = 0
        }

        if (cappedAddressesToReset !== undefined) {
          yield* Effect.ignore(storage.resetAddresses(cappedAddressesToReset))
        }

        // A full batch means more messages could be waiting; start the next
        // read immediately, as long as this read made progress (a full batch
        // of skipped messages must not spin the loop). When the runner is at
        // capacity, the next read waits for an entity to be removed or the
        // next poll interval instead.
        if (fullBatch && deliveredThisRead) {
          storageReadLatch.openUnsafe()
        }
      }
    }).pipe(
      Effect.scoped,
      Effect.ensuring(storageReadLock.releaseAll),
      Effect.catchCause((cause) => Effect.logWarning("Could not read messages from storage", cause)),
      Effect.forever,
      Effect.annotateLogs({
        module: "effect/cluster/Sharding",
        fiber: "Storage read loop",
        runner: selfAddress
      }),
      Effect.forkIn(shardingScope)
    )

    // open the storage latch every poll interval
    yield* storageReadLatch.open.pipe(
      Effect.delay(config.entityMessagePollInterval),
      Effect.forever,
      Effect.forkIn(shardingScope)
    )

    // Resume unprocessed messages for entities that reached a full mailbox.
    const entityResumptionState = MutableHashMap.empty<EntityAddress, {
      unprocessed: Set<Snowflake.Snowflake>
      interrupts: Map<Snowflake.Snowflake, Message.IncomingEnvelope>
    }>()
    const resumeEntityFromStorage = (lastReceivedMessage: Message.IncomingRequest<any>) => {
      const address = lastReceivedMessage.envelope.address
      const resumptionState = MutableHashMap.get(entityResumptionState, address)
      if (Option.isSome(resumptionState)) {
        resumptionState.value.unprocessed.add(lastReceivedMessage.envelope.requestId)
        return Effect.void
      }
      MutableHashMap.set(entityResumptionState, address, {
        unprocessed: new Set([lastReceivedMessage.envelope.requestId]),
        interrupts: new Map()
      })
      return resumeEntityFromStorageImpl(address)
    }
    const resumeEntityFromStorageImpl = Effect.fnUntraced(
      function*(address: EntityAddress) {
        const state = entityManagers.get(address.entityType)
        if (!state) {
          MutableHashMap.remove(entityResumptionState, address)
          return
        }

        const resumptionState = Option.getOrThrow(MutableHashMap.get(entityResumptionState, address))
        let done = false

        while (!done) { // oxlint-disable-line no-unmodified-loop-condition
          // if the shard is no longer assigned to this runner, we stop
          if (!MutableHashSet.has(acquiredShards, address.shardId)) {
            return
          }

          // take a batch of unprocessed messages ids
          const messageIds = Arr.empty<Snowflake.Snowflake>()
          for (const id of resumptionState.unprocessed) {
            if (messageIds.length === 1024) break
            messageIds.push(id)
          }

          const messages = yield* storage.unprocessedMessagesById(messageIds)

          // this should not happen, but we handle it just in case
          if (messages.length === 0) {
            yield* Effect.sleep(config.entityMessagePollInterval)
            continue
          }

          let index = 0

          const sendWithRetry: Effect.Effect<
            void,
            EntityNotAssignedToRunner
          > = Effect.catchTags(
            Effect.suspend(() => {
              if (!MutableHashSet.has(acquiredShards, address.shardId)) {
                return Effect.fail(new EntityNotAssignedToRunner({ address }))
              }

              const message = messages[index]
              // check if this is a request that was interrupted
              const interrupt = message._tag === "IncomingRequest" &&
                resumptionState.interrupts.get(message.envelope.requestId)
              return interrupt ?
                Effect.flatMap(state.manager.send(message), () => {
                  resumptionState.interrupts.delete(message.envelope.requestId)
                  return state.manager.send(interrupt)
                }) :
                state.manager.send(message)
            }),
            {
              MailboxFull: () => Effect.delay(sendWithRetry, config.sendRetryInterval),
              AlreadyProcessingMessage: () => Effect.void
            }
          )

          yield* Effect.whileLoop({
            while: () => index < messages.length,
            body: constant(sendWithRetry),
            step: () => index++
          })

          for (const id of messageIds) {
            resumptionState.unprocessed.delete(id)
          }
          if (resumptionState.unprocessed.size > 0) continue

          // if we have caught up to the main storage loop, we let it take over
          yield* withStorageReadLock(Effect.sync(() => {
            if (resumptionState.unprocessed.size === 0) {
              MutableHashMap.remove(entityResumptionState, address)
              done = true
            }
          }))
        }
      },
      Effect.retry({
        while: (e) => e._tag === "PersistenceError",
        schedule: Schedule.spaced(config.entityMessagePollInterval)
      }),
      Effect.catchCause((cause) => Effect.logDebug("Could not resume unprocessed messages", cause)),
      (effect, address) =>
        Effect.annotateLogs(effect, {
          module: "effect/cluster/Sharding",
          fiber: "Resuming unprocessed messages",
          runner: selfAddress,
          entity: address
        }),
      (effect, address) =>
        Effect.ensuring(
          effect,
          Effect.sync(() => MutableHashMap.remove(entityResumptionState, address))
        ),
      Effect.forkIn(shardingScope)
    )
  }

  // --- Sending messages ---

  const sendLocal = <M extends Message.Outgoing<any> | Message.Incoming<any>>(message: M) =>
    Effect.suspend(function loop(): Effect.Effect<
      void,
      | EntityNotAssignedToRunner
      | MailboxFull
      | AlreadyProcessingMessage
      | (M extends Message.Incoming<any> ? never : PersistenceError)
    > {
      const address = message.envelope.address
      if (!isEntityOnLocalShards(address)) {
        return Effect.fail(new EntityNotAssignedToRunner({ address }))
      }
      const state = entityManagers.get(address.entityType)
      if (!state) {
        return Effect.flatMap(waitForEntityManager(address.entityType), loop)
      } else if (state.status === "closed" || (state.status === "closing" && message._tag === "IncomingRequest")) {
        // if we are shutting down, we don't accept new requests
        return Effect.fail(new EntityNotAssignedToRunner({ address }))
      }

      return message._tag === "IncomingRequest" || message._tag === "IncomingEnvelope" ?
        state.manager.send(message) :
        runnersService.sendLocal({
          message,
          send: state.manager.sendLocal,
          simulateRemoteSerialization: config.simulateRemoteSerialization
        }) as any
    })

  type PendingNotification = {
    resume: (_: Effect.Effect<void, EntityNotAssignedToRunner>) => void
    readonly message: Message.IncomingRequest<any>
  }
  const pendingNotifications = new Map<Snowflake.Snowflake, PendingNotification>()
  const notifyLocal = <M extends Message.Outgoing<any> | Message.Incoming<any>>(
    message: M,
    discard: boolean,
    options?: {
      readonly waitUntilRead?: boolean | undefined
    }
  ) =>
    Effect.suspend(function loop(): Effect.Effect<
      void,
      | EntityNotAssignedToRunner
      | AlreadyProcessingMessage
      | (M extends Message.Incoming<any> ? never : PersistenceError)
    > {
      const address = message.envelope.address
      const state = entityManagers.get(address.entityType)
      if (!state) {
        return Effect.flatMap(waitForEntityManager(address.entityType), loop)
      } else if (state.status === "closed" || !isEntityOnLocalShards(address)) {
        return Effect.fail(new EntityNotAssignedToRunner({ address }))
      }

      const isLocal = isEntityOnLocalShards(address)
      const notify = storageEnabled
        ? openStorageReadLatch
        : () => Effect.die("Sharding.notifyLocal: storage is disabled")

      if (message._tag === "IncomingRequest" || message._tag === "IncomingEnvelope") {
        if (!isLocal) {
          return Effect.fail(new EntityNotAssignedToRunner({ address }))
        } else if (
          message._tag === "IncomingRequest" && state.manager.isProcessingFor(message, { excludeReplies: true })
        ) {
          return Effect.fail(new AlreadyProcessingMessage({ address, envelopeId: message.envelope.requestId }))
        } else if (message._tag === "IncomingRequest" && options?.waitUntilRead) {
          if (!storageEnabled) return notify()
          return Effect.callback<void, EntityNotAssignedToRunner>((resume) => {
            let entry = pendingNotifications.get(message.envelope.requestId)
            if (entry) {
              const prevResume = entry.resume
              entry.resume = (effect) => {
                prevResume(effect)
                resume(effect)
              }
              return
            }
            entry = { resume, message }
            pendingNotifications.set(message.envelope.requestId, entry)
            storageReadLatch.openUnsafe()
          })
        }
        return notify()
      }

      return runnersService.notifyLocal({ message, notify, discard, storageOnly: !isLocal }) as any
    })

  function sendOutgoing(
    message: Message.Outgoing<any>,
    discard: boolean,
    retries?: number
  ): Effect.Effect<
    void,
    MailboxFull | AlreadyProcessingMessage | PersistenceError | EntityNotAssignedToRunner
  > {
    const isPersisted = Context.get(
      message._tag === "OutgoingRequest" ? message.annotations : message.rpc.annotations,
      Persisted
    )
    const shouldFail = !discard &&
      (message._tag === "OutgoingRequest" || message.envelope._tag === "AckChunk")
    const abandon = (error: EntityNotAssignedToRunner) => {
      if (!isPersisted) {
        return shouldFail
          ? Effect.fail(error)
          : Effect.logDebug("Abandoning outgoing message during shutdown", message.envelope.address)
      }
      const persist = message._tag === "OutgoingRequest"
        ? storage.saveRequest(message)
        : storage.saveEnvelope(message)
      return Effect.catchTag(persist, "MalformedMessage", Effect.die).pipe(
        Effect.andThen(
          shouldFail
            // The message is durable, so a transient routing state is never an
            // error for the caller. The runner is tearing down and can no
            // longer observe the reply, so interrupt the caller instead: the
            // request will be served under the next owner.
            ? message._tag === "OutgoingRequest"
              ? ClusterAbandon.interrupt
              : Effect.fail(error)
            : Effect.logWarning("Persisting outgoing message abandoned during shutdown", message.envelope.address)
        )
      )
    }
    return Effect.catchFilter(
      Effect.suspend(() => {
        const address = message.envelope.address
        if (isPersisted && !storageEnabled) {
          return Effect.die("Sharding.sendOutgoing: Persisted messages require MessageStorage")
        }
        if (shouldFail && MutableRef.get(isShutdown)) {
          return Effect.fail(new EntityNotAssignedToRunner({ address }))
        }
        const maybeRunner = MutableHashMap.get(shardAssignments, address.shardId)
        const runnerIsLocal = Option.isSome(maybeRunner) && isLocalRunner(maybeRunner.value)
        if (isPersisted) {
          return runnerIsLocal
            ? notifyLocal(message, discard)
            : runnersService.notify({ address: maybeRunner, message, discard })
        } else if (Option.isNone(maybeRunner)) {
          return Effect.fail(new EntityNotAssignedToRunner({ address }))
        }
        return runnerIsLocal
          ? sendLocal(message)
          : discard
          ? runnersService.notify({ address: maybeRunner, message, discard })
          : runnersService.send({ address: maybeRunner.value, message })
      }),
      (error) =>
        error._tag === "EntityNotAssignedToRunner" || error._tag === "RunnerUnavailable"
          ? Result.succeed(error)
          : Result.fail(error),
      (error) => {
        // Abandon the message during teardown: retrying would loop forever once the runner is shutting down
        if (error._tag === "EntityNotAssignedToRunner") {
          const targetManager = entityManagers.get(message.envelope.address.entityType)
          const cannotRecover = MutableRef.get(isShutdown) ||
            (targetManager !== undefined && targetManager.status !== "alive")
          if (cannotRecover) {
            return abandon(error)
          }
        }
        if (retries === 0) {
          return Effect.die(error)
        }
        return Effect.delay(sendOutgoing(message, discard, retries && retries - 1), config.sendRetryInterval)
      }
    )
  }

  const reset: Sharding["Service"]["reset"] = (requestId, options) =>
    Effect.matchCause(storage.clearReplies(requestId, options), {
      onSuccess: () => true,
      onFailure: () => false
    })

  // --- RunnerStorage sync ---
  //
  // This is responsible for syncing the local view of runners and shard
  // assignments with RunnerStorage.
  //
  // It should be shutdown after the clients, so that they can still get correct
  // shard assignments for outgoing messages (they could still be in use by
  // entities that are shutting down).

  const selfRunner = initialRunnerAddress ?
    new Runner({
      address: initialRunnerAddress,
      groups: Array.from(shardGroups.assigned),
      weight: config.runnerShardWeight
    }) :
    undefined

  let allRunners = MutableHashMap.empty<Runner, boolean>()
  let healthyRunnerCount = 0

  // update metrics
  if (selfRunner) {
    ClusterMetrics.runners.updateUnsafe(BigInt(1), Context.empty())
    ClusterMetrics.runnersHealthy.updateUnsafe(BigInt(1), Context.empty())
  }

  yield* Effect.gen(function*() {
    const hashRings = new Map<string, HashRing.HashRing<RunnerAddress>>()
    let nextRunners = MutableHashMap.empty<Runner, boolean>()
    const healthyRunners = MutableHashSet.empty<Runner>()
    const withTimeout = Effect.timeout(Duration.seconds(5))

    while (true) {
      // Ensure the current runner is registered
      if (selfRunner && !isShutdown.current && !MutableHashMap.has(allRunners, selfRunner)) {
        yield* Effect.logDebug("Registering runner", selfRunner)
        const machineId = yield* withTimeout(runnerStorage.register(selfRunner, true))
        yield* snowflakeGen.setMachineId(machineId)
      }

      const runners = yield* withTimeout(runnerStorage.getRunners)
      let changed = false
      for (let i = 0; i < runners.length; i++) {
        const [runner, healthy] = runners[i]
        MutableHashMap.set(nextRunners, runner, healthy)
        const wasHealthy = MutableHashSet.has(healthyRunners, runner)
        if (!healthy || wasHealthy) {
          if (healthy === wasHealthy || !wasHealthy) {
            // no change
            MutableHashMap.remove(allRunners, runner)
          }
          continue
        }
        changed = true
        MutableHashSet.add(healthyRunners, runner)
        MutableHashMap.remove(allRunners, runner)
        for (let j = 0; j < runner.groups.length; j++) {
          const group = runner.groups[j]
          let ring = hashRings.get(group)
          if (!ring) {
            ring = HashRing.make()
            hashRings.set(group, ring)
          }
          HashRing.add(ring, runner.address, { weight: runner.weight })
        }
      }

      // Remove runners that are no longer present or healthy
      MutableHashMap.forEach(allRunners, (_, runner) => {
        changed = true
        MutableHashMap.remove(allRunners, runner)
        MutableHashSet.remove(healthyRunners, runner)
        runFork(runnersService.onRunnerUnavailable(runner.address))
        for (let i = 0; i < runner.groups.length; i++) {
          HashRing.remove(hashRings.get(runner.groups[i])!, runner.address)
        }
      })

      // swap allRunners and nextRunners
      const prevRunners = allRunners
      allRunners = nextRunners
      nextRunners = prevRunners
      healthyRunnerCount = MutableHashSet.size(healthyRunners)

      // Ensure the current runner is registered
      if (selfRunner && !isShutdown.current && !MutableHashMap.has(allRunners, selfRunner)) {
        continue
      }

      // Recompute shard assignments if the set of healthy runners has changed.
      if (changed) {
        MutableHashSet.clear(selfShards)
        hashRings.forEach((ring, group) => {
          const newAssignments = HashRing.getShards(ring, config.shardsPerGroup)
          for (let i = 0; i < config.shardsPerGroup; i++) {
            const shard = makeShardId(group, i + 1)
            if (newAssignments) {
              const runner = newAssignments[i]
              MutableHashMap.set(shardAssignments, shard, runner)
              if (shardLocksHealthyLatch.isOpen() && isLocalRunner(runner)) {
                MutableHashSet.add(selfShards, shard)
              }
            } else {
              MutableHashMap.remove(shardAssignments, shard)
            }
          }
        })
        yield* Effect.logDebug("New shard assignments", selfShards)
        activeShardsLatch.openUnsafe()

        // update metrics
        if (selfRunner) {
          ClusterMetrics.runnersHealthy.updateUnsafe(
            BigInt(MutableHashSet.has(healthyRunners, selfRunner) ? 1 : 0),
            Context.empty()
          )
        }
      }

      if (selfRunner && MutableHashSet.size(healthyRunners) === 0) {
        yield* Effect.logWarning("No healthy runners available")
        // to prevent a deadlock, we will mark the current node as healthy to
        // start the health check singleton again
        yield* withTimeout(runnerStorage.setRunnerHealth(selfRunner.address, true))
      }

      yield* Effect.sleep(config.refreshAssignmentsInterval)
    }
  }).pipe(
    Effect.catchCause((cause) => Effect.logDebug(cause)),
    Effect.repeat(Schedule.spaced(1000)),
    Effect.annotateLogs({
      module: "effect/cluster/Sharding",
      fiber: "RunnerStorage sync",
      runner: initialRunnerAddress
    }),
    Effect.forkIn(shardingScope)
  )

  // --- Clients ---

  type ClientRequestEntry = {
    readonly rpc: Rpc.AnyWithProps
    readonly context: Context.Context<never>
    readonly message: Message.OutgoingRequest<any>
    lastChunkId?: Snowflake.Snowflake
  }
  const clientRequests = new Map<Snowflake.Snowflake, ClientRequestEntry>()

  const clients: ResourceMap<
    Entity<any, any>,
    (entityId: string) => RpcClient.RpcClient<
      any,
      MailboxFull | AlreadyProcessingMessage | EntityNotAssignedToRunner
    >,
    never
  > = yield* ResourceMap.make(
    Effect.fnUntraced(function*(entity: Entity<string, any>) {
      const clientScope = yield* Effect.scope
      yield* Scope.addFinalizer(
        clientScope,
        Effect.sync(() => {
          ActiveTeardown.releaseEntityType(entity.type)
        })
      )
      const client = yield* RpcClient.makeNoSerialization(entity.protocol, {
        spanPrefix: `${entity.type}.client`,
        disableTracing: !Context.get(entity.protocol.annotations, ClusterSchema.ClientTracingEnabled),
        supportsAck: true,
        generateRequestId: () => snowflakeGen.nextUnsafe() as any,
        flatten: true,
        onFromClient(options): Effect.Effect<
          void,
          MailboxFull | AlreadyProcessingMessage | PersistenceError | EntityNotAssignedToRunner
        > {
          const address = Context.getUnsafe(options.context, ClientAddressTag)
          switch (options.message._tag) {
            case "Request": {
              const fiber = Fiber.getCurrent()!
              const id = Snowflake.Snowflake(options.message.id)
              const rpc = entity.protocol.requests.get(options.message.tag)!
              let respond: (reply: Reply.Reply<any>) => Effect.Effect<void>
              const envelope = Envelope.makeRequest<any>({
                requestId: id,
                address,
                tag: options.message.tag,
                payload: options.message.payload,
                headers: options.message.headers,
                traceId: options.message.traceId,
                spanId: options.message.spanId,
                sampled: options.message.sampled
              })
              const message = new Message.OutgoingRequest({
                envelope,
                lastReceivedReply: Option.none(),
                rpc,
                context: fiber.context as Context.Context<any>,
                respond: (reply) => respond(reply),
                annotations: Context.get(rpc.annotations, ClusterSchema.Dynamic)(
                  rpc.annotations,
                  envelope as any
                )
              })
              if (!options.discard) {
                const entry: ClientRequestEntry = {
                  rpc: rpc as any,
                  context: fiber.context,
                  message
                }
                clientRequests.set(id, entry)
                respond = makeClientRespond(entry, client.write)
              } else {
                respond = clientRespondDiscard
              }
              return sendOutgoing(message, options.discard)
            }
            case "Ack": {
              const requestId = Snowflake.Snowflake(options.message.requestId)
              const entry = clientRequests.get(requestId)
              if (!entry) return Effect.void
              return sendOutgoing(
                new Message.OutgoingEnvelope({
                  envelope: new Envelope.AckChunk({
                    id: snowflakeGen.nextUnsafe(),
                    address,
                    requestId,
                    replyId: entry.lastChunkId!
                  }),
                  rpc: entry.rpc
                }),
                false
              )
            }
            case "Interrupt": {
              const requestId = Snowflake.Snowflake(options.message.requestId)
              const entry = clientRequests.get(requestId)!
              if (!entry) return Effect.void
              clientRequests.delete(requestId)
              if (ClusterSchema.isUninterruptibleForClient(entry.message.annotations)) {
                return Effect.void
              }
              // for durable messages, we ignore interrupts on shutdown or as a
              // result of a shard being resassigned
              const caller = Context.getOption(entry.context, CurrentAddress).valueOrUndefined
              const singletonShard = Context.getOption(entry.context, SingletonShardTag).valueOrUndefined
              const isTransientInterrupt = MutableRef.get(isShutdown) ||
                (caller !== undefined && ActiveTeardown.isActive(caller)) ||
                (singletonShard !== undefined && ActiveTeardown.isShardActive(singletonShard))
              if (isTransientInterrupt && Context.get(entry.message.annotations, Persisted)) {
                return Effect.void
              }
              return Effect.ignore(sendOutgoing(
                new Message.OutgoingEnvelope({
                  envelope: new Envelope.Interrupt({
                    id: snowflakeGen.nextUnsafe(),
                    address,
                    requestId
                  }),
                  rpc: entry.rpc
                }),
                false,
                3
              ))
            }
          }
          return Effect.void
        }
      })

      yield* Scope.addFinalizer(
        clientScope,
        Effect.sync(() => {
          ActiveTeardown.acquireEntityType(entity.type)
        })
      )

      return (entityId: string) => {
        const id = makeEntityId(entityId)
        const address = ClientAddressTag.context(makeEntityAddress({
          shardId: getShardId(id, entity.getShardGroup(entityId as EntityId)),
          entityId: id,
          entityType: entity.type
        }))
        const clientFn = function(tag: string, payload: any, options?: {
          readonly context?: Context.Context<never>
        }) {
          const context = options?.context ? Context.merge(options.context, address) : address
          return client.client(tag, payload, {
            ...options,
            context
          })
        }
        const proxyClient: any = {}
        return new Proxy(proxyClient, {
          has(_, p) {
            return entity.protocol.requests.has(p as string)
          },
          get(target, p) {
            if (Object.hasOwn(target, p)) {
              return target[p]
            } else if (!entity.protocol.requests.has(p as string)) {
              return undefined
            }
            const method = (payload: any, options?: {}) => clientFn(p as string, payload, options)
            InternalRecord.assignProperty(target, p, method)
            return method
          }
        })
      }
    }),
    { referential: true }
  )

  const makeClient = <Type extends string, Rpcs extends Rpc.Any>(entity: Entity<Type, Rpcs>): Effect.Effect<
    (
      entityId: string
    ) => RpcClient.RpcClient.From<Rpcs, MailboxFull | AlreadyProcessingMessage | EntityNotAssignedToRunner>
  > => clients.get(entity) as any

  const clientRespondDiscard = (_reply: Reply.Reply<any>) => Effect.void

  const makeClientRespond = (
    entry: ClientRequestEntry,
    write: (reply: FromServer<any>) => Effect.Effect<void>
  ) =>
  (reply: Reply.Reply<any>) => {
    switch (reply._tag) {
      case "Chunk": {
        entry.lastChunkId = reply.id
        return write({
          _tag: "Chunk",
          clientId: 0,
          requestId: reply.requestId as any,
          values: reply.values
        })
      }
      case "WithExit": {
        clientRequests.delete(reply.requestId)
        return write({
          _tag: "Exit",
          clientId: 0,
          requestId: reply.requestId as any,
          exit: reply.exit
        })
      }
    }
  }

  // --- Singletons ---

  const singletons = new Map<ShardId, MutableHashMap.MutableHashMap<SingletonAddress, Effect.Effect<void>>>()
  const singletonFibers = yield* FiberMap.make<SingletonAddress>()
  const withSingletonLock = Semaphore.makeUnsafe(1).withPermits(1)

  const registerSingleton: Sharding["Service"]["registerSingleton"] = Effect.fnUntraced(
    function*(name, run, options) {
      const shardGroup = options?.shardGroup ?? "default"
      const address = new SingletonAddress({
        shardId: getShardId(makeEntityId(name), shardGroup),
        name
      })

      let map = singletons.get(address.shardId)
      if (!map) {
        map = MutableHashMap.empty()
        singletons.set(address.shardId, map)
      }
      if (MutableHashMap.has(map, address)) {
        return yield* Effect.die(`Singleton '${name}' is already registered`)
      }

      const services = yield* Effect.context<never>()
      const wrappedRun = run.pipe(
        Effect.andThen(Effect.never),
        Effect.scoped,
        Effect.provideService(CurrentLogAnnotations, {}),
        Effect.provideContext(Context.add(services, SingletonShardTag, address.shardId)),
        Effect.orDie,
        Effect.interruptible
      ) as Effect.Effect<never>
      MutableHashMap.set(map, address, wrappedRun)

      yield* PubSub.publish(events, SingletonRegistered({ address }))

      // start if we are on the right shard
      if (MutableHashSet.has(acquiredShards, address.shardId)) {
        yield* Effect.logDebug("Starting singleton", address)
        yield* FiberMap.run(singletonFibers, address, wrappedRun)
      }

      yield* Effect.addFinalizer(() => {
        const map = singletons.get(address.shardId)!
        MutableHashMap.remove(map, address)
        return FiberMap.remove(singletonFibers, address)
      })
    },
    withSingletonLock
  )

  const syncSingletons = withSingletonLock(Effect.gen(function*() {
    for (const [shardId, map] of singletons) {
      for (const [address, run] of map) {
        const running = FiberMap.hasUnsafe(singletonFibers, address)
        const shouldBeRunning = MutableHashSet.has(acquiredShards, shardId)
        if (running && !shouldBeRunning) {
          yield* Effect.logDebug("Stopping singleton", address)
          yield* ActiveTeardown.aroundShard(
            address.shardId,
            FiberMap.remove(singletonFibers, address)
          )
        } else if (!running && shouldBeRunning) {
          yield* Effect.logDebug("Starting singleton", address)
          yield* FiberMap.run(singletonFibers, address, run)
        }
      }
    }
    ClusterMetrics.singletons.updateUnsafe(
      BigInt(yield* FiberMap.size(singletonFibers)),
      Context.empty()
    )
  }))

  // --- Entities ---

  const reaper = yield* EntityReaper
  const entityManagerLatches = new Map<string, Latch.Latch>()

  const registerEntity: Sharding["Service"]["registerEntity"] = Effect.fnUntraced(
    function*(entity, build, options) {
      const runnerAddress = getRunnerAddress()
      if (!runnerAddress || entityManagers.has(entity.type)) return
      const scope = yield* Effect.scope
      const registrationContext = yield* Effect.context<never>()
      yield* Scope.addFinalizer(
        scope,
        Effect.sync(() => {
          state.status = "closed"
        })
      )
      const manager = yield* EntityManager.make(entity, build, {
        ...options,
        storage,
        runnerAddress,
        residency,
        sharding
      }).pipe(
        Effect.provideContext(services.pipe(
          // Registration overrides construction fallbacks, except for runner-owned services.
          Context.merge(registrationContext),
          Context.add(ShardingConfig, config),
          Context.add(Clock, clock),
          Context.add(EntityReaper, reaper),
          Context.add(Scope.Scope, scope),
          Context.add(Snowflake.Generator, snowflakeGen)
        ))
      ) as Effect.Effect<EntityManager.EntityManager>
      const state: EntityManagerState = {
        entity,
        status: "alive",
        manager
      }
      yield* Scope.addFinalizer(
        scope,
        Effect.suspend(() => {
          state.status = "closing"
          return ActiveTeardown.aroundEntityType(
            entity.type,
            config.preemptiveShutdown ? shutdown() : Effect.void
          )
        })
      )

      // register entities while storage is idle
      // this ensures message order is preserved
      yield* withStorageReadLock(Effect.sync(() => {
        entityRegistrationStartMillis ??= clock.currentTimeMillisUnsafe()
        entityManagers.set(entity.type, state)
        if (entityManagerLatches.has(entity.type)) {
          entityManagerLatches.get(entity.type)!.openUnsafe()
          entityManagerLatches.delete(entity.type)
        }
      }))

      yield* PubSub.publish(events, EntityRegistered({ entity }))
    }
  )

  // Sleeps until the registration deadline shared with the storage read loop,
  // re-checking once in case registration started and moved the deadline.
  const awaitRegistrationDeadline = (entityType: string): Effect.Effect<never> =>
    Effect.suspend(() => {
      const remaining = entityRegistrationTimeRemaining()
      return remaining > 0
        ? Effect.flatMap(Effect.sleep(remaining), () => awaitRegistrationDeadline(entityType))
        : entityNotRegistered(entityType)
    })

  const waitForEntityManager = (entityType: string) => {
    let latch = entityManagerLatches.get(entityType)
    if (!latch) {
      latch = Latch.makeUnsafe()
      entityManagerLatches.set(entityType, latch)
    }
    return Effect.raceFirst(latch.await, awaitRegistrationDeadline(entityType))
  }

  // --- Runner health checks ---

  if (selfRunner) {
    const checkRunner = ([runner, healthy]: [Runner, boolean]) =>
      Effect.flatMap(runnerHealth.isAlive(runner.address), (isAlive) => {
        if (healthy === isAlive) return Effect.void
        if (isAlive) {
          healthyRunnerCount++
          return Effect.logDebug(`Runner is healthy`, runner).pipe(
            Effect.andThen(runnerStorage.setRunnerHealth(runner.address, isAlive))
          )
        }
        if (healthyRunnerCount <= 1) {
          // never mark the last runner as unhealthy, to prevent a deadlock
          return Effect.void
        }
        healthyRunnerCount--
        return Effect.logDebug(`Runner is unhealthy`, runner).pipe(
          Effect.andThen(runnerStorage.setRunnerHealth(runner.address, isAlive))
        )
      })

    yield* registerSingleton(
      "effect/cluster/Sharding/RunnerHealth",
      Effect.gen(function*() {
        while (true) {
          // Skip health checks if we are the only runner
          if (MutableHashMap.size(allRunners) > 1) {
            yield* Effect.forEach(allRunners, checkRunner, { discard: true, concurrency: 10 })
          }
          yield* Effect.sleep(config.runnerHealthCheckInterval)
        }
      }).pipe(
        Effect.catchCause((cause) => Effect.logDebug("Runner health check failed", cause)),
        Effect.forever,
        Effect.annotateLogs({
          module: "effect/cluster/Sharding",
          fiber: "Runner health check"
        })
      )
    )
  }

  // --- Finalization ---

  const shutdown = Effect.fnUntraced(function*(exit?: Exit.Exit<unknown, unknown>) {
    if (exit) {
      yield* Effect.logDebug("Shutting down", exit._tag === "Failure" ? exit.cause : {}).pipe(
        Effect.annotateLogs({
          module: "effect/cluster/Sharding"
        })
      )
    }

    if (isShutdown.current) return
    MutableRef.set(isShutdown, true)
    if (selfRunner) {
      yield* Effect.ignore(runnerStorage.unregister(selfRunner.address))
    }
  })

  yield* Scope.addFinalizerExit(shardingScope, shutdown)

  const activeEntityCount = Effect.gen(function*() {
    let count = 0
    for (const state of entityManagers.values()) {
      count += yield* state.manager.activeEntityCount
    }
    return count
  })

  const sharding = Sharding.of({
    getRegistrationEvents,
    getShardId,
    hasShardId(shardId: ShardId) {
      if (isShutdown.current) return false
      return MutableHashSet.has(acquiredShards, shardId)
    },
    getSnowflake: Effect.sync(() => snowflakeGen.nextUnsafe()),
    isShutdown: Effect.sync(() => MutableRef.get(isShutdown)),
    registerEntity,
    registerSingleton,
    makeClient,
    send: sendLocal,
    sendOutgoing: (message, discard) => sendOutgoing(message, discard),
    notify: (message, options) => notifyLocal(message, false, options),
    activeEntityCount,
    pollStorage: storageReadLatch.open,
    reset
  })

  return sharding
})

/**
 * Layer that constructs the `Sharding` service from sharding configuration,
 * runner communication, message storage, runner storage, runner health, the
 * snowflake generator, and the entity reaper.
 *
 * **When to use**
 *
 * Use when you need to assemble a cluster sharding runtime from explicit
 * sharding configuration, runner communication, message storage, runner
 * storage, and runner health layers.
 *
 * **Details**
 *
 * The layer provides the `Sharding` service and installs its own snowflake
 * generator and entity reaper. Callers still provide `ShardingConfig`,
 * `Runners`, `MessageStorage`, `RunnerStorage`, and `RunnerHealth`.
 *
 * **Gotchas**
 *
 * Persisted messages require a non-no-op `MessageStorage`; if this layer is
 * provided with `MessageStorage.layerNoop`, persisted sends defect.
 *
 * @see {@link Sharding} for the service provided by this layer
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<
  Sharding,
  never,
  ShardingConfig | Runners | MessageStorage.MessageStorage | RunnerStorage | RunnerHealth.RunnerHealth
> = Layer.effect(Sharding)(make).pipe(
  Layer.provide([Snowflake.layerGenerator, EntityReaper.layer])
)

// Utilities

const ClientAddressTag = Context.Service<EntityAddress>("effect/cluster/Sharding/ClientAddress")
const SingletonShardTag = Context.Service<ShardId>("effect/cluster/Sharding/SingletonShard")
