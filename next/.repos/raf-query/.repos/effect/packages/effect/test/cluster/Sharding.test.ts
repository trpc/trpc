import { assert, describe, expect, it } from "@effect/vitest"
import {
  Array,
  Cause,
  Clock,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Latch,
  Layer,
  Logger,
  MutableRef,
  Option,
  Queue,
  Ref,
  Result,
  Schedule,
  Schema,
  Stream
} from "effect"
import {
  ClusterError,
  ClusterMetrics,
  ClusterSchema,
  Entity,
  EntityAddress,
  EntityId,
  EntityType,
  Envelope,
  MachineId,
  Message,
  MessageStorage,
  Runner,
  RunnerAddress,
  RunnerHealth,
  Runners,
  RunnerStorage,
  ShardId,
  Sharding,
  ShardingConfig,
  Snowflake
} from "effect/cluster"
import * as EntityManager from "effect/cluster/internal/entityManager"
import { EntityReaper } from "effect/cluster/internal/entityReaper"
import * as ActiveTeardown from "effect/cluster/internal/interruptors"
import { Headers } from "effect/http"
import { Rpc, type RpcGroup } from "effect/rpc"
import { TestClock } from "effect/testing"
import {
  CallerId,
  ContextBleedEntity,
  ContextBleedLayer,
  TestEntity,
  TestEntityNoState,
  TestEntityState,
  User
} from "./TestEntity.ts"

// Isolate the long-lived stream from concurrent shard-metric tests.
describe("Sharding claim release regressions", { concurrent: false }, () => {
  it.effect("keeps the claim of an active request replayed after an entity defect", () =>
    Effect.gen(function*() {
      const started = yield* Queue.make<number>()
      let starts = 0
      let active = 0
      let layerBuilds = 0
      let defectAttempts = 0
      const released: Array<Snowflake.Snowflake> = []
      const claimed: Array<Snowflake.Snowflake> = []
      const Replaying = Entity.make("ClaimDefectReplay", [
        Rpc.make("Run"),
        Rpc.make("Defect")
      ]).annotateRpcs(ClusterSchema.Persisted, true)
      const layer = Replaying.toLayer(
        Effect.sync(() => {
          layerBuilds++
          return Replaying.of({
            Run: () =>
              Rpc.fork(
                Effect.gen(function*() {
                  starts++
                  active++
                  yield* Queue.offer(started, starts)
                  return yield* Effect.never
                }).pipe(Effect.ensuring(Effect.sync(() => active--)))
              ),
            Defect: () =>
              Effect.suspend(() => {
                defectAttempts++
                return defectAttempts === 1 ? Effect.die("restart entity") : Effect.void
              })
          })
        }),
        { defectRetryPolicy: Schedule.forever }
      ).pipe(Layer.provideMerge(CappedSharding({}, (storage) => ({
        ...storage,
        resetRequests: (ids) =>
          Effect.gen(function*() {
            released.push(...ids)
            yield* storage.resetRequests(ids)
          }),
        unprocessedMessages: (shards, options) =>
          storage.unprocessedMessages(shards, options).pipe(
            Effect.tap((messages) =>
              Effect.sync(() => {
                for (const message of messages) {
                  if (message._tag === "IncomingRequest") claimed.push(message.envelope.requestId)
                }
              })
            )
          )
      }))))

      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const sharding = yield* Sharding.Sharding
        const driver = yield* MessageStorage.MemoryDriver
        const client = (yield* Replaying.client)("replay")
        const running = yield* client.Run().pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust(1)
        assert.strictEqual(yield* Queue.take(started), 1)
        const request = driver.journal[0]
        assert.strictEqual(request._tag, "Request")

        // Defecting another handler rebuilds the entity and replays Run.
        yield* client.Defect()
        assert.strictEqual(yield* Queue.take(started), 2, "in-flight handler must replay after the defect")
        assert.strictEqual(layerBuilds, 2)
        assert.strictEqual(defectAttempts, 2)
        assert.strictEqual(active, 1)
        expect(running.pollUnsafe()).toBeUndefined()
        claimed.length = 0
        released.length = 0

        yield* TestClock.adjust("10 minutes")
        for (let i = 0; i < 3; i++) {
          yield* sharding.pollStorage
          yield* TestClock.adjust(1)
        }
        expect(claimed).toContain(Snowflake.Snowflake(request.requestId))
        assert.strictEqual(starts, 2, "polling must not deliver the replayed request again")
        assert.strictEqual(layerBuilds, 2, "polling must not restart the entity again")
        assert.strictEqual(active, 1, "replayed handler must remain active")
        expect(running.pollUnsafe()).toBeUndefined()
        assert.strictEqual(released.length, 0, "replayed active request claim must not be released")
        assert.deepStrictEqual(
          claimed,
          [Snowflake.Snowflake(request.requestId)],
          "replayed request must not be reclaimed on every poll"
        )
      }).pipe(Effect.provide(layer))
    }))

  it.effect("keeps the claim of an active uninterruptible request after restarting", () =>
    Effect.gen(function*() {
      const started = yield* Queue.make<number>()
      let starts = 0
      let active = 0
      const released: Array<Snowflake.Snowflake> = []
      const claimed: Array<Snowflake.Snowflake> = []
      const Restarting = Entity.make("ClaimRestart", [
        Rpc.make("Run")
          .annotate(ClusterSchema.Persisted, true)
          .annotate(ClusterSchema.Uninterruptible, true)
      ])
      const layer = Restarting.toLayer({
        Run: () =>
          Effect.gen(function*() {
            starts++
            active++
            yield* Queue.offer(started, starts)
            return yield* Effect.never
          }).pipe(Effect.ensuring(Effect.sync(() => active--)))
      }).pipe(Layer.provideMerge(CappedSharding({}, (storage) => ({
        ...storage,
        resetRequests: (ids) =>
          Effect.gen(function*() {
            released.push(...ids)
            yield* storage.resetRequests(ids)
          }),
        unprocessedMessages: (shards, options) =>
          storage.unprocessedMessages(shards, options).pipe(
            Effect.tap((messages) =>
              Effect.sync(() => {
                for (const message of messages) {
                  if (message._tag === "IncomingRequest") claimed.push(message.envelope.requestId)
                }
              })
            )
          )
      }))))

      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const sharding = yield* Sharding.Sharding
        const driver = yield* MessageStorage.MemoryDriver
        const client = (yield* Restarting.client)("restart")
        const running = yield* client.Run().pipe(Effect.forkChild({ startImmediately: true }))
        assert.strictEqual(yield* Queue.take(started), 1)
        const request = driver.journal[0]
        assert.strictEqual(request._tag, "Request")

        // A persisted interrupt restarts the uninterruptible request.
        yield* driver.encoded.saveEnvelope({
          envelope: {
            _tag: "Interrupt",
            id: String(yield* sharding.getSnowflake),
            requestId: request.requestId,
            address: request.address
          },
          primaryKey: null,
          deliverAt: null
        })
        yield* sharding.pollStorage
        yield* TestClock.adjust(1)
        assert.strictEqual(yield* Queue.take(started), 2, "handler must restart after the stored interrupt")
        assert.strictEqual(active, 1)
        expect(running.pollUnsafe()).toBeUndefined()
        claimed.length = 0
        released.length = 0

        yield* TestClock.adjust("10 minutes")
        for (let i = 0; i < 3; i++) {
          yield* sharding.pollStorage
          yield* TestClock.adjust(1)
        }
        expect(claimed).toContain(Snowflake.Snowflake(request.requestId))
        assert.strictEqual(starts, 2, "polling must not deliver the restarted request again")
        assert.strictEqual(active, 1, "restarted handler must remain active")
        expect(running.pollUnsafe()).toBeUndefined()
        assert.strictEqual(released.length, 0, "restarted active request claim must not be released")
        assert.deepStrictEqual(
          claimed,
          [Snowflake.Snowflake(request.requestId)],
          "restarted request must not be reclaimed on every poll"
        )
      }).pipe(Effect.provide(layer))
    }))

  it.effect("keeps the claim of an active stream after an acknowledged chunk", () =>
    Effect.gen(function*() {
      const acked = yield* Deferred.make<void>()
      const released: Array<Snowflake.Snowflake> = []
      const claimed: Array<Snowflake.Snowflake> = []
      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const sharding = yield* Sharding.Sharding
        const state = yield* TestEntityState
        const client = (yield* TestEntity.client)("active-stream")
        const values: Array<number> = []
        const stream = yield* client.StreamWithKey({ key: "run" }).pipe(
          Stream.runForEach((value) => Effect.sync(() => values.push(value))),
          Effect.forkChild({ startImmediately: true })
        )
        yield* Queue.offer(state.streamMessages, void 0)
        yield* TestClock.adjust(1000)
        yield* Deferred.await(acked)
        expect(values).toEqual([0])
        expect(stream.pollUnsafe()).toBeUndefined()
        claimed.length = 0
        released.length = 0

        // Await the ack because memory storage does not model SQL reply filtering.
        yield* TestClock.adjust("10 minutes")
        for (let i = 0; i < 3; i++) {
          yield* sharding.pollStorage
          yield* TestClock.adjust(1)
        }
        expect(claimed.length).toBeGreaterThan(0)
        expect(stream.pollUnsafe()).toBeUndefined()
        expect(values).toEqual([0])
        assert.strictEqual(released.length, 0, "active stream claim must not be released after a chunk")
        assert.strictEqual(claimed.length, 1, "active stream must not be reclaimed on every poll")
      }).pipe(Effect.provide(CappedSharding({}, (storage) => ({
        ...storage,
        saveEnvelope: (message) =>
          storage.saveEnvelope(message).pipe(
            Effect.tap(() => message.envelope._tag === "AckChunk" ? Deferred.succeed(acked, void 0) : Effect.void)
          ),
        resetRequests: (ids) =>
          Effect.gen(function*() {
            released.push(...ids)
            yield* storage.resetRequests(ids)
          }),
        unprocessedMessages: (shards, options) =>
          storage.unprocessedMessages(shards, options).pipe(
            Effect.tap((messages) =>
              Effect.sync(() => {
                for (const message of messages) {
                  if (message._tag === "IncomingRequest") claimed.push(message.envelope.requestId)
                }
              })
            )
          )
      }))))
    }))

  it.effect("releases capped addresses even when targeted claim release fails", () =>
    Effect.gen(function*() {
      const readStarted = yield* Deferred.make<void>()
      const releaseRead = yield* Deferred.make<void>()
      let pauseNextRead = false
      const failedReleases: Array<Snowflake.Snowflake> = []
      const cappedReleases: Array<EntityAddress.EntityAddress> = []
      const claimed: Array<string> = []
      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const sharding = yield* Sharding.Sharding
        const state = yield* TestEntityState
        const client = yield* TestEntity.client
        const firstRun = yield* client("completed").RequestWithKey({ key: "run" }).pipe(
          Effect.forkChild({ startImmediately: true })
        )
        const request = yield* Queue.take(state.envelopes)
        pauseNextRead = true
        yield* sharding.pollStorage
        yield* Deferred.await(readStarted)
        yield* Queue.offer(state.messages, void 0)
        yield* Fiber.join(firstRun)
        yield* TestClock.adjust(1)
        yield* sharding.reset(request.requestId)
        yield* saveGetUserRequest("capped", 42)

        // Fill capacity during the read so its batch also contains a capped address.
        yield* client("resident").NeverVolatile().pipe(Effect.forkChild({ startImmediately: true }))
        yield* Queue.take(state.envelopes)
        expect(yield* sharding.activeEntityCount).toEqual(2)
        yield* Deferred.succeed(releaseRead, void 0)
        yield* TestClock.adjust(1)
        expect(claimed).toContain("completed")
        expect(claimed).toContain("capped")
        expect(failedReleases).toEqual([request.requestId])
        assert.deepStrictEqual(
          cappedReleases.map((address) => address.entityId),
          ["capped"],
          "failed targeted release must not skip capped-address release from the same batch"
        )
      }).pipe(Effect.provide(CappedSharding({ maxResidentEntities: 2 }, (storage) => ({
        ...storage,
        resetRequests: (ids) =>
          Effect.suspend(() => {
            failedReleases.push(...ids)
            return Effect.fail(new ClusterError.PersistenceError({ cause: "injected targeted release failure" }))
          }),
        resetAddresses: (addresses) =>
          Effect.gen(function*() {
            cappedReleases.push(...addresses)
            yield* storage.resetAddresses(addresses)
          }),
        unprocessedMessages: (shards, options) =>
          Effect.gen(function*() {
            if (pauseNextRead) {
              pauseNextRead = false
              yield* Deferred.succeed(readStarted, void 0)
              yield* Deferred.await(releaseRead)
            }
            const messages = yield* storage.unprocessedMessages(shards, options)
            for (const message of messages) claimed.push(message.envelope.address.entityId)
            return messages
          })
      }))))
    }))
})

