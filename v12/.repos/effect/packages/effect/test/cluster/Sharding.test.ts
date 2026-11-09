import { assert, describe, expect, it } from "@effect/vitest"
import {
  Array,
  Cause,
  Clock,
  Context,
  Deferred,
  Effect,
  Equal,
  Exit,
  Fiber,
  Latch,
  Layer,
  Logger,
  Metric,
  MutableRef,
  Option,
  Queue,
  Ref,
  Result,
  Schedule,
  Scheduler,
  Schema,
  Scope,
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
import { Rpc, type RpcGroup, type RpcSerialization } from "effect/rpc"
import { TestClock } from "effect/testing"
import {
  BoomError,
  CallerId,
  ContextBleedEntity,
  ContextBleedLayer,
  TestEntity,
  TestEntityNoState,
  TestEntityState,
  User
} from "./TestEntity.ts"

describe("Sharding startup", () => {
  it.effect("initializes singleton synchronization before startup fibers run", () =>
    Effect.gen(function*() {
      const causes: Array<string> = []
      const logger = Logger.make(({ cause }) => {
        if (cause.reasons.length > 0) causes.push(Cause.pretty(cause))
      })
      const layer = Sharding.layer.pipe(
        Layer.provide(RunnerStorage.layerMemory),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(Runners.layerNoop),
        Layer.provide(MessageStorage.layerMemory),
        Layer.provide(ShardingConfig.layer({
          runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
          shardsPerGroup: 1
        }))
      )
      const scheduler = new Scheduler.MixedScheduler()
      const scope = yield* Scope.make()
      yield* Effect.withFiber((startupFiber) =>
        Layer.buildWithScope(layer, scope).pipe(
          Effect.provide(Logger.layer([logger])),
          // Let startup fibers run to their first suspension whenever construction yields.
          Effect.provideService(Scheduler.Scheduler, {
            executionMode: scheduler.executionMode,
            makeDispatcher: () => scheduler.makeDispatcher(),
            shouldYield: (fiber) => fiber === startupFiber && fiber.currentOpCount >= 4
          })
        )
      )
      const closing = yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild)
      // Drain the retry/handoff delay too, so a regression fails without leaking a scope.
      yield* TestClock.adjust(10_000)
      yield* Fiber.join(closing)
      assert.deepStrictEqual(causes, [])
    }))
})

