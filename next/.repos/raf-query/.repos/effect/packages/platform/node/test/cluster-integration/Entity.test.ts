import { assert, describe, it } from "@effect/vitest"
import { Cause, Clock, Effect, Exit, Fiber, Latch, Layer, PrimaryKey, Schema, Scope } from "effect"
import { ClusterSchema, Entity, EntityResource, Singleton } from "effect/cluster"
import { Rpc } from "effect/rpc"
import { type Backend, type ClusterRunner, make } from "./harness.ts"

class Request extends Schema.Class<Request>("ClusterEntityRequest")({
  id: Schema.String,
  sequence: Schema.Number
}) {
  [PrimaryKey.symbol]() {
    return this.id
  }
}

const StateReply = Schema.Struct({
  generation: Schema.Number,
  runner: Schema.String,
  value: Schema.Number
})

const StateEntity = Entity.make("ClusterIntegrationState", [
  Rpc.make("Increment", {
    payload: Request,
    success: StateReply
  }),
  Rpc.make("Ordered", {
    payload: Request,
    success: Schema.Number
  })
]).annotateRpcs(ClusterSchema.Persisted, true)

let orderGate = Latch.makeUnsafe(true)
let orderEntered = Latch.makeUnsafe()
let order: Array<number> = []
const generations = new Map<string, number>()

const addressString = (address: { readonly host: string; readonly port: number }) => `${address.host}:${address.port}`

const StateEntityLayer = StateEntity.toLayer(
  Effect.gen(function*() {
    const address = yield* Entity.CurrentAddress
    const runner = yield* Entity.CurrentRunnerAddress
    const entityId = String(address.entityId)
    const generation = (generations.get(entityId) ?? 0) + 1
    generations.set(entityId, generation)
    let value = 0
    return {
      Increment: () =>
        Effect.sync(() => ({
          generation,
          runner: addressString(runner),
          value: ++value
        })),
      Ordered: Effect.fnUntraced(function*({ payload }) {
        order.push(payload.sequence)
        if (payload.sequence === 1) {
          orderEntered.openUnsafe()
          yield* orderGate.await
        }
        return payload.sequence
      })
    }
  }),
  { maxIdleTime: "1 second" }
)

const MailboxEntity = Entity.make("ClusterIntegrationMailbox", [
  Rpc.make("Hold", {
    payload: Request,
    success: Schema.Number
  })
])

let mailboxGate = Latch.makeUnsafe(true)
let mailboxEntered = Latch.makeUnsafe()

const MailboxEntityLayer = MailboxEntity.toLayer({
  Hold: Effect.fnUntraced(function*({ payload }) {
    mailboxEntered.openUnsafe()
    yield* mailboxGate.await
    return payload.sequence
  })
}, { mailboxCapacity: 1 })

const GroupEntity = Entity.make("ClusterIntegrationSpecialGroup", [
  Rpc.make("Runner", { success: Schema.String })
]).annotate(ClusterSchema.ShardGroup, () => "special")

const GroupEntityLayer = GroupEntity.toLayer(Effect.gen(function*() {
  const runner = yield* Entity.CurrentRunnerAddress
  return { Runner: () => Effect.succeed(addressString(runner)) }
}))

const ResourceEntity = Entity.make("ClusterIntegrationResource", [
  Rpc.make("Get", { success: Schema.Number }),
  Rpc.make("Close", { success: Schema.Void })
])

const resourceState = { acquired: 0, released: 0 }

const ResourceEntityLayer = ResourceEntity.toLayer(Effect.gen(function*() {
  const resource = yield* EntityResource.make({
    acquire: Effect.gen(function*() {
      const closeScope = yield* EntityResource.CloseScope
      return yield* Effect.acquireRelease(
        Effect.sync(() => ++resourceState.acquired),
        () => Effect.sync(() => resourceState.released++)
      ).pipe(Scope.provide(closeScope))
    })
  })
  return {
    Close: () => resource.close,
    Get: () => Effect.scoped(resource.get)
  }
}))