describe.concurrent("Sharding", () => {
  it.effect("redelivers a request reset while an asynchronous storage read is pending", () =>
    Effect.gen(function*() {
      const readStarted = yield* Deferred.make<void>()
      const releaseRead = yield* Deferred.make<void>()
      let pauseNextRead = false
      const claimed: Array<Snowflake.Snowflake> = []

      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const sharding = yield* Sharding.Sharding
        const state = yield* TestEntityState
        const client = (yield* TestEntity.client)("reset-race")
        const firstRun = yield* client.RequestWithKey({ key: "run" }).pipe(
          Effect.forkChild({ startImmediately: true })
        )
        const request = yield* Queue.take(state.envelopes)

        // Pause after clearing processed IDs but before storage claims rows.
        pauseNextRead = true
        yield* sharding.pollStorage
        yield* Deferred.await(readStarted)

        // Complete the request while the read is paused.
        yield* Queue.offer(state.messages, void 0)
        yield* Fiber.join(firstRun)
        yield* TestClock.adjust(1)
        assert.isTrue(yield* sharding.reset(request.requestId))
        yield* sharding.pollStorage
        claimed.length = 0

        // The reset must be redelivered before its new claim expires.
        yield* Deferred.succeed(releaseRead, void 0)
        yield* TestClock.adjust(5000)
        assert.include(claimed, request.requestId)
        const deliveriesBeforeClaimExpiry = Queue.sizeUnsafe(state.envelopes)

        yield* TestClock.adjust("10 minutes")
        assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 1)
        assert.strictEqual(
          deliveriesBeforeClaimExpiry,
          1,
          "reset request was claimed but not redelivered before claim expiry"
        )
      }).pipe(Effect.provide(CappedSharding({ refreshAssignmentsInterval: 1000 }, (storage) => ({
        ...storage,
        unprocessedMessages: (shardIds, options) =>
          Effect.gen(function*() {
            if (pauseNextRead) {
              pauseNextRead = false
              yield* Deferred.succeed(readStarted, void 0)
              yield* Deferred.await(releaseRead)
            }
            const messages = yield* storage.unprocessedMessages(shardIds, options)
            for (const message of messages) claimed.push(message.envelope.requestId)
            return messages
          })
      }))))
    }))

  for (const pauseReply of [false, true]) {
    it.effect(
      pauseReply
        ? "redelivers a remote reset published before active-request cleanup"
        : "redelivers a remote reset during a pending storage read",
      () =>
        Effect.gen(function*() {
          const readStarted = yield* Deferred.make<void>()
          const releaseRead = yield* Deferred.make<void>()
          const replyPublished = yield* Deferred.make<void>()
          const releaseReply = yield* Deferred.make<void>()
          let pauseNextRead = false
          let pauseNextReply = pauseReply
          const released: Array<Snowflake.Snowflake> = []

          yield* Effect.gen(function*() {
            yield* TestClock.adjust(1)
            const sharding = yield* Sharding.Sharding
            const driver = yield* MessageStorage.MemoryDriver
            // Share persistence without sharing runner state.
            const remoteStorage = yield* MessageStorage.makeEncoded(driver.encoded).pipe(
              Effect.provide(Snowflake.layerGenerator.pipe(Layer.provide(ShardingConfig.layerDefaults)))
            )
            const state = yield* TestEntityState
            const client = (yield* TestEntity.client)("remote-reset-race")
            const firstRun = yield* client.RequestWithKey({ key: "run" }).pipe(
              Effect.forkChild({ startImmediately: true })
            )
            const request = yield* Queue.take(state.envelopes)

            // Reclaiming an active request must not redeliver it or release its claim.
            yield* remoteStorage.resetRequests([request.requestId])
            yield* sharding.pollStorage
            yield* TestClock.adjust(1)
            expect(Queue.sizeUnsafe(state.envelopes)).toEqual(0)
            expect(released).toEqual([])

            pauseNextRead = true
            yield* sharding.pollStorage
            yield* Deferred.await(readStarted)
            yield* Queue.offer(state.messages, void 0)
            yield* Fiber.join(firstRun)
            if (pauseReply) yield* Deferred.await(replyPublished)
            yield* TestClock.adjust(1)

            // Simulate Sharding.reset on another runner.
            yield* remoteStorage.clearReplies(request.requestId)
            yield* Deferred.succeed(releaseRead, void 0)
            yield* TestClock.adjust(1)
            expect(released).toContain(request.requestId)
            if (pauseReply) {
              expect(Queue.sizeUnsafe(state.envelopes)).toEqual(0)
              yield* Deferred.succeed(releaseReply, void 0)
              yield* TestClock.adjust(1)
            }
            yield* sharding.pollStorage
            yield* TestClock.adjust(5000)
            expect(Queue.sizeUnsafe(state.envelopes)).toEqual(1)
            expect((yield* Queue.take(state.envelopes)).requestId).toEqual(request.requestId)
            yield* sharding.pollStorage
            yield* TestClock.adjust(5000)
            expect(Queue.sizeUnsafe(state.envelopes)).toEqual(0)
          }).pipe(Effect.provide(CappedSharding({}, (storage) => ({
            ...storage,
            resetRequests: (ids) =>
              Effect.gen(function*() {
                released.push(...ids)
                yield* storage.resetRequests(ids)
              }),
            unprocessedMessages: (shards, options) =>
              Effect.gen(function*() {
                if (pauseNextRead) {
                  pauseNextRead = false
                  yield* Deferred.succeed(readStarted, void 0)
                  yield* Deferred.await(releaseRead)
                }
                const messages = yield* storage.unprocessedMessages(shards, options)
                return messages.map((message) =>
                  message._tag !== "IncomingRequest" ?
                    message :
                    new Message.IncomingRequest({
                      ...message,
                      respond: (reply) =>
                        Effect.gen(function*() {
                          yield* message.respond(reply)
                          if (pauseNextReply) {
                            pauseNextReply = false
                            yield* Deferred.succeed(replyPublished, void 0)
                            yield* Deferred.await(releaseReply)
                          }
                        })
                    })
                )
              })
          }))))
        })
    )
  }

  it.effect("delivers volatile requests directly to the entity", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const makeClient = yield* TestEntity.client
      const client = makeClient("1")
      const user = yield* client.GetUserVolatile({ id: 1 })
      expect(user).toEqual(new User({ id: 1, name: "User 1" }))
    }).pipe(Effect.provide(TestSharding)))

  it.effect("does not freeze the first caller's context into the entity server", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const makeClient = yield* ContextBleedEntity.client
      const client = makeClient("1")

      const first = yield* client.ReadCaller().pipe(Effect.provideService(CallerId, "A"))
      expect(first).toEqual("A")

      const second = yield* client.ReadCaller()
      expect(second).toEqual("none")

      const durable = yield* client.ReadCallerPersisted()
      expect(durable).toEqual("none")
    }).pipe(Effect.provide(ContextBleedSharding)))

  it.effect("uses services provided when registering an entity", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      yield* sharding.registerEntity(RegistrationContextEntity, RegistrationContextHandlers).pipe(
        Effect.provideService(RegistrationContext, "registration")
      )
      yield* TestClock.adjust(1)

      const client = (yield* RegistrationContextEntity.client)("1")
      expect(yield* client.Read()).toEqual("registration")
    }).pipe(
      Effect.provide(TestSharding),
      Effect.provideService(RegistrationContext, "construction"),
      Effect.scoped
    ))

  it.effect("persists durable requests until the entity replies", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const driver = yield* MessageStorage.MemoryDriver
      const makeClient = yield* TestEntity.client
      const client = makeClient("1")
      const user = yield* client.GetUser({ id: 1 })
      expect(user).toEqual(new User({ id: 1, name: "User 1" }))
      expect(driver.journal.length).toEqual(1)
      expect(driver.unprocessed.size).toEqual(0)
    }).pipe(Effect.provide(TestSharding)))

  it.live("defects instead of hanging when persisted failures contain non-JSON Error values", () =>
    Effect.gen(function*() {
      const driver = yield* MessageStorage.MemoryDriver
      const makeClient = yield* TestEntity.client
      const client = makeClient("1")
      const cause = yield* client.Fail().pipe(
        Effect.timeout("2 seconds"),
        Effect.sandbox,
        Effect.flip
      )
      assert(Cause.hasDies(cause))
      assert.include(Cause.pretty(cause), "MalformedMessage")
      assert.strictEqual(driver.replyIds.size, 1)
      assert.strictEqual(driver.unprocessed.size, 0)
    }).pipe(Effect.provide(TestSharding)))

  it.effect("routes durable interrupts through storage", () =>
    Effect.gen(function*() {
      const driver = yield* MessageStorage.MemoryDriver
      const state = yield* TestEntityState
      const makeClient = yield* TestEntity.client
      yield* TestClock.adjust(1)
      const client = makeClient("1")

      const fiber = yield* client.Never().pipe(Effect.forkChild({ startImmediately: true }))
      yield* TestClock.adjust(1)
      yield* Fiber.interrupt(fiber)

      yield* TestClock.adjust(1)
      expect(driver.journal.length).toEqual(2)
      expect(driver.replyIds.size).toEqual(1)
      expect(Queue.sizeUnsafe(state.interrupts)).toEqual(1)
    }).pipe(Effect.provide(TestSharding)))

  it.effect("interrupts aren't sent for durable messages on shutdown", () =>
    Effect.gen(function*() {
      let driver!: MessageStorage.MemoryDriver["Service"]
      yield* Effect.gen(function*() {
        driver = yield* MessageStorage.MemoryDriver
        const makeClient = yield* TestEntity.client
        yield* TestClock.adjust(1)
        const client = makeClient("1")
        yield* client.Never().pipe(Effect.forkChild)
        yield* TestClock.adjust(1)
      }).pipe(Effect.provide(TestSharding))

      // request, client interrupt is dropped
      expect(driver.journal.length).toEqual(1)
      // server interrupt is not sent
      expect(driver.replyIds.size).toEqual(0)
    }))

  for (const persisted of [false, true] as const) {
    for (const preemptiveShutdown of [true, false]) {
      it.live(
        `shutdown completes when a finalizing entity sends an outgoing message (persisted=${persisted}, preemptiveShutdown=${preemptiveShutdown})`,
        () =>
          Effect.gen(function*() {
            const discardExit = yield* Deferred.make<Exit.Exit<void, unknown>>()
            const Receiver = Entity.make("ShutdownDeadlockReceiver", [
              Rpc.make("Ping").annotate(ClusterSchema.Persisted, persisted)
            ])
            const ReceiverLayer = Receiver.toLayer({ Ping: () => Effect.void })

            const Sender = Entity.make("ShutdownDeadlockSender", [
              Rpc.make("Arm").annotate(ClusterSchema.Persisted, false)
            ])
            const SenderLayer = Sender.toLayer(Effect.gen(function*() {
              const receiver = yield* Receiver.client
              // finalizer sends an outgoing message during entity teardown
              yield* Effect.addFinalizer(() =>
                Effect.uninterruptible(
                  Effect.sleep(300).pipe(
                    Effect.andThen(receiver("peer").Ping(void 0, { discard: true })),
                    Effect.exit,
                    Effect.flatMap((exit) => Deferred.succeed(discardExit, exit))
                  )
                )
              )
              return { Arm: () => Effect.void }
            }))

            const env = Layer.mergeAll(SenderLayer, ReceiverLayer).pipe(
              Layer.provideMerge(Sharding.layer),
              Layer.provide(RunnerStorage.layerMemory),
              Layer.provide(RunnerHealth.layerNoop),
              Layer.provide(Runners.layerNoop),
              Layer.provideMerge(MessageStorage.layerMemory),
              Layer.provide(ShardingConfig.layer({
                runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
                shardsPerGroup: 8,
                entityTerminationTimeout: 0,
                entityMessagePollInterval: 50,
                refreshAssignmentsInterval: 20,
                sendRetryInterval: 10,
                preemptiveShutdown
              }))
            )

            const shardAcquired = Latch.makeUnsafe()
            const armed = Latch.makeUnsafe()
            let driver!: MessageStorage.MemoryDriver["Service"]
            const runFiber = yield* Effect.gen(function*() {
              driver = yield* MessageStorage.MemoryDriver
              const sharding = yield* Sharding.Sharding
              const shardId = sharding.getShardId(EntityId.make("1"), "default")
              while (!sharding.hasShardId(shardId)) {
                yield* Effect.sleep(5)
              }
              yield* shardAcquired.open
              yield* (yield* Sender.client)("1").Arm()
              yield* armed.open
              return yield* Effect.never
            }).pipe(Effect.provide(env), Effect.scoped, Effect.forkDetach)

            const acquired = yield* shardAcquired.await.pipe(Effect.timeoutOption("8 seconds"))
            if (Option.isNone(acquired)) {
              runFiber.interruptUnsafe()
              yield* Fiber.await(runFiber)
            }
            assert(Option.isSome(acquired), "Timed out waiting for sender shard acquisition")
            yield* armed.await

            // Interrupting the fiber closes the Sharding scope, running the entity
            // finalizer (and its outgoing send) as part of teardown
            runFiber.interruptUnsafe()
            const completed = yield* Fiber.await(runFiber).pipe(Effect.timeoutOption("4 seconds"))
            assert(Option.isSome(completed), "Sharding scope-close hung during shutdown (deadlock)")
            assert(Exit.isSuccess(yield* Deferred.await(discardExit)), "discard send failed during shutdown")
            assert.strictEqual(driver.journal.length, persisted ? 1 : 0)
          }),
        20_000
      )
    }

    it.live(
      `shutdown completes when a finalizing entity awaits a reply from an unroutable entity (persisted=${persisted})`,
      () =>
        Effect.gen(function*() {
          const requestExit = yield* Deferred.make<Exit.Exit<void, unknown>>()
          const Receiver = Entity.make("StrandReceiver", [
            Rpc.make("Ping").annotate(ClusterSchema.Persisted, persisted)
          ])
          const ReceiverLayer = Receiver.toLayer({ Ping: () => Effect.void })

          const Sender = Entity.make("StrandSender", [
            Rpc.make("Arm").annotate(ClusterSchema.Persisted, false)
          ])
          const SenderLayer = Sender.toLayer(Effect.gen(function*() {
            const receiver = yield* Receiver.client
            // uninterruptible finalizer that awaits a reply from another entity
            yield* Effect.addFinalizer(() =>
              Effect.uninterruptible(
                Effect.sleep(300).pipe(
                  Effect.andThen(receiver("peer").Ping()),
                  Effect.exit,
                  Effect.flatMap((exit) => Deferred.succeed(requestExit, exit))
                )
              )
            )
            return { Arm: () => Effect.void }
          }))

          const env = Layer.mergeAll(SenderLayer, ReceiverLayer).pipe(
            Layer.provideMerge(Sharding.layer),
            Layer.provide(RunnerStorage.layerMemory),
            Layer.provide(RunnerHealth.layerNoop),
            Layer.provide(Runners.layerNoop),
            Layer.provideMerge(MessageStorage.layerMemory),
            Layer.provide(ShardingConfig.layer({
              runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
              shardsPerGroup: 8,
              entityTerminationTimeout: 0,
              entityMessagePollInterval: 50,
              refreshAssignmentsInterval: 20,
              sendRetryInterval: 10
            }))
          )

          const shardAcquired = Latch.makeUnsafe()
          const armed = Latch.makeUnsafe()
          let driver!: MessageStorage.MemoryDriver["Service"]
          const runFiber = yield* Effect.gen(function*() {
            driver = yield* MessageStorage.MemoryDriver
            const sharding = yield* Sharding.Sharding
            const shardId = sharding.getShardId(EntityId.make("1"), "default")
            while (!sharding.hasShardId(shardId)) {
              yield* Effect.sleep(5)
            }
            yield* shardAcquired.open
            yield* (yield* Sender.client)("1").Arm()
            yield* armed.open
            return yield* Effect.never
          }).pipe(Effect.provide(env), Effect.scoped, Effect.forkDetach)

          const acquired = yield* shardAcquired.await.pipe(Effect.timeoutOption("8 seconds"))
          if (Option.isNone(acquired)) {
            runFiber.interruptUnsafe()
            yield* Fiber.await(runFiber)
          }
          assert(Option.isSome(acquired), "Timed out waiting for sender shard acquisition")
          yield* armed.await

          runFiber.interruptUnsafe()
          const completed = yield* Fiber.await(runFiber).pipe(Effect.timeoutOption("4 seconds"))
          assert(Option.isSome(completed), "Sharding scope-close hung during shutdown (stranded caller)")
          assert(!Exit.hasDies(completed.value), "finalizer defected instead of failing cleanly")
          const exit = yield* Deferred.await(requestExit)
          assert(Exit.isFailure(exit), "request succeeded instead of failing during shutdown")
          if (persisted) {
            // A persisted request is durable, so a transient routing state is
            // not an error: the caller is interrupted instead, and the request
            // is served under the next owner.
            assert(Cause.hasInterruptsOnly(exit.cause), "persisted request was not interrupted")
          } else {
            const failure = Cause.findErrorOption(exit.cause)
            assert(Option.isSome(failure), "request did not fail with a typed error")
            assert(failure.value instanceof ClusterError.EntityNotAssignedToRunner)
          }
          assert.strictEqual(driver.journal.length, persisted ? 1 : 0)
        }),
      20_000
    )
  }

  it.live("fails a stream when its chunk acknowledgement is abandoned during shutdown", () =>
    Effect.gen(function*() {
      const chunks = yield* Queue.unbounded<number>()
      const streamStarted = yield* Deferred.make<void>()
      const streamExit = yield* Deferred.make<Exit.Exit<void, unknown>>()

      const Receiver = Entity.make("ShutdownStreamReceiver", [
        Rpc.make("Values", { success: Schema.Number, stream: true }).annotate(ClusterSchema.Persisted, true)
      ])
      const ReceiverLayer = Receiver.toLayer({
        Values: () => Stream.fromQueue(chunks).pipe(Stream.onStart(Deferred.succeed(streamStarted, void 0)))
      })

      const Sender = Entity.make("ShutdownStreamSender", [
        Rpc.make("Arm").annotate(ClusterSchema.Persisted, false)
      ])
      const SenderLayer = Sender.toLayer(Effect.gen(function*() {
        const receiver = yield* Receiver.client
        const streamFiber = yield* receiver("peer").Values().pipe(
          Stream.runDrain,
          Effect.uninterruptible,
          Effect.forkScoped({ startImmediately: true })
        )
        yield* Deferred.await(streamStarted)
        yield* Effect.addFinalizer(() =>
          Effect.uninterruptible(
            Queue.offer(chunks, 1).pipe(
              Effect.andThen(Fiber.await(streamFiber)),
              Effect.flatMap((exit) => Deferred.succeed(streamExit, exit))
            )
          )
        )
        return { Arm: () => Effect.void }
      }))

      const env = Layer.mergeAll(SenderLayer, ReceiverLayer).pipe(
        Layer.provideMerge(Sharding.layer),
        Layer.provide(RunnerStorage.layerMemory),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(Runners.layerNoop),
        Layer.provideMerge(MessageStorage.layerMemory),
        Layer.provide(ShardingConfig.layer({
          runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
          shardsPerGroup: 8,
          entityTerminationTimeout: 1000,
          entityMessagePollInterval: 50,
          refreshAssignmentsInterval: 20,
          sendRetryInterval: 10
        }))
      )

      const shardAcquired = Latch.makeUnsafe()
      const armed = Latch.makeUnsafe()
      let driver!: MessageStorage.MemoryDriver["Service"]
      const runFiber = yield* Effect.gen(function*() {
        driver = yield* MessageStorage.MemoryDriver
        const sharding = yield* Sharding.Sharding
        const shardId = sharding.getShardId(EntityId.make("1"), "default")
        while (!sharding.hasShardId(shardId)) {
          yield* Effect.sleep(5)
        }
        yield* shardAcquired.open
        yield* (yield* Sender.client)("1").Arm()
        yield* armed.open
        return yield* Effect.never
      }).pipe(Effect.provide(env), Effect.scoped, Effect.forkDetach)

      const acquired = yield* shardAcquired.await.pipe(Effect.timeoutOption("8 seconds"))
      if (Option.isNone(acquired)) {
        runFiber.interruptUnsafe()
        yield* Fiber.await(runFiber)
      }
      assert(Option.isSome(acquired), "Timed out waiting for sender shard acquisition")
      yield* armed.await

      runFiber.interruptUnsafe()
      const completed = yield* Fiber.await(runFiber).pipe(Effect.timeoutOption("4 seconds"))
      assert(Option.isSome(completed), "Sharding scope-close hung after abandoning a stream chunk acknowledgement")
      const exit = yield* Deferred.await(streamExit)
      assert(Exit.isFailure(exit), "stream succeeded instead of failing during shutdown")
      const failure = Cause.findErrorOption(exit.cause)
      assert(Option.isSome(failure), "stream did not fail with a typed error")
      assert(failure.value instanceof ClusterError.EntityNotAssignedToRunner)
      assert.strictEqual(driver.journal.filter((envelope) => envelope._tag === "AckChunk").length, 1)
    }), 20_000)

  it.effect("interrupts are sent for volatile messages on shutdown", () =>
    Effect.gen(function*() {
      let interrupted = false
      const testClock = (yield* Clock.Clock) as TestClock.TestClock

      yield* Effect.gen(function*() {
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")
        const fiber = yield* client.NeverVolatile().pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust(1)
        const config = yield* ShardingConfig.ShardingConfig
        ;(config as any).runnerAddress = Option.some(RunnerAddress.make("localhost", 1234))
        fiber.currentDispatcher.scheduleTask(() => {
          fiber.interruptUnsafe()
          Effect.runFork(testClock.adjust(30000))
        }, 0)
      }).pipe(
        Effect.provide(TestShardingWithoutRunners.pipe(
          Layer.provide(
            Layer.effect(Runners.Runners)(
              Effect.gen(function*() {
                const runners = yield* Runners.makeNoop
                return {
                  ...runners,
                  send(options) {
                    if (options.message.envelope._tag === "Interrupt") {
                      interrupted = true
                      return Effect.void
                    }
                    return runners.send(options)
                  }
                }
              })
            )
          ),
          Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
          Layer.provideMerge(ShardingConfig.layer({
            entityMailboxCapacity: 10,
            entityTerminationTimeout: 30000,
            entityMessagePollInterval: 5000,
            sendRetryInterval: 100,
            refreshAssignmentsInterval: 100
          }))
        ))
      )

      assert.isTrue(interrupted)
    }))

  it.effect("malformed message in storage", () =>
    Effect.gen(function*() {
      const driver = yield* MessageStorage.MemoryDriver
      const makeClient = yield* TestEntity.client
      yield* TestClock.adjust(1)
      const client = makeClient("1")

      const fiber = yield* client.Never().pipe(Effect.forkChild)
      yield* TestClock.adjust(1)

      const request = driver.journal[0]
      yield* driver.encoded.saveEnvelope({
        envelope: {
          id: "boom",
          _tag: "Interrupt",
          requestId: request.requestId,
          address: {
            shardId: request.address.shardId
          } as any
        },
        primaryKey: null,
        deliverAt: null
      })

      // wait for storage to poll
      yield* TestClock.adjust(5000)

      const exit = fiber.pollUnsafe()
      assert(exit && Exit.isFailure(exit) && Cause.hasDies(exit.cause))

      // malformed message should be left in the database
      expect(driver.journal.length).toEqual(2)
      // defect reply should be sent
      expect(driver.replyIds.size).toEqual(1)

      const reply = driver.requests.get(request.requestId)!.replies[0]
      assert(reply._tag === "WithExit" && reply.exit._tag === "Failure" && reply.exit.cause[0]._tag === "Die")
    }).pipe(Effect.provide(TestSharding)))

  it.effect("fails volatile requests immediately when the mailbox is full", () =>
    Effect.gen(function*() {
      const makeClient = yield* TestEntity.client
      yield* TestClock.adjust(1)
      const client = makeClient("1")

      yield* client.NeverVolatile().pipe(Effect.forkChild, Effect.replicateEffect(10))
      yield* TestClock.adjust(1)
      const error = yield* client.NeverVolatile().pipe(Effect.flip)
      assert.strictEqual(error._tag, "MailboxFull")
    }).pipe(Effect.provide(TestSharding)))

  it.effect("durable messages are retried when mailbox is full", () =>
    Effect.gen(function*() {
      const requestedIds = yield* Queue.make<Array<Snowflake.Snowflake>>()
      yield* Effect.gen(function*() {
        const state = yield* TestEntityState
        const makeClient = yield* TestEntity.client
        yield* TestClock.adjust(1)
        const client = makeClient("1")

        const fibers = yield* client.NeverFork().pipe(Effect.forkChild, Effect.replicateEffect(11))
        yield* TestClock.adjust(1)

        // wait for entity to go into resume mode and request ids
        const ids = yield* Queue.take(requestedIds)
        assert.strictEqual(ids.length, 1)

        // test entity should still only have 10 requests
        assert.deepStrictEqual(Queue.sizeUnsafe(state.envelopes), 10)

        // interrupt first request
        yield* Fiber.interrupt(fibers[0])
        yield* TestClock.adjust(100) // let retry happen

        // last request should come through
        assert.deepStrictEqual(Queue.sizeUnsafe(state.envelopes), 11)

        // interrupt second request, now the entity should be back in the main storage loop
        yield* Fiber.interrupt(fibers[1])

        // send another request within mailbox capacity
        yield* client.NeverFork().pipe(Effect.forkChild)
        yield* TestClock.adjust(1)
        yield* Fiber.interruptAll(fibers)
        yield* TestClock.adjust(100)

        // no more ids should have been requested from entity catch up
        assert.deepStrictEqual(Queue.sizeUnsafe(requestedIds), 0)
      }).pipe(Effect.provide(TestShardingWithoutStorage.pipe(
        Layer.updateService(MessageStorage.MessageStorage, (storage) => ({
          ...storage,
          unprocessedMessagesById(messageIds) {
            Queue.offerUnsafe(requestedIds, Array.fromIterable(messageIds))
            return storage.unprocessedMessagesById(messageIds)
          }
        })),
        Layer.provide(MessageStorage.layerMemory),
        Layer.provide(TestShardingConfig)
      )))
    }))

  it.effect("interrupt for future request works while mailbox is full", () =>
    Effect.gen(function*() {
      const state = yield* TestEntityState
      const makeClient = yield* TestEntity.client
      yield* TestClock.adjust(1)
      const client = makeClient("1")

      const fibers = yield* client.NeverFork().pipe(
        Effect.forkChild({ startImmediately: true }),
        Effect.replicateEffect(12)
      )
      yield* TestClock.adjust(1)

      assert.deepStrictEqual(Queue.sizeUnsafe(state.envelopes), 10)

      // interrupt 11th request
      yield* Fiber.interrupt(fibers[10])
      yield* TestClock.adjust(100) // let retry happen
      // interrupt first request, and let the 11th request come through
      yield* Fiber.interrupt(fibers[0])
      yield* TestClock.adjust(100) // let retry happen

      assert.deepStrictEqual(Queue.sizeUnsafe(state.envelopes), 12)
      // second interrupt should be sent
      assert.deepStrictEqual(Queue.sizeUnsafe(state.interrupts), 2)
    }).pipe(Effect.provide(TestSharding)))

  it.effect("delivers durable streams and acknowledges each chunk", () =>
    Effect.gen(function*() {
      const driver = yield* MessageStorage.MemoryDriver
      yield* TestClock.adjust(1)
      const makeClient = yield* TestEntity.client
      const client = makeClient("1")
      const users = yield* client.GetAllUsers({ ids: [1, 2, 3] }).pipe(
        Stream.runCollect
      )
      expect(users).toEqual([
        new User({ id: 1, name: "User 1" }),
        new User({ id: 2, name: "User 2" }),
        new User({ id: 3, name: "User 3" })
      ])

      // 1 request, 3 acks, 4 replies
      expect(driver.journal.length).toEqual(4)
      expect(driver.replyIds.size).toEqual(4)
    }).pipe(Effect.provide(TestSharding)))

  it.effect("durable stream while mailbox is full", () =>
    Effect.gen(function*() {
      const requestedIds = yield* Queue.make<Array<Snowflake.Snowflake>>()
      yield* Effect.gen(function*() {
        const state = yield* TestEntityState
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")

        const fibers = yield* client.NeverFork().pipe(
          Effect.forkChild({ startImmediately: true }),
          Effect.replicateEffect(10)
        )
        yield* TestClock.adjust(1)

        const fiber = yield* client.GetAllUsers({ ids: [1, 2, 3] }).pipe(
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true })
        )

        // make sure entity doesn't leave resume mode
        yield* client.NeverFork().pipe(Effect.forkChild({ startImmediately: true }))
        yield* client.NeverFork().pipe(Effect.forkChild({ startImmediately: true }))

        // wait for entity to go into resume mode and request ids
        const ids = yield* Queue.take(requestedIds)
        assert.strictEqual(ids.length, 3)
        assert.deepStrictEqual(Queue.sizeUnsafe(state.envelopes), 10)

        // interrupt first request
        yield* Fiber.interrupt(fibers[0])
        yield* TestClock.adjust(500) // let retry happen

        // last request + NeverFork should come through
        assert.deepStrictEqual(Queue.sizeUnsafe(state.envelopes), 12)

        // acks should be allowed to be sent
        const users = yield* Fiber.join(fiber)
        expect(users).toEqual([
          new User({ id: 1, name: "User 1" }),
          new User({ id: 2, name: "User 2" }),
          new User({ id: 3, name: "User 3" })
        ])

        const driver = yield* MessageStorage.MemoryDriver
        // 13 requests, 3 acks, 1 interrupt, 5 replies
        assert.strictEqual(driver.journal.length, 13 + 3 + 1)
        assert.strictEqual(driver.replyIds.size, 1 + 4)
      }).pipe(Effect.provide(TestShardingWithoutStorage.pipe(
        Layer.provideMerge(Layer.effect(MessageStorage.MemoryDriver)(MessageStorage.MemoryDriver)),
        Layer.updateService(MessageStorage.MessageStorage, (storage) => ({
          ...storage,
          unprocessedMessagesById(messageIds) {
            Queue.offerUnsafe(requestedIds, Array.fromIterable(messageIds))
            return storage.unprocessedMessagesById(messageIds)
          }
        })),
        Layer.provide(MessageStorage.layerMemory),
        Layer.provide(TestShardingConfig)
      )))
    }))

  it.effect("durable messages are retried on restart", () =>
    Effect.gen(function*() {
      const EnvLayer = TestShardingWithoutState.pipe(
        Layer.provide(Runners.layerNoop),
        Layer.provide(TestShardingConfig)
      )
      const driver = yield* MessageStorage.MemoryDriver
      const state = yield* TestEntityState

      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")
        yield* Effect.forkChild(client.RequestWithKey({ key: "abc" }))
        yield* TestClock.adjust(1)
      }).pipe(
        Effect.provide(EnvLayer),
        Effect.scoped
      )

      // only the request should be in the journal
      expect(driver.journal.length).toEqual(1)
      expect(driver.replyIds.size).toEqual(0)
      expect(driver.unprocessed.size).toEqual(1)

      // add response
      yield* Queue.offer(state.messages, void 0)

      // Let the shards get assigned and storage poll
      yield* TestClock.adjust(5000).pipe(
        Effect.provide(EnvLayer),
        Effect.scoped
      )

      expect(driver.journal.length).toEqual(1)
      expect(driver.replyIds.size).toEqual(1)
      expect(driver.unprocessed.size).toEqual(0)

      // the client should read the result from storage
      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")
        const result = yield* client.RequestWithKey({ key: "abc" })
        expect(result).toEqual(void 0)
      }).pipe(
        Effect.provide(EnvLayer),
        Effect.scoped
      )

      // the request should not hit the entity
      expect(driver.journal.length).toEqual(1)
      expect(driver.replyIds.size).toEqual(1)
      expect(driver.unprocessed.size).toEqual(0)
    }).pipe(Effect.provide(MessageStorage.layerMemory.pipe(
      Layer.provide(TestShardingConfig),
      Layer.merge(TestEntityState.layer)
    ))))

  it.effect("holds durable messages while entity layers are still building", () =>
    Effect.gen(function*() {
      const config = ShardingConfig.layer({
        entityMailboxCapacity: 10,
        entityRegistrationTimeout: 6000,
        entityTerminationTimeout: 0,
        entityMessagePollInterval: 100,
        sendRetryInterval: 100,
        refreshAssignmentsInterval: 0
      })
      const env = TestEntityNoState.pipe(
        Layer.provideMerge(Sharding.layer),
        Layer.provide(RunnerStorage.layerMemory),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(Runners.layerNoop),
        Layer.provide(config)
      )
      const delayedEnv = TestEntityNoState.pipe(
        Layer.provide(Layer.effectDiscard(Effect.sleep(10_000))),
        Layer.provideMerge(Sharding.layer),
        Layer.provide(RunnerStorage.layerMemory),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(Runners.layerNoop),
        Layer.provide(config)
      )
      const driver = yield* MessageStorage.MemoryDriver
      const state = yield* TestEntityState

      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")
        yield* client.RequestWithKey({ key: "slow-registration" }).pipe(Effect.forkChild)
        yield* TestClock.adjust(1)
      }).pipe(
        Effect.provide(env),
        Effect.scoped
      )

      assert.strictEqual(driver.journal.length, 1)
      assert.strictEqual(driver.replyIds.size, 0)
      assert.strictEqual(driver.unprocessed.size, 1)

      const fiber = yield* Effect.never.pipe(
        Effect.provide(delayedEnv),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )

      yield* TestClock.adjust(7500)
      assert.strictEqual(driver.replyIds.size, 0)
      assert.strictEqual(driver.unprocessed.size, 1)

      yield* TestClock.adjust(2500)
      yield* Queue.offer(state.messages, void 0)
      yield* TestClock.adjust(100)

      assert.strictEqual(driver.replyIds.size, 1)
      assert.strictEqual(driver.unprocessed.size, 0)
      yield* Fiber.interrupt(fiber)
    }).pipe(Effect.provide(MessageStorage.layerMemory.pipe(
      Layer.provide(ShardingConfig.layer({})),
      Layer.merge(TestEntityState.layer)
    ))))

  it.effect("defects durable messages when no entity ever registers", () =>
    Effect.gen(function*() {
      const config = ShardingConfig.layer({
        entityMailboxCapacity: 10,
        entityRegistrationTimeout: 1000,
        entityTerminationTimeout: 0,
        entityMessagePollInterval: 100,
        sendRetryInterval: 100,
        refreshAssignmentsInterval: 0
      })
      const registeredEnv = TestEntityNoState.pipe(
        Layer.provideMerge(Sharding.layer),
        Layer.provide(RunnerStorage.layerMemory),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(Runners.layerNoop),
        Layer.provide(config)
      )
      const noEntitiesEnv = Sharding.layer.pipe(
        Layer.provide(RunnerStorage.layerMemory),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(Runners.layerNoop),
        Layer.provide(config)
      )
      const driver = yield* MessageStorage.MemoryDriver
      const warnings: Array<unknown> = []
      const logger = Logger.make<unknown, void>((options) => {
        if (options.logLevel === "Warn") {
          warnings.push(options.message)
        }
      })

      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")
        yield* client.RequestWithKey({ key: "missing-registration" }).pipe(Effect.forkChild)
        yield* TestClock.adjust(1)
      }).pipe(
        Effect.provide(registeredEnv),
        Effect.scoped
      )

      const fiber = yield* Effect.never.pipe(
        Effect.provide(noEntitiesEnv),
        Effect.scoped,
        Effect.withLogger(logger),
        Effect.forkChild({ startImmediately: true })
      )

      yield* TestClock.adjust(8000)
      assert.isTrue(warnings.some((message) =>
        globalThis.Array.isArray(message) && message.includes("Could not find entity manager for address, retrying")
      ))
      assert.strictEqual(driver.replyIds.size, 1)
      assert.strictEqual(driver.unprocessed.size, 0)
      yield* Fiber.interrupt(fiber)
    }).pipe(Effect.provide(MessageStorage.layerMemory.pipe(
      Layer.provide(ShardingConfig.layer({})),
      Layer.merge(TestEntityState.layer)
    ))))

  it.effect("bounds local sends while entity registration is missing", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const entityId = EntityId.make("one")
      yield* TestClock.adjust(1)
      assert.isTrue(sharding.hasShardId(sharding.getShardId(entityId, "default")))

      const client = (yield* MissingRegistrationEntity.client)(entityId)
      const fiber = yield* client.Call().pipe(Effect.forkDetach({ startImmediately: true }))
      yield* Effect.yieldNow
      assert.isUndefined(fiber.pollUnsafe())

      yield* TestClock.adjust(1000)
      const exit = fiber.pollUnsafe()
      assert(exit !== undefined, "the sendLocal registration wait must be bounded")
      const defect = Exit.findDefect(exit)
      assert(Result.isSuccess(defect) && defect.success instanceof Error)
      assert.strictEqual(defect.success.message, "Entity type 'MissingRegistrationEntity' not registered")
    }).pipe(Effect.provide(CappedSharding({ entityRegistrationTimeout: 1000 }))))

  it.effect("recomputes the missing entity deadline when registration starts", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const entityId = EntityId.make("one")
      yield* TestClock.adjust(1)
      assert.isTrue(sharding.hasShardId(sharding.getShardId(entityId, "default")))

      const client = (yield* MissingRegistrationEntity.client)(entityId)
      const fiber = yield* client.Call().pipe(Effect.forkDetach({ startImmediately: true }))
      yield* Effect.yieldNow
      assert.isUndefined(fiber.pollUnsafe())

      yield* TestClock.adjust(1500)
      yield* sharding.registerEntity(
        FirstRegistrationEntity,
        Effect.succeed(FirstRegistrationEntity.of({ Call: () => Effect.void }))
      )

      // The registration-start deadline is 1 second from now. The original
      // fallback deadline has elapsed, but must no longer win the race.
      yield* TestClock.adjust(600)
      assert.isUndefined(fiber.pollUnsafe())

      yield* TestClock.adjust(400)
      const exit = fiber.pollUnsafe()
      assert(exit !== undefined, "the registration-start deadline must be bounded")
      const defect = Exit.findDefect(exit)
      assert(Result.isSuccess(defect) && defect.success instanceof Error)
      assert.strictEqual(defect.success.message, "Entity type 'MissingRegistrationEntity' not registered")
    }).pipe(Effect.provide(UnregisteredSharding({ entityRegistrationTimeout: 1000 }))))

  it.effect("keeps a shared registration latch when one waiter is interrupted", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const entityId = EntityId.make("one")
      yield* TestClock.adjust(1)
      assert.isTrue(sharding.hasShardId(sharding.getShardId(entityId, "default")))

      const client = (yield* MissingRegistrationEntity.client)(entityId)
      const interrupted = yield* client.Call().pipe(Effect.forkDetach({ startImmediately: true }))
      const remaining = yield* client.Call().pipe(Effect.forkDetach({ startImmediately: true }))
      yield* Effect.yieldNow
      assert.isUndefined(interrupted.pollUnsafe())
      assert.isUndefined(remaining.pollUnsafe())

      interrupted.interruptUnsafe()
      yield* Effect.yieldNow
      yield* sharding.registerEntity(
        MissingRegistrationEntity,
        Effect.succeed(MissingRegistrationEntity.of({ Call: () => Effect.void }))
      )
      const interruptedExit = yield* Fiber.await(interrupted)
      assert.isTrue(Exit.isFailure(interruptedExit) && Cause.hasInterruptsOnly(interruptedExit.cause))
      yield* Fiber.join(remaining)
    }).pipe(Effect.provide(UnregisteredSharding({ entityRegistrationTimeout: 1000 }))))

  it.effect("bounds client interruption while entity registration is missing", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const entityId = EntityId.make("one")
      yield* TestClock.adjust(1)
      assert.isTrue(sharding.hasShardId(sharding.getShardId(entityId, "default")))

      const client = (yield* MissingRegistrationEntity.client)(entityId)
      const fiber = yield* client.Call().pipe(Effect.forkDetach({ startImmediately: true }))
      yield* Effect.yieldNow

      // Interrupting a client sends an interrupt message through the same local
      // registration wait. Fork it so TestClock can reach the shared deadline.
      const interruptFiber = yield* Fiber.interrupt(fiber).pipe(
        Effect.forkDetach({ startImmediately: true })
      )
      yield* Effect.yieldNow
      assert.isUndefined(interruptFiber.pollUnsafe())

      yield* TestClock.adjust(1000)
      yield* Fiber.join(interruptFiber)
      const interruptedExit = yield* Fiber.await(fiber)
      assert.isTrue(Exit.isFailure(interruptedExit) && Cause.hasInterruptsOnly(interruptedExit.cause))
    }).pipe(Effect.provide(CappedSharding({ entityRegistrationTimeout: 1000 }))))

  it.effect("durable streams are resumed on restart", () =>
    Effect.gen(function*() {
      const EnvLayer = TestShardingWithoutState.pipe(
        Layer.provide(Runners.layerNoop),
        Layer.provide(TestShardingConfig)
      )
      const driver = yield* MessageStorage.MemoryDriver
      const state = yield* TestEntityState

      // first chunk
      yield* Queue.offerAll(state.streamMessages, [void 0, void 0])

      yield* Effect.gen(function*() {
        yield* TestClock.adjust(2000)
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")
        yield* Effect.forkChild(Stream.runDrain(client.StreamWithKey({ key: "abc" })))
        yield* TestClock.adjust(2000)
        // second chunk
        yield* Queue.offer(state.streamMessages, void 0)
        yield* TestClock.adjust(2000)
      }).pipe(
        Effect.provide(EnvLayer),
        Effect.scoped
      )

      // 1 request, 2 acks, 2 replies
      expect(driver.journal.length).toEqual(1 + 2)
      expect(driver.replyIds.size).toEqual(2)
      expect(driver.unprocessed.size).toEqual(1)

      // third chunk
      yield* Queue.offerAll(state.streamMessages, [void 0, void 0])
      yield* Queue.end(state.streamMessages)

      // the client should resume
      yield* Effect.gen(function*() {
        yield* TestClock.adjust(5000) // let the shards get assigned and storage poll
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")

        // let the reply loop run
        yield* TestClock.adjust(500).pipe(Effect.forkChild)

        const results = yield* Stream.runCollect(client.StreamWithKey({ key: "abc" }))
        expect(results).toEqual([3, 4])
      }).pipe(
        Effect.provide(EnvLayer),
        Effect.scoped
      )

      // 1 request, 3 acks, 4 replies (3 chunks + WithExit)
      expect(driver.journal.length).toEqual(1 + 3)
      expect(driver.replyIds.size).toEqual(4)
      expect(driver.unprocessed.size).toEqual(0)
    }).pipe(Effect.provide(MessageStorage.layerMemory.pipe(
      Layer.provide(TestShardingConfig),
      Layer.merge(TestEntityState.layer)
    ))))

  it.effect("client discard stores durable requests without waiting for replies", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const driver = yield* MessageStorage.MemoryDriver
      const makeClient = yield* TestEntity.client
      const client = makeClient("1")
      const result = yield* client.GetUser({ id: 123 }, { discard: true })
      expect(result).toEqual(void 0)
      yield* TestClock.adjust(1)
      expect(driver.journal.length).toEqual(1)
      expect(driver.unprocessed.size).toEqual(0)
    }).pipe(Effect.provide(TestSharding)))

  it.effect("client discard returns while the durable request keeps processing", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const driver = yield* MessageStorage.MemoryDriver
      const makeClient = yield* TestEntity.client
      const client = makeClient("1")
      const result = yield* client.Never(void 0, { discard: true })
      expect(result).toEqual(void 0)
      yield* TestClock.adjust(1)
      expect(driver.journal.length).toEqual(1)
      // should still be processing
      expect(driver.unprocessed.size).toEqual(1)
    }).pipe(Effect.provide(TestSharding)))

  it.effect("client discard returns while the volatile request keeps processing", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const state = yield* TestEntityState
      const makeClient = yield* TestEntity.client
      const client = makeClient("1")

      const result = yield* client.NeverVolatile(void 0, { discard: true })

      assert.isUndefined(result)
      yield* TestClock.adjust(1)
      assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 1)
    }).pipe(Effect.provide(TestSharding)))

  it.effect("client volatile discard retries a failed delivery", () =>
    Effect.gen(function*() {
      let attempts = 0

      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const config = yield* ShardingConfig.ShardingConfig
        ;(config as any).runnerAddress = Option.some(RunnerAddress.make("localhost", 1234))
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")
        const fiber = yield* client.NeverVolatile(void 0, { discard: true }).pipe(
          Effect.forkChild({ startImmediately: true })
        )

        assert.strictEqual(attempts, 1)
        assert.isUndefined(fiber.pollUnsafe())
        yield* TestClock.adjust(100)
        yield* Fiber.join(fiber)
        assert.strictEqual(attempts, 2)
      }).pipe(
        Effect.provide(TestShardingWithoutRunners.pipe(
          Layer.provide(
            Layer.effect(Runners.Runners)(
              Effect.gen(function*() {
                const runners = yield* Runners.makeNoop
                return {
                  ...runners,
                  notify(options) {
                    attempts++
                    return attempts === 1
                      ? Effect.fail(
                        new ClusterError.RunnerUnavailable({
                          address: Option.getOrThrow(options.address)
                        })
                      )
                      : Effect.void
                  }
                }
              })
            )
          ),
          Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
          Layer.provideMerge(ShardingConfig.layer({
            entityMailboxCapacity: 10,
            entityTerminationTimeout: 0,
            entityMessagePollInterval: 5000,
            sendRetryInterval: 100,
            refreshAssignmentsInterval: 0
          }))
        ))
      )
    }))

  it.effect("defects when a durable request has no MessageStorage", () =>
    Effect.gen(function*() {
      const makeClient = yield* TestEntity.client
      const client = makeClient("1")
      const cause = yield* client.Never().pipe(
        Effect.sandbox,
        Effect.flip
      )
      assert(Cause.hasDies(cause))
    }).pipe(Effect.provide(TestShardingWithoutStorage.pipe(
      Layer.provide(MessageStorage.layerNoop)
    ))))

  it.effect("reprocesses a completed volatile request id without MessageStorage", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const sharding = yield* Sharding.Sharding
      const state = yield* TestEntityState
      const rpc = TestEntity.protocol.requests.get("GetUserVolatile") as Extract<
        RpcGroup.Rpcs<typeof TestEntity.protocol>,
        { readonly _tag: "GetUserVolatile" }
      >
      const entityId = EntityId.make("1")
      const requestId = yield* sharding.getSnowflake
      const send = Effect.gen(function*() {
        const replied = yield* Deferred.make<void>()
        yield* sharding.sendOutgoing(
          new Message.OutgoingRequest({
            envelope: Envelope.makeRequest<typeof rpc>({
              requestId,
              address: EntityAddress.make({
                shardId: sharding.getShardId(entityId, "default"),
                entityType: EntityType.make(TestEntity.type),
                entityId
              }),
              tag: "GetUserVolatile",
              payload: { id: 1 },
              headers: Headers.empty
            }),
            annotations: rpc.annotations,
            context: Context.empty() as Context.Context<unknown>,
            rpc,
            lastReceivedReply: Option.none(),
            respond: () => Deferred.succeed(replied, void 0)
          }),
          false
        )
        yield* Deferred.await(replied)
      })
      yield* send
      assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 1)
      yield* send
      assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 2)
    }).pipe(Effect.provide(TestShardingWithoutStorage.pipe(
      Layer.provide(MessageStorage.layerNoop)
    ))))

  it.effect("restarts the entity layer after a handler defect", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const state = yield* TestEntityState
      const makeClient = yield* TestEntity.client
      const client = makeClient("1")
      MutableRef.set(state.defectTrigger, true)
      const result = yield* client.GetUser({ id: 123 })
      expect(result).toEqual(new User({ id: 123, name: "User 123" }))
      expect(state.layerBuilds.current).toEqual(2)
    }).pipe(Effect.provide(TestSharding)))

  it.effect("replays in-flight requests when restarting after a defect", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const state = yield* TestEntityState
      const makeClient = yield* TestEntity.client
      const client = makeClient("1")

      yield* client.NeverFork().pipe(Effect.forkChild({ startImmediately: true }))
      yield* TestClock.adjust(1)
      assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 1)

      MutableRef.set(state.defectTrigger, true)
      const result = yield* client.GetUser({ id: 123 })
      assert.deepStrictEqual(result, new User({ id: 123, name: "User 123" }))
      assert.strictEqual(state.layerBuilds.current, 2)

      yield* TestClock.adjust(1)
      assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 4)
    }).pipe(Effect.provide(TestSharding)))

  it.effect("WithTransaction is propagated to the entity handler", () =>
    Effect.gen(function*() {
      let isTransaction = false
      let transactionOpen = false
      yield* Effect.gen(function*() {
        const makeClient = yield* TestEntity.client
        yield* TestClock.adjust(1)
        const client = makeClient("1")

        const result = yield* client.WithTransaction({ id: 1 })
        assert.strictEqual(result, true)
        assert.strictEqual(isTransaction, true)
      }).pipe(Effect.provide(TestShardingWithoutStorage.pipe(
        Layer.updateService(MessageStorage.MessageStorage, (storage) => ({
          ...storage,
          withTransaction(effect) {
            return Effect.suspend(() => {
              transactionOpen = true
              return storage.withTransaction(effect)
            }).pipe(
              Effect.ensuring(Effect.sync(() => {
                transactionOpen = false
              }))
            )
          },
          saveReply(reply) {
            return MessageStorage.MemoryTransaction.use((isTransaction_) => {
              isTransaction = isTransaction_
              assert.strictEqual(transactionOpen, true)
              return storage.saveReply(reply)
            })
          }
        })),
        Layer.provide(MessageStorage.layerMemory),
        Layer.provide(TestShardingConfig)
      )))
    }))
})