// Isolate the long-lived stream from concurrent shard-metric tests.
// Use a nonzero assignment refresh interval when advancing through claim expiry
// so the runner-storage sync loop does not busy-poll between clock ticks.
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
      ).pipe(Layer.provideMerge(CappedSharding({ refreshAssignmentsInterval: 60_000 }, (storage) => ({
        ...storage,
        resetRequests: Effect.fnUntraced(function*(ids) {
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
        Run: Effect.fnUntraced(function*() {
          starts++
          active++
          yield* Queue.offer(started, starts)
          return yield* Effect.never
        }, Effect.ensuring(Effect.sync(() => active--)))
      }).pipe(Layer.provideMerge(CappedSharding({ refreshAssignmentsInterval: 60_000 }, (storage) => ({
        ...storage,
        resetRequests: Effect.fnUntraced(function*(ids) {
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
      }).pipe(Effect.provide(CappedSharding({ refreshAssignmentsInterval: 60_000 }, (storage) => ({
        ...storage,
        saveEnvelope: (message) =>
          storage.saveEnvelope(message).pipe(
            Effect.tap(() => message.envelope._tag === "AckChunk" ? Deferred.succeed(acked, void 0) : Effect.void)
          ),
        resetRequests: Effect.fnUntraced(function*(ids) {
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
        resetAddresses: Effect.fnUntraced(function*(addresses) {
          cappedReleases.push(...addresses)
          yield* storage.resetAddresses(addresses)
        }),
        unprocessedMessages: Effect.fnUntraced(function*(shards, options) {
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

  // Keep the ten-minute clock advance out of the concurrent Sharding batch.
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
      }).pipe(Effect.provide(CappedSharding({ refreshAssignmentsInterval: 60_000 }, (storage) => ({
        ...storage,
        unprocessedMessages: Effect.fnUntraced(function*(shardIds, options) {
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
})

describe.concurrent("Sharding", () => {
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
            resetRequests: Effect.fnUntraced(function*(ids) {
              released.push(...ids)
              yield* storage.resetRequests(ids)
            }),
            unprocessedMessages: Effect.fnUntraced(function*(shards, options) {
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
                    respond: Effect.fnUntraced(function*(reply) {
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

  it.effect("reports entity mailbox sizes until entities are released", () => {
    const registry: Metric.MetricRegistry = new Map()
    const mailboxSizes = () =>
      Metric.snapshotUnsafe(Context.make(Metric.MetricRegistry, registry))
        .filter((metric) => metric.id === ClusterMetrics.entityMailboxSize.id)
        .map((metric) => [metric.attributes, metric.state])
        .sort((a, b) => JSON.stringify(a[0]) < JSON.stringify(b[0]) ? -1 : 1)
    return Effect.gen(function*() {
      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const makeClient = yield* TestEntity.client
        yield* TestClock.adjust(1)
        const first = yield* makeClient("1").NeverVolatile().pipe(Effect.forkChild, Effect.replicateEffect(2))
        yield* makeClient("2").NeverVolatile().pipe(Effect.forkChild)
        yield* TestClock.adjust(1)

        const shard = (id: string) => sharding.getShardId(EntityId.make(id), "default").toString()
        assert.deepStrictEqual(mailboxSizes(), [
          [{ type: "TestEntity", id: "1", shard: shard("1") }, { value: BigInt(2) }],
          [{ type: "TestEntity", id: "2", shard: shard("2") }, { value: BigInt(1) }]
        ])

        yield* Fiber.interruptAll(first)
        yield* waitForIdleReap(sharding, 1)
        assert.deepStrictEqual(mailboxSizes(), [
          [{ type: "TestEntity", id: "2", shard: shard("2") }, { value: BigInt(1) }]
        ])
      }).pipe(Effect.provide(CappedSharding({ entityMailboxMetrics: true, entityMaxIdleTime: 1 })))

      // Shutting down releases every shard, tearing down the remaining entity
      assert.deepStrictEqual(mailboxSizes(), [])
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry))
  })

  it.effect("creates no entity mailbox series by default", () => {
    const registry: Metric.MetricRegistry = new Map()
    return Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const makeClient = yield* TestEntity.client
      yield* TestClock.adjust(1)
      yield* makeClient("1").NeverVolatile().pipe(Effect.forkChild)
      yield* TestClock.adjust(1)

      assert.strictEqual(yield* sharding.activeEntityCount, 1)
      const snapshots = Metric.snapshotUnsafe(Context.make(Metric.MetricRegistry, registry))
      assert.isFalse(snapshots.some((metric) => metric.id === ClusterMetrics.entityMailboxSize.id))
    }).pipe(Effect.provide(TestSharding), Effect.provideService(Metric.MetricRegistry, registry))
  })

  it.effect("reports the active entity count on snapshot until the entity manager closes", () => {
    const registry: Metric.MetricRegistry = new Map()
    const entityCounts = () =>
      Metric.snapshotUnsafe(Context.make(Metric.MetricRegistry, registry))
        .filter((metric) => metric.id === ClusterMetrics.entities.id && metric.attributes?.type === "TestEntity")
        .map((metric) => metric.state)
    return Effect.gen(function*() {
      yield* Effect.gen(function*() {
        const makeClient = yield* TestEntity.client
        yield* TestClock.adjust(1)
        yield* makeClient("1").NeverVolatile().pipe(Effect.forkChild)
        yield* TestClock.adjust(1)
        assert.deepStrictEqual(entityCounts(), [{ value: BigInt(1) }])

        // Well within a second, so the count cannot come from a periodic update
        yield* makeClient("2").NeverVolatile().pipe(Effect.forkChild)
        yield* TestClock.adjust(1)
        assert.deepStrictEqual(entityCounts(), [{ value: BigInt(2) }])
      }).pipe(Effect.provide(TestSharding))

      assert.deepStrictEqual(entityCounts(), [])
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry))
  })

  it.effect("reports the largest entity mailbox size per type by default", () => {
    const registry: Metric.MetricRegistry = new Map()
    const mailboxSizeMax = () =>
      Metric.snapshotUnsafe(Context.make(Metric.MetricRegistry, registry))
        .filter((metric) => metric.id === ClusterMetrics.entityMailboxSizeMax.id)
        .map((metric) => [metric.attributes, metric.state])
    return Effect.gen(function*() {
      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const makeClient = yield* TestEntity.client
        yield* TestClock.adjust(1)
        const first = yield* makeClient("1").NeverVolatile().pipe(Effect.forkChild, Effect.replicateEffect(2))
        yield* makeClient("2").NeverVolatile().pipe(Effect.forkChild)
        yield* TestClock.adjust(1)
        assert.deepStrictEqual(mailboxSizeMax(), [[{ type: "TestEntity" }, { value: BigInt(2) }]])

        yield* Fiber.interruptAll(first)
        yield* waitForIdleReap(sharding, 1)
        assert.deepStrictEqual(mailboxSizeMax(), [[{ type: "TestEntity" }, { value: BigInt(1) }]])
      }).pipe(Effect.provide(CappedSharding({ entityMaxIdleTime: 1 })))

      // Shutting down closes the entity manager, which removes the series
      assert.deepStrictEqual(mailboxSizeMax(), [])
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry))
  })

  it.effect("reports the largest mailbox size across entities sharing an id on different shards", () => {
    const registry: Metric.MetricRegistry = new Map()
    return Effect.gen(function*() {
      const release = yield* Deferred.make<void>()
      const send = yield* makeMailboxMaxManager("MailboxMaxDuplicateId", Deferred.await(release))
      yield* TestClock.adjust(1)
      yield* send(ShardId.make("default", 1))
      yield* send(ShardId.make("default", 1))
      yield* send(ShardId.make("workflow", 1))
      yield* TestClock.adjust(1)

      // Let the entities drain when the test scope closes, even if the assertion fails
      yield* Effect.sync(() =>
        assert.deepStrictEqual(entityMailboxSizeMaxSeries(registry), [
          [{ type: "MailboxMaxDuplicateId" }, { value: BigInt(2) }]
        ])
      ).pipe(Effect.ensuring(Deferred.succeed(release, undefined)))
    }).pipe(Effect.provide(BlockedRebuildSharding), Effect.provideService(Metric.MetricRegistry, registry))
  })

  it.effect("keeps reporting the largest mailbox size until entities drain on shutdown", () => {
    const registry: Metric.MetricRegistry = new Map()
    return Effect.gen(function*() {
      const release = yield* Deferred.make<void>()
      const scope = yield* Scope.make()
      const send = yield* makeMailboxMaxManager("MailboxMaxDrain", Deferred.await(release)).pipe(
        Scope.provide(scope)
      )
      yield* TestClock.adjust(1)
      assert.deepStrictEqual(entityMailboxSizeMaxSeries(registry), [
        [{ type: "MailboxMaxDrain" }, { value: BigInt(0) }]
      ])

      yield* send(ShardId.make("default", 1))
      yield* TestClock.adjust(1)
      const closing = yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild)
      // Stay within the termination timeout, so the entity is still draining
      yield* TestClock.adjust(1)
      yield* Effect.sync(() =>
        assert.deepStrictEqual(entityMailboxSizeMaxSeries(registry), [
          [{ type: "MailboxMaxDrain" }, { value: BigInt(1) }]
        ])
      ).pipe(Effect.ensuring(Deferred.succeed(release, undefined)))

      yield* Fiber.join(closing)
      assert.deepStrictEqual(entityMailboxSizeMaxSeries(registry), [])
    }).pipe(Effect.provide(BlockedRebuildSharding), Effect.provideService(Metric.MetricRegistry, registry))
  })

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
    ))), 20_000)

  it.effect("reads durable messages from storage when a late entity registers", () =>
    Effect.gen(function*() {
      const config = ShardingConfig.layer({
        entityMailboxCapacity: 10,
        entityRegistrationTimeout: 6000,
        entityTerminationTimeout: 0,
        entityMessagePollInterval: "1 hour",
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
      const resetStarted = yield* Deferred.make<void>()
      const releaseReset = yield* Deferred.make<void>()
      const gateReset = <E>(reset: Effect.Effect<void, E>) =>
        Deferred.succeed(resetStarted, void 0).pipe(
          Effect.andThen(Deferred.await(releaseReset)),
          Effect.andThen(reset)
        )
      const delayedEnv = TestEntityNoState.pipe(
        Layer.provide(Layer.effectDiscard(Effect.sleep(1000))),
        Layer.provideMerge(Sharding.layer),
        Layer.provide(RunnerStorage.layerMemory),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(Runners.layerNoop),
        Layer.provide(config),
        Layer.updateService(MessageStorage.MessageStorage, (storage) => ({
          ...storage,
          resetAddress: (address) => gateReset(storage.resetAddress(address)),
          resetAddresses: (addresses) => gateReset(storage.resetAddresses(addresses))
        }))
      )
      const driver = yield* MessageStorage.MemoryDriver
      const state = yield* TestEntityState

      yield* Effect.gen(function*() {
        yield* TestClock.adjust(1)
        const makeClient = yield* TestEntity.client
        const client = makeClient("1")
        yield* client.RequestWithKey({ key: "late-registration" }).pipe(Effect.forkChild)
        yield* TestClock.adjust(1)
      }).pipe(
        Effect.provide(env),
        Effect.scoped
      )
      assert.strictEqual(driver.unprocessed.size, 1)

      const fiber = yield* Effect.never.pipe(
        Effect.provide(delayedEnv),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )

      // the startup storage read sees the message before the entity registers,
      // and the entity registers while the claim reset is still pending
      yield* TestClock.adjust(999)
      assert.isTrue(yield* Deferred.isDone(resetStarted))
      yield* TestClock.adjust(1)

      // the reset must complete before the read woken by registration, without
      // waiting for the poll interval or new client traffic
      yield* Deferred.succeed(releaseReset, void 0)
      yield* Queue.offer(state.messages, void 0)
      yield* TestClock.adjust(100)

      assert.strictEqual(driver.replyIds.size, 1)
      assert.strictEqual(driver.unprocessed.size, 0)
      yield* Fiber.interrupt(fiber)
    }).pipe(Effect.provide(MessageStorage.layerMemory.pipe(
      Layer.provide(ShardingConfig.layer({})),
      Layer.merge(TestEntityState.layer)
    ))), 20_000)

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
    ))), 20_000)

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

  it.effect("WithTransaction persists a failure reply after rollback", () =>
    Effect.gen(function*() {
      const state = yield* TestEntityState
      const makeClient = yield* TestEntity.client
      yield* TestClock.adjust(1)
      const client = makeClient("1")

      const first = yield* Effect.flip(client.FailWithTransaction({ id: 1 }))
      assert.strictEqual(first._tag, "BoomError")

      // The retry must be answered from storage without rerunning the handler.
      const retry = yield* client.FailWithTransaction({ id: 1 }).pipe(
        Effect.flip,
        Effect.timeout(5000),
        Effect.forkChild
      )
      yield* TestClock.adjust(5000)
      const second = yield* Fiber.join(retry)
      assert.strictEqual(second._tag, "BoomError")
      assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 1)
    }).pipe(Effect.provide(TestShardingWithoutStorage.pipe(
      // Replies saved inside a failed transaction are discarded, like a SQL
      // rollback.
      Layer.updateService(MessageStorage.MessageStorage, (storage) => {
        let saved: Array<Snowflake.Snowflake> = []
        return {
          ...storage,
          withTransaction: (effect) =>
            storage.withTransaction(effect).pipe(
              Effect.onExit((exit) => {
                const rolledBack = saved
                saved = []
                return Exit.isFailure(exit)
                  ? Effect.forEach(rolledBack, (id) => Effect.orDie(storage.clearReplies(id)), { discard: true })
                  : Effect.void
              })
            ),
          saveReply: (reply) =>
            MessageStorage.MemoryTransaction.use((inTransaction) => {
              if (inTransaction) saved.push(reply.reply.requestId)
              return storage.saveReply(reply)
            })
        }
      }),
      Layer.provide(MessageStorage.layerMemory),
      Layer.provide(TestShardingConfig)
    ))))

  it.effect("WithTransaction persists a client interrupt instead of replaying the request", () =>
    Effect.gen(function*() {
      const driver = yield* MessageStorage.MemoryDriver
      const state = yield* TestEntityState
      const makeClient = yield* TestEntity.client
      yield* TestClock.adjust(1)

      const fiber = yield* makeClient("1").NeverWithTransaction().pipe(Effect.forkChild({ startImmediately: true }))
      yield* TestClock.adjust(1)
      yield* Fiber.interrupt(fiber)

      yield* TestClock.adjust(1)
      expect(driver.replyIds.size).toEqual(1)
      expect(Queue.sizeUnsafe(state.envelopes)).toEqual(1)
    }).pipe(Effect.provide(TestSharding)))

  it.effect("WithTransaction delivers a success only after commit", () =>
    Effect.gen(function*() {
      const committing = Latch.makeUnsafe()
      const commit = Latch.makeUnsafe()
      yield* Effect.gen(function*() {
        const makeClient = yield* TestEntity.client
        yield* TestClock.adjust(1)
        const result = yield* makeClient("1").WithTransaction({ id: 1 }).pipe(Effect.forkChild)

        yield* committing.await
        yield* TestClock.adjust(1000)
        assert.isUndefined(result.pollUnsafe())

        yield* commit.open
        assert.isTrue(yield* Fiber.join(result))
      }).pipe(Effect.provide(TestShardingWithoutStorage.pipe(
        Layer.provide(RollbackMemoryStorage((transaction) =>
          Effect.tap(transaction, () => Effect.andThen(committing.open, commit.await))
        )),
        Layer.provide(TestShardingConfig)
      )))
    }))

  it.effect("WithTransaction replays the request without replying when COMMIT dies", () =>
    Effect.gen(function*() {
      const state = yield* TestEntityState
      const makeClient = yield* TestEntity.client
      yield* TestClock.adjust(1)

      // Count handler runs when the reply arrives: only the replay may reply.
      const result = yield* makeClient("1").WithTransaction({ id: 1 }).pipe(
        Effect.map((value) => [value, Queue.sizeUnsafe(state.envelopes)] as const),
        Effect.forkChild
      )
      yield* TestClock.adjust(5000)
      assert.deepStrictEqual(yield* Fiber.join(result), [true, 2])
    }).pipe(Effect.provide(TestShardingWithoutStorage.pipe(
      Layer.provide(RollbackMemoryStorage((transaction, attempt) =>
        attempt === 1 ? Effect.andThen(transaction, Effect.die("COMMIT failed")) : transaction
      )),
      Layer.provide(TestShardingConfig)
    ))))

  it.effect("WithTransaction replays the request without replying when ROLLBACK dies", () =>
    Effect.gen(function*() {
      const state = yield* TestEntityState
      const makeClient = yield* TestEntity.client
      yield* TestClock.adjust(1)

      // Count handler runs when the reply arrives: only the replay may reply.
      const result = yield* makeClient("1").FailWithTransaction({ id: 1 }).pipe(
        Effect.flip,
        Effect.map((error) => [error._tag, Queue.sizeUnsafe(state.envelopes)] as const),
        Effect.forkChild
      )
      yield* TestClock.adjust(5000)
      assert.deepStrictEqual(yield* Fiber.join(result), ["BoomError", 2])
    }).pipe(Effect.provide(TestShardingWithoutStorage.pipe(
      Layer.provide(RollbackMemoryStorage((transaction, attempt) =>
        attempt === 1 ? Effect.catchCause(transaction, () => Effect.die("ROLLBACK failed")) : transaction
      )),
      Layer.provide(TestShardingConfig)
    ))))

  it.effect("WithTransaction replays the request when saving the reply aborts the transaction", () =>
    Effect.gen(function*() {
      const state = yield* TestEntityState
      const makeClient = yield* TestEntity.client
      yield* TestClock.adjust(1)

      // Count handler runs when the reply arrives: only the replay may reply.
      const result = yield* makeClient("1").WithTransaction({ id: 1 }).pipe(
        Effect.map((value) => [value, Queue.sizeUnsafe(state.envelopes)] as const),
        Effect.forkChild
      )
      yield* TestClock.adjust(5000)
      assert.deepStrictEqual(yield* Fiber.join(result), [true, 2])
    }).pipe(Effect.provide(TestShardingWithoutStorage.pipe(
      // Like a MySQL deadlock: the first in-transaction reply write aborts the
      // transaction, later writes on it autocommit, and the transaction fails.
      Layer.updateService(MessageStorage.MessageStorage, (storage) => {
        let deadlocked = false
        let aborted = false
        return {
          ...storage,
          withTransaction: (effect) =>
            Effect.suspend(() => {
              aborted = false
              return storage.withTransaction(effect)
            }).pipe(Effect.tap(() => aborted ? Effect.die("COMMIT failed") : Effect.void)),
          saveReply: (reply) =>
            MessageStorage.MemoryTransaction.use((inTransaction) => {
              if (!inTransaction || deadlocked) return storage.saveReply(reply)
              deadlocked = aborted = true
              return Effect.fail(new ClusterError.PersistenceError({ cause: "deadlock" }))
            })
        }
      }),
      Layer.provide(MessageStorage.layerMemory),
      Layer.provide(TestShardingConfig)
    ))))

  it.effect.each(
    [
      { rpc: "GetUser", exit: Exit.succeed(new User({ id: 1, name: "User 1" })) },
      // A transactional failure reply is saved after the transaction ends.
      { rpc: "FailWithTransaction", exit: Exit.fail(new BoomError({ cause: "boom" })) }
    ] as const
  )(
    "delivers a persisted $rpc reply whose save committed but reported a failure",
    ({ exit, rpc }) =>
      Effect.gen(function*() {
        const state = yield* TestEntityState
        const driver = yield* MessageStorage.MemoryDriver
        const makeClient = yield* TestEntity.client
        yield* TestClock.adjust(1)

        const result = yield* makeClient("1")[rpc]({ id: 1 }).pipe(Effect.forkChild)
        yield* TestClock.adjust(5000)
        assert.deepStrictEqual(result.pollUnsafe(), exit)
        assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 1)
        assert.strictEqual(driver.replyIds.size, 1)
      }).pipe(Effect.provide(TestShardingWithoutStorage.pipe(
        Layer.provide(Layer.effect(
          MessageStorage.MessageStorage,
          Effect.gen(function*() {
            const { encoded } = yield* MessageStorage.MemoryDriver
            const committed = new Set<string>()
            return yield* MessageStorage.makeEncoded({
              ...encoded,
              // Like a lost COMMIT acknowledgement: the first exit reply is
              // stored but reported as failed, and later saves for the same
              // request violate UNIQUE (request_id, kind).
              saveReply: (reply) => {
                if (reply._tag !== "WithExit") return encoded.saveReply(reply)
                const failure = Effect.fail(new ClusterError.PersistenceError({ cause: "connection lost" }))
                if (committed.has(reply.requestId)) return failure
                committed.add(reply.requestId)
                return Effect.andThen(encoded.saveReply(reply), failure)
              }
            })
          })
        )),
        Layer.provideMerge(MessageStorage.MemoryDriver.layer),
        Layer.provide(Snowflake.layerGenerator),
        Layer.provide(TestShardingConfig)
      )))
  )
})

// Memory storage that discards replies saved inside a failed transaction, like
// a SQL rollback. `wrap` runs around each transaction with its 1-based attempt.
const RollbackMemoryStorage = (
  wrap: <A, E, R>(transaction: Effect.Effect<A, E, R>, attempt: number) => Effect.Effect<A, E, R>
) =>
  Layer.effect(
    MessageStorage.MessageStorage,
    Effect.gen(function*() {
      const { encoded } = yield* MessageStorage.MemoryDriver
      let attempts = 0
      let saved: Array<Snowflake.Snowflake> = []
      return yield* MessageStorage.makeEncoded({
        ...encoded,
        withTransaction: (effect) =>
          Effect.suspend(() => wrap(encoded.withTransaction(effect), ++attempts)).pipe(
            Effect.onExit((exit) => {
              const rolledBack = saved
              saved = []
              return Exit.isFailure(exit)
                ? Effect.forEach(rolledBack, (id) => Effect.orDie(encoded.clearReplies(id)), { discard: true })
                : Effect.void
            })
          ),
        saveReply: (reply) =>
          MessageStorage.MemoryTransaction.use((inTransaction) => {
            if (inTransaction) saved.push(Snowflake.Snowflake(reply.requestId))
            return encoded.saveReply(reply)
          })
      })
    })
  ).pipe(Layer.provide([MessageStorage.MemoryDriver.layer, Snowflake.layerGenerator]))

const DefectRecoveryRun = Rpc.make("run", {
  payload: { id: Schema.String },
  success: Schema.String
})

const DefectRecoveryEntity = Entity.make("DefectRecovery", [DefectRecoveryRun.annotate(ClusterSchema.Persisted, true)])

const DefectRecoverySharding = <R>(entityLayer: Layer.Layer<never, never, R>) =>
  entityLayer.pipe(Layer.provideMerge(UnregisteredSharding({})))

// Restarts after 1ms, so tests only advance the clock as far as a restart
// needs instead of waking every background Sharding loop along the way.
const defectRetryPolicy = Schedule.spaced(1)

// Steps the test clock until `effect` completes.
const advanceUntil = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.raceFirst(effect, Effect.forever(TestClock.adjust(1)))

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
      abandonUndelivered: () => Effect.void,
      isShardOwned: () => Effect.succeed(true),
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
      const entityLayer = entity.toLayer(
        Effect.as(
          generations.next,
          entity.of({
            run: Effect.fnUntraced(function*({ payload }) {
              if ((yield* Ref.updateAndGet(attempts, (n) => n + 1)) <= 3) {
                return yield* Effect.die("repeated defect")
              }
              return payload.id
            })
          })
        ),
        { defectRetryPolicy }
      )

      yield* Effect.gen(function*() {
        const client = (yield* entity.client)("repeated")
        const work = yield* client.run({ id: "request" }).pipe(Effect.forkChild)
        assert.strictEqual(yield* advanceUntil(Fiber.join(work)), "request")
        assert.strictEqual(yield* Ref.get(attempts), 4)
        assert.strictEqual(yield* Ref.get(generations.count), 4)
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
        { concurrency: "unbounded", defectRetryPolicy }
      )

      yield* Effect.gen(function*() {
        const client = (yield* entity.client)("arrivals")
        const first = yield* client.run({ id: "first" }).pipe(Effect.forkChild)
        const second = yield* client.run({ id: "second" }).pipe(Effect.forkChild)
        yield* Deferred.await(bothStarted)
        yield* Deferred.succeed(fail, undefined)
        yield* advanceUntil(Deferred.await(generations.acquiring))
        const third = yield* client.run({ id: "third" }).pipe(Effect.forkChild)
        yield* TestClock.adjust(1)
        yield* Deferred.succeed(generations.acquired, undefined)
        yield* advanceUntil(Fiber.joinAll([first, second, third]))
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

  // Preemptive shutdown abandons the parked caller during the drain; otherwise it
  // must stay parked rather than store an interrupt as its reply.
  for (const preemptiveShutdown of [true, false]) {
    it.effect(`replays a durable caller parked on a queued request when its target closes (preemptiveShutdown: ${preemptiveShutdown})`, () =>
      Effect.gen(function*() {
        const storage = yield* makeSharedMemoryStorage
        const queued = yield* Latch.make()
        const state = { children: 0, continued: [] as Array<string> }
        const config = { preemptiveShutdown }
        const runnerScope = yield* Scope.make()
        const targetScope = yield* Scope.make()
        const runner = yield* Layer.buildWithScope(
          RestartSharding(ClosingTargetCallerLayer(state), unreadStorage(storage, "Child", queued), config),
          runnerScope
        )
        yield* Effect.gen(function*() {
          yield* Layer.buildWithScope(ClosingTargetLayer(state), targetScope)
          // The target entity is resident while the caller waits on its queued request.
          yield* advanceUntil((yield* ClosingTarget.client)("1").Warm())
          yield* (yield* ClosingTargetCaller.client)("1").Call({ id: "call" }, { discard: true })
          yield* queued.await
        }).pipe(Effect.provide(runner))
        yield* advanceUntil(Scope.close(targetScope, Exit.void))
        // A caller left parked waits out `entityTerminationTimeout`.
        const closing = yield* Effect.forkChild(Scope.close(runnerScope, Exit.void), { startImmediately: true })
        for (let i = 0; i < 100 && closing.pollUnsafe() === undefined; i++) yield* TestClock.adjust(1000)
        yield* Fiber.join(closing)
        assert.deepStrictEqual(state, { children: 0, continued: [] })

        const exit = yield* Effect.gen(function*() {
          const client = (yield* ClosingTargetCaller.client)("1")
          return yield* advanceUntil(Effect.exit(client.Call({ id: "call" })))
        }).pipe(Effect.provide(
          RestartSharding(
            Layer.merge(ClosingTargetCallerLayer(state), ClosingTargetLayer(state)),
            storage,
            config
          )
        ))
        assert.deepStrictEqual(exit, Exit.succeed("child"))
        assert.deepStrictEqual(state, { children: 1, continued: ["child"] })
      }))
  }

  it.effect("interrupts an entity whose id is also active on a shard that was interrupted first", () =>
    Effect.gen(function*() {
      const run = Rpc.make("run")
      const entity = Entity.make("DuplicateEntityId", [run])
      const sharding = yield* Sharding.Sharding
      let stopped = 0
      const manager = yield* EntityManager.make(
        entity,
        Effect.as(
          Effect.addFinalizer(() => Effect.sync(() => stopped++)),
          entity.of({ run: () => Effect.void })
        ),
        {
          // both shards belong to this runner
          sharding: { ...sharding, hasShardId: () => true },
          storage: MessageStorage.noop,
          runnerAddress: RunnerAddress.make("localhost", 1234),
          residency: { admitUnsafe: () => true, releaseUnsafe: () => {} },
          abandonUndelivered: () => Effect.void,
          isShardOwned: () => Effect.succeed(true),
          maxIdleTime: Infinity
        }
      )
      const entityId = EntityId.make("duplicate")
      const activate = Effect.fnUntraced(function*(shardId: ShardId.ShardId) {
        yield* manager.sendLocal(
          new Message.IncomingRequestLocal<typeof run>({
            envelope: Envelope.makeRequest<typeof run>({
              requestId: yield* sharding.getSnowflake,
              address: EntityAddress.make({ shardId, entityType: EntityType.make(entity.type), entityId }),
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
      const defaultShard = ShardId.make("default", 1)
      const workflowShard = ShardId.make("workflow", 1)
      yield* TestClock.adjust(1)
      yield* activate(defaultShard)
      yield* activate(workflowShard)
      yield* TestClock.adjust(1)

      const interruptWorkflow = yield* manager.interruptShard(workflowShard).pipe(Effect.forkChild)
      yield* TestClock.adjust(1000)
      assert.deepStrictEqual(interruptWorkflow.pollUnsafe(), Exit.void)
      assert.strictEqual(stopped, 1)
      const interruptDefault = yield* manager.interruptShard(defaultShard).pipe(Effect.forkChild)
      yield* TestClock.adjust(1000)
      assert.deepStrictEqual(interruptDefault.pollUnsafe(), Exit.void)
      assert.strictEqual(stopped, 2)
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
          entityMessagePollInterval: 1000,
          refreshAssignmentsInterval: 1000,
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
        // The acquisition loop waits one second between passes. Advance by
        // that interval instead of repeatedly waking 10ms polling loops.
        while (sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(1000)
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
  // Repeated TestClock adjustments need wall-clock headroom under concurrent Deno CI load.
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
    }).pipe(Effect.provide(CappedSharding({ maxResidentEntities: 2, entityMaxIdleTime: 1000 }))), 20_000)

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

describe("Sharding metrics", { concurrent: false }, () => {
  it.effect("updates the shards gauge after reassignment", () =>
    Effect.gen(function*() {
      const storage = yield* RunnerStorage.makeMemory
      const context = yield* Sharding.layer.pipe(
        Layer.provide(Layer.succeed(RunnerStorage.RunnerStorage, storage)),
        Layer.provide([RunnerHealth.layerNoop, Runners.layerNoop]),
        Layer.provide(MessageStorage.layerMemory),
        Layer.provide(ShardingConfig.layer({
          runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
          shardsPerGroup: 8,
          refreshAssignmentsInterval: 10
        })),
        Layer.build
      )
      const sharding = Context.get(context, Sharding.Sharding)
      const shardIds = Array.makeBy(8, (i) => ShardId.make("default", i + 1))
      const held = () => shardIds.filter((shardId) => sharding.hasShardId(shardId)).length

      while (held() !== 8) {
        yield* TestClock.adjust(10)
      }
      assert.strictEqual(ClusterMetrics.shards.valueUnsafe(Context.empty()).value, 8n)

      yield* storage.register(otherRunner, true)
      while (held() !== 4) {
        yield* TestClock.adjust(10)
      }
      assert.strictEqual(ClusterMetrics.shards.valueUnsafe(Context.empty()).value, 4n)
    }))
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

  it.effect("interrupts opted-in streams on reassignment but respects Uninterruptible", () =>
    Effect.gen(function*() {
      const entity = Entity.make(TestEntity.type, [
        terminationRpc("StreamWithKey").annotate(ClusterSchema.Persisted, false),
        terminationRpc("RequestWithKey")
          .annotate(ClusterSchema.Persisted, false)
          .annotate(ClusterSchema.Uninterruptible, "server")
      ]).annotateRpcs(ClusterSchema.InterruptOnTermination, true)
      const storageState = makeFailoverStorageState()
      const started = yield* Queue.make<void>()
      const finish = yield* Deferred.make<void>()
      const entityLayer = entity.toLayer({
        StreamWithKey: () => Stream.fromEffect(Queue.offer(started, void 0).pipe(Effect.andThen(Effect.never))),
        RequestWithKey: () => Queue.offer(started, void 0).pipe(Effect.andThen(Deferred.await(finish)))
      }, { concurrency: "unbounded" })

      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        yield* waitForTerminationOwnership(sharding, true)
        // Let the acquisition backoff finish before testing reassignment.
        yield* TestClock.adjust(1000)
        const client = (yield* entity.client)("termination-stream")
        const stream = yield* client.StreamWithKey({ key: "run" }).pipe(
          Stream.runDrain,
          Effect.forkChild({ startImmediately: true })
        )
        const protectedRequest = yield* client.RequestWithKey({ key: "run" }).pipe(
          Effect.forkChild({ startImmediately: true })
        )
        yield* Queue.take(started)
        yield* Queue.take(started)
        storageState.assignSelf = false
        yield* waitForTerminationOwnership(sharding, false)
        yield* TestClock.adjust(100)
        const earlyExit = stream.pollUnsafe()
        const protectedExit = protectedRequest.pollUnsafe()
        const held = storageState.releaseCalls.length === 0
        yield* Deferred.succeed(finish, void 0)
        yield* TestClock.adjust(100)
        const earlyReleases = storageState.releaseCalls.slice()
        // Finish a broken implementation's grace period before asserting.
        yield* TestClock.adjust(1000)
        assert(earlyExit && Exit.hasInterrupts(earlyExit))
        assert.isUndefined(protectedExit)
        assert.isTrue(held)
        assert.deepStrictEqual(protectedRequest.pollUnsafe(), Exit.void)
        assert.deepStrictEqual(earlyReleases, [ShardId.make("default", 1)])
      }).pipe(Effect.provide(TerminationSharding(entityLayer, storageState)), Effect.scoped)
    }))

  it.effect("resumes an opted-in persisted request after early shard release", () =>
    Effect.gen(function*() {
      const entity = Entity.make(TestEntity.type, [terminationRpc("RequestWithKey")])
        .annotateRpcs(ClusterSchema.InterruptOnTermination, true)
      const storageState = makeFailoverStorageState()
      const started = yield* Queue.make<Snowflake.Snowflake>()
      const finish = yield* Deferred.make<void>()
      const entityLayer = entity.toLayer({
        RequestWithKey: ({ requestId }) => Queue.offer(started, requestId).pipe(Effect.andThen(Deferred.await(finish)))
      })

      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        yield* waitForTerminationOwnership(sharding, true)
        yield* TestClock.adjust(1000)
        const client = (yield* entity.client)("termination-persisted")
        const running = yield* client.RequestWithKey({ key: "run" }).pipe(
          Effect.forkChild({ startImmediately: true })
        )
        const requestId = yield* Queue.take(started)
        storageState.assignSelf = false
        yield* waitForTerminationOwnership(sharding, false)
        yield* TestClock.adjust(100)
        const earlyReleases = storageState.releaseCalls.slice()
        yield* TestClock.adjust(1000)
        assert.deepStrictEqual(earlyReleases, [ShardId.make("default", 1)])
        assert.isUndefined(running.pollUnsafe())

        // A replay with the same ID and successful completion proves termination
        // neither saved a terminal reply nor marked the request processed.
        storageState.assignSelf = true
        yield* waitForTerminationOwnership(sharding, true)
        yield* sharding.pollStorage
        yield* TestClock.adjust(10)
        assert.deepStrictEqual(Queue.takeUnsafe(started), Exit.succeed(requestId))
        yield* Deferred.succeed(finish, void 0)
        yield* TestClock.adjust(100)
        assert.deepStrictEqual(running.pollUnsafe(), Exit.void)
      }).pipe(Effect.provide(TerminationSharding(entityLayer, storageState)), Effect.scoped)
    }))

  it.effect("releases a shard reassigned while a defected entity waits to restart", () =>
    Effect.gen(function*() {
      const entity = Entity.make("ReleaseDuringRestart", [
        Rpc.make("Defect").annotate(ClusterSchema.Persisted, true)
      ])
      const storageState = makeFailoverStorageState()
      const defected = yield* Deferred.make<void>()
      let attempts = 0
      const entityLayer = entity.toLayer({
        Defect: () =>
          Effect.suspend(() => {
            attempts++
            return attempts === 1 ?
              Deferred.succeed(defected, void 0).pipe(Effect.andThen(Effect.die("boom"))) :
              Effect.void
          })
      })

      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        yield* waitForTerminationOwnership(sharding, true)
        yield* TestClock.adjust(1000)
        yield* (yield* entity.client)("restarting").Defect().pipe(Effect.forkChild({ startImmediately: true }))
        yield* advanceUntil(Deferred.await(defected))

        // Reassign the shard during the 500ms defect retry sleep.
        storageState.assignSelf = false
        yield* waitForTerminationOwnership(sharding, false)
        yield* TestClock.adjust(1000)
        const releases = storageState.releaseCalls.slice()
        // Finish a broken implementation's termination timeout before asserting.
        yield* TestClock.adjust(10_000)
        assert.deepStrictEqual(releases, [ShardId.make("default", 1)])
      }).pipe(
        Effect.provide(TerminationSharding(entityLayer, storageState, { entityTerminationTimeout: 10_000 })),
        Effect.scoped
      )
    }))

  it.effect("keeps the graceful timeout and records release duration across retries for shard reassignment", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState({ releaseFailures: 1 })
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
        const before = yield* Metric.value(ClusterMetrics.shardReleaseDuration)

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
        assert.strictEqual((yield* Metric.value(ClusterMetrics.shardReleaseDuration)).count, before.count)
        yield* TestClock.adjust(50)
        assert.strictEqual(storageState.releaseCalls.length, 2)
        assert.deepStrictEqual(unregisterInterrupts, [false])
        const after = yield* Metric.value(ClusterMetrics.shardReleaseDuration)
        assert.strictEqual(after.count - before.count, 1)
        assert.strictEqual(after.sum - before.sum, 1050)
      }).pipe(
        Effect.provide(layer),
        Effect.scoped,
        // Keep fractional samples from other tests out of the duration delta.
        Effect.provideService(Metric.MetricRegistry, new Map())
      )
    }))

  it.effect("delivers a client interrupt to a request still draining on the lock holder", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState()
      yield* Effect.gen(function*() {
        const state = yield* TestEntityState
        const sharding = yield* Sharding.Sharding
        const client = (yield* TestEntity.client)("1")
        const shardId = sharding.getShardId(EntityId.make("1"), "default")
        while (!sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }
        const request = yield* client.NeverVolatile().pipe(Effect.forkChild({ startImmediately: true }))
        yield* Queue.take(state.envelopes)
        storageState.assignSelf = false
        while (sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }
        assert.strictEqual(storageState.releaseCalls.length, 0, "the shard lock must still be held")

        yield* Fiber.interrupt(request).pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust(100)
        assert.strictEqual(Queue.sizeUnsafe(state.interrupts), 1)
      }).pipe(Effect.provide(GracefulHandoffSharding(storageState)), Effect.scoped)
    }))

  it.effect("acknowledges stream chunks from a request still draining on the lock holder", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState()
      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const client = (yield* TestEntity.client)("1")
        const shardId = sharding.getShardId(EntityId.make("1"), "default")
        while (!sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }
        // With one buffered chunk, the second is acknowledged only once the first is consumed.
        const users = yield* client.GetAllUsersVolatile({ ids: [1, 2] }, { asQueue: true, streamBufferSize: 1 })
        yield* TestClock.adjust(1)
        storageState.assignSelf = false
        while (sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }

        const consumed = yield* Stream.fromQueue(users).pipe(
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true })
        )
        yield* TestClock.adjust(100)
        const exit = consumed.pollUnsafe()
        assert.deepStrictEqual(exit && Exit.map(exit, (users) => users.map((user) => user.id)), Exit.succeed([1, 2]))
      }).pipe(Effect.provide(GracefulHandoffSharding(storageState)), Effect.scoped)
    }))

  it.effect("holds a remote request on the new owner until it acquires the shard lock", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState({ lockHeldElsewhere: true })
      yield* Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const entityId = EntityId.make("1")
        const shardId = sharding.getShardId(entityId, "default")
        while (storageState.acquireCalls.length === 0) {
          yield* TestClock.adjust(10)
        }
        const delivery = yield* sharding.send(
          new Message.IncomingRequest({
            envelope: {
              _tag: "Request",
              requestId: Snowflake.Snowflake(BigInt(1)),
              address: EntityAddress.make({ shardId, entityType: EntityType.make(TestEntity.type), entityId }),
              tag: "GetUserVolatile",
              payload: { id: 1 },
              headers: Headers.empty
            },
            lastSentReply: Option.none(),
            respond: () => Effect.void,
            codecFor: Schema.toCodecJson as RpcSerialization.CodecFor
          })
        ).pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust(10)
        assert.isUndefined(delivery.pollUnsafe(), "delivery must wait for the shard lock")

        storageState.lockHeldElsewhere = false
        while (!sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }
        assert.deepStrictEqual(yield* Fiber.await(delivery), Exit.void)
      }).pipe(Effect.provide(GracefulHandoffSharding(storageState)), Effect.scoped)
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

describe("Sharding shard fencing", { concurrent: false }, () => {
  it.effect("abandons a reply once lock storage no longer attributes the shard to this runner", () =>
    withFencedEntity(Effect.fnUntraced(function*({ client, driver, fence, probe, sharding }) {
      const result = yield* client.Request().pipe(Effect.forkChild({ startImmediately: true }))
      yield* TestClock.adjust(1)
      assert.strictEqual(yield* Queue.take(probe.entered), "Request")

      fence.fenced = true
      yield* probe.release.open
      // Past every retry of a failed reply write.
      yield* TestClock.adjust(1000)

      assert.strictEqual(driver.replyIds.size, 0)
      // A rejected write is never retried: one lock refresh per handler run,
      // of the reply's shard only.
      assert.strictEqual(fence.refreshes.length, 1 + Queue.sizeUnsafe(probe.entered))
      const shardId = sharding.getShardId(EntityId.make("1"), "default")
      assert.deepStrictEqual(fence.refreshes, fence.refreshes.map(() => [shardId]))
      // The caller is not answered with this runner's result.
      assert.isUndefined(result.pollUnsafe())
    })))

  it.effect("abandons a fenced transactional reply without restarting the entity", () =>
    withFencedEntity(Effect.fnUntraced(function*({ client, driver, fence, probe }) {
      const result = yield* client.Transaction().pipe(Effect.forkChild({ startImmediately: true }))
      yield* TestClock.adjust(1)
      assert.strictEqual(yield* Queue.take(probe.entered), "Transaction")

      fence.fenced = true
      yield* probe.release.open
      yield* TestClock.adjust(1000)

      assert.strictEqual(driver.replyIds.size, 0)
      assert.strictEqual(fence.refreshes.length, 1 + Queue.sizeUnsafe(probe.entered))
      assert.isUndefined(result.pollUnsafe())
    })))
})

const FencedEntity = Entity.make("FencedEntity", [
  Rpc.make("Request", { success: Schema.Number }),
  Rpc.make("Transaction", { success: Schema.Number }).annotate(
    ClusterSchema.Dynamic,
    Context.add(ClusterSchema.WithTransaction, true)
  )
]).annotateRpcs(ClusterSchema.Persisted, true)

interface FencedProbe {
  readonly entered: Queue.Queue<string>
  readonly release: Latch.Latch
}

// Each handler produces its result only after `release` opens.
const FencedEntityLayer = (probe: FencedProbe) =>
  FencedEntity.toLayer(FencedEntity.of({
    Request: () => Effect.andThen(Queue.offer(probe.entered, "Request"), Effect.as(probe.release.await, 1)),
    Transaction: () => Effect.andThen(Queue.offer(probe.entered, "Transaction"), Effect.as(probe.release.await, 1))
  }))

interface ShardFence {
  // once set, lock refreshes no longer return any shard, while the runner's
  // periodic lock refresh is not due yet
  fenced: boolean
  // the shards of each lock refresh made while fenced
  readonly refreshes: Array<ReadonlyArray<ShardId.ShardId>>
}

const withFencedEntity = Effect.fnUntraced(function*<E>(
  body: (options: {
    readonly client: ReturnType<Effect.Success<typeof FencedEntity.client>>
    readonly driver: MessageStorage.MemoryDriver["Service"]
    readonly fence: ShardFence
    readonly probe: FencedProbe
    readonly sharding: Sharding.Sharding["Service"]
  }) => Effect.Effect<void, E>
) {
  const restarts: Array<unknown> = []
  const logger = Logger.make<unknown, void>(({ message }) => {
    if (globalThis.Array.isArray(message) && message.includes("Defect in entity, restarting")) {
      restarts.push(message)
    }
  })
  const fence: ShardFence = { fenced: false, refreshes: [] }
  const probe: FencedProbe = {
    entered: yield* Queue.make<string>(),
    release: Latch.makeUnsafe(false)
  }
  const runnerStorage = Layer.effect(
    RunnerStorage.RunnerStorage,
    Effect.map(RunnerStorage.makeMemory, (storage) =>
      RunnerStorage.RunnerStorage.of({
        ...storage,
        refresh: (address, shardIds) => {
          const shards = globalThis.Array.from(shardIds)
          if (!fence.fenced) return storage.refresh(address, shards)
          if (shards.length > 0) fence.refreshes.push(shards)
          return Effect.succeed([])
        }
      }))
  )
  const layer = FencedEntityLayer(probe).pipe(
    Layer.provideMerge(Sharding.layer),
    Layer.provide([runnerStorage, RunnerHealth.layerNoop, Runners.layerNoop]),
    Layer.provideMerge(MessageStorage.layerMemory),
    Layer.provide(TestShardingConfig)
  )

  yield* Effect.gen(function*() {
    const driver = yield* MessageStorage.MemoryDriver
    const makeClient = yield* FencedEntity.client
    yield* TestClock.adjust(1)
    const sharding = yield* Sharding.Sharding
    yield* body({ client: makeClient("1"), driver, fence, probe, sharding })
    assert.deepStrictEqual(restarts, [])
  }).pipe(Effect.provide(layer), Effect.withLogger(logger))
})

const terminationRpc = <Tag extends RpcGroup.Rpcs<typeof TestEntity.protocol>["_tag"]>(tag: Tag) =>
  TestEntity.protocol.requests.get(tag)! as Extract<RpcGroup.Rpcs<typeof TestEntity.protocol>, { readonly _tag: Tag }>

const TerminationSharding = (
  entityLayer: Layer.Layer<never, never, Sharding.Sharding>,
  state: FailoverStorageState,
  config?: Partial<ShardingConfig.ShardingConfig["Service"]>
) =>
  entityLayer.pipe(
    Layer.provideMerge(Sharding.layer),
    Layer.provide(Layer.effect(
      RunnerStorage.RunnerStorage,
      Effect.map(Clock.Clock, (clock) => makeFailoverStorage(state, clock))
    )),
    Layer.provide(RunnerHealth.layerNoop),
    Layer.provide(Runners.layerNoop),
    Layer.provideMerge(MessageStorage.layerMemory),
    Layer.provide(ShardingConfig.layer({
      runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
      shardsPerGroup: 1,
      shardLockExpiration: 3000,
      shardLockRefreshInterval: 100,
      entityTerminationTimeout: 1000,
      entityMessagePollInterval: 10,
      entityReplyPollInterval: 10,
      refreshAssignmentsInterval: 10,
      sendRetryInterval: 10,
      ...config
    }))
  )

const waitForTerminationOwnership = Effect.fnUntraced(
  function*(sharding: Sharding.Sharding["Service"], owned: boolean) {
    const shardId = ShardId.make("default", 1)
    for (let i = 0; i < 100; i++) {
      if (sharding.hasShardId(shardId) === owned) return
      yield* TestClock.adjust(10)
    }
    assert.strictEqual(sharding.hasShardId(shardId), owned)
  }
)
const PersistedHold = Entity.make("PersistedHold", [
  Rpc.make("Hold").annotate(ClusterSchema.Persisted, true)
])

const GatedTeardownEntity = Entity.make("GatedTeardownEntity", [
  Rpc.make("Activate").annotate(ClusterSchema.Persisted, false)
])

describe("Sharding shard handoff", { concurrent: false }, () => {
  const allShards = [ShardId.make("default", 1), ShardId.make("default", 2)]
  const makeOwnedScope = Effect.acquireRelease(Scope.make(), (scope) => Scope.close(scope, Exit.void))
  // Open teardown gates before closing scopes, including on assertion failure.
  const makeGate = Effect.acquireRelease(Effect.sync(() => Latch.makeUnsafe()), (gate) => gate.open)
  const advanceUntil = Effect.fnUntraced(function*(done: () => boolean) {
    for (let i = 0; i < 100 && !done(); i++) {
      yield* TestClock.adjust(10)
    }
    assert.isTrue(done())
  })
  // Reads the releasing-shards gauge from the registry the runner was built with
  const releasingGauge = (registry: Metric.MetricRegistry) =>
    (Metric.snapshotUnsafe(Context.make(Metric.MetricRegistry, registry)).find((metric) =>
      metric.id === "effect_cluster_shards_releasing"
    )?.state as Metric.GaugeState<bigint> | undefined)?.value
  const buildSharding = Effect.fnUntraced(function*(
    storageState: FailoverStorageState,
    config?: Partial<ShardingConfig.ShardingConfig["Service"]>,
    existingScope?: Scope.Closeable
  ) {
    const scope = existingScope ?? (yield* makeOwnedScope)
    const context = yield* Layer.buildWithScope(
      Sharding.layer.pipe(
        Layer.provide(Layer.effect(
          RunnerStorage.RunnerStorage,
          Effect.map(Clock.Clock, (clock) => makeFailoverStorage(storageState, clock))
        )),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(Runners.layerNoop),
        Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
        Layer.provide(ShardingConfig.layer({
          runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
          shardsPerGroup: 2,
          entityTerminationTimeout: 0,
          entityMessagePollInterval: 10,
          refreshAssignmentsInterval: 10,
          ...config
        }))
      ),
      scope
    )
    return { context, scope, sharding: Context.get(context, Sharding.Sharding) }
  })

  it.effect("warns about pending entities and singletons and reacquires only after teardown", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState()
      const registrationScope = yield* makeOwnedScope
      const registry: Metric.MetricRegistry = new Map()
      const clock = yield* Clock.Clock
      const warnings: Array<{ at: number; output: string }> = []
      let unhealthyAt: number | undefined
      const logger = Logger.make((options) => {
        if (options.logLevel === "Error" && String(options.message).includes("unhealthy")) {
          unhealthyAt ??= clock.currentTimeMillisUnsafe()
        }
        if (options.logLevel !== "Warn") return
        const output = Logger.formatJson.log(options)
        if (/releas/i.test(output)) warnings.push({ at: clock.currentTimeMillisUnsafe(), output })
      })
      const { context, sharding } = yield* buildSharding(storageState, {
        shardsPerGroup: 1,
        shardLockExpiration: 300,
        shardLockRefreshInterval: 1000,
        // Keep 30 seconds of polling cheap
        entityMessagePollInterval: 100
      }).pipe(Effect.provide(Logger.layer([logger])), Effect.provideService(Metric.MetricRegistry, registry))
      // These finalizers run before either scope closes, even on assertion failure.
      const entityGate = yield* makeGate
      const singletonGate = yield* makeGate
      const started = Latch.makeUnsafe()
      const stopped = Latch.makeUnsafe()
      const shardId = ShardId.make("default", 1)
      yield* advanceUntil(() => sharding.hasShardId(shardId))
      yield* sharding.registerEntity(
        GatedTeardownEntity,
        Effect.as(
          Effect.addFinalizer(() => entityGate.await),
          GatedTeardownEntity.of({ Activate: () => Effect.void })
        )
      ).pipe(Effect.provideService(Scope.Scope, registrationScope))
      const makeClient = yield* GatedTeardownEntity.client.pipe(Effect.provideContext(context))
      yield* makeClient("1").Activate()
      yield* sharding.registerSingleton(
        "StalledReleaseSingleton",
        Effect.andThen(started.open, singletonGate.await).pipe(
          Effect.uninterruptible,
          Effect.ensuring(stopped.open)
        )
      ).pipe(Effect.provideService(Scope.Scope, registrationScope))
      yield* started.await
      yield* advanceUntil(() => storageState.refreshCalls.some((call) => call.shards.length > 0))
      const acquiresBeforeOutage = storageState.acquireCalls.length
      const assertStillBlocked = () => {
        assert.isFalse(sharding.hasShardId(shardId))
        assert.strictEqual(storageState.acquireCalls.length, acquiresBeforeOutage)
        assert.strictEqual(storageState.releaseAllCalls.length, 0)
      }

      storageState.blackholed = true
      yield* TestClock.adjust(201)
      assert.isFalse(sharding.hasShardId(shardId))
      assert.deepStrictEqual(warnings, [], "a brief release must not warn")
      storageState.blackholed = false
      // Storage recovers, but uninterruptible work must still prevent release.
      yield* TestClock.adjust(1000)
      assertStillBlocked()
      assert.isFalse(stopped.isOpen())
      const firstWarnings = warnings.slice()
      const blockedShards = ClusterMetrics.shards.valueUnsafe(Context.empty()).value
      const blockedReleasing = releasingGauge(registry)
      // The entity stops, so the next warning names only the singleton.
      yield* entityGate.open
      yield* TestClock.adjust(firstWarnings[0].at + 29_999 - clock.currentTimeMillisUnsafe())
      const warningsBeforeRepeat = warnings.slice()
      assertStillBlocked()
      yield* TestClock.adjust(1)
      const warningsAtRepeat = warnings.slice()
      assertStillBlocked()

      yield* singletonGate.open
      yield* advanceUntil(() => sharding.hasShardId(shardId))
      assert.isTrue(stopped.isOpen())
      assert.strictEqual(storageState.releaseAllCalls.length, 1)
      assert.isTrue(storageState.releaseAllCalls[0].completed)
      const reacquires = storageState.acquireCalls.slice(acquiresBeforeOutage)
      assert.isAbove(reacquires.length, 0)
      assert.isTrue(reacquires.every((call) => call.completedReleaseAlls === 1))
      const recoveredReleasing = releasingGauge(registry)
      const warningsAtRecovery = warnings.slice()
      yield* TestClock.adjust(30_000)
      assert.deepStrictEqual(warnings, warningsAtRecovery, "the release monitor must stop after recovery")

      // Assert diagnostics last so the red test also exercises safe recovery.
      assert.strictEqual(firstWarnings.length, 1, "a prolonged forced release must warn once by expiration")
      // The forced release starts once the acquisition loop wakes, after the loss.
      assert.isAtLeast(firstWarnings[0].at - unhealthyAt!, 300, "the first warning must not precede expiration")
      assert.include(firstWarnings[0].output, "default:1")
      assert.include(firstWarnings[0].output, "GatedTeardownEntity")
      assert.include(firstWarnings[0].output, "StalledReleaseSingleton")
      assert.deepStrictEqual(warningsBeforeRepeat, firstWarnings, "warnings must not repeat before 30 seconds")
      assert.strictEqual(warningsAtRepeat.length, 2, "a pending release must warn again after 30 seconds")
      assert.strictEqual(warningsAtRepeat[1].at - firstWarnings[0].at, 30_000)
      assert.include(warningsAtRepeat[1].output, "default:1")
      assert.notInclude(warningsAtRepeat[1].output, "GatedTeardownEntity")
      assert.include(warningsAtRepeat[1].output, "StalledReleaseSingleton")
      assert.deepStrictEqual(warningsAtRecovery, warningsAtRepeat)
      assert.strictEqual(blockedShards, 0n)
      assert.strictEqual(blockedReleasing, 1n, "the blocked shard must count as releasing")
      assert.strictEqual(recoveredReleasing, 0n, "releasing must return to zero after recovery")
    }))

  it.effect("does not warn when forced release completes before the warning deadline", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState({ releaseAllDuration: 50 })
      const warnings: Array<string> = []
      const logger = Logger.make((options) => {
        if (options.logLevel === "Warn") {
          const output = Logger.formatJson.log(options)
          if (/releas/i.test(output)) warnings.push(output)
        }
      })
      const { sharding } = yield* buildSharding(storageState, {
        shardsPerGroup: 1,
        shardLockExpiration: 300,
        shardLockRefreshInterval: 1000
      }).pipe(Effect.provide(Logger.layer([logger])))
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          storageState.releaseAllDuration = 0
        })
      )
      const shardId = ShardId.make("default", 1)
      yield* advanceUntil(() => sharding.hasShardId(shardId))
      yield* advanceUntil(() => storageState.refreshCalls.some((call) => call.shards.length > 0))
      storageState.blackholed = true
      yield* TestClock.adjust(201)
      assert.isFalse(sharding.hasShardId(shardId))
      storageState.blackholed = false
      yield* advanceUntil(() => storageState.releaseAllCalls.length > 0)
      assert.isFalse(storageState.releaseAllCalls[0].completed)
      yield* advanceUntil(() => sharding.hasShardId(shardId))
      assert.isTrue(storageState.releaseAllCalls[0].completed)
      yield* TestClock.adjust(900)
      assert.deepStrictEqual(warnings, [], "a completed release must cancel its warning monitor")
    }))

  it.effect("warns immediately on release failure and throttles retries to one warning per 30 seconds", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState({ releaseFailures: Infinity })
      const clock = yield* Clock.Clock
      const warnings: Array<{ at: number; output: string }> = []
      const logger = Logger.make((options) => {
        if (options.logLevel !== "Warn") return
        const output = Logger.formatJson.log(options)
        if (/releas/i.test(output)) warnings.push({ at: clock.currentTimeMillisUnsafe(), output })
      })
      const { sharding } = yield* buildSharding(storageState, {
        shardsPerGroup: 1,
        shardLockRefreshInterval: 100
      }).pipe(Effect.provide(Logger.layer([logger])))
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          storageState.releaseFailures = 0
        })
      )
      yield* advanceUntil(() => sharding.hasShardId(allShards[0]))
      storageState.assignSelf = false
      yield* advanceUntil(() => storageState.releaseCalls.length > 0)
      assert.strictEqual(warnings.length, 1, "the first failure must warn immediately")
      assert.include(warnings[0].output, "release failed")
      assert.include(warnings[0].output, "default")
      const firstWarningAt = warnings[0].at
      const firstAttempts = storageState.releaseCalls.length
      yield* TestClock.adjust(firstWarningAt + 29_999 - (yield* Clock.currentTimeMillis))
      assert.strictEqual(warnings.length, 1, "retries inside the throttle window must not warn")
      assert.isAbove(storageState.releaseCalls.length, firstAttempts, "storage retries must continue")
      yield* TestClock.adjust(1)
      assert.strictEqual(warnings.length, 2, "a continuing failure must warn again after 30 seconds")
      assert.strictEqual(warnings[1].at - firstWarningAt, 30_000)
      storageState.releaseFailures = 0
      yield* TestClock.adjust(100)
      const completedAttempts = storageState.releaseCalls.length
      yield* TestClock.adjust(30_000)
      assert.strictEqual(storageState.releaseCalls.length, completedAttempts)
      assert.strictEqual(warnings.length, 2, "warnings must stop after release succeeds")
    }))

  it.effect("waits for entity teardown before handing off without acquiring newly freed shards", () =>
    Effect.gen(function*() {
      const [heldShard, freedShard] = allShards
      const storageState = makeFailoverStorageState({ acquireDenied: [freedShard] })
      const registrationScope = yield* makeOwnedScope
      // Keep assignments unchanged while a peer's lock becomes available.
      const { context, scope, sharding } = yield* buildSharding(storageState, { refreshAssignmentsInterval: 60_000 })
      const gate = yield* makeGate
      yield* advanceUntil(() => sharding.hasShardId(heldShard))
      yield* sharding.registerEntity(
        GatedTeardownEntity,
        Effect.as(Effect.addFinalizer(() => gate.await), GatedTeardownEntity.of({ Activate: () => Effect.void }))
      ).pipe(Effect.provideService(Scope.Scope, registrationScope))
      let entityId = 0
      while (!Equal.equals(sharding.getShardId(EntityId.make(String(entityId)), "default"), heldShard)) {
        entityId++
      }
      const makeClient = yield* GatedTeardownEntity.client.pipe(Effect.provideContext(context))
      yield* makeClient(String(entityId)).Activate()

      const closing = yield* Effect.forkChild(Scope.close(scope, Exit.void))
      yield* advanceUntil(() => storageState.runner === undefined)
      const acquires = storageState.acquireCalls.length
      storageState.acquireDenied.length = 0
      yield* TestClock.adjust(3000)
      assert.isUndefined(closing.pollUnsafe())
      assert.isUndefined(storageState.runner)
      assert.deepStrictEqual(storageState.acquireCalls.slice(acquires), [])
      assert.deepStrictEqual(storageState.releaseCalls, [])
      assert.deepStrictEqual(storageState.releaseAllCalls, [])

      yield* gate.open
      yield* advanceUntil(() => closing.pollUnsafe() !== undefined)
      assert.deepStrictEqual(closing.pollUnsafe(), Exit.void)
      assert.deepStrictEqual(storageState.releaseCalls, [heldShard])
      assert.deepStrictEqual(storageState.releaseAllCalls.map((call) => call.releases), [1])
    }).pipe(Effect.scoped))

  it.effect("finishes a persisted reply that completes while shutdown starts", () =>
    Effect.gen(function*() {
      // Shutdown unregisters the runner before handing its shards off, with
      // the sharding scope already closing.
      const unregisterGate = yield* makeGate
      const storageState = makeFailoverStorageState({ unregisterGate })
      // Closed only once the test passes: a stuck handler would block it.
      const registrationScope = yield* Scope.make()
      const { context, scope, sharding } = yield* buildSharding(storageState)
      const gate = yield* makeGate
      let entered = false
      yield* advanceUntil(() => allShards.every((shardId) => sharding.hasShardId(shardId)))
      yield* sharding.registerEntity(
        PersistedHold,
        Effect.succeed(PersistedHold.of({
          Hold: () =>
            Effect.andThen(
              Effect.sync(() => {
                entered = true
              }),
              gate.await
            )
        }))
      ).pipe(Effect.provideService(Scope.Scope, registrationScope))
      const makeClient = yield* PersistedHold.client.pipe(Effect.provideContext(context))
      yield* makeClient("1").Hold(void 0, { discard: true })
      yield* advanceUntil(() => entered)

      // The handler finishes while the runner unregisters.
      const closing = yield* Effect.forkChild(Scope.close(scope, Exit.void))
      yield* TestClock.adjust(10)
      yield* gate.open
      yield* TestClock.adjust(10)
      yield* unregisterGate.open
      yield* advanceUntil(() => closing.pollUnsafe() !== undefined)
      assert.deepStrictEqual(closing.pollUnsafe(), Exit.void)
      // The entity stopped, so its shard was handed off through the per-shard
      // release rather than left to the final release of every lock.
      const shardId = sharding.getShardId(EntityId.make("1"), "default")
      assert.isTrue(storageState.releaseCalls.some((released) => Equal.equals(released, shardId)))
      yield* Scope.close(registrationScope, Exit.void)
    }).pipe(Effect.scoped))

  it.effect("does not record a release cancelled when shutdown handoff times out", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState({ releaseFailures: Infinity })
      const registry: Metric.MetricRegistry = new Map()
      const config = { shardsPerGroup: 1, shardLockRefreshInterval: 100 }
      const { scope, sharding } = yield* buildSharding(storageState, config).pipe(
        Effect.provideService(Metric.MetricRegistry, registry)
      )
      yield* advanceUntil(() => sharding.hasShardId(allShards[0]))
      const releaseDuration = () =>
        ClusterMetrics.shardReleaseDuration.valueUnsafe(Context.make(Metric.MetricRegistry, registry))
      const before = releaseDuration()

      const closing = yield* Effect.forkChild(Scope.close(scope, Exit.void))
      yield* advanceUntil(() => storageState.releaseCalls.length > 0)
      yield* TestClock.adjust(50)
      assert.isAbove(storageState.releaseCalls.length, 1, "storage retries must continue")
      const retryingReleasing = releasingGauge(registry)
      yield* advanceUntil(() => closing.pollUnsafe() !== undefined)

      assert.deepStrictEqual(closing.pollUnsafe(), Exit.void)
      assert.strictEqual(releaseDuration().count, before.count)
      assert.strictEqual(retryingReleasing, 1n, "retries must not count a shard twice")

      // A new runner in the same registry must not report the abandoned release.
      storageState.releaseFailures = 0
      const restarted = yield* buildSharding(storageState, config).pipe(
        Effect.provideService(Metric.MetricRegistry, registry)
      )
      assert.strictEqual(releasingGauge(registry), 0n, "initialization must publish zero")
      yield* advanceUntil(() => restarted.sharding.hasShardId(allShards[0]))
      assert.strictEqual(releasingGauge(registry), 0n)
    }))

  it.effect("waits for singleton teardown before handing off their shards", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState()
      const registry: Metric.MetricRegistry = new Map()
      const registrationScope = yield* makeOwnedScope
      const runningRegistrationScope = yield* makeOwnedScope
      const { scope, sharding } = yield* buildSharding(storageState).pipe(
        Effect.provideService(Metric.MetricRegistry, registry)
      )
      const gate = yield* makeGate
      yield* advanceUntil(() => allShards.every((shardId) => sharding.hasShardId(shardId)))
      assert.strictEqual(releasingGauge(registry), 0n, "initialization must publish zero")
      const started = Latch.makeUnsafe()
      const stopping = Latch.makeUnsafe()
      yield* sharding.registerSingleton(
        "ClosingSingleton",
        Effect.andThen(started.open, Effect.addFinalizer(() => Effect.andThen(stopping.open, gate.await)))
      ).pipe(Effect.provideService(Scope.Scope, registrationScope))
      yield* started.await
      // a singleton on the other shard that is still running at shutdown
      const closingShard = sharding.getShardId(EntityId.make("ClosingSingleton"), "default")
      let runningName = 0
      while (Equal.equals(sharding.getShardId(EntityId.make(`Running${runningName}`), "default"), closingShard)) {
        runningName++
      }
      const runningStarted = Latch.makeUnsafe()
      yield* sharding.registerSingleton(
        `Running${runningName}`,
        Effect.andThen(runningStarted.open, Effect.addFinalizer(() => gate.await))
      ).pipe(Effect.provideService(Scope.Scope, runningRegistrationScope))
      yield* runningStarted.await
      yield* Effect.forkChild(Scope.close(registrationScope, Exit.void))
      yield* stopping.await

      const closing = yield* Effect.forkChild(Scope.close(scope, Exit.void))
      yield* TestClock.adjust(100)
      assert.isUndefined(closing.pollUnsafe())
      assert.deepStrictEqual(storageState.releaseCalls, [])
      assert.deepStrictEqual(storageState.releaseAllCalls, [])
      const tearingDownReleasing = releasingGauge(registry)

      // Each shard's first release attempt fails and is retried.
      storageState.releaseFailures = 2
      yield* gate.open
      yield* advanceUntil(() => storageState.releaseCalls.length >= 2)
      const retryingReleasing = releasingGauge(registry)
      yield* advanceUntil(() => closing.pollUnsafe() !== undefined)
      assert.deepStrictEqual(closing.pollUnsafe(), Exit.void)
      assert.deepStrictEqual(storageState.releaseAllCalls.map((call) => call.releases), [4])
      assert.strictEqual(tearingDownReleasing, 2n, "each shard waiting for teardown must count once")
      assert.strictEqual(retryingReleasing, 2n, "retries must not count a shard twice")
      assert.strictEqual(releasingGauge(registry), 0n, "a completed handoff must publish zero")
    }).pipe(Effect.scoped))

  it.effect("closes a singleton registration whose singleton registered another singleton", () =>
    Effect.gen(function*() {
      // Await cleanup, but keep a regressed uninterruptible teardown bounded.
      const makeDetachedScope = Effect.acquireRelease(
        Scope.make(),
        (scope) =>
          Effect.gen(function*() {
            const closing = yield* Effect.forkDetach(Scope.close(scope, Exit.void))
            yield* advanceUntil(() => closing.pollUnsafe() !== undefined)
            assert.deepStrictEqual(closing.pollUnsafe(), Exit.void)
          })
      )
      const storageState = makeFailoverStorageState()
      const shardingScope = yield* makeDetachedScope
      const registrationScope = yield* makeDetachedScope
      const { sharding } = yield* buildSharding(storageState, undefined, shardingScope)
      yield* advanceUntil(() => allShards.every((shardId) => sharding.hasShardId(shardId)))
      const childRegistered = Latch.makeUnsafe()
      yield* sharding.registerSingleton(
        "ParentSingleton",
        Effect.andThen(sharding.registerSingleton("ChildSingleton", Effect.never), childRegistered.open)
      ).pipe(Effect.provideService(Scope.Scope, registrationScope))
      yield* childRegistered.await

      const closing = yield* Effect.forkDetach(Scope.close(registrationScope, Exit.void))
      yield* advanceUntil(() => closing.pollUnsafe() !== undefined)
      assert.deepStrictEqual(closing.pollUnsafe(), Exit.void)
    }).pipe(Effect.scoped))
})