const RegistrationEntity = Entity.make("ClusterIntegrationRegistration", [
  Rpc.make("Runner", { success: Schema.String }).annotate(ClusterSchema.Persisted, true)
])

const RegistrationEntityLayer = RegistrationEntity.toLayer(Effect.gen(function*() {
  const runner = yield* Entity.CurrentRunnerAddress
  return { Runner: () => Effect.succeed(addressString(runner)) }
}))

const StandardEntities = Layer.mergeAll(StateEntityLayer, MailboxEntityLayer, ResourceEntityLayer)

const resetOrder = () => {
  orderGate = Latch.makeUnsafe()
  orderEntered = Latch.makeUnsafe()
  order = []
}

const resetMailbox = () => {
  mailboxGate = Latch.makeUnsafe()
  mailboxEntered = Latch.makeUnsafe()
}

const findIdsByRunner = Effect.fnUntraced(function*(
  cluster: Effect.Success<ReturnType<typeof make>>,
  runners: ReadonlyArray<ClusterRunner>
) {
  const found = new Map<ClusterRunner, string>()
  for (let index = 0; index < 2_000 && found.size < runners.length; index++) {
    const id = `entity-${index}`
    const owner = yield* cluster.ownerOfEntity(StateEntity, id)
    if (owner && runners.includes(owner) && !found.has(owner)) found.set(owner, id)
  }
  assert.strictEqual(found.size, runners.length)
  return found
})