const DefectRecoveryRun = Rpc.make("run", {
  payload: { id: Schema.String },
  success: Schema.String
})

const DefectRecoveryEntity = Entity.make("DefectRecovery", [DefectRecoveryRun.annotate(ClusterSchema.Persisted, true)])

const DefectRecoverySharding = <R>(entityLayer: Layer.Layer<never, never, R>) =>
  entityLayer.pipe(Layer.provideMerge(UnregisteredSharding({})))

// Counts handler builds. Building the `blocked` generation waits until
// `acquired` completes, holding the entity in replacement acquisition.
const makeGenerations = Effect.fnUntraced(function*(blocked?: number) {
  const count = yield* Ref.make(0)
  const acquiring = yield* Deferred.make<void>()
  const acquired = yield* Deferred.make<void>()
  const next = Effect.gen(function*() {
    const generation = yield* Ref.updateAndGet(count, (n) => n + 1)
    if (generation === blocked) {
      yield* Deferred.succeed(acquiring, undefined)
      yield* Deferred.await(acquired)
    }
    return generation
  })
  return { count, acquiring, acquired, next } as const
})

// Drives an EntityManager directly: its first request defects, and the
// replacement handlers stay in acquisition until `generations.acquired`.
const startBlockedRebuild = Effect.fnUntraced(function*(entityId: string) {
  const generations = yield* makeGenerations(2)
  const attempts = yield* Ref.make(0)
  const run = Rpc.make("run")
  const entity = Entity.make("DefectRecoveryShutdown", [run])
  const sharding = yield* Sharding.Sharding
  const manager = yield* EntityManager.make(
    entity,
    Effect.as(
      generations.next,
      entity.of({
        run: () => Ref.update(attempts, (n) => n + 1).pipe(Effect.andThen(Effect.die("restart")))
      })
    ),
    {
      sharding,
      storage: MessageStorage.noop,
      runnerAddress: RunnerAddress.make("localhost", 1234),
      residency: { admitUnsafe: () => true, releaseUnsafe: () => {} },
      maxIdleTime: Infinity,
      defectRetryPolicy: Schedule.spaced(1)
    }
  )
  const id = EntityId.make(entityId)
  const shardId = sharding.getShardId(id, "default")
  const address = EntityAddress.make({ shardId, entityType: EntityType.make(entity.type), entityId: id })
  const send = Effect.gen(function*() {
    return yield* manager.sendLocal(
      new Message.IncomingRequestLocal<typeof run>({
        envelope: Envelope.makeRequest<typeof run>({
          requestId: yield* sharding.getSnowflake,
          address,
          tag: "run",
          payload: undefined,
          headers: Headers.empty
        }),
        lastSentReply: Option.none(),
        annotations: Context.empty(),
        respond: () => Effect.void
      })
    )
  })
  yield* TestClock.adjust(1)
  yield* send
  yield* TestClock.adjust(10)
  yield* Deferred.await(generations.acquiring)
  return { manager, shardId, send, attempts, acquired: generations.acquired } as const
})