describe("Sharding assignment settling", { concurrent: false }, () => {
  const shards = globalThis.Array.from({ length: 24 }, (_, i) => ShardId.make("default", i + 1))
  const joiner = (port: number) =>
    Runner.make({ address: RunnerAddress.make("localhost", port), groups: ["default"], weight: 1 })

  // Builds the local runner over `membership`, recording each change to the
  // shards it owns with the time since the runner started.
  const buildRunner = Effect.fnUntraced(function*(
    membership: Array<readonly [Runner.Runner, boolean]>,
    config?: Partial<ShardingConfig.ShardingConfig["Service"]>
  ) {
    const context = yield* Layer.build(
      Sharding.layer.pipe(
        Layer.provide(Layer.succeed(RunnerStorage.RunnerStorage, makeMembershipStorage(membership))),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(Runners.layerNoop),
        Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
        Layer.provide(ShardingConfig.layer({
          runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
          shardsPerGroup: shards.length,
          entityTerminationTimeout: 0,
          refreshAssignmentsInterval: 100,
          ...config
        }))
      )
    )
    const sharding = Context.get(context, Sharding.Sharding)
    const clock = yield* Clock.Clock
    const startedAt = clock.currentTimeMillisUnsafe()
    const history: Array<{ readonly at: number; readonly owned: string }> = []
    let current = ""
    const advance = Effect.fnUntraced(function*(millis: number) {
      for (let elapsed = 0; elapsed < millis; elapsed += 10) {
        yield* TestClock.adjust(10)
        const owned = shards.filter((shardId) => sharding.hasShardId(shardId)).join()
        if (owned === current) continue
        current = owned
        history.push({ at: clock.currentTimeMillisUnsafe() - startedAt, owned })
      }
    })
    return { history, advance }
  })

  // One runner, then three more joining 1.5 seconds apart.
  const staggeredJoins = Effect.fnUntraced(function*(config: Partial<ShardingConfig.ShardingConfig["Service"]>) {
    const membership: Array<readonly [Runner.Runner, boolean]> = []
    const { advance, history } = yield* buildRunner(membership, config)
    yield* advance(1500)
    for (const port of [5001, 5002, 5003]) {
      membership.push([joiner(port), true])
      yield* advance(1500)
    }
    yield* advance(10_000)
    return history
  }, Effect.scoped)

  it.effect("hands each shard off once for a bounded burst of staggered joins", () =>
    Effect.gen(function*() {
      // By default, each join publishes a new assignment within its interval.
      const immediate = yield* staggeredJoins({})
      assert.deepStrictEqual(immediate.map(({ at }) => Math.floor(at / 1500)), [0, 1, 2, 3])

      const settled = yield* staggeredJoins({ runnerJoinDebounce: 2000 })
      assert.deepStrictEqual(settled.map(({ owned }) => owned), [immediate[0].owned, immediate[3].owned])
      // the initial assignment does not wait for the window
      assert.isBelow(settled[0].at, 1500)
      // the last join at 4500ms is published once membership is quiet for the window
      assert.isAtLeast(settled[1].at, 6500)
      assert.isBelow(settled[1].at, 7000)
    }), 30_000)

  it.effect("publishes continuous joins within four settle windows", () =>
    Effect.gen(function*() {
      const membership: Array<readonly [Runner.Runner, boolean]> = []
      const { advance, history } = yield* buildRunner(membership, { runnerJoinDebounce: 2000 })
      yield* advance(1000)
      // joins every 1000ms never leave membership quiet for the window
      for (let port = 5001; port <= 5012; port++) {
        membership.push([joiner(port), true])
        yield* advance(1000)
      }
      assert.isAtLeast(history.length, 2)
      // the first join at 1000ms is published by 1000 + 4 * 2000ms
      assert.isAtLeast(history[1].at, 9000)
      assert.isBelow(history[1].at, 9500)
    }).pipe(Effect.scoped))

  it.effect("publishes unhealthy runners immediately while joins are settling", () =>
    Effect.gen(function*() {
      const existing = joiner(5001)
      const membership: Array<readonly [Runner.Runner, boolean]> = [[existing, true]]
      const { advance, history } = yield* buildRunner(membership, { runnerJoinDebounce: 2000 })
      yield* advance(1000)
      // a runner starting in an existing cluster takes its share without waiting
      assert.strictEqual(history.length, 1)
      assert.notStrictEqual(history[0].owned, shards.join())

      membership.push([joiner(5002), true])
      yield* advance(1000)
      assert.strictEqual(history.length, 1, "the join should still be settling")

      membership[0] = [existing, false]
      yield* advance(500)
      assert.strictEqual(history.length, 2, "the unhealthy runner should be published immediately")
    }).pipe(Effect.scoped))

  // Runners A (1234) and Z (1240, assigned no shard groups) start together,
  // then B, C and D join 1.5 seconds apart. Every runner shares membership and
  // shard locks, A to D register a singleton on each shard, and Z routes a
  // volatile request to an entity on each shard.
  const staggeredCluster = Effect.fnUntraced(function*(options: {
    readonly refreshAssignmentsInterval?: number
    // Fail A's next membership read once C has joined, while joins are pending.
    readonly failRefreshDuringJoins?: boolean
    // Delay B's next membership read after D has joined by 2.5 seconds, then
    // fail it, so B's view is stale while A publishes.
    readonly stallJoinerRefresh?: boolean
    // Delay B's first acquisition by 7.6 seconds, so it completes after A
    // publishes and while B has C and D pending.
    readonly slowJoinerAcquire?: boolean
  }) {
    const cluster = makeSharedCluster()
    if (options.slowJoinerAcquire) {
      cluster.acquireDelays.set(1235, 7600)
    }
    // The ports Z routed each shard to, in order
    const routes = new Map<string, Array<number>>()
    // The ports each shard's singleton started on, in order
    const executions = new Map<string, Array<number>>()
    // The port each shard's singleton is running on
    const running = new Map<string, number>()
    const scope = yield* Scope.make()
    const startRunner = (
      port: number,
      config?: Partial<ShardingConfig.ShardingConfig["Service"]>,
      runners: typeof Runners.layerNoop = Runners.layerNoop
    ) =>
      Layer.buildWithScope(
        Sharding.layer.pipe(
          Layer.provide(Layer.succeed(RunnerStorage.RunnerStorage, makeSharedClusterStorage(cluster, port))),
          Layer.provide(RunnerHealth.layerNoop),
          Layer.provide(runners),
          Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
          Layer.provide(ShardingConfig.layer({
            runnerAddress: Option.some(RunnerAddress.make("localhost", port)),
            shardsPerGroup: 24,
            entityTerminationTimeout: 0,
            refreshAssignmentsInterval: options.refreshAssignmentsInterval ?? 100,
            sendRetryInterval: 100,
            runnerJoinDebounce: 2000,
            ...config
          }))
        ),
        scope
      )
    const runnerA = yield* startRunner(1234)
    const observer = yield* startRunner(
      1240,
      { assignedShardGroups: [] },
      Layer.effect(
        Runners.Runners,
        Runners.make({
          codecFor: Schema.toCodecJson as RpcSerialization.CodecFor,
          // Records each routing attempt, then fails it so the request retries.
          send: ({ address, message }) =>
            Effect.suspend(() => {
              const shard = message.envelope.address.shardId.toString()
              const history = routes.get(shard) ?? []
              if (history[history.length - 1] !== address.port) history.push(address.port)
              routes.set(shard, history)
              return Effect.fail(new ClusterError.EntityNotAssignedToRunner({ address: message.envelope.address }))
            }),
          notify: () => Effect.void,
          ping: () => Effect.void,
          onRunnerUnavailable: () => Effect.void
        })
      ).pipe(Layer.provide(Snowflake.layerGenerator))
    )
    const observerSharding = Context.get(observer, Sharding.Sharding)
    const makeClient = yield* TestEntity.client.pipe(Effect.provideService(Sharding.Sharding, observerSharding))
    const routedShards = new Set<string>()
    for (let id = 1; routedShards.size < 24; id++) {
      const shard = observerSharding.getShardId(EntityId.make(String(id)), "default").toString()
      if (routedShards.has(shard)) continue
      routedShards.add(shard)
      yield* Effect.forkIn(makeClient(String(id)).GetUserVolatile({ id }), scope)
    }
    const singletons = new Map<string, string>()
    for (let id = 1; singletons.size < 24; id++) {
      const shard = observerSharding.getShardId(EntityId.make(`singleton-${id}`), "default").toString()
      if (!singletons.has(shard)) singletons.set(shard, `singleton-${id}`)
    }
    const registerSingletons = Effect.fnUntraced(function*(context: Context.Context<Sharding.Sharding>, port: number) {
      for (const [shard, name] of singletons) {
        yield* Context.get(context, Sharding.Sharding).registerSingleton(
          name,
          Effect.sync(() => {
            const history = executions.get(shard) ?? []
            if (history[history.length - 1] !== port) history.push(port)
            executions.set(shard, history)
            running.set(shard, port)
          }).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                if (running.get(shard) === port) running.delete(shard)
              })
            )
          )
        ).pipe(Effect.provideService(Scope.Scope, scope))
      }
    })
    yield* registerSingletons(runnerA, 1234)

    yield* TestClock.adjust(1500)
    for (const port of [1235, 1236, 1237]) {
      yield* registerSingletons(yield* startRunner(port), port)
      if (port === 1236 && options.failRefreshDuringJoins) {
        yield* TestClock.adjust(200)
        cluster.failGetRunners.add(1234)
        yield* TestClock.adjust(1300)
      } else {
        yield* TestClock.adjust(1500)
      }
    }
    if (options.stallJoinerRefresh) {
      cluster.stallGetRunners.set(1235, 2500)
    }
    for (let i = 0; i < 150; i++) {
      yield* TestClock.adjust(100)
    }

    // Exclude the handoffs made while shutting down, which waits on the test clock
    const result = {
      owners: structuredClone(cluster.owners),
      locks: new Map(globalThis.Array.from(cluster.locks, ([shard, owner]) => [shard, owner.port])),
      routes: structuredClone(routes),
      executions: structuredClone(executions),
      running: structuredClone(running)
    }
    const closing = yield* Effect.forkChild(Scope.close(scope, Exit.void))
    while (closing.pollUnsafe() === undefined) {
      yield* TestClock.adjust(100)
    }
    return result
  })

  // Every shard is locked by at most two runners in turn, its singleton runs
  // on at most two runners in turn, and Z changes the runner it routes each
  // shard to at most once. Each shard ends up locked by the runner Z routes it
  // to, with its singleton running there. `lockChurn` allows a runner to lock a
  // shard briefly without running anything on it.
  const assertSingleHandoffs = (result: {
    readonly owners: ReadonlyMap<string, ReadonlyArray<number>>
    readonly locks: ReadonlyMap<string, number>
    readonly routes: ReadonlyMap<string, ReadonlyArray<number>>
    readonly executions: ReadonlyMap<string, ReadonlyArray<number>>
    readonly running: ReadonlyMap<string, number>
  }, options?: { readonly lockChurn?: boolean }) => {
    assert.strictEqual(result.owners.size, 24)
    assert.isTrue([...result.owners.values()].some((owners) => owners.length === 2), "no shard was handed off")
    if (!options?.lockChurn) {
      for (const [shard, owners] of result.owners) {
        assert.isAtMost(owners.length, 2, `shard ${shard} was locked by ${owners.join(" -> ")}`)
      }
    }
    assert.strictEqual(result.executions.size, 24)
    for (const [shard, executions] of result.executions) {
      assert.isAtMost(executions.length, 2, `shard ${shard} ran its singleton on ${executions.join(" -> ")}`)
      assert.strictEqual(result.running.get(shard), result.locks.get(shard), `shard ${shard} runs its singleton`)
    }
    assert.strictEqual(result.routes.size, 24)
    assert.isTrue([...result.routes.values()].some((routes) => routes.length === 2), "no shard was rerouted")
    for (const [shard, routes] of result.routes) {
      assert.isAtMost(routes.length, 2, `shard ${shard} was routed to ${routes.join(" -> ")}`)
      const route = routes[routes.length - 1]
      assert.strictEqual(result.locks.get(shard), route, `shard ${shard} is routed to ${route}`)
    }
  }

  it.effect("hands each shard off once across a staggered cluster startup", () =>
    Effect.gen(function*() {
      assertSingleHandoffs(yield* staggeredCluster({ failRefreshDuringJoins: false }))
    }), 30_000)

  it.effect(
    "hands each shard off once when membership refresh fails during pending joins",
    () =>
      Effect.gen(function*() {
        assertSingleHandoffs(yield* staggeredCluster({ failRefreshDuringJoins: true }))
      }),
    30_000
  )

  it.effect("hands each shard off once when runners poll membership out of phase", () =>
    Effect.gen(function*() {
      assertSingleHandoffs(yield* staggeredCluster({ refreshAssignmentsInterval: 3000 }))
    }), 30_000)

  it.effect(
    "hands each shard off once when a joining runner's membership refresh stalls",
    () =>
      Effect.gen(function*() {
        assertSingleHandoffs(yield* staggeredCluster({ stallJoinerRefresh: true }))
      }),
    30_000
  )

  it.effect(
    "runs each singleton on one new runner when a joining runner's acquisition is slow",
    () =>
      Effect.gen(function*() {
        assertSingleHandoffs(
          yield* staggeredCluster({ refreshAssignmentsInterval: 3000, slowJoinerAcquire: true }),
          // B can still lock shards when its slow acquisition completes, but must
          // not run them while joins are pending
          { lockChurn: true }
        )
      }),
    30_000
  )
})