describe("cluster entity integration", () => {
  for (const backend of ["pg", "mysql"] satisfies ReadonlyArray<Backend>) {
    it.live(`${backend}: interrupts an unroutable reply during runner shutdown without hanging teardown`, () =>
      Effect.gen(function*() {
        const finalizerEntered = Latch.makeUnsafe()
        const sendReply = Latch.makeUnsafe()
        let requestExit: Exit.Exit<void, unknown> | undefined

        const Receiver = Entity.make("ClusterIntegrationShutdownReplyReceiver", [
          Rpc.make("Ping").annotate(ClusterSchema.Persisted, true)
        ])
        const Sender = Entity.make("ClusterIntegrationShutdownReplySender", [
          Rpc.make("Arm").annotate(ClusterSchema.Persisted, false)
        ])
        const entities = Layer.merge(
          Receiver.toLayer({ Ping: () => Effect.void }),
          Sender.toLayer(Effect.gen(function*() {
            const receiver = yield* Receiver.client
            yield* Effect.addFinalizer(() =>
              Effect.uninterruptible(Effect.gen(function*() {
                finalizerEntered.openUnsafe()
                yield* sendReply.await
                requestExit = yield* receiver("unroutable").Ping().pipe(Effect.exit)
              }))
            )
            return { Arm: () => Effect.void }
          }))
        )
        const cluster = yield* make({ backend, entities })
        const [runner] = yield* cluster.start(1, { assignedShardGroups: ["default"] })
        yield* cluster.waitForStableAssignments()
        const sender = yield* cluster.getClient(Sender)
        yield* sender("sender").Arm()

        const stopping = yield* cluster.stop(runner).pipe(Effect.forkChild({ startImmediately: true }))
        yield* cluster.waitUntil(
          "The shutdown reply finalizer did not start",
          Effect.as(finalizerEntered.await, true)
        )
        sendReply.openUnsafe()
        yield* Fiber.join(stopping)

        // The request is durable, so the caller is interrupted rather than
        // failed: the send is not an error, this runner just cannot observe
        // the reply.
        assert.isDefined(requestExit)
        assert(Exit.isFailure(requestExit!))
        assert(Cause.hasInterruptsOnly(requestExit!.cause))
      }))

    for (const persisted of [false, true] as const) {
      for (const preemptiveShutdown of [false, true] as const) {
        it.live(
          `${backend}: sends an outgoing discard from a shutdown finalizer without deadlocking (persisted=${persisted}, preemptive=${preemptiveShutdown})`,
          () =>
            Effect.gen(function*() {
              const finalizerEntered = Latch.makeUnsafe()
              const sendDiscard = Latch.makeUnsafe()
              let discardExit: Exit.Exit<void, unknown> | undefined

              const Receiver = Entity.make("ClusterIntegrationShutdownDiscardReceiver", [
                Rpc.make("Ping").annotate(ClusterSchema.Persisted, persisted)
              ])
              const Sender = Entity.make("ClusterIntegrationShutdownDiscardSender", [
                Rpc.make("Arm").annotate(ClusterSchema.Persisted, false)
              ])
              const entities = Layer.merge(
                Receiver.toLayer({ Ping: () => Effect.void }),
                Sender.toLayer(Effect.gen(function*() {
                  const receiver = yield* Receiver.client
                  yield* Effect.addFinalizer(() =>
                    Effect.uninterruptible(Effect.gen(function*() {
                      finalizerEntered.openUnsafe()
                      yield* sendDiscard.await
                      discardExit = yield* receiver("unroutable").Ping(void 0, { discard: true }).pipe(Effect.exit)
                    }))
                  )
                  return { Arm: () => Effect.void }
                }))
              )
              const cluster = yield* make({
                backend,
                config: { preemptiveShutdown },
                entities
              })
              const [runner] = yield* cluster.start(1, { assignedShardGroups: ["default"] })
              yield* cluster.waitForStableAssignments()
              const sender = yield* cluster.getClient(Sender)
              yield* sender("sender").Arm()

              const stopping = yield* cluster.stop(runner).pipe(Effect.forkChild({ startImmediately: true }))
              yield* cluster.waitUntil(
                "The shutdown discard finalizer did not start",
                Effect.as(finalizerEntered.await, true)
              )
              sendDiscard.openUnsafe()
              yield* Fiber.join(stopping)

              assert.isDefined(discardExit)
              assert(Exit.isSuccess(discardExit!))
            })
        )
      }
    }

    it.live(`${backend}: rebuilds an entity after a fatal defect and replays in-flight requests`, () =>
      Effect.gen(function*() {
        const firstAttemptEntered = Latch.makeUnsafe()
        const replayEntered = Latch.makeUnsafe()
        const replayGate = Latch.makeUnsafe()
        const replayCompleted = Latch.makeUnsafe()
        let builds = 0
        let replayAttempts = 0

        const ReplayEntity = Entity.make("ClusterIntegrationFatalReplay", [
          Rpc.make("Hold").annotate(ClusterSchema.Persisted, true),
          Rpc.make("Crash", { success: Schema.Number }).annotate(ClusterSchema.Persisted, true)
        ])
        const ReplayEntityLayer = ReplayEntity.toLayer(Effect.sync(() => {
          const generation = ++builds
          return ReplayEntity.of({
            Crash: () => generation === 1 ? Effect.die("fatal replay defect") : Effect.succeed(generation),
            Hold: () =>
              Rpc.fork(Effect.gen(function*() {
                replayAttempts++
                if (replayAttempts === 1) {
                  firstAttemptEntered.openUnsafe()
                } else {
                  replayEntered.openUnsafe()
                }
                yield* replayGate.await
                replayCompleted.openUnsafe()
              }))
          })
        }))
        const cluster = yield* make({ backend, entities: ReplayEntityLayer })
        yield* cluster.start(1)
        yield* cluster.waitForStableAssignments()
        const client = yield* cluster.getClient(ReplayEntity)

        const held = yield* client("replay").Hold().pipe(Effect.forkChild({ startImmediately: true }))
        yield* cluster.waitUntil(
          "The in-flight request did not start before the defect",
          Effect.as(firstAttemptEntered.await, true)
        )
        const generation = yield* client("replay").Crash()
        yield* cluster.waitUntil(
          "The in-flight request was not replayed after the defect",
          Effect.as(replayEntered.await, true)
        )
        replayGate.openUnsafe()
        yield* cluster.waitUntil(
          "The replayed request did not complete",
          Effect.as(replayCompleted.await, true)
        )
        yield* Fiber.join(held)

        assert.strictEqual(generation, 2)
        assert.strictEqual(builds, 2)
        assert.strictEqual(replayAttempts, 2)
      }))

    it.live(`${backend}: force-interrupts a stuck handler after the graceful termination timeout`, () =>
      Effect.gen(function*() {
        const handlerEntered = Latch.makeUnsafe()
        const handlerInterrupted = Latch.makeUnsafe()
        let attempts = 0
        let block = true

        const StuckEntity = Entity.make("ClusterIntegrationStuckReassignment", [
          Rpc.make("Run", { success: Schema.Number }).annotate(ClusterSchema.Persisted, false)
        ])
        const StuckEntityLayer = StuckEntity.toLayer({
          Run: () =>
            Effect.suspend(() => {
              const attempt = ++attempts
              if (!block) return Effect.succeed(attempt)
              handlerEntered.openUnsafe()
              return Effect.never.pipe(Effect.onInterrupt(() => handlerInterrupted.open))
            })
        })
        const cluster = yield* make({
          backend,
          config: {
            entityTerminationTimeout: 100,
            preemptiveShutdown: false
          },
          entities: StuckEntityLayer
        })
        yield* cluster.start(2)
        yield* cluster.waitForStableAssignments()
        const owner = yield* cluster.ownerOfEntity(StuckEntity, "stuck")
        const client = yield* cluster.getClient(StuckEntity)
        const request = yield* client("stuck").Run().pipe(Effect.forkChild({ startImmediately: true }))
        yield* cluster.waitUntil(
          "The stuck handler did not start",
          Effect.as(handlerEntered.await, true)
        )
        block = false

        const stopping = yield* cluster.stop(owner!).pipe(Effect.forkChild({ startImmediately: true }))
        yield* cluster.waitUntil(
          "The stuck handler was not force-interrupted after the graceful timeout",
          Effect.as(handlerInterrupted.await, true)
        )
        yield* Fiber.join(stopping)
        yield* cluster.waitUntil(
          "The stopped runner did not reassign the stuck entity",
          Effect.map(cluster.ownerOfEntity(StuckEntity, "stuck"), (next) => next !== undefined && next !== owner)
        )

        assert.strictEqual(yield* Fiber.join(request), 2)
        assert.strictEqual(attempts, 2)
      }))

    it.live(`${backend}: holds persisted messages until a slow entity layer registers`, () =>
      Effect.gen(function*() {
        const registrationGate = Latch.makeUnsafe()
        const delayedEntities = RegistrationEntityLayer.pipe(
          Layer.provide(Layer.effectDiscard(registrationGate.await))
        )
        const cluster = yield* make({
          backend,
          config: {
            entityMessagePollInterval: 100,
            entityRegistrationTimeout: 1_000,
            sendRetryInterval: 100,
            shardsPerGroup: 4
          },
          entities: RegistrationEntityLayer
        })
        yield* cluster.start(1, { assignedShardGroups: [] })
        const starting = yield* cluster.start(1, { entities: delayedEntities }).pipe(
          Effect.forkChild({ startImmediately: true })
        )
        const client = yield* cluster.getClient(RegistrationEntity)
        const request = yield* client(`${backend}-slow-registration`).Runner().pipe(
          Effect.forkChild({ startImmediately: true })
        )

        yield* cluster.waitUntil(
          "The slow-registration request was not persisted",
          Effect.map(cluster.unprocessedMessageCount, (count) => count === 1)
        )
        const deadline = (yield* Clock.currentTimeMillis) + 1_500
        yield* cluster.waitUntil(
          "The slow-registration hold window did not elapse",
          Effect.map(Clock.currentTimeMillis, (now) => now >= deadline),
          "2 seconds"
        )
        assert.deepStrictEqual(yield* cluster.messageCounts(), {
          failed: 0,
          replied: 0,
          unprocessed: 1
        })

        registrationGate.openUnsafe()
        const [runner] = yield* Fiber.join(starting)
        yield* cluster.waitForEntityOwner(RegistrationEntity, `${backend}-slow-registration`, runner)
        assert.strictEqual(yield* Fiber.join(request), addressString(runner.address))
        assert.deepStrictEqual(yield* cluster.messageCounts(), {
          failed: 0,
          replied: 1,
          unprocessed: 0
        })
      }))

    it.live(`${backend}: defects a durable request whose owner never registers the entity`, () =>
      Effect.gen(function*() {
        const cluster = yield* make({
          backend,
          config: {
            entityMessagePollInterval: 100,
            entityRegistrationTimeout: 500,
            sendRetryInterval: 100,
            shardsPerGroup: 4
          },
          entities: RegistrationEntityLayer
        })
        yield* cluster.start(1, { assignedShardGroups: [] })
        const [runner] = yield* cluster.start(1, { entities: Layer.empty })
        const entityId = `${backend}-missing-registration`
        yield* cluster.waitForEntityOwner(RegistrationEntity, entityId, runner)
        const client = yield* cluster.getClient(RegistrationEntity)
        const request = yield* client(entityId).Runner().pipe(
          Effect.forkChild({ startImmediately: true })
        )

        yield* cluster.waitUntil(
          "The missing entity registration did not produce a stored defect",
          Effect.map(cluster.failedMessageCount, (count) => count === 1)
        )
        const exit = yield* Fiber.await(request)
        assert.isTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          assert.include(Cause.pretty(exit.cause), `Entity type '${RegistrationEntity.type}' not registered`)
        }
        assert.deepStrictEqual(yield* cluster.messageCounts(), {
          failed: 1,
          replied: 0,
          unprocessed: 0
        })
      }))

    it.live(`${backend}: routes by entity id, isolates state, and preserves mailbox order`, () =>
      Effect.gen(function*() {
        generations.clear()
        resetOrder()
        const cluster = yield* make({ backend, entities: StandardEntities })
        const runners = yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()
        const ids = yield* findIdsByRunner(cluster, runners)
        const client = yield* cluster.getClient(StateEntity)

        for (const [runner, id] of ids) {
          const first = yield* client(id).Increment(new Request({ id: `${id}-1`, sequence: 0 }))
          const second = yield* client(id).Increment(new Request({ id: `${id}-2`, sequence: 0 }))
          assert.strictEqual(first.runner, addressString(runner.address))
          assert.strictEqual(second.runner, first.runner)
          assert.strictEqual(first.value, 1)
          assert.strictEqual(second.value, 2)
          assert.isFalse(cluster.clientSharding.hasShardId(yield* cluster.shardOfEntity(StateEntity, id)))
        }

        const orderedId = ids.values().next().value!
        const first = yield* client(orderedId).Ordered(
          new Request({ id: `${backend}-ordered-1`, sequence: 1 })
        ).pipe(Effect.forkChild({ startImmediately: true }))
        yield* cluster.waitUntil("The first ordered request did not start", Effect.as(orderEntered.await, true))
        const second = yield* client(orderedId).Ordered(
          new Request({ id: `${backend}-ordered-2`, sequence: 2 })
        ).pipe(Effect.forkChild({ startImmediately: true }))
        orderGate.openUnsafe()
        assert.strictEqual(yield* Fiber.join(first), 1)
        assert.strictEqual(yield* Fiber.join(second), 2)
        assert.deepStrictEqual(order, [1, 2])

        const registrations = (yield* cluster.diagnostics()).registrations
        assert.strictEqual(registrations.length, runners.length)
      }))

    it.live(`${backend}: reports mailbox saturation and revives idle entities with fresh state`, () =>
      Effect.gen(function*() {
        generations.clear()
        resetMailbox()
        const cluster = yield* make({ backend, entities: StandardEntities })
        yield* cluster.start(2)
        yield* cluster.waitForStableAssignments()

        const mailbox = yield* cluster.getClient(MailboxEntity)
        const held = yield* mailbox("full").Hold(
          new Request({ id: `${backend}-held`, sequence: 1 })
        ).pipe(Effect.forkChild({ startImmediately: true }))
        yield* cluster.waitUntil("The mailbox request did not start", Effect.as(mailboxEntered.await, true))
        const error = yield* mailbox("full").Hold(
          new Request({ id: `${backend}-rejected`, sequence: 2 })
        ).pipe(Effect.flip)
        assert.strictEqual(error._tag, "MailboxFull")
        mailboxGate.openUnsafe()
        assert.strictEqual(yield* Fiber.join(held), 1)

        const state = yield* cluster.getClient(StateEntity)
        const first = yield* state("idle").Increment(
          new Request({ id: `${backend}-idle-1`, sequence: 0 })
        )
        const owner = yield* cluster.ownerOfEntity(StateEntity, "idle")
        yield* cluster.waitUntil(
          "The idle entity was not reaped",
          Effect.map(owner!.sharding.activeEntityCount, (count) => count === 0),
          "12 seconds"
        )
        const revived = yield* state("idle").Increment(
          new Request({ id: `${backend}-idle-2`, sequence: 0 })
        )
        assert.strictEqual(first.generation, 1)
        assert.strictEqual(revived.generation, 2)
        assert.strictEqual(revived.value, 1)
      }))

    it.live(`${backend}: rebalances on runner addition, graceful stop, and abrupt death`, () =>
      Effect.gen(function*() {
        resetOrder()
        const cluster = yield* make({ backend, entities: StandardEntities })
        const initial = yield* cluster.start(2)
        yield* cluster.waitForStableAssignments()
        const before = new Map<string, ClusterRunner>()
        for (let index = 0; index < 2_000; index++) {
          const id = `moving-${index}`
          before.set(id, (yield* cluster.ownerOfEntity(StateEntity, id))!)
        }

        const [added] = yield* cluster.start(1)
        assert.strictEqual(added.index, 2)
        yield* cluster.waitForStableAssignments()
        let movedId: string | undefined
        for (const [id, old] of before) {
          if (old !== added && (yield* cluster.ownerOfEntity(StateEntity, id)) === added) {
            movedId = id
            break
          }
        }
        assert.isDefined(movedId)
        const client = yield* cluster.getClient(StateEntity)
        const moved = yield* client(movedId!).Increment(
          new Request({ id: `${backend}-moved`, sequence: 0 })
        )
        assert.strictEqual(moved.runner, addressString(added.address))

        const stopId = (yield* findIdsByRunner(cluster, initial)).get(initial[0])!
        const request = yield* client(stopId).Ordered(
          new Request({ id: `${backend}-stop`, sequence: 1 })
        ).pipe(Effect.forkChild({ startImmediately: true }))
        yield* cluster.waitUntil("The handover request did not start", Effect.as(orderEntered.await, true))
        const stopping = yield* cluster.stop(initial[0]).pipe(Effect.forkChild({ startImmediately: true }))
        yield* cluster.waitUntil(
          "The stopped runner did not hand over its entity",
          Effect.map(cluster.ownerOfEntity(StateEntity, stopId), (owner) => owner !== undefined && owner !== initial[0])
        )
        orderGate.openUnsafe()
        assert.strictEqual(yield* Fiber.join(request), 1)
        yield* Fiber.join(stopping)
        yield* cluster.waitForStableAssignments()

        const killId = `kill-${backend}`
        const killed = yield* cluster.ownerOfEntity(StateEntity, killId)
        yield* cluster.kill(killed!)
        const reply = yield* client(killId).Increment(
          new Request({ id: `${backend}-kill`, sequence: 0 })
        )
        assert.notStrictEqual(reply.runner, addressString(killed!.address))
        yield* cluster.waitForStableAssignments()
        assert.strictEqual((yield* cluster.messageCounts()).unprocessed, 0)
      }))

    it.live(`${backend}: transfers frozen row locks after expiry`, () =>
      Effect.gen(function*() {
        const cluster = yield* make({ backend, entities: StandardEntities, lockMode: "row" })
        yield* cluster.start(2)
        yield* cluster.waitForStableAssignments()
        const id = `frozen-${backend}`
        const oldOwner = yield* cluster.ownerOfEntity(StateEntity, id)
        const shard = yield* cluster.shardOfEntity(StateEntity, id)
        yield* cluster.freeze(oldOwner!)
        yield* cluster.waitUntil(
          "The frozen runner's row lock did not expire",
          Effect.map(cluster.ownerOfEntity(StateEntity, id), (owner) => owner !== undefined && owner !== oldOwner),
          "12 seconds"
        )
        const nextOwner = yield* cluster.ownerOfEntity(StateEntity, id)
        assert.strictEqual(cluster.ownersOfShard(shard).length, 1)
        assert.strictEqual(cluster.ownersOfShard(shard)[0], nextOwner)
        const client = yield* cluster.getClient(StateEntity)
        const reply = yield* client(id).Increment(new Request({ id: `${backend}-freeze`, sequence: 0 }))
        assert.strictEqual(reply.runner, addressString(nextOwner!.address))
        yield* cluster.kill(oldOwner!)
      }))

    it.live(`${backend}: retains frozen advisory locks until the session closes`, () =>
      Effect.gen(function*() {
        const cluster = yield* make({ backend, entities: StandardEntities })
        yield* cluster.start(2)
        yield* cluster.waitForStableAssignments()
        const id = `frozen-advisory-${backend}`
        const oldOwner = yield* cluster.ownerOfEntity(StateEntity, id)
        const shard = yield* cluster.shardOfEntity(StateEntity, id)
        yield* cluster.freeze(oldOwner!)
        const deadline = (yield* Clock.currentTimeMillis) + 3_000
        yield* cluster.waitUntil(
          "The advisory-lock observation window did not elapse",
          Effect.map(Clock.currentTimeMillis, (now) => now >= deadline),
          "5 seconds"
        )
        assert.strictEqual(cluster.ownersOfShard(shard).length, 0)
        assert.deepStrictEqual(cluster.ownersOfShard(shard, true), [oldOwner])
        yield* cluster.kill(oldOwner!)
        yield* cluster.waitUntil(
          "The advisory lock was not handed over after its session closed",
          Effect.map(cluster.ownerOfEntity(StateEntity, id), (owner) => owner !== undefined && owner !== oldOwner)
        )
      }))
  }

  it.live("assigns annotated entities only to runners in their shard group", () =>
    Effect.gen(function*() {
      const entities = Layer.mergeAll(StateEntityLayer, GroupEntityLayer)
      const cluster = yield* make({
        backend: "pg",
        config: { availableShardGroups: ["default", "special"], shardsPerGroup: 30 },
        entities
      })
      const [defaultRunner] = yield* cluster.start(1, { assignedShardGroups: ["default"] })
      const [specialRunner] = yield* cluster.start(1, { assignedShardGroups: ["special"] })
      yield* cluster.waitForStableAssignments()
      const client = yield* cluster.getClient(GroupEntity)
      assert.strictEqual(yield* client("grouped").Runner(), addressString(specialRunner.address))
      assert.strictEqual(yield* cluster.ownerOfEntity(GroupEntity, "grouped"), specialRunner)
      assert.strictEqual(yield* cluster.ownerOfEntity(StateEntity, "default"), defaultRunner)
    }))

  it.live("runs one singleton and migrates it after owner death", () =>
    Effect.gen(function*() {
      const singleton = { active: 0, maxActive: 0, starts: 0 }
      const singletonLayer = Singleton.make(
        "cluster-integration-singleton",
        Effect.acquireRelease(
          Effect.sync(() => {
            singleton.active++
            singleton.starts++
            singleton.maxActive = Math.max(singleton.maxActive, singleton.active)
          }),
          () => Effect.sync(() => singleton.active--)
        )
      )
      const cluster = yield* make({
        backend: "pg",
        entities: Layer.merge(StateEntityLayer, singletonLayer)
      })
      const runners = yield* cluster.start(3)
      yield* cluster.waitForStableAssignments()
      yield* cluster.waitUntil("The singleton did not start", Effect.sync(() => singleton.active === 1))
      const firstOwner = yield* cluster.ownerOfEntity(StateEntity, "cluster-integration-singleton")
      assert.isTrue(runners.includes(firstOwner!))
      yield* cluster.kill(firstOwner!)
      yield* cluster.waitUntil(
        "The singleton did not migrate",
        Effect.sync(() => singleton.starts >= 2 && singleton.active === 1)
      )
      assert.notStrictEqual(
        yield* cluster.ownerOfEntity(StateEntity, "cluster-integration-singleton"),
        firstOwner
      )
      assert.strictEqual(singleton.maxActive, 1)
    }))

  it.live("keeps EntityResource alive during movement and releases it explicitly", () =>
    Effect.gen(function*() {
      resourceState.acquired = 0
      resourceState.released = 0
      const cluster = yield* make({ backend: "pg", entities: ResourceEntityLayer })
      yield* cluster.start(2)
      yield* cluster.waitForStableAssignments()
      const client = yield* cluster.getClient(ResourceEntity)
      assert.strictEqual(yield* client("resource").Get(), 1)
      const owner = yield* cluster.ownerOfEntity(ResourceEntity, "resource")
      yield* cluster.stop(owner!)
      yield* cluster.waitUntil(
        "The resource entity did not move",
        Effect.map(cluster.ownerOfEntity(ResourceEntity, "resource"), (next) => next !== undefined && next !== owner)
      )
      assert.strictEqual(resourceState.released, 0)
      assert.strictEqual(yield* client("resource").Get(), 2)
      yield* client("resource").Close()
      yield* cluster.waitUntil(
        "The entity resource was not released",
        Effect.sync(() => resourceState.released === 1)
      )
    }))

  for (const backend of ["pg", "mysql"] satisfies ReadonlyArray<Backend>) {
    it.live(`${backend}: isolates clusters with different table prefixes`, () =>
      Effect.gen(function*() {
        const first = yield* make({ backend, entities: StateEntityLayer, config: { shardsPerGroup: 30 } })
        const second = yield* make({ backend, entities: StateEntityLayer, config: { shardsPerGroup: 30 } })
        const [firstRunner] = yield* first.start(1)
        const [secondRunner] = yield* second.start(1)
        yield* first.waitForStableAssignments()
        yield* second.waitForStableAssignments()
        assert.notStrictEqual(first.prefix, second.prefix)
        const firstRegistrations = (yield* first.diagnostics()).registrations
        const secondRegistrations = (yield* second.diagnostics()).registrations
        assert.deepStrictEqual(firstRegistrations.map((row) => row.address), [addressString(firstRunner.address)])
        assert.deepStrictEqual(secondRegistrations.map((row) => row.address), [addressString(secondRunner.address)])
        const firstClient = yield* first.getClient(StateEntity)
        const secondClient = yield* second.getClient(StateEntity)
        const firstReply = yield* firstClient("same-id").Increment(
          new Request({ id: `${backend}-prefix-first`, sequence: 0 })
        )
        const secondReply = yield* secondClient("same-id").Increment(
          new Request({ id: `${backend}-prefix-second`, sequence: 0 })
        )
        assert.strictEqual(firstReply.runner, addressString(firstRunner.address))
        assert.strictEqual(secondReply.runner, addressString(secondRunner.address))
      }))
  }
})