describe.concurrent("Sharding defect recovery", () => {
  it.effect("restarts again when a replayed request defects synchronously", () =>
    Effect.gen(function*() {
      const entity = DefectRecoveryEntity
      const generations = yield* makeGenerations()
      const attempts = yield* Ref.make(0)
      const entityLayer = entity.toLayer(Effect.as(
        generations.next,
        entity.of({
          run: Effect.fnUntraced(function*({ payload }) {
            if ((yield* Ref.updateAndGet(attempts, (n) => n + 1)) <= 3) {
              return yield* Effect.die("repeated defect")
            }
            return payload.id
          })
        })
      ))

      yield* Effect.gen(function*() {
        const client = (yield* entity.client)("repeated")
        const work = yield* client.run({ id: "request" }).pipe(Effect.forkChild)
        yield* TestClock.adjust("30 seconds")
        assert.strictEqual(yield* Ref.get(attempts), 4)
        assert.strictEqual(yield* Ref.get(generations.count), 4)
        assert.strictEqual(yield* Fiber.join(work), "request")
      }).pipe(Effect.provide(DefectRecoverySharding(entityLayer)))
    }))

  it.effect("replays unfinished requests before arrivals during acquisition", () =>
    Effect.gen(function*() {
      const entity = DefectRecoveryEntity
      const generations = yield* makeGenerations(2)
      const fail = yield* Deferred.make<void>()
      const bothStarted = yield* Deferred.make<void>()
      const started = yield* Ref.make(0)
      const calls = yield* Ref.make<Array<readonly [number, string]>>([])
      const completed = yield* Ref.make<Array<string>>([])
      const thirdRequestId = yield* Deferred.make<Snowflake.Snowflake>()
      const entityLayer = entity.toLayer(
        Effect.map(generations.next, (generation) =>
          entity.of({
            run: Effect.fnUntraced(function*({ payload, requestId }) {
              if (payload.id === "third") {
                yield* Deferred.succeed(thirdRequestId, requestId)
              }
              yield* Ref.update(calls, (calls) => [...calls, [generation, payload.id] as const])
              if (generation === 1) {
                if ((yield* Ref.updateAndGet(started, (n) => n + 1)) === 2) {
                  yield* Deferred.succeed(bothStarted, undefined)
                }
                yield* Deferred.await(fail)
                return yield* Effect.die("initial defect")
              }
              if (generation === 2 && payload.id === "first") {
                return yield* Effect.die("replay defect")
              }
              yield* Ref.update(completed, (ids) => [...ids, payload.id])
              return payload.id
            })
          })),
        { concurrency: "unbounded" }
      )

      yield* Effect.gen(function*() {
        const client = (yield* entity.client)("arrivals")
        const first = yield* client.run({ id: "first" }).pipe(Effect.forkChild)
        const second = yield* client.run({ id: "second" }).pipe(Effect.forkChild)
        yield* Deferred.await(bothStarted)
        yield* Deferred.succeed(fail, undefined)
        yield* TestClock.adjust("10 seconds")
        yield* Deferred.await(generations.acquiring)
        const third = yield* client.run({ id: "third" }).pipe(Effect.forkChild)
        yield* TestClock.adjust(1)
        yield* Deferred.succeed(generations.acquired, undefined)
        yield* TestClock.adjust("30 seconds")
        assert.strictEqual(yield* Fiber.join(first), "first")
        assert.strictEqual(yield* Fiber.join(second), "second")
        assert.strictEqual(yield* Fiber.join(third), "third")
        const recorded = yield* Ref.get(calls)
        assert.deepStrictEqual(
          Array.findFirst(recorded, ([generation]) => generation === 2),
          Option.some([2, "first"] as const)
        )
        // A request still waiting for its first dispatch is not replayed as well
        assert.strictEqual(Array.filter(recorded, ([, id]) => id === "third").length, 1)
        const requestId = yield* Deferred.await(thirdRequestId)
        const driver = yield* MessageStorage.MemoryDriver
        const replies = yield* driver.encoded.repliesFor([String(requestId)]).pipe(Effect.orDie)
        assert.isTrue(Array.some(
          replies,
          (reply) => reply._tag === "WithExit" && reply.exit._tag === "Success" && reply.exit.value === "third"
        ))
        assert.sameMembers(yield* Ref.get(completed), ["first", "second", "third"])
        assert.strictEqual(yield* Ref.get(generations.count), 3)
      }).pipe(Effect.provide(DefectRecoverySharding(entityLayer)))
    }))

  it.effect("finishes shutdown when replacement acquisition completes", () =>
    Effect.gen(function*() {
      const { acquired, attempts, manager, shardId } = yield* startBlockedRebuild("shutdown")
      const shutdown = yield* manager.interruptShard(shardId).pipe(Effect.forkChild)
      yield* TestClock.adjust(1)
      assert.strictEqual(yield* manager.activeEntityCount, 0)
      yield* Deferred.succeed(acquired, undefined)
      yield* TestClock.adjust(1)
      const completed = shutdown.pollUnsafe()
      // Let a broken implementation's termination timeout finish before asserting.
      yield* TestClock.adjust(1000)
      assert.deepStrictEqual(completed, Exit.void)
      assert.strictEqual(yield* Ref.get(attempts), 1, "shutdown must not replay application requests")
    }).pipe(Effect.provide(BlockedRebuildSharding)))

  it.effect("interrupts a queued arrival when shutdown starts during replacement acquisition", () =>
    Effect.gen(function*() {
      const { acquired, manager, send, shardId } = yield* startBlockedRebuild("shutdown-queued")
      // Arrives while the replacement handlers are still being built, so it
      // queues behind the replay of unfinished requests.
      const queued = yield* send.pipe(Effect.forkChild)
      yield* TestClock.adjust(1)
      assert.strictEqual(queued.pollUnsafe(), undefined)
      yield* manager.interruptShard(shardId).pipe(Effect.forkChild)
      yield* TestClock.adjust(1)
      assert.strictEqual(yield* manager.activeEntityCount, 0)
      // The queued request must be refused as soon as the activation is retired,
      // without waiting for the replacement handlers.
      const exit = queued.pollUnsafe()
      assert.isDefined(exit, "queued arrival must not wait for replacement acquisition")
      assert.isTrue(Exit.hasInterrupts(exit), "queued arrival must be interrupted")
      yield* Deferred.succeed(acquired, undefined)
    }).pipe(Effect.provide(BlockedRebuildSharding)))
})