// Runner membership the test controls; the local runner joins on registration.
const makeMembershipStorage = (membership: Array<readonly [Runner.Runner, boolean]>) =>
  RunnerStorage.RunnerStorage.of({
    getRunners: Effect.sync(() => membership.slice()),
    register: (runner) =>
      Effect.sync(() => {
        membership.push([runner, true])
        return MachineId.make(1)
      }),
    unregister: () => Effect.void,
    setRunnerHealth: () => Effect.void,
    acquire: (_address, shards) => Effect.succeed(globalThis.Array.from(shards)),
    refresh: (_address, shards) => Effect.succeed(globalThis.Array.from(shards)),
    release: () => Effect.void,
    releaseAll: () => Effect.void
  })

interface SharedCluster {
  readonly membership: Array<readonly [Runner.Runner, boolean]>
  readonly locks: Map<string, RunnerAddress.RunnerAddress>
  /** The ports of the runners that locked each shard, in order. */
  readonly owners: Map<string, Array<number>>
  /** Ports whose next membership read fails. */
  readonly failGetRunners: Set<number>
  /** Ports whose next membership read fails after the given milliseconds. */
  readonly stallGetRunners: Map<number, number>
  /** Ports whose next acquisition of any shards completes after the given milliseconds. */
  readonly acquireDelays: Map<number, number>
}