const ActiveTeardownCaller = Entity.make("ActiveTeardownCaller", [
  Rpc.make("Arm").annotate(ClusterSchema.Persisted, false)
])

const ActiveTeardownCallerLayer = ActiveTeardownCaller.toLayer(Effect.gen(function*() {
  const receiver = yield* TestEntity.client
  yield* receiver("nested-target").Never().pipe(Effect.forkScoped)
  return { Arm: () => Effect.void }
}))

const journalInterrupts = (driver: MessageStorage.MemoryDriver["Service"]) =>
  driver.journal.filter((envelope) => envelope._tag === "Interrupt").length

const waitForIdleReap = Effect.fnUntraced(function*(
  sharding: { readonly activeEntityCount: Effect.Effect<number> },
  remaining: number
) {
  for (let i = 0; i < 12; i++) {
    if ((yield* sharding.activeEntityCount) <= remaining) return
    yield* TestClock.adjust(5000)
  }
  assert.isAtMost(yield* sharding.activeEntityCount, remaining)
})

describe.concurrent("Sharding active teardowns", () => {
  it.effect("swallows persisted interrupts from an idle-reaped nested proxy call", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const driver = yield* MessageStorage.MemoryDriver
      const state = yield* TestEntityState
      const sharding = yield* Sharding.Sharding
      const caller = (yield* ActiveTeardownCaller.client)("1")
      yield* caller.Arm()
      yield* TestClock.adjust(1)
      assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 1)
      assert.strictEqual(journalInterrupts(driver), 0)

      yield* waitForIdleReap(sharding, 1)
      assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 1)
      assert.strictEqual(Queue.sizeUnsafe(state.interrupts), 0)
      assert.strictEqual(journalInterrupts(driver), 0)
    }).pipe(Effect.provide(ActiveTeardownSharding({ entityMaxIdleTime: 1 }))))

  // TestClock-driven reassignment can exhaust the wall-clock timeout when
  // this test competes with the rest of this file in CI.
  it.effect("swallows persisted interrupts when the caller's shard is released", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState()
      const runnerStorage = Layer.effect(
        RunnerStorage.RunnerStorage,
        Effect.map(Clock.Clock, (clock) => makeFailoverStorage(storageState, clock))
      )
      const layer = ActiveTeardownCallerLayer.pipe(
        Layer.merge(TestEntityNoState),
        Layer.provideMerge(Sharding.layer),
        Layer.provide(runnerStorage),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provideMerge(TestEntityState.layer),
        Layer.provide(Runners.layerNoop),
        Layer.provideMerge(MessageStorage.layerMemory),
        Layer.provide(Snowflake.layerGenerator),
        Layer.provide(ShardingConfig.layer({
          runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
          shardsPerGroup: 1,
          entityTerminationTimeout: 0,
          entityMessagePollInterval: 10,
          refreshAssignmentsInterval: 10,
          sendRetryInterval: 10
        }))
      )

      yield* Effect.gen(function*() {
        const driver = yield* MessageStorage.MemoryDriver
        const state = yield* TestEntityState
        const sharding = yield* Sharding.Sharding
        const shardId = sharding.getShardId(EntityId.make("1"), "default")
        while (!sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }

        yield* (yield* ActiveTeardownCaller.client)("1").Arm()
        yield* TestClock.adjust(1)
        assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 1)

        storageState.assignSelf = false
        while (sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }
        while ((yield* sharding.activeEntityCount) > 0) {
          yield* TestClock.adjust(1)
        }

        assert.strictEqual(journalInterrupts(driver), 0)
      }).pipe(Effect.provide(layer), Effect.scoped)
    }), { concurrent: false })

  it.effect("treats node shutdown interrupts as transient via isShutdown", () =>
    Effect.gen(function*() {
      let driver!: MessageStorage.MemoryDriver["Service"]
      let state!: TestEntityState["Service"]
      yield* Effect.gen(function*() {
        driver = yield* MessageStorage.MemoryDriver
        state = yield* TestEntityState
        yield* TestClock.adjust(1)
        yield* (yield* ActiveTeardownCaller.client)("1").Arm()
        yield* TestClock.adjust(1)
        assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 1)
      }).pipe(Effect.provide(ActiveTeardownSharding()))

      assert.strictEqual(journalInterrupts(driver), 0)
      assert.strictEqual(driver.journal.length, 1)
    }))

  it.effect("forwards replayed storage interrupts that have no local provenance", () =>
    Effect.gen(function*() {
      const driver = yield* MessageStorage.MemoryDriver
      const state = yield* TestEntityState
      const sharding = yield* Sharding.Sharding
      const makeClient = yield* TestEntity.client
      yield* TestClock.adjust(1)
      const client = makeClient("1")

      yield* client.Never().pipe(Effect.forkChild({ startImmediately: true }))
      yield* TestClock.adjust(1)
      assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 1)

      const request = driver.journal[0]
      assert.strictEqual(request._tag, "Request")
      yield* driver.encoded.saveEnvelope({
        envelope: {
          id: String(yield* sharding.getSnowflake),
          _tag: "Interrupt",
          requestId: request.requestId,
          address: request.address
        },
        primaryKey: null,
        deliverAt: null
      })

      yield* TestClock.adjust(5000)
      assert.strictEqual(Queue.sizeUnsafe(state.interrupts), 1)
      assert.strictEqual(journalInterrupts(driver), 1)
    }).pipe(Effect.provide(TestSharding)))

  it.effect("forwards interrupts from an external same-node caller", () =>
    Effect.gen(function*() {
      const driver = yield* MessageStorage.MemoryDriver
      const state = yield* TestEntityState
      const makeClient = yield* TestEntity.client
      yield* TestClock.adjust(1)
      const client = makeClient("1")

      const fiber = yield* client.Never().pipe(Effect.forkChild({ startImmediately: true }))
      yield* TestClock.adjust(1)
      yield* Fiber.interrupt(fiber)
      yield* TestClock.adjust(1)

      assert.strictEqual(journalInterrupts(driver), 1)
      assert.strictEqual(Queue.sizeUnsafe(state.interrupts), 1)
    }).pipe(Effect.provide(TestSharding)))

  it.effect("forwards interrupts from an external same-node caller during entity teardown", () =>
    Effect.gen(function*() {
      const driver = yield* MessageStorage.MemoryDriver
      const state = yield* TestEntityState
      const sharding = yield* Sharding.Sharding
      const makeClient = yield* TestEntity.client
      yield* TestClock.adjust(1)
      const entityId = EntityId.make("external-teardown")
      const client = makeClient("external-teardown")
      const address = EntityAddress.make({
        shardId: sharding.getShardId(entityId, "default"),
        entityType: EntityType.make(TestEntity.type),
        entityId
      })

      const fiber = yield* client.Never().pipe(Effect.forkChild({ startImmediately: true }))
      yield* TestClock.adjust(1)
      ActiveTeardown.acquireEntity(address)
      yield* Fiber.interrupt(fiber).pipe(
        Effect.ensuring(Effect.sync(() => ActiveTeardown.releaseEntity(address)))
      )
      yield* TestClock.adjust(1)

      assert.strictEqual(journalInterrupts(driver), 1)
      assert.strictEqual(Queue.sizeUnsafe(state.interrupts), 1)
    }).pipe(Effect.provide(TestSharding)))

  it.effect("returns registry size to baseline after entity reap storms", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const sharding = yield* Sharding.Sharding
      const makeClient = yield* ReapStormEntity.client

      const storm = Effect.fnUntraced(function*(offset: number) {
        for (let i = 0; i < 20; i++) {
          yield* makeClient(String(offset + i)).Ping()
        }
        assert.strictEqual(yield* sharding.activeEntityCount, 20)
        yield* waitForIdleReap(sharding, 0)
        assert.strictEqual(yield* sharding.activeEntityCount, 0)
        for (let i = 0; i < 20; i++) {
          const entityId = EntityId.make(String(offset + i))
          assert.isFalse(ActiveTeardown.isActive(EntityAddress.make({
            shardId: sharding.getShardId(entityId, "default"),
            entityType: EntityType.make("ReapStormEntity"),
            entityId
          })))
        }
      })

      yield* storm(0)
      yield* storm(100)
    }).pipe(Effect.provide(ReapStormSharding)))
})

const ReapStormEntity = Entity.make("ReapStormEntity", [
  Rpc.make("Ping").annotate(ClusterSchema.Persisted, false)
])

const ReapStormEntityLayer = ReapStormEntity.toLayer({ Ping: () => Effect.void })

describe.concurrent("Sharding residency cap", () => {
  it.effect("bounds resident entities to maxResidentEntities", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const sharding = yield* Sharding.Sharding
      const makeClient = yield* TestEntity.client
      const fibers: Array<Fiber.Fiber<User, any>> = []
      for (let i = 1; i <= 6; i++) {
        fibers.push(
          yield* makeClient(String(i)).GetUser({ id: i }).pipe(
            Effect.forkChild({ startImmediately: true })
          )
        )
      }
      yield* TestClock.adjust(1)
      assert.isAtMost(yield* sharding.activeEntityCount, 2)

      // idle entities are reaped over time, freeing slots for the backlog
      for (let i = 0; i < 12; i++) {
        yield* TestClock.adjust(5000)
        assert.isAtMost(yield* sharding.activeEntityCount, 2)
      }

      const users = yield* Fiber.joinAll(fibers)
      assert.deepStrictEqual(users.map((user) => user.id), [1, 2, 3, 4, 5, 6])
    }).pipe(Effect.provide(CappedSharding({ maxResidentEntities: 2, entityMaxIdleTime: 1000 }))))

  it.effect("volatile sends to new entities fail with MailboxFull at the cap", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const driver = yield* MessageStorage.MemoryDriver
      const sharding = yield* Sharding.Sharding
      const makeClient = yield* TestEntity.client
      // occupy the only slot
      yield* makeClient("1").NeverVolatile().pipe(Effect.forkChild({ startImmediately: true }))
      yield* TestClock.adjust(1)
      assert.strictEqual(yield* sharding.activeEntityCount, 1)

      const error = yield* makeClient("2").GetUserVolatile({ id: 2 }).pipe(Effect.flip)
      assert.strictEqual(error._tag, "MailboxFull")

      // persisted sends still succeed and wait in storage
      yield* makeClient("2").GetUser({ id: 2 }, { discard: true })
      yield* TestClock.adjust(5000)
      assert.strictEqual(yield* sharding.activeEntityCount, 1)
      assert.strictEqual(driver.unprocessed.size, 1)
      assert.strictEqual(driver.replyIds.size, 0)
    }).pipe(Effect.provide(CappedSharding({ maxResidentEntities: 1 }))))

  it.effect("keeps delivering to resident entities at the cap", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const driver = yield* MessageStorage.MemoryDriver
      const state = yield* TestEntityState
      const sharding = yield* Sharding.Sharding
      const makeClient = yield* TestEntity.client
      // make entity "1" resident and keep it busy
      yield* makeClient("1").NeverFork().pipe(Effect.forkChild({ startImmediately: true }))
      yield* TestClock.adjust(1)
      assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 1)

      // a backlog of new entity ids in front of the resident's next message
      for (let i = 2; i <= 4; i++) {
        yield* makeClient(String(i)).GetUser({ id: i }, { discard: true })
      }
      const fiber = yield* makeClient("1").GetUser({ id: 1 }).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      yield* TestClock.adjust(5000)

      // the resident entity received its message despite the backlog in front
      assert.deepStrictEqual(yield* Fiber.join(fiber), new User({ id: 1, name: "User 1" }))
      // the new ids were not admitted and their requests stay in storage
      assert.strictEqual(yield* sharding.activeEntityCount, 1)
      assert.strictEqual(driver.unprocessed.size, 4)
      assert.strictEqual(driver.replyIds.size, 1)
    }).pipe(Effect.provide(CappedSharding({
      maxResidentEntities: 1,
      unprocessedMessageBatchSize: 2
    }))))

  it.effect("drains a full batch without waiting for the poll interval", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const driver = yield* MessageStorage.MemoryDriver

      for (let i = 1; i <= 5; i++) {
        yield* saveGetUserRequest(String(i), i)
      }
      assert.strictEqual(driver.replyIds.size, 0)

      // a single poll drains the whole backlog in batches of 2
      yield* TestClock.adjust(5000)
      assert.strictEqual(driver.replyIds.size, 5)
    }).pipe(Effect.provide(CappedSharding({ unprocessedMessageBatchSize: 2 }))))

  it.effect("advances past in-flight memory requests when reading bounded batches", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const makeClient = yield* TestEntity.client
      yield* makeClient("1").Never().pipe(Effect.forkChild({ startImmediately: true }))
      yield* makeClient("2").Never().pipe(Effect.forkChild({ startImmediately: true }))
      const fiber = yield* makeClient("3").GetUser({ id: 3 }).pipe(
        Effect.forkChild({ startImmediately: true })
      )

      yield* TestClock.adjust(5000)
      assert.deepStrictEqual(yield* Fiber.join(fiber), new User({ id: 3, name: "User 3" }))
    }).pipe(Effect.provide(CappedSharding({ unprocessedMessageBatchSize: 2 }))))

  it.effect("keeps full-sized storage reads when approaching the entity cap", () =>
    Effect.gen(function*() {
      const limits: Array<number> = []
      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const sharding = yield* Sharding.Sharding
        const makeClient = yield* TestEntity.client
        for (let i = 1; i <= 4; i++) {
          yield* makeClient(String(i)).NeverVolatile().pipe(Effect.forkChild({ startImmediately: true }))
        }
        yield* TestClock.adjust(1)
        assert.strictEqual(yield* sharding.activeEntityCount, 4)
        limits.length = 0

        for (let i = 0; i < 10; i++) {
          yield* saveGetUserRequest(String(i % 4 + 1), i)
        }
        yield* TestClock.adjust(5000)
        assert.isNotEmpty(limits)
        assert.deepStrictEqual([...new Set(limits)], [100])
      }).pipe(Effect.provide(CappedSharding({
        maxResidentEntities: 5,
        unprocessedMessageBatchSize: 100
      }, (storage) => ({
        ...storage,
        unprocessedMessages(shardIds, options) {
          if (options?.limit !== undefined) limits.push(options.limit)
          return storage.unprocessedMessages(shardIds, options)
        }
      }))))
    }))

  it.effect("normalizes programmatic batch sizes below one", () =>
    Effect.forEach([0, -1], (unprocessedMessageBatchSize) =>
      Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const makeClient = yield* TestEntity.client
        const fiber = yield* makeClient("1").GetUser({ id: 1 }).pipe(
          Effect.forkChild({ startImmediately: true })
        )

        yield* TestClock.adjust(5000)
        assert.isDefined(fiber.pollUnsafe())
        assert.deepStrictEqual(yield* Fiber.join(fiber), new User({ id: 1, name: "User 1" }))
      }).pipe(Effect.provide(CappedSharding({ unprocessedMessageBatchSize }))), { discard: true }))

  it.effect("does not busy-poll storage at the cap", () =>
    Effect.gen(function*() {
      let reads = 0
      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const makeClient = yield* TestEntity.client
        yield* makeClient("1").NeverVolatile().pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust(1)
        // a backlog for a new id that cannot be admitted
        yield* makeClient("2").GetUser({ id: 2 }, { discard: true })
        yield* TestClock.adjust(1)
        const before = reads
        yield* TestClock.adjust(4000) // less than the poll interval
        assert.isAtMost(reads - before, 1)
      }).pipe(Effect.provide(CappedSharding({ maxResidentEntities: 1 }, (storage) => ({
        ...storage,
        unprocessedMessages(shardIds, options) {
          reads++
          return storage.unprocessedMessages(shardIds, options)
        }
      }))))
    }))

  it.effect("unbounded maxResidentEntities does not limit spawning", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const sharding = yield* Sharding.Sharding
      const makeClient = yield* TestEntity.client
      for (let i = 1; i <= 15; i++) {
        yield* makeClient(String(i)).NeverVolatile().pipe(Effect.forkChild({ startImmediately: true }))
      }
      yield* TestClock.adjust(1)
      assert.strictEqual(yield* sharding.activeEntityCount, 15)
    }).pipe(Effect.provide(CappedSharding({ maxResidentEntities: "unbounded" }))))
})