const makeSharedCluster = (): SharedCluster => ({
  membership: [],
  locks: new Map(),
  owners: new Map(),
  failGetRunners: new Set(),
  stallGetRunners: new Map(),
  acquireDelays: new Map()
})

// One runner's view of shared membership and exclusive shard locks.
const makeSharedClusterStorage = (cluster: SharedCluster, port: number) => {
  const isOwner = (shardId: ShardId.ShardId, address: RunnerAddress.RunnerAddress) => {
    const owner = cluster.locks.get(shardId.toString())
    return owner !== undefined && Equal.equals(owner, address)
  }
  return RunnerStorage.RunnerStorage.of({
    getRunners: Effect.suspend(() => {
      const failed = Effect.fail(new ClusterError.PersistenceError({ cause: "getRunners failed" }))
      const stall = cluster.stallGetRunners.get(port)
      if (stall !== undefined) {
        cluster.stallGetRunners.delete(port)
        return Effect.delay(failed, stall)
      }
      return cluster.failGetRunners.delete(port) ? failed : Effect.succeed(cluster.membership.slice())
    }),
    register: (runner) =>
      Effect.sync(() => {
        cluster.membership.push([runner, true])
        return MachineId.make(port)
      }),
    unregister: (address) =>
      Effect.sync(() => {
        const index = cluster.membership.findIndex(([runner]) => Equal.equals(runner.address, address))
        if (index >= 0) cluster.membership.splice(index, 1)
      }),
    setRunnerHealth: () => Effect.void,
    acquire: (address, shardIds) => {
      const requested = globalThis.Array.from(shardIds)
      const acquire = Effect.sync(() => {
        const acquired: Array<ShardId.ShardId> = []
        for (const shardId of requested) {
          const key = shardId.toString()
          if (cluster.locks.has(key) && !isOwner(shardId, address)) continue
          cluster.locks.set(key, address)
          const owners = cluster.owners.get(key) ?? []
          if (owners[owners.length - 1] !== address.port) owners.push(address.port)
          cluster.owners.set(key, owners)
          acquired.push(shardId)
        }
        return acquired
      })
      const delay = cluster.acquireDelays.get(port)
      if (delay === undefined || requested.length === 0) return acquire
      cluster.acquireDelays.delete(port)
      return Effect.delay(acquire, delay)
    },
    refresh: (address, shardIds) =>
      Effect.sync(() => globalThis.Array.from(shardIds).filter((shardId) => isOwner(shardId, address))),
    release: (address, shardId) =>
      Effect.sync(() => {
        if (isOwner(shardId, address)) cluster.locks.delete(shardId.toString())
      }),
    releaseAll: (address) =>
      Effect.sync(() => {
        for (const [key, owner] of cluster.locks) {
          if (Equal.equals(owner, address)) cluster.locks.delete(key)
        }
      })
  })
}