describe("Sharding shard lock failover", { concurrent: false }, () => {
  it.effect("interrupts entities and reacquires shards after lock storage recovers", () =>
    Effect.gen(function*() {
      const warnings: Array<unknown> = []
      const logger = Logger.make<unknown, void>((options) => {
        if (options.logLevel === "Warn") {
          warnings.push(options.message)
        }
      })
      const storageState = makeFailoverStorageState()
      const runnerStorage = Layer.effect(
        RunnerStorage.RunnerStorage,
        Effect.map(Clock.Clock, (clock) => makeFailoverStorage(storageState, clock))
      )
      const config = ShardingConfig.layer({
        runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
        shardsPerGroup: 1,
        shardLockExpiration: 300,
        shardLockRefreshInterval: 1000,
        entityTerminationTimeout: 30_000,
        entityMessagePollInterval: 10,
        refreshAssignmentsInterval: 10,
        sendRetryInterval: 10
      })
      const layer = TestEntityNoState.pipe(
        Layer.provideMerge(Sharding.layer),
        Layer.provide(runnerStorage),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provideMerge(TestEntityState.layer),
        Layer.provide(Runners.layerNoop),
        Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
        Layer.provide(config)
      )

      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const entityState = yield* TestEntityState
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")
        const shardId = sharding.getShardId(EntityId.make("1"), "default")

        while (!sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }
        while (!storageState.refreshCalls.some((call) => call.shards.length > 0)) {
          yield* TestClock.adjust(100)
        }

        const entityFiber = yield* client.NeverVolatile().pipe(
          Effect.forkChild({ startImmediately: true })
        )
        yield* TestClock.adjust(1)
        assert.strictEqual(Queue.sizeUnsafe(entityState.envelopes), 1)

        const acquireCount = storageState.acquireCalls.length
        const partitionedAt = yield* Clock.currentTimeMillis
        storageState.blackholed = true

        yield* TestClock.adjust(201)

        assert.isFalse(sharding.hasShardId(shardId))
        assert.isFalse(yield* sharding.isShutdown)
        const entityExit = entityFiber.pollUnsafe()
        assert(entityExit && Exit.hasInterrupts(entityExit))
        assert.strictEqual(ClusterMetrics.shards.valueUnsafe(Context.empty()).value, BigInt(0))

        const failedRefreshes = storageState.refreshCalls.filter((call) =>
          call.at >= partitionedAt && call.shards.length > 0
        )
        assert.isAtMost(failedRefreshes.length, 2)

        yield* TestClock.adjust(1000)
        assert.strictEqual(storageState.acquireCalls.length, acquireCount)
        assert(storageState.refreshCalls.some((call) => call.at >= partitionedAt && call.shards.length === 0))
        assert(
          storageState.refreshCalls
            .filter((call) => call.at >= partitionedAt + 200)
            .every((call) => call.shards.length === 0)
        )

        storageState.blackholed = false
        yield* TestClock.adjust(101)
        while (!sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }

        assert.isAbove(storageState.acquireCalls.length, acquireCount)
        assert(storageState.acquireCalls.at(-1)!.shards.some((shard) => shard.id === shardId.id))
        assert.deepStrictEqual(yield* client.GetUserVolatile({ id: 2 }), new User({ id: 2, name: "User 2" }))
        assert.strictEqual(Queue.sizeUnsafe(entityState.envelopes), 2)
        assert.isTrue(warnings.some((message) =>
          globalThis.Array.isArray(message) && message.includes("Shard lock storage is still unhealthy")
        ))
      }).pipe(Effect.provide(layer), Effect.withLogger(logger), Effect.scoped)
    }))

  it.effect("keeps shards acquired while an earlier lock refresh is in flight", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState()
      const acquireStarted = yield* Deferred.make<void>()
      const refreshStarted = yield* Deferred.make<void>()
      const acquireDone = yield* Deferred.make<void>()
      const runnerStorage = Layer.effect(
        RunnerStorage.RunnerStorage,
        Effect.map(Clock.Clock, (clock) => {
          const storage = makeFailoverStorage(storageState, clock)
          return RunnerStorage.RunnerStorage.of({
            ...storage,
            acquire: Effect.fnUntraced(function*(address, shardIds) {
              if (yield* Deferred.isDone(acquireDone)) {
                return yield* storage.acquire(address, shardIds)
              }
              yield* Deferred.succeed(acquireStarted, void 0)
              yield* Deferred.await(refreshStarted)
              const acquired = yield* storage.acquire(address, shardIds)
              yield* Deferred.succeed(acquireDone, void 0)
              return acquired
            }),
            refresh: Effect.fnUntraced(function*(address, shardIds) {
              const shards = globalThis.Array.from(shardIds)
              if ((yield* Deferred.isDone(acquireStarted)) && !(yield* Deferred.isDone(acquireDone))) {
                assert.deepStrictEqual(shards, [])
                yield* Deferred.succeed(refreshStarted, void 0)
                yield* Deferred.await(acquireDone)
              }
              return yield* storage.refresh(address, shards)
            })
          })
        })
      )
      const config = ShardingConfig.layer({
        runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
        shardsPerGroup: 1,
        shardLockExpiration: 3000,
        shardLockRefreshInterval: 100,
        entityTerminationTimeout: 0,
        refreshAssignmentsInterval: 10
      })
      const layer = Sharding.layer.pipe(
        Layer.provide(runnerStorage),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(Runners.layerNoop),
        Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
        Layer.provide(config)
      )

      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const shardId = ShardId.make("default", 1)

        yield* TestClock.adjust(100)
        assert.isTrue(yield* Deferred.isDone(acquireDone))
        assert.isTrue(sharding.hasShardId(shardId))

        yield* TestClock.adjust(500)

        assert.isTrue(sharding.hasShardId(shardId), "shard acquired during the refresh was dropped")
        assert.deepStrictEqual(storageState.releaseCalls, [])
        assert.strictEqual(storageState.acquireCalls.length, 1)
      }).pipe(Effect.provide(layer))
    }))

  it.effect("releases a lost requested shard without dropping a shard acquired during refresh", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState()
      const firstShard = ShardId.make("default", 1)
      const secondShard = ShardId.make("default", 2)
      const refreshStarted = yield* Deferred.make<void>()
      const refreshResponse = yield* Deferred.make<void>()
      let acquireCount = 0
      let lostShard = false
      const runnerStorage = Layer.effect(
        RunnerStorage.RunnerStorage,
        Effect.map(Clock.Clock, (clock) => {
          const storage = makeFailoverStorage(storageState, clock)
          return RunnerStorage.RunnerStorage.of({
            ...storage,
            acquire: Effect.fnUntraced(function*(address, shardIds) {
              acquireCount++
              if (acquireCount === 1) {
                return yield* storage.acquire(address, [firstShard])
              }
              if (acquireCount === 2) {
                yield* Deferred.await(refreshStarted)
              }
              return yield* storage.acquire(
                address,
                globalThis.Array.from(shardIds).filter((shard) => shard.id !== firstShard.id)
              )
            }),
            refresh: Effect.fnUntraced(function*(address, shardIds) {
              const shards = globalThis.Array.from(shardIds)
              if (!lostShard && shards.length > 0) {
                lostShard = true
                assert.deepStrictEqual(shards, [firstShard])
                yield* Deferred.succeed(refreshStarted, void 0)
                yield* Deferred.await(refreshResponse)
                return []
              }
              return yield* storage.refresh(address, shards)
            })
          })
        })
      )
      const layer = Sharding.layer.pipe(
        Layer.provide(runnerStorage),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(Runners.layerNoop),
        Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
        Layer.provide(ShardingConfig.layer({
          runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
          shardsPerGroup: 2,
          shardLockExpiration: 30_000,
          shardLockRefreshInterval: 2000,
          entityTerminationTimeout: 0,
          refreshAssignmentsInterval: 10
        }))
      )

      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding

        yield* TestClock.adjust(2000)
        assert.isTrue(yield* Deferred.isDone(refreshStarted))
        assert.isTrue(sharding.hasShardId(firstShard))
        assert.isTrue(sharding.hasShardId(secondShard))

        yield* Deferred.succeed(refreshResponse, void 0)
        yield* TestClock.adjust(1)

        assert.isFalse(sharding.hasShardId(firstShard))
        assert.isTrue(sharding.hasShardId(secondShard))

        yield* TestClock.adjust(1000)

        assert.isFalse(sharding.hasShardId(firstShard))
        assert.isTrue(sharding.hasShardId(secondShard))
        assert.deepStrictEqual(storageState.releaseCalls, [firstShard])
      }).pipe(Effect.provide(layer))
    }))

  it.effect("refreshes a newly acquired shard when retrying a failed lock refresh", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState()
      const acquireStarted = yield* Deferred.make<void>()
      const refreshFailed = yield* Deferred.make<void>()
      const retryShards = yield* Deferred.make<Array<ShardId.ShardId>>()
      const runnerStorage = Layer.effect(
        RunnerStorage.RunnerStorage,
        Effect.map(Clock.Clock, (clock) => {
          const storage = makeFailoverStorage(storageState, clock)
          return RunnerStorage.RunnerStorage.of({
            ...storage,
            acquire: Effect.fnUntraced(function*(address, shardIds) {
              yield* Deferred.succeed(acquireStarted, void 0)
              yield* Deferred.await(refreshFailed)
              return yield* storage.acquire(address, shardIds)
            }),
            refresh: Effect.fnUntraced(function*(address, shardIds) {
              const shards = globalThis.Array.from(shardIds)
              if (yield* Deferred.isDone(refreshFailed)) {
                yield* Deferred.succeed(retryShards, shards)
              } else if (yield* Deferred.isDone(acquireStarted)) {
                assert.deepStrictEqual(shards, [])
                yield* Deferred.succeed(refreshFailed, void 0)
                return yield* Effect.fail(new ClusterError.PersistenceError({ cause: "refresh failed" }))
              }
              return yield* storage.refresh(address, shards)
            })
          })
        })
      )
      const layer = Sharding.layer.pipe(
        Layer.provide(runnerStorage),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(Runners.layerNoop),
        Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
        Layer.provide(ShardingConfig.layer({
          runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
          shardsPerGroup: 1,
          shardLockExpiration: 30_000,
          shardLockRefreshInterval: 1000,
          entityTerminationTimeout: 0,
          refreshAssignmentsInterval: 10
        }))
      )

      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const shardId = ShardId.make("default", 1)

        yield* TestClock.adjust(1000)
        assert.isTrue(yield* Deferred.isDone(refreshFailed))
        assert.isTrue(sharding.hasShardId(shardId))
        assert.isFalse(yield* Deferred.isDone(retryShards))

        yield* TestClock.adjust(50)

        assert.isTrue(yield* Deferred.isDone(retryShards))
        assert.deepStrictEqual(yield* Deferred.await(retryShards), [shardId])
        assert.isTrue(sharding.hasShardId(shardId))
        assert.deepStrictEqual(storageState.releaseCalls, [])
      }).pipe(Effect.provide(layer))
    }))

  it.effect("reacquires shards when the liveness probe succeeds while lock refresh is hung", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState()
      const runnerStorage = Layer.effect(
        RunnerStorage.RunnerStorage,
        Effect.map(Clock.Clock, (clock) => makeFailoverStorage(storageState, clock))
      )
      const config = ShardingConfig.layer({
        runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
        shardsPerGroup: 1,
        shardLockExpiration: 300,
        shardLockRefreshInterval: 1000,
        entityTerminationTimeout: 30_000,
        entityMessagePollInterval: 10,
        refreshAssignmentsInterval: 10,
        sendRetryInterval: 10
      })
      const layer = TestEntityNoState.pipe(
        Layer.provideMerge(Sharding.layer),
        Layer.provide(runnerStorage),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provideMerge(TestEntityState.layer),
        Layer.provide(Runners.layerNoop),
        Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
        Layer.provide(config)
      )

      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")
        const shardId = sharding.getShardId(EntityId.make("1"), "default")

        while (!sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }
        while (!storageState.refreshCalls.some((call) => call.shards.length > 0)) {
          yield* TestClock.adjust(100)
        }

        const acquireCount = storageState.acquireCalls.length
        storageState.blackholeNonEmptyRefresh = true
        yield* TestClock.adjust(201)
        assert.isFalse(sharding.hasShardId(shardId))

        // recovery only needs the empty liveness probe to succeed
        while (!sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }

        assert.isAbove(storageState.acquireCalls.length, acquireCount)
        assert(storageState.refreshCalls.some((call) => call.shards.length === 0))
        assert.deepStrictEqual(yield* client.GetUserVolatile({ id: 3 }), new User({ id: 3, name: "User 3" }))
      }).pipe(Effect.provide(layer), Effect.scoped)
    }))

  it.effect("keeps the graceful timeout for normal shard reassignment", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState()
      const unregisterInterrupts: Array<boolean> = []
      const runnerStorage = Layer.effect(
        RunnerStorage.RunnerStorage,
        Effect.map(Clock.Clock, (clock) => makeFailoverStorage(storageState, clock))
      )
      const shardingLayer = Sharding.layer.pipe(
        Layer.updateService(MessageStorage.MessageStorage, (storage) => ({
          ...storage,
          unregisterShardReplyHandlers: (shardId, options) =>
            Effect.sync(() => unregisterInterrupts.push(options?.interrupt ?? false)).pipe(
              Effect.andThen(storage.unregisterShardReplyHandlers(shardId, options))
            )
        }))
      )
      const config = ShardingConfig.layer({
        runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
        shardsPerGroup: 1,
        shardLockExpiration: 3000,
        shardLockRefreshInterval: 100,
        entityTerminationTimeout: 1000,
        entityMessagePollInterval: 10,
        refreshAssignmentsInterval: 10,
        sendRetryInterval: 10
      })
      const layer = TestEntityNoState.pipe(
        Layer.provideMerge(shardingLayer),
        Layer.provide(runnerStorage),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provideMerge(TestEntityState.layer),
        Layer.provide(Runners.layerNoop),
        Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
        Layer.provide(config)
      )

      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")
        const shardId = sharding.getShardId(EntityId.make("1"), "default")

        while (!sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }
        const entityFiber = yield* client.NeverVolatile().pipe(
          Effect.forkChild({ startImmediately: true })
        )
        yield* TestClock.adjust(1)

        storageState.assignSelf = false
        while (sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }
        while ((yield* sharding.activeEntityCount) > 0) {
          yield* TestClock.adjust(1)
        }

        assert.isUndefined(entityFiber.pollUnsafe())
        assert.strictEqual(storageState.releaseCalls.length, 0)
        yield* TestClock.adjust(900)
        assert.isUndefined(entityFiber.pollUnsafe())
        assert.strictEqual(storageState.releaseCalls.length, 0)

        for (let i = 0; i < 20 && entityFiber.pollUnsafe() === undefined; i++) {
          yield* TestClock.adjust(10)
        }
        const entityExit = entityFiber.pollUnsafe()
        assert(entityExit && Exit.hasInterrupts(entityExit))
        assert.strictEqual(storageState.releaseCalls.length, 1)
        assert.deepStrictEqual(unregisterInterrupts, [false])
      }).pipe(Effect.provide(layer), Effect.scoped)
    }))

  it.effect("does not wait for entity construction before a forced shard release", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState()
      const runnerStorage = Layer.effect(
        RunnerStorage.RunnerStorage,
        Effect.map(Clock.Clock, (clock) => makeFailoverStorage(storageState, clock))
      )
      const config = ShardingConfig.layer({
        runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
        shardsPerGroup: 1,
        shardLockExpiration: 300,
        shardLockRefreshInterval: 1000,
        entityTerminationTimeout: 0,
        entityMessagePollInterval: 10,
        refreshAssignmentsInterval: 10,
        sendRetryInterval: 10
      })
      const layer = TestEntityNoState.pipe(
        Layer.provideMerge(Sharding.layer),
        Layer.provide(runnerStorage),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provideMerge(TestEntityState.layer),
        Layer.provide(Runners.layerNoop),
        Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
        Layer.provide(config)
      )

      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const entityState = yield* TestEntityState
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")
        const shardId = sharding.getShardId(EntityId.make("1"), "default")

        while (!sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }
        while (!storageState.refreshCalls.some((call) => call.shards.length > 0)) {
          yield* TestClock.adjust(100)
        }

        yield* Effect.gen(function*() {
          entityState.buildLatch.closeUnsafe()
          const entityFiber = yield* client.GetUserVolatile({ id: 1 }).pipe(
            Effect.forkChild({ startImmediately: true })
          )
          while (entityState.layerBuilds.current === 0) {
            yield* TestClock.adjust(1)
          }

          storageState.blackholed = true
          yield* TestClock.adjust(201)
          assert.isFalse(sharding.hasShardId(shardId))

          storageState.blackholed = false
          yield* TestClock.adjust(1000)

          assert.strictEqual(storageState.releaseAllCalls.length, 1)
          entityState.buildLatch.openUnsafe()
          yield* TestClock.adjust(1)
          yield* Fiber.interrupt(entityFiber)
        }).pipe(Effect.ensuring(entityState.buildLatch.open))
      }).pipe(
        Effect.provide(layer),
        Effect.scoped
      )
    }))

  it.effect("does not register an entity built after shard release", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState()
      const runnerStorage = Layer.effect(
        RunnerStorage.RunnerStorage,
        Effect.map(Clock.Clock, (clock) => makeFailoverStorage(storageState, clock))
      )
      const config = ShardingConfig.layer({
        runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
        shardsPerGroup: 1,
        shardLockExpiration: 3000,
        shardLockRefreshInterval: 100,
        entityTerminationTimeout: 0,
        entityMessagePollInterval: 10,
        refreshAssignmentsInterval: 10,
        sendRetryInterval: 10
      })
      const layer = TestEntityNoState.pipe(
        Layer.provideMerge(Sharding.layer),
        Layer.provide(runnerStorage),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provideMerge(TestEntityState.layer),
        Layer.provide(Runners.layerNoop),
        Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
        Layer.provide(config)
      )

      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const entityState = yield* TestEntityState
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")
        const shardId = sharding.getShardId(EntityId.make("1"), "default")

        while (!sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }

        yield* Effect.gen(function*() {
          entityState.buildLatch.closeUnsafe()
          const entityFiber = yield* client.GetUserVolatile({ id: 1 }).pipe(
            Effect.forkChild({ startImmediately: true })
          )
          while (entityState.layerBuilds.current === 0) {
            yield* TestClock.adjust(1)
          }

          storageState.assignSelf = false
          while (storageState.releaseCalls.length === 0) {
            yield* TestClock.adjust(10)
          }
          assert.isFalse(sharding.hasShardId(shardId))

          entityState.buildLatch.openUnsafe()
          yield* TestClock.adjust(10)

          assert.strictEqual(yield* sharding.activeEntityCount, 0)
          assert.strictEqual(Queue.sizeUnsafe(entityState.envelopes), 0)
          assert.isUndefined(entityFiber.pollUnsafe())
        }).pipe(Effect.ensuring(entityState.buildLatch.open))
      }).pipe(
        Effect.provide(layer),
        Effect.scoped
      )
    }))

  it.effect("does not acquire shards while a forced release is pending", () =>
    Effect.gen(function*() {
      const shardsPerGroup = 4
      const storageState = makeFailoverStorageState({
        otherRunnerHealthy: true,
        releaseAllDuration: 500
      })
      const runnerStorage = Layer.effect(
        RunnerStorage.RunnerStorage,
        Effect.map(Clock.Clock, (clock) => makeFailoverStorage(storageState, clock))
      )
      const config = ShardingConfig.layer({
        runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
        shardsPerGroup,
        shardLockExpiration: 300,
        shardLockRefreshInterval: 1000,
        entityTerminationTimeout: 0,
        entityMessagePollInterval: 10,
        refreshAssignmentsInterval: 10,
        sendRetryInterval: 10
      })
      const layer = TestEntityNoState.pipe(
        Layer.provideMerge(Sharding.layer),
        Layer.provide(runnerStorage),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provideMerge(TestEntityState.layer),
        Layer.provide(Runners.layerNoop),
        Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
        Layer.provide(config)
      )

      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const allShards = Array.makeBy(shardsPerGroup, (i) => ShardId.make("default", i + 1))
        const ownedCount = () => allShards.filter((shardId) => sharding.hasShardId(shardId)).length

        // the other runner holds part of the ring, so this runner starts with a
        // strict subset of the shards
        while (ownedCount() === 0) {
          yield* TestClock.adjust(10)
        }
        assert.isBelow(ownedCount(), shardsPerGroup)
        while (!storageState.refreshCalls.some((call) => call.shards.length > 0)) {
          yield* TestClock.adjust(100)
        }

        const acquiresBeforeOutage = storageState.acquireCalls.length
        storageState.blackholed = true
        yield* TestClock.adjust(201)
        assert.strictEqual(ownedCount(), 0)

        // the other runner's shards are reassigned to this runner during the
        // outage, so they are not part of the forced release set
        storageState.otherRunnerHealthy = false
        yield* TestClock.adjust(100)
        assert.strictEqual(storageState.releaseAllCalls.length, 0)

        // recovery runs the forced release, which stays in flight for
        // `releaseAllDuration`
        storageState.blackholed = false
        while (storageState.releaseAllCalls.length === 0) {
          yield* TestClock.adjust(10)
        }
        while (!storageState.releaseAllCalls[0].completed) {
          yield* TestClock.adjust(10)
        }
        // keep shutdown from blocking on the finalizer release
        storageState.releaseAllDuration = 0

        while (ownedCount() < shardsPerGroup) {
          yield* TestClock.adjust(10)
        }

        // `releaseAll` drops every lock held by this runner, so nothing may be
        // acquired before it has completed
        assert.strictEqual(storageState.releaseAllCalls.length, 1)
        assert(
          storageState.acquireCalls
            .slice(acquiresBeforeOutage)
            .every((call) => call.completedReleaseAlls > 0)
        )
      }).pipe(Effect.provide(layer), Effect.scoped)
    }))
})

interface FailoverStorageState {
  blackholed: boolean
  /** Hang only non-empty refreshes, so the empty liveness probe can succeed. */
  blackholeNonEmptyRefresh: boolean
  assignSelf: boolean
  otherRunnerHealthy: boolean
  /** Test clock duration `releaseAll` stays in flight for. */
  releaseAllDuration: number
  runner: Runner.Runner | undefined
  readonly acquireCalls: Array<{
    readonly shards: Array<ShardId.ShardId>
    readonly completedReleaseAlls: number
  }>
  readonly refreshCalls: Array<{
    readonly at: number
    readonly shards: Array<ShardId.ShardId>
  }>
  readonly releaseCalls: Array<ShardId.ShardId>
  readonly releaseAllCalls: Array<{ completed: boolean }>
}

const makeFailoverStorageState = (
  overrides?: Partial<FailoverStorageState>
): FailoverStorageState => ({
  blackholed: false,
  blackholeNonEmptyRefresh: false,
  assignSelf: true,
  otherRunnerHealthy: false,
  releaseAllDuration: 0,
  runner: undefined,
  acquireCalls: [],
  refreshCalls: [],
  releaseCalls: [],
  releaseAllCalls: [],
  ...overrides
})