interface FailoverStorageState {
  blackholed: boolean
  /** Hang only non-empty refreshes, so the empty liveness probe can succeed. */
  blackholeNonEmptyRefresh: boolean
  assignSelf: boolean
  /** Fail lock acquisition, as when another runner still holds the locks. */
  lockHeldElsewhere: boolean
  otherRunnerHealthy: boolean
  /** Test clock duration `releaseAll` stays in flight for. */
  releaseAllDuration: number
  /** Number of `release` calls that fail before succeeding. */
  releaseFailures: number
  /** Holds `unregister` until opened, when set. */
  unregisterGate: Latch.Latch | undefined
  runner: Runner.Runner | undefined
  /** Shards `acquire` does not grant, as if another runner holds them. */
  readonly acquireDenied: Array<ShardId.ShardId>
  readonly acquireCalls: Array<{
    readonly shards: Array<ShardId.ShardId>
    readonly completedReleaseAlls: number
  }>
  readonly refreshCalls: Array<{
    readonly at: number
    readonly shards: Array<ShardId.ShardId>
  }>
  readonly releaseCalls: Array<ShardId.ShardId>
  readonly releaseAllCalls: Array<{ completed: boolean; readonly releases: number }>
}

const makeFailoverStorageState = (
  overrides?: Partial<FailoverStorageState>
): FailoverStorageState => ({
  blackholed: false,
  blackholeNonEmptyRefresh: false,
  assignSelf: true,
  lockHeldElsewhere: false,
  otherRunnerHealthy: false,
  releaseAllDuration: 0,
  releaseFailures: 0,
  unregisterGate: undefined,
  runner: undefined,
  acquireDenied: [],
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
    unregister: () =>
      Effect.andThen(
        state.unregisterGate?.await ?? Effect.void,
        Effect.sync(() => {
          state.runner = undefined
        })
      ),
    setRunnerHealth: () => Effect.void,
    acquire: (_address, shardIds) =>
      Effect.sync(() => {
        const shards = globalThis.Array.from(shardIds)
        state.acquireCalls.push({
          shards,
          completedReleaseAlls: state.releaseAllCalls.filter((call) => call.completed).length
        })
        return state.lockHeldElsewhere ?
          [] :
          shards.filter((shardId) => !state.acquireDenied.some((denied) => Equal.equals(denied, shardId)))
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
      Effect.suspend(() => {
        state.releaseCalls.push(shardId)
        if (state.releaseFailures > 0) {
          state.releaseFailures--
          return Effect.fail(new ClusterError.PersistenceError({ cause: "release failed" }))
        }
        return Effect.void
      }),
    releaseAll: () =>
      Effect.suspend(() => {
        const call = { completed: false, releases: state.releaseCalls.length }
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

const GracefulHandoffSharding = (storageState: FailoverStorageState) =>
  TestEntityNoState.pipe(
    Layer.provideMerge(Sharding.layer),
    Layer.provide(Layer.effect(
      RunnerStorage.RunnerStorage,
      Effect.map(Clock.Clock, (clock) => makeFailoverStorage(storageState, clock))
    )),
    Layer.provide(RunnerHealth.layerNoop),
    Layer.provideMerge(TestEntityState.layer),
    Layer.provide(Runners.layerNoop),
    Layer.provide([MessageStorage.layerMemory, Snowflake.layerGenerator]),
    Layer.provide(ShardingConfig.layer({
      runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
      shardsPerGroup: 1,
      entityTerminationTimeout: 1000,
      entityMessagePollInterval: 10,
      refreshAssignmentsInterval: 10,
      sendRetryInterval: 10
    }))
  )

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

// Shared across runners, so a restarted runner sees the previous runner's requests.
const makeSharedMemoryStorage = Effect.map(
  Layer.build(MessageStorage.layerMemory.pipe(Layer.provide(ShardingConfig.layerDefaults))),
  (context) => Context.get(context, MessageStorage.MessageStorage)
)

// Persists requests with `tag`, but never reads them back for delivery.
const unreadStorage = (storage: MessageStorage.MessageStorage["Service"], tag: string, saved: Latch.Latch) => {
  const isUnread = (message: Message.Incoming<any>) =>
    message.envelope._tag === "Request" && message.envelope.tag === tag
  return MessageStorage.MessageStorage.of({
    ...storage,
    saveRequest: (message) =>
      Effect.tap(storage.saveRequest(message), () => message.envelope.tag === tag ? saved.open : Effect.void),
    unprocessedMessages: (shardIds, options) =>
      Effect.map(storage.unprocessedMessages(shardIds, options), (messages) => messages.filter((m) => !isUnread(m))),
    unprocessedMessagesById: (ids) =>
      Effect.map(storage.unprocessedMessagesById(ids), (messages) => messages.filter((m) => !isUnread(m)))
  })
}

const RestartSharding = <R>(
  entityLayer: Layer.Layer<never, never, R>,
  storage: MessageStorage.MessageStorage["Service"],
  config?: Partial<ShardingConfig.ShardingConfig["Service"]>
) =>
  entityLayer.pipe(
    Layer.provideMerge(Sharding.layer),
    Layer.provide(RunnerStorage.layerMemory),
    Layer.provide(RunnerHealth.layerNoop),
    Layer.provide(Runners.layerNoop),
    Layer.provide(Layer.succeed(MessageStorage.MessageStorage, storage)),
    Layer.provide(
      ShardingConfig.layer({
        ...testConfigDefaults,
        entityTerminationTimeout: 60_000,
        entityReplyPollInterval: 1,
        sendRetryInterval: 10,
        ...config
      })
    )
  )

const ClosingTarget = Entity.make("ClosingTarget", [
  Rpc.make("Warm").annotate(ClusterSchema.Persisted, false),
  Rpc.make("Child", { payload: { id: Schema.String }, primaryKey: ({ id }) => id, success: Schema.String })
    .annotate(ClusterSchema.Persisted, true)
])

const ClosingTargetLayer = (state: { children: number }) =>
  ClosingTarget.toLayer({
    Warm: () => Effect.void,
    Child: () =>
      Effect.sync(() => {
        state.children++
        return "child"
      })
  })

const ClosingTargetCaller = Entity.make("ClosingTargetCaller", [
  Rpc.make("Call", { payload: { id: Schema.String }, primaryKey: ({ id }) => id, success: Schema.String })
    .annotate(ClusterSchema.Persisted, true)
])

// `Call` is an ordinary durable handler that continues after a `ClosingTarget` request.
const ClosingTargetCallerLayer = (state: { readonly continued: Array<string> }) =>
  ClosingTargetCaller.toLayer(Effect.gen(function*() {
    const target = yield* ClosingTarget.client
    return ClosingTargetCaller.of({
      Call: () =>
        Effect.tap(Effect.orDie(target("1").Child({ id: "child" })), (value) =>
          Effect.sync(() => {
            state.continued.push(value)
          }))
    })
  }))

const entityMailboxSizeMaxSeries = (registry: Metric.MetricRegistry) =>
  Metric.snapshotUnsafe(Context.make(Metric.MetricRegistry, registry))
    .filter((metric) => metric.id === ClusterMetrics.entityMailboxSizeMax.id)
    .map((metric) => [metric.attributes, metric.state])

// Owns every shard, so one entity id can be resident on several shards at once.
// Returns a function sending a `run` request to entity "1" on a given shard.
const makeMailboxMaxManager = Effect.fnUntraced(function*(type: string, handler: Effect.Effect<void>) {
  const run = Rpc.make("run")
  const entity = Entity.make(type, [run])
  const sharding = yield* Sharding.Sharding
  const manager = yield* EntityManager.make(entity, Effect.succeed(entity.of({ run: () => handler })), {
    sharding: { ...sharding, hasShardId: () => true },
    storage: MessageStorage.noop,
    runnerAddress: RunnerAddress.make("localhost", 1234),
    residency: { admitUnsafe: () => true, releaseUnsafe: () => {} },
    abandonUndelivered: () => Effect.void,
    isShardOwned: () => Effect.succeed(true),
    maxIdleTime: Infinity
  })
  return Effect.fnUntraced(function*(shardId: ShardId.ShardId) {
    yield* manager.sendLocal(
      new Message.IncomingRequestLocal<typeof run>({
        envelope: Envelope.makeRequest<typeof run>({
          requestId: yield* sharding.getSnowflake,
          address: EntityAddress.make({ shardId, entityType: EntityType.make(type), entityId: EntityId.make("1") }),
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
})

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

const PendingLockSharding = (storageState: FailoverStorageState) =>
  TestEntityNoState.pipe(
    Layer.provideMerge(Sharding.layer),
    Layer.provide(Layer.effect(
      RunnerStorage.RunnerStorage,
      Effect.map(Clock.Clock, (clock) => makeFailoverStorage(storageState, clock))
    )),
    Layer.provide(RunnerHealth.layerNoop),
    Layer.provideMerge(TestEntityState.layer),
    Layer.provide(Runners.layerNoop),
    Layer.provide(MessageStorage.layerMemory),
    Layer.provide(ShardingConfig.layer({
      runnerAddress: Option.some(RunnerAddress.make("localhost", 1234)),
      shardsPerGroup: 1,
      entityMessagePollInterval: 10,
      refreshAssignmentsInterval: 10,
      sendRetryInterval: 10
    }))
  )

describe("Sharding persisted sends to a shard awaiting its lock", { concurrent: false }, () => {
  it.effect("persists a discard send and delivers it once the shard lock is acquired", () =>
    Effect.gen(function*() {
      const storageState = makeFailoverStorageState({ lockHeldElsewhere: true })
      yield* Effect.gen(function*() {
        const state = yield* TestEntityState
        const sharding = yield* Sharding.Sharding
        const shardId = sharding.getShardId(EntityId.make("1"), "default")
        while (storageState.acquireCalls.length === 0) {
          yield* TestClock.adjust(10)
        }
        const client = (yield* TestEntity.client)("1")
        const send = yield* client.GetUser({ id: 1 }, { discard: true }).pipe(
          Effect.forkChild({ startImmediately: true })
        )
        yield* TestClock.adjust(100)
        assert.deepStrictEqual(send.pollUnsafe(), Exit.void, "a discard send returns once persisted")
        assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 0, "delivery must wait for the shard lock")

        storageState.lockHeldElsewhere = false
        while (!sharding.hasShardId(shardId)) {
          yield* TestClock.adjust(10)
        }
        yield* sharding.pollStorage
        yield* TestClock.adjust(10)
        assert.strictEqual(Queue.sizeUnsafe(state.envelopes), 1)
      }).pipe(Effect.provide(PendingLockSharding(storageState)), Effect.scoped)
    }))
})