const makeFailoverStorage = (state: FailoverStorageState, clock: Clock.Clock) =>
  RunnerStorage.RunnerStorage.of({
    getRunners: Effect.sync(() => {
      if (!state.runner) return []
      if (!state.assignSelf) return [[state.runner, false], [otherRunner, true]]
      return state.otherRunnerHealthy ? [[state.runner, true], [otherRunner, true]] : [[state.runner, true]]
    }),
    register: (runner) =>
      Effect.sync(() => {
        state.runner = runner
        return MachineId.make(1)
      }),
    unregister: () => Effect.void,
    setRunnerHealth: () => Effect.void,
    acquire: (_address, shardIds) =>
      Effect.sync(() => {
        const shards = globalThis.Array.from(shardIds)
        state.acquireCalls.push({
          shards,
          completedReleaseAlls: state.releaseAllCalls.filter((call) => call.completed).length
        })
        return shards
      }),
    refresh: (_address, shardIds) =>
      Effect.suspend(() => {
        const shards = globalThis.Array.from(shardIds)
        state.refreshCalls.push({
          at: clock.currentTimeMillisUnsafe(),
          shards
        })
        return (state.blackholed || (state.blackholeNonEmptyRefresh && shards.length > 0))
          ? Effect.never
          : Effect.succeed(shards)
      }),
    release: (_address, shardId) =>
      Effect.sync(() => {
        state.releaseCalls.push(shardId)
      }),
    releaseAll: () =>
      Effect.suspend(() => {
        const call = { completed: false }
        state.releaseAllCalls.push(call)
        return Effect.andThen(
          Effect.sleep(state.releaseAllDuration),
          Effect.sync(() => {
            call.completed = true
          })
        )
      })
  })

const otherRunner = Runner.make({
  address: RunnerAddress.make("localhost", 5678),
  groups: ["default"],
  weight: 1
})

class RegistrationContext extends Context.Service<RegistrationContext, string>()(
  "effect/test/cluster/RegistrationContext"
) {}

const RegistrationContextEntity = Entity.make("RegistrationContextEntity", [
  Rpc.make("Read", { success: Schema.String }).annotate(ClusterSchema.Persisted, false)
])

const MissingRegistrationEntity = Entity.make("MissingRegistrationEntity", [
  Rpc.make("Call").annotate(ClusterSchema.Persisted, false)
])

const FirstRegistrationEntity = Entity.make("FirstRegistrationEntity", [
  Rpc.make("Call").annotate(ClusterSchema.Persisted, false)
])

const RegistrationContextHandlers = Effect.map(
  RegistrationContext,
  (value) => RegistrationContextEntity.of({ Read: () => Effect.succeed(value) })
)

const testConfigDefaults: Partial<ShardingConfig.ShardingConfig["Service"]> = {
  entityMailboxCapacity: 10,
  entityTerminationTimeout: 0,
  entityMessagePollInterval: 5000,
  sendRetryInterval: 100,
  refreshAssignmentsInterval: 0
}

const TestShardingConfig = ShardingConfig.layer(testConfigDefaults)

const TestShardingWithoutRunnerStorage = TestEntityNoState.pipe(
  Layer.provideMerge(Sharding.layer),
  Layer.provide(RunnerHealth.layerNoop)
  // Layer.provide(Logger.minimumLogLevel(LogLevel.All)),
  // Layer.provideMerge(Logger.pretty)
)

const TestShardingWithoutState = TestShardingWithoutRunnerStorage.pipe(
  Layer.provide(RunnerStorage.layerMemory)
)

const TestShardingWithoutRunners = TestShardingWithoutState.pipe(
  Layer.provideMerge(TestEntityState.layer)
)

const TestShardingWithoutStorage = TestShardingWithoutRunners.pipe(
  Layer.provide(Runners.layerNoop),
  Layer.provide(TestShardingConfig)
)

const TestSharding = TestShardingWithoutStorage.pipe(
  Layer.provideMerge(MessageStorage.layerMemory),
  Layer.provide(TestShardingConfig)
)

const CappedSharding = (
  config: Partial<ShardingConfig.ShardingConfig["Service"]>,
  transformStorage?: (
    storage: MessageStorage.MessageStorage["Service"]
  ) => MessageStorage.MessageStorage["Service"]
) => {
  const configLayer = ShardingConfig.layer({ ...testConfigDefaults, ...config })
  let layer = TestShardingWithoutRunners.pipe(
    Layer.provide(Runners.layerNoop),
    Layer.provide(configLayer)
  )
  if (transformStorage) {
    layer = layer.pipe(Layer.updateService(MessageStorage.MessageStorage, transformStorage))
  }
  return layer.pipe(
    Layer.provideMerge(MessageStorage.layerMemory),
    Layer.provide(configLayer)
  )
}

const UnregisteredSharding = (
  config: Partial<ShardingConfig.ShardingConfig["Service"]>
) => {
  const configLayer = ShardingConfig.layer({ ...testConfigDefaults, ...config })
  return Sharding.layer.pipe(
    Layer.provide(RunnerStorage.layerMemory),
    Layer.provide(RunnerHealth.layerNoop),
    Layer.provide(Runners.layerNoop),
    Layer.provideMerge(MessageStorage.layerMemory),
    Layer.provide(configLayer)
  )
}

// The directly driven EntityManager waits up to 1000ms for its entities to end.
const BlockedRebuildSharding = Layer.mergeAll(
  EntityReaper.layer,
  Snowflake.layerGenerator,
  ShardingConfig.layer({ ...testConfigDefaults, entityTerminationTimeout: 1000 })
).pipe(Layer.provideMerge(UnregisteredSharding({})))

const ContextBleedSharding = ContextBleedLayer.pipe(Layer.provideMerge(TestSharding))

const ActiveTeardownSharding = (
  config?: Partial<ShardingConfig.ShardingConfig["Service"]>
) =>
  ActiveTeardownCallerLayer.pipe(
    Layer.merge(TestEntityNoState),
    Layer.provideMerge(Sharding.layer),
    Layer.provide(RunnerStorage.layerMemory),
    Layer.provide(RunnerHealth.layerNoop),
    Layer.provideMerge(TestEntityState.layer),
    Layer.provide(Runners.layerNoop),
    Layer.provideMerge(MessageStorage.layerMemory),
    Layer.provide(ShardingConfig.layer({ ...testConfigDefaults, ...config }))
  )

const ReapStormSharding = ReapStormEntityLayer.pipe(
  Layer.provideMerge(Sharding.layer),
  Layer.provide(RunnerStorage.layerMemory),
  Layer.provide(RunnerHealth.layerNoop),
  Layer.provide(Runners.layerNoop),
  Layer.provideMerge(MessageStorage.layerMemory),
  Layer.provide(ShardingConfig.layer({
    ...testConfigDefaults,
    entityMaxIdleTime: 1,
    entityTerminationTimeout: 0
  }))
)

// saves a persisted GetUser request directly to storage, bypassing the client,
// so the storage read loop only learns about it from the next poll
const saveGetUserRequest = Effect.fnUntraced(function*(entityId: string, id: number) {
  const storage = yield* MessageStorage.MessageStorage
  const sharding = yield* Sharding.Sharding
  const rpc = TestEntity.protocol.requests.get("GetUser")! as any
  const entity = EntityId.make(entityId)
  yield* storage.saveRequest(
    new Message.OutgoingRequest({
      envelope: Envelope.makeRequest<any>({
        requestId: yield* sharding.getSnowflake,
        address: EntityAddress.make({
          shardId: sharding.getShardId(entity, "default"),
          entityType: EntityType.make(TestEntity.type),
          entityId: entity
        }),
        tag: "GetUser",
        payload: { id },
        headers: Headers.empty
      }),
      annotations: rpc.annotations,
      context: Context.empty() as any,
      rpc,
      lastReceivedReply: Option.none(),
      respond: () => Effect.void
    })
  )
})

interface SingletonStorageState {
  assignSelf: boolean
  runner: Runner.Runner | undefined
}

const makeSingletonStorageState = (): SingletonStorageState => ({ assignSelf: true, runner: undefined })

const singletonOtherRunner = Runner.make({
  address: RunnerAddress.make("localhost", 5678),
  groups: ["singleton"],
  // With these fixed addresses, the weighted ring moves singleton:1 to this
  // runner. The ownership assertions below guard that fixture assumption.
  weight: 1000
})

// Keep the destination shard local while only the singleton shard moves away.
const SingletonReassignmentSharding = (state: SingletonStorageState) => {
  const runnerStorage = Layer.effect(
    RunnerStorage.RunnerStorage,
    Effect.succeed(RunnerStorage.RunnerStorage.of({
      getRunners: Effect.sync(() => {
        if (!state.runner) return []
        if (state.assignSelf) return [[state.runner, true]] as const
        return [
          [state.runner, true],
          [singletonOtherRunner, true]
        ] as const
      }),
      register: (runner) =>
        Effect.sync(() => {
          state.runner = runner
          return MachineId.make(1)
        }),
      unregister: () => Effect.void,
      setRunnerHealth: () => Effect.void,
      acquire: (_address, shards) => Effect.succeed(globalThis.Array.from(shards)),
      refresh: (_address, shards) => Effect.succeed(globalThis.Array.from(shards)),
      release: () => Effect.void,
      releaseAll: () => Effect.void
    }))
  )
  return TestShardingWithoutRunnerStorage.pipe(
    Layer.provide(runnerStorage),
    Layer.provideMerge(TestEntityState.layer),
    Layer.provide(Runners.layerNoop),
    Layer.provideMerge(MessageStorage.layerMemory),
    Layer.provide(ShardingConfig.layer({
      ...testConfigDefaults,
      runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
      availableShardGroups: ["default", "singleton"],
      assignedShardGroups: ["default", "singleton"],
      shardsPerGroup: 1,
      entityTerminationTimeout: 0,
      entityMessagePollInterval: 10,
      refreshAssignmentsInterval: 10,
      sendRetryInterval: 10
    }))
  )
}

const singletonShard = ShardId.make("singleton", 1)
const destinationShard = ShardId.make("default", 1)

const waitForSingletonOwnership = Effect.fnUntraced(function*(
  sharding: Sharding.Sharding["Service"],
  owned: boolean
) {
  for (let i = 0; i < 100; i++) {
    if (sharding.hasShardId(singletonShard) === owned) return
    yield* TestClock.adjust(10)
  }
  assert.strictEqual(sharding.hasShardId(singletonShard), owned)
})

// These tests share the internal teardown registry, so do not run concurrently.
describe("Sharding singleton cancellation", { concurrent: false }, () => {
  it.effect("cancels explicitly but abandons a singleton child RPC on reassignment", () =>
    Effect.gen(function*() {
      const storageState = makeSingletonStorageState()
      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const driver = yield* MessageStorage.MemoryDriver
        const state = yield* TestEntityState
        // Acquire clients outside the singleton context; children must use caller identity.
        const makeClient = yield* TestEntity.client
        const explicitClient = makeClient("explicit-singleton-target")
        const reassignmentClient = makeClient("singleton-target")
        const childReady = yield* Deferred.make<Fiber.Fiber<void, unknown>>()
        const runReassignment = yield* Deferred.make<void>()
        const stopped = yield* Deferred.make<void>()
        yield* waitForSingletonOwnership(sharding, true)
        yield* sharding.registerSingleton(
          "rpc-caller",
          Effect.gen(function*() {
            const child = yield* explicitClient.Never().pipe(Effect.forkChild({ startImmediately: true }))
            yield* Deferred.succeed(childReady, child)
            yield* Deferred.await(runReassignment)
            yield* reassignmentClient.Never().pipe(Effect.forkChild({ startImmediately: true }))
            return yield* Effect.never
          }).pipe(Effect.ensuring(Deferred.succeed(stopped, void 0))),
          { shardGroup: "singleton" }
        )
        yield* Queue.take(state.envelopes)
        yield* Fiber.interrupt(yield* Deferred.await(childReady))
        yield* TestClock.adjust(1)
        assert.isTrue(sharding.hasShardId(singletonShard))
        assert.strictEqual(journalInterrupts(driver), 1, "explicit child cancellation must persist")
        yield* Queue.take(state.interrupts)

        yield* Deferred.succeed(runReassignment, void 0)
        yield* Queue.take(state.envelopes)
        storageState.assignSelf = false
        yield* waitForSingletonOwnership(sharding, false)
        yield* Deferred.await(stopped)
        yield* TestClock.adjust(1)
        assert.isTrue(sharding.hasShardId(destinationShard), "Sharding and the destination stay alive")
        assert.strictEqual(journalInterrupts(driver), 1, "reassignment must not add a durable cancellation")
        assert.strictEqual(Queue.sizeUnsafe(state.interrupts), 0)
      }).pipe(Effect.provide(SingletonReassignmentSharding(storageState)), Effect.scoped)
    }))

  it.effect("bounds singleton teardown to interruption finalization, not inherited context", () =>
    Effect.gen(function*() {
      const storageState = makeSingletonStorageState()
      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const driver = yield* MessageStorage.MemoryDriver
        const state = yield* TestEntityState
        const client = (yield* TestEntity.client)("finalizer-target")
        // Both clients are acquired before singleton execution. Keep the survivor
        // on a separate local entity so the preserved finalizer RPC cannot block it.
        const survivorClient = (yield* TestEntity.client)("survivor-target")
        const outerScope = yield* Effect.scope
        const runLater = yield* Deferred.make<void>()
        const survivorReady = yield* Deferred.make<Fiber.Fiber<void, unknown>>()
        const finalizing = yield* Deferred.make<void>()
        const finish = yield* Deferred.make<void>()
        const stopped = yield* Deferred.make<void>()
        yield* waitForSingletonOwnership(sharding, true)
        yield* sharding.registerSingleton(
          "finalizer-caller",
          Effect.gen(function*() {
            // This fiber inherits singleton identity but outlives its local run.
            const survivor = yield* Deferred.await(runLater).pipe(
              Effect.andThen(survivorClient.Never()),
              Effect.forkIn(outerScope, { startImmediately: true })
            )
            yield* Deferred.succeed(survivorReady, survivor)
            return yield* Effect.never
          }).pipe(
            Effect.ensuring(Effect.gen(function*() {
              // Cancellation during finalization is still shard teardown.
              const child = yield* client.Never().pipe(
                Effect.interruptible,
                Effect.forkChild({ startImmediately: true })
              )
              yield* Queue.take(state.envelopes)
              yield* Fiber.interrupt(child)
              yield* Deferred.succeed(finalizing, void 0)
              yield* Deferred.await(finish)
            })),
            Effect.ensuring(Deferred.succeed(stopped, void 0))
          ),
          { shardGroup: "singleton" }
        )
        const survivor = yield* Deferred.await(survivorReady)
        // Release the finalizer barrier even if a setup assertion fails.
        yield* Effect.addFinalizer(() => Deferred.succeed(finish, void 0))
        storageState.assignSelf = false
        yield* waitForSingletonOwnership(sharding, false)
        yield* Deferred.await(finalizing)
        const duringFinalization = journalInterrupts(driver)
        const probe = EntityAddress.make({
          shardId: singletonShard,
          entityType: EntityType.make("singleton-teardown-probe"),
          entityId: EntityId.make("probe")
        })
        assert.isTrue(ActiveTeardown.isActive(probe), "tracking must remain active through finalization")
        yield* Deferred.succeed(finish, void 0)
        yield* Deferred.await(stopped)
        yield* TestClock.adjust(10)
        assert.isFalse(ActiveTeardown.isActive(probe), "teardown must release its shard tracking")

        // Do not let inherited identity suppress a later explicit cancellation.
        yield* Deferred.succeed(runLater, void 0)
        yield* Queue.take(state.envelopes)
        yield* Fiber.interrupt(survivor)
        yield* TestClock.adjust(1)
        assert.strictEqual(journalInterrupts(driver) - duringFinalization, 1)
        assert.isTrue(sharding.hasShardId(destinationShard))
        assert.strictEqual(duringFinalization, 0, "teardown must include singleton finalizers")
      }).pipe(Effect.provide(SingletonReassignmentSharding(storageState)), Effect.scoped)
    }))
})
