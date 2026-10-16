import { assert, describe, it } from "@effect/vitest"
import { Cause, Clock, Duration, Effect, Exit, Fiber, Latch, Layer, Option, Schema } from "effect"
import { ClusterSchema, ClusterWorkflowEngine, Entity, EntityId, Sharding } from "effect/cluster"
import { PersistedQueue } from "effect/persistence"
import { Rpc } from "effect/rpc"
import { Activity, DurableClock, DurableDeferred, DurableQueue, Workflow, WorkflowEngine } from "effect/workflow"
import { type Backend, type ClusterRunner, make } from "./harness.ts"

const EndToEndWorkflow = Workflow.make("ClusterIntegrationEndToEnd", {
  payload: {
    id: Schema.String,
    value: Schema.Number
  },
  success: Schema.Number,
  idempotencyKey: ({ id }) => id
})

let endToEndGate = Latch.makeUnsafe(true)
let endToEndEntered = Latch.makeUnsafe()
const endToEndRuns = new Map<string, number>()

const EndToEndWorkflowLayer = EndToEndWorkflow.toLayer(({ id, value }) =>
  Activity.make({
    name: "EndToEnd",
    success: Schema.Number,
    execute: Effect.gen(function*() {
      endToEndRuns.set(id, (endToEndRuns.get(id) ?? 0) + 1)
      endToEndEntered.openUnsafe()
      yield* endToEndGate.await
      return value + 1
    })
  })
)

const ReplayGate = DurableDeferred.make("ClusterIntegrationReplayGate", {
  success: Schema.String
})

const ReplayWorkflow = Workflow.make("ClusterIntegrationReplay", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const replayRuns = new Map<string, number>()

const ReplayWorkflowLayer = ReplayWorkflow.toLayer(Effect.fnUntraced(function*({ id }) {
  yield* Activity.make({
    name: "BeforeSuspension",
    execute: Effect.sync(() => replayRuns.set(id, (replayRuns.get(id) ?? 0) + 1))
  })
  return yield* DurableDeferred.await(ReplayGate)
}))

const RestartGate = DurableDeferred.make("ClusterIntegrationRestartGate", {
  success: Schema.String
})

const RestartWorkflow = Workflow.make("ClusterIntegrationRestart", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const RestartWorkflowLayer = RestartWorkflow.toLayer(() => DurableDeferred.await(RestartGate))

const RaceReplayGate = DurableDeferred.make("ClusterIntegrationRaceReplayGate", {
  success: Schema.String
})

const RaceReplayTail = DurableDeferred.make("ClusterIntegrationRaceReplayTail", {
  success: Schema.String
})

const RaceReplayWorkflow = Workflow.make("ClusterIntegrationRaceReplay", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const raceReplayEnters = new Map<string, number>()

const RaceReplayWorkflowLayer = RaceReplayWorkflow.toLayer(({ id }) =>
  Effect.gen(function*() {
    const winner = yield* DurableDeferred.raceAll({
      name: "ClusterIntegrationRaceReplay",
      success: Schema.String,
      error: Schema.Never,
      effects: [
        DurableDeferred.await(RaceReplayGate),
        Effect.sync(() => raceReplayEnters.set(id, (raceReplayEnters.get(id) ?? 0) + 1)).pipe(
          Effect.andThen(Effect.never)
        )
      ]
    })
    const tail = yield* DurableDeferred.await(RaceReplayTail)
    return `${winner}:${tail}`
  })
)

const CompensationGate = DurableDeferred.make("ClusterIntegrationCompensationGate")

class CompensationError extends Schema.Error<CompensationError>("ClusterIntegrationCompensationError")({
  _tag: Schema.tag("ClusterIntegrationCompensationError"),
  id: Schema.String
}) {}

const CompensationWorkflow = Workflow.make("ClusterIntegrationCompensation", {
  payload: { id: Schema.String },
  error: CompensationError,
  idempotencyKey: ({ id }) => id
})

const compensationRuns = new Map<string, number>()

const CompensationWorkflowLayer = CompensationWorkflow.toLayer(Effect.fnUntraced(function*({ id }) {
  yield* Activity.make({
    name: "ClusterIntegrationCompensationRegistered",
    success: Schema.String,
    execute: Effect.succeed(id)
  }).pipe(
    CompensationWorkflow.withCompensation(() =>
      Effect.sync(() => compensationRuns.set(id, (compensationRuns.get(id) ?? 0) + 1))
    )
  )
  yield* DurableDeferred.await(CompensationGate)
  return yield* new CompensationError({ id })
}))

const SuspendFailureGate = DurableDeferred.make("ClusterIntegrationSuspendFailureGate")

const SuspendFailureWorkflow = Workflow.make("ClusterIntegrationSuspendFailure", {
  payload: { id: Schema.String },
  idempotencyKey: ({ id }) => id
}).annotate(Workflow.SuspendOnFailure, true)

const suspendFailures = new Set<string>()

const SuspendFailureWorkflowLayer = SuspendFailureWorkflow.toLayer(Effect.fnUntraced(function*({ id }) {
  yield* DurableDeferred.await(SuspendFailureGate)
  return yield* Activity.make({
    name: "ClusterIntegrationSuspendFailure",
    execute: Effect.sync(() => suspendFailures.add(id)).pipe(
      Effect.andThen(Effect.die("suspend after owner loss"))
    )
  })
}))

const RaceBoundaryGateA = DurableDeferred.make("ClusterIntegrationRaceBoundaryGateA", {
  success: Schema.String
})

const RaceBoundaryGateB = DurableDeferred.make("ClusterIntegrationRaceBoundaryGateB", {
  success: Schema.String
})

const RaceBoundaryWorkflow = Workflow.make("ClusterIntegrationRaceBoundary", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

let raceBoundaryCommitStarted = Latch.makeUnsafe()
let raceBoundaryCommit = Latch.makeUnsafe()
const raceBoundaryRuns = new Map<string, number>()

const RaceBoundaryWorkflowLayer = RaceBoundaryWorkflow.toLayer(Effect.fnUntraced(function*({ id }) {
  raceBoundaryRuns.set(id, (raceBoundaryRuns.get(id) ?? 0) + 1)
  return yield* DurableDeferred.raceAll({
    name: "ClusterIntegrationRaceBoundary",
    success: Schema.String,
    error: Schema.Never,
    effects: [
      DurableDeferred.await(RaceBoundaryGateA),
      DurableDeferred.await(RaceBoundaryGateB)
    ]
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => raceBoundaryCommitStarted.openUnsafe()).pipe(
        Effect.andThen(raceBoundaryCommit.await)
      )
    )
  )
}))

class RetryError extends Schema.Error<RetryError>("ClusterIntegrationRetryError")({
  _tag: Schema.tag("ClusterIntegrationRetryError"),
  attempt: Schema.Number
}) {}

const RetryWorkflow = Workflow.make("ClusterIntegrationRetry", {
  payload: {
    id: Schema.String,
    succeed: Schema.Boolean
  },
  success: Schema.Number,
  error: RetryError,
  idempotencyKey: ({ id }) => id
})

const retryAttempts = new Map<string, Array<number>>()

const RetryWorkflowLayer = RetryWorkflow.toLayer(({ id, succeed }) =>
  Activity.make({
    name: "Retry",
    success: Schema.Number,
    error: RetryError,
    execute: Effect.gen(function*() {
      const attempt = yield* Activity.CurrentAttempt
      const attempts = retryAttempts.get(id) ?? []
      attempts.push(attempt)
      retryAttempts.set(id, attempts)
      if (succeed && attempt === 3) return attempt
      return yield* new RetryError({ attempt })
    })
  }).pipe(Activity.retry({ times: 2 }))
)

const ClockWorkflow = Workflow.make("ClusterIntegrationClock", {
  payload: { id: Schema.String },
  success: Schema.Number,
  idempotencyKey: ({ id }) => id
})

const ClockWorkflowLayer = ClockWorkflow.toLayer(() =>
  Effect.gen(function*() {
    yield* DurableClock.sleep({
      name: "RestartSleep",
      duration: "1 second",
      inMemoryThreshold: Duration.zero
    })
    return yield* Clock.currentTimeMillis
  })
)

const Queue = DurableQueue.make({
  name: "ClusterIntegrationQueue",
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const QueueWorkflow = Workflow.make("ClusterIntegrationQueue", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const QueueWorkflowLayer = QueueWorkflow.toLayer(({ id }) => DurableQueue.process(Queue, { id }))
const queueRuns = new Map<string, number>()
let queueWorkerGate = Latch.makeUnsafe()

const QueueWorkerLayer = Layer.effectDiscard(
  Effect.forkScoped(
    Effect.suspend(() => queueWorkerGate.await).pipe(
      Effect.andThen(DurableQueue.makeWorker(Queue, ({ id }) =>
        Effect.sync(() => {
          queueRuns.set(id, (queueRuns.get(id) ?? 0) + 1)
          return `processed:${id}`
        })))
    )
  )
)

const InterruptGate = DurableDeferred.make("ClusterIntegrationInterruptGate")

const InterruptWorkflow = Workflow.make("ClusterIntegrationInterrupt", {
  payload: { id: Schema.String },
  idempotencyKey: ({ id }) => id
})

const InterruptWorkflowLayer = InterruptWorkflow.toLayer(() => DurableDeferred.await(InterruptGate))

const ShutdownActivityWorkflow = Workflow.make("ClusterIntegrationShutdownActivity", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const ShutdownSuspendActivityWorkflow = Workflow.make("ClusterIntegrationShutdownSuspendActivity", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
}).annotate(Workflow.SuspendOnFailure, true)

const activityHandoffState = {
  ready: Latch.makeUnsafe(),
  start: Latch.makeUnsafe(),
  faultArmed: false,
  persisted: Latch.makeUnsafe(),
  faultRelease: Latch.makeUnsafe(true),
  runs: new Map<string, number>(),
  compensations: new Set<string>(),
  resourceEvents: new Map<string, Array<"acquire" | "release">>()
}

const abandon = Effect.interruptible(Effect.callback<never>(() => {
  const fiber = Fiber.getCurrent()!
  fiber.interruptUnsafe(fiber.id, ClusterSchema.Abandon.annotation)
}))

const resetActivityHandoffState = (id: string, options?: { readonly faultReleaseOpen?: boolean }) => {
  activityHandoffState.ready = Latch.makeUnsafe()
  activityHandoffState.start = Latch.makeUnsafe()
  activityHandoffState.faultArmed = false
  activityHandoffState.persisted = Latch.makeUnsafe()
  activityHandoffState.faultRelease = Latch.makeUnsafe(options?.faultReleaseOpen ?? true)
  activityHandoffState.runs.delete(id)
  activityHandoffState.compensations.delete(id)
  activityHandoffState.resourceEvents.set(id, [])
}

const ShutdownActivityWorkflowLayer = ShutdownActivityWorkflow.toLayer(({ id }) =>
  Effect.gen(function*() {
    yield* Effect.succeed(id).pipe(
      ShutdownActivityWorkflow.withCompensation(() => Effect.sync(() => activityHandoffState.compensations.add(id)))
    )
    yield* Effect.acquireRelease(
      Effect.sync(() => activityHandoffState.resourceEvents.get(id)!.push("acquire")),
      () => Effect.sync(() => activityHandoffState.resourceEvents.get(id)!.push("release"))
    ).pipe(Workflow.provideScope)
    activityHandoffState.ready.openUnsafe()
    yield* activityHandoffState.start.await
    return yield* Activity.make({
      name: "ShutdownActivity",
      success: Schema.String,
      execute: Effect.sync(() => {
        activityHandoffState.runs.set(id, (activityHandoffState.runs.get(id) ?? 0) + 1)
        return `completed:${id}`
      })
    })
  })
)

const ShutdownSuspendActivityWorkflowLayer = ShutdownSuspendActivityWorkflow.toLayer(({ id }) =>
  Effect.gen(function*() {
    yield* Effect.succeed(id).pipe(
      ShutdownSuspendActivityWorkflow.withCompensation(() =>
        Effect.sync(() => activityHandoffState.compensations.add(id))
      )
    )
    yield* Effect.acquireRelease(
      Effect.sync(() => activityHandoffState.resourceEvents.get(id)!.push("acquire")),
      () => Effect.sync(() => activityHandoffState.resourceEvents.get(id)!.push("release"))
    ).pipe(Workflow.provideScope)
    activityHandoffState.ready.openUnsafe()
    yield* activityHandoffState.start.await
    return yield* Activity.make({
      name: "ShutdownActivity",
      success: Schema.String,
      execute: Effect.sync(() => {
        activityHandoffState.runs.set(id, (activityHandoffState.runs.get(id) ?? 0) + 1)
        return `completed:${id}`
      })
    })
  })
)

const ActivityHandoffShardingLayer = Layer.effect(
  Sharding.Sharding,
  Effect.gen(function*() {
    const sharding = yield* Sharding.Sharding
    return Sharding.Sharding.of({
      ...sharding,
      makeClient: (entity) =>
        // The wrapped factory returns the same dynamic RPC client shape, but
        // its generic relationship to the entity protocol is no longer visible.
        Effect.map(sharding.makeClient(entity), (makeClient) => (entityId: string) => {
          // RPC clients expose their protocol methods dynamically, so the
          // Proxy type cannot retain this client's generated method shape.
          return new Proxy(makeClient(entityId), {
            get(target, property, receiver) {
              if (property !== "activity") return Reflect.get(target, property, receiver)
              const activity = Reflect.get(target, property, receiver) as (
                payload: { readonly name: string },
                options?: object
              ) => Effect.Effect<unknown, unknown, unknown>
              return (payload: { readonly name: string }, options?: object) => {
                if (!activityHandoffState.faultArmed) {
                  return activity(payload, options)
                }
                activityHandoffState.faultArmed = false
                // Mirror sendOutgoing's persisted abandon branch during a
                // runner shutdown: accept the durable request, then interrupt
                // the caller because this runner can never observe the reply.
                return activity(payload, { ...options, discard: true }).pipe(
                  Effect.tap(() => activityHandoffState.persisted.open),
                  Effect.andThen(activityHandoffState.faultRelease.await),
                  Effect.andThen(abandon)
                )
              }
            }
          }) as any
        }) as any
    })
  })
)

const ShutdownActivityEntities = Layer.mergeAll(
  ShutdownActivityWorkflowLayer,
  ShutdownSuspendActivityWorkflowLayer
).pipe(
  Layer.provide(Layer.effect(
    WorkflowEngine.WorkflowEngine,
    ClusterWorkflowEngine.make
  )),
  Layer.provide(ActivityHandoffShardingLayer),
  Layer.orDie
)

const CompleteDeferred = Rpc.make("CompleteDeferred", {
  payload: {
    token: DurableDeferred.Token,
    value: Schema.String
  },
  success: Schema.String
})

const CompleteRaceBoundaryDeferred = Rpc.make("CompleteRaceBoundaryDeferred", {
  payload: {
    token: DurableDeferred.Token,
    value: Schema.String
  },
  success: Schema.String
})

const DeferredControl = Entity.make("ClusterIntegrationDeferredControl", [
  CompleteDeferred,
  CompleteRaceBoundaryDeferred
])

const DeferredControlLayer = DeferredControl.toLayer(Effect.gen(function*() {
  const runner = yield* Entity.CurrentRunnerAddress
  return {
    CompleteDeferred: ({ payload }) =>
      DurableDeferred.succeed(RestartGate, payload).pipe(
        Effect.as(`${runner.host}:${runner.port}`)
      ),
    CompleteRaceBoundaryDeferred: ({ payload }) =>
      DurableDeferred.succeed(RaceBoundaryGateB, payload).pipe(
        Effect.as(`${runner.host}:${runner.port}`)
      )
  }
}))

const Workflows = Layer.mergeAll(
  EndToEndWorkflowLayer,
  ReplayWorkflowLayer,
  RestartWorkflowLayer,
  RaceReplayWorkflowLayer,
  CompensationWorkflowLayer,
  SuspendFailureWorkflowLayer,
  RaceBoundaryWorkflowLayer,
  RetryWorkflowLayer,
  ClockWorkflowLayer,
  QueueWorkflowLayer,
  QueueWorkerLayer,
  InterruptWorkflowLayer,
  DeferredControlLayer
)

const entities = ({ prefix }: { readonly prefix: string }) => {
  const queue = PersistedQueue.layer.pipe(
    Layer.provideMerge(PersistedQueue.layerStoreSql({
      tableName: `${prefix}_workflow_queue`,
      pollInterval: 100,
      lockRefreshInterval: 500,
      lockExpiration: 1_750
    }))
  )
  return Workflows.pipe(
    Layer.provide(queue),
    Layer.provide(ClusterWorkflowEngine.layer),
    Layer.orDie
  )
}

type Cluster = Effect.Success<ReturnType<typeof make>>

const withWorkflow = <A, E, R>(
  cluster: Cluster,
  effect: Effect.Effect<A, E, R | WorkflowEngine.WorkflowEngine>
) => Effect.provideService(effect, WorkflowEngine.WorkflowEngine, cluster.workflowEngine)

const waitForSuspended = Effect.fnUntraced(function*<
  Name extends string,
  Payload extends Workflow.AnyStructSchema,
  Success extends Schema.Top,
  Error extends Schema.Top
>(
  cluster: Cluster,
  workflow: Workflow.Workflow<Name, Payload, Success, Error>,
  executionId: string
) {
  yield* cluster.waitUntil(
    `${workflow._tag}/${executionId} did not suspend`,
    Effect.map(workflow.poll(executionId), (result) => Option.isSome(result) && result.value._tag === "Suspended")
  )
})

const waitForComplete = Effect.fnUntraced(function*<
  Name extends string,
  Payload extends Workflow.AnyStructSchema,
  Success extends Schema.Top,
  Error extends Schema.Top
>(
  cluster: Cluster,
  workflow: Workflow.Workflow<Name, Payload, Success, Error>,
  executionId: string
) {
  let complete: Workflow.Complete<Success["Type"], Error["Type"]> | undefined
  yield* cluster.waitUntil(
    `${workflow._tag}/${executionId} did not complete`,
    Effect.map(workflow.poll(executionId), (result) => {
      if (Option.isNone(result) || result.value._tag !== "Complete") return false
      complete = result.value
      return true
    })
  )
  return complete!
})

const restart = Effect.fnUntraced(function*(cluster: Cluster) {
  const running = cluster.runners.filter((runner) => runner.state() === "running")
  yield* Effect.forEach(running, cluster.kill, { concurrency: "unbounded", discard: true })
  const replacements = yield* cluster.start(3)
  yield* cluster.waitForStableAssignments()
  return replacements
})

const workflowOwner = (cluster: Cluster, executionId: string) => {
  const shard = cluster.clientSharding.getShardId(EntityId.make(executionId), "default")
  return cluster.ownersOfShard(shard)[0]
}

const findControlOnAnotherRunner = Effect.fnUntraced(function*(
  cluster: Cluster,
  workflowRunner: ClusterRunner
) {
  for (let index = 0; index < 2_000; index++) {
    const id = `control-${index}`
    const owner = yield* cluster.ownerOfEntity(DeferredControl, id)
    if (owner !== undefined && owner !== workflowRunner) return [id, owner] as const
  }
  return yield* Effect.die("Could not route deferred control to another runner")
})

describe("cluster workflow integration", () => {
  for (const backend of ["pg", "mysql"] satisfies ReadonlyArray<Backend>) {
    it.live(`${backend}: executes end to end and deduplicates concurrent callers`, () =>
      Effect.gen(function*() {
        const id = `${backend}-end-to-end`
        endToEndGate = Latch.makeUnsafe()
        endToEndEntered = Latch.makeUnsafe()
        const cluster = yield* make({ backend, entities })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()

        const first = yield* withWorkflow(cluster, EndToEndWorkflow.execute({ id, value: 41 })).pipe(
          Effect.forkChild({ startImmediately: true })
        )
        yield* cluster.waitUntil("The end-to-end activity did not start", Effect.as(endToEndEntered.await, true))
        const second = yield* withWorkflow(cluster, EndToEndWorkflow.execute({ id, value: 41 })).pipe(
          Effect.forkChild({ startImmediately: true })
        )
        endToEndGate.openUnsafe()

        assert.strictEqual(yield* Fiber.join(first), 42)
        assert.strictEqual(yield* Fiber.join(second), 42)
        assert.strictEqual(endToEndRuns.get(id), 1)
      }))

    it.live(`${backend}: replays completed activities after the owner dies`, () =>
      Effect.gen(function*() {
        const id = `${backend}-replay`
        const cluster = yield* make({ backend, entities })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()
        const executionId = yield* withWorkflow(cluster, ReplayWorkflow.execute({ id }, { discard: true }))
        yield* waitForSuspended(cluster, ReplayWorkflow, executionId)
        assert.strictEqual(replayRuns.get(id), 1)

        const owner = workflowOwner(cluster, executionId)
        assert.isDefined(owner)
        yield* cluster.kill(owner!)
        yield* cluster.waitForStableAssignments()
        const token = DurableDeferred.tokenFromExecutionId(ReplayGate, { workflow: ReplayWorkflow, executionId })
        yield* withWorkflow(cluster, DurableDeferred.succeed(ReplayGate, { token, value: "resumed" }))
        const result = yield* waitForComplete(cluster, ReplayWorkflow, executionId)

        assert.deepStrictEqual(result.exit, Exit.succeed("resumed"))
        assert.strictEqual(replayRuns.get(id), 1)
      }))

    it.live(`${backend}: resumes deferred workflows across a whole-cluster restart from another runner`, () =>
      Effect.gen(function*() {
        const id = `${backend}-restart`
        const cluster = yield* make({ backend, entities })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()
        const executionId = yield* withWorkflow(cluster, RestartWorkflow.execute({ id }, { discard: true }))
        yield* waitForSuspended(cluster, RestartWorkflow, executionId)
        yield* restart(cluster)

        const owner = workflowOwner(cluster, executionId)
        assert.isDefined(owner)
        const [controlId, controlOwner] = yield* findControlOnAnotherRunner(cluster, owner!)
        const control = yield* cluster.getClient(DeferredControl)
        const token = DurableDeferred.tokenFromExecutionId(RestartGate, { workflow: RestartWorkflow, executionId })
        const completedBy = yield* control(controlId).CompleteDeferred({ token, value: "after-restart" })
        assert.strictEqual(completedBy, `${controlOwner.address.host}:${controlOwner.address.port}`)

        const result = yield* waitForComplete(cluster, RestartWorkflow, executionId)
        assert.deepStrictEqual(result.exit, Exit.succeed("after-restart"))
      }))

    it.live(`${backend}: wakes a DurableDeferred raceAll and replays the winner after owner death`, () =>
      Effect.gen(function*() {
        const id = `${backend}-race-replay`
        const cluster = yield* make({ backend, entities })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()
        const executionId = yield* withWorkflow(cluster, RaceReplayWorkflow.execute({ id }, { discard: true }))
        yield* cluster.waitUntil(
          "The durable race did not start",
          Effect.sync(() => (raceReplayEnters.get(id) ?? 0) > 0)
        )

        const raceToken = DurableDeferred.tokenFromExecutionId(RaceReplayGate, {
          workflow: RaceReplayWorkflow,
          executionId
        })
        yield* withWorkflow(
          cluster,
          DurableDeferred.succeed(RaceReplayGate, {
            token: raceToken,
            value: "winner"
          })
        )
        yield* waitForSuspended(cluster, RaceReplayWorkflow, executionId)
        const entriesBeforeKill = raceReplayEnters.get(id)

        const owner = workflowOwner(cluster, executionId)
        assert.isDefined(owner)
        yield* cluster.kill(owner!)
        yield* cluster.waitForStableAssignments()

        const tailToken = DurableDeferred.tokenFromExecutionId(RaceReplayTail, {
          workflow: RaceReplayWorkflow,
          executionId
        })
        yield* withWorkflow(
          cluster,
          DurableDeferred.succeed(RaceReplayTail, {
            token: tailToken,
            value: "after-owner-death"
          })
        )
        const result = yield* waitForComplete(cluster, RaceReplayWorkflow, executionId)

        assert.deepStrictEqual(result.exit, Exit.succeed("winner:after-owner-death"))
        assert.strictEqual(raceReplayEnters.get(id), entriesBeforeKill)
      }))

    it.live(`${backend}: runs compensation and SuspendOnFailure after the owner is lost`, () =>
      Effect.gen(function*() {
        const compensationId = `${backend}-compensation-owner-loss`
        const suspendId = `${backend}-suspend-owner-loss`
        const cluster = yield* make({ backend, entities })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()
        const compensationExecutionId = yield* withWorkflow(
          cluster,
          CompensationWorkflow.execute({ id: compensationId }, { discard: true })
        )
        const suspendExecutionId = yield* withWorkflow(
          cluster,
          SuspendFailureWorkflow.execute({ id: suspendId }, { discard: true })
        )
        yield* waitForSuspended(cluster, CompensationWorkflow, compensationExecutionId)
        yield* waitForSuspended(cluster, SuspendFailureWorkflow, suspendExecutionId)

        const compensationOwner = workflowOwner(cluster, compensationExecutionId)
        const suspendOwner = workflowOwner(cluster, suspendExecutionId)
        assert.isDefined(compensationOwner)
        assert.isDefined(suspendOwner)
        yield* Effect.forEach(
          new Set([compensationOwner!, suspendOwner!]),
          cluster.kill,
          { discard: true }
        )
        yield* cluster.waitForStableAssignments()

        const compensationToken = DurableDeferred.tokenFromExecutionId(CompensationGate, {
          workflow: CompensationWorkflow,
          executionId: compensationExecutionId
        })
        yield* withWorkflow(
          cluster,
          DurableDeferred.succeed(CompensationGate, {
            token: compensationToken,
            value: undefined
          })
        )
        const compensationResult = yield* waitForComplete(
          cluster,
          CompensationWorkflow,
          compensationExecutionId
        )
        assert(Exit.isFailure(compensationResult.exit))
        const failure = Cause.findErrorOption(compensationResult.exit.cause)
        assert(Option.isSome(failure))
        assert.strictEqual(failure.value._tag, "ClusterIntegrationCompensationError")
        assert.strictEqual(compensationRuns.get(compensationId), 1)

        const suspendToken = DurableDeferred.tokenFromExecutionId(SuspendFailureGate, {
          workflow: SuspendFailureWorkflow,
          executionId: suspendExecutionId
        })
        yield* withWorkflow(
          cluster,
          DurableDeferred.succeed(SuspendFailureGate, {
            token: suspendToken,
            value: undefined
          })
        )
        yield* cluster.waitUntil(
          "SuspendOnFailure did not run after the workflow owner was lost",
          Effect.sync(() => suspendFailures.has(suspendId))
        )
        yield* waitForSuspended(cluster, SuspendFailureWorkflow, suspendExecutionId)
      }))

    it.live(`${backend}: accepts a late durable-race completion across the suspend commit`, () =>
      Effect.gen(function*() {
        const id = `${backend}-race-suspend-commit`
        raceBoundaryCommitStarted = Latch.makeUnsafe()
        raceBoundaryCommit = Latch.makeUnsafe()
        const cluster = yield* make({ backend, entities })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()
        const executionId = yield* withWorkflow(
          cluster,
          RaceBoundaryWorkflow.execute({ id }, { discard: true })
        )
        yield* cluster.waitUntil(
          "The durable race did not reach its suspend commit",
          Effect.as(raceBoundaryCommitStarted.await, true)
        )

        const owner = workflowOwner(cluster, executionId)
        assert.isDefined(owner)
        const [controlId, controlOwner] = yield* findControlOnAnotherRunner(cluster, owner!)
        const control = yield* cluster.getClient(DeferredControl)
        const token = DurableDeferred.tokenFromExecutionId(RaceBoundaryGateB, {
          workflow: RaceBoundaryWorkflow,
          executionId
        })
        const completedBy = yield* control(controlId).CompleteRaceBoundaryDeferred({
          token,
          value: "late-winner"
        })
        assert.strictEqual(completedBy, `${controlOwner.address.host}:${controlOwner.address.port}`)

        const killFiber = yield* cluster.kill(owner!).pipe(Effect.forkChild({ startImmediately: true }))
        // The uninterruptible ensuring finalizer holds Scope.close here until
        // the commit latch opens, keeping the owner blocked mid-commit.
        raceBoundaryCommit.openUnsafe()
        yield* Fiber.join(killFiber)
        yield* cluster.waitForStableAssignments()

        const result = yield* waitForComplete(cluster, RaceBoundaryWorkflow, executionId)
        assert.deepStrictEqual(result.exit, Exit.succeed("late-winner"))
        assert.isAtLeast(raceBoundaryRuns.get(id) ?? 0, 2)
      }))

    it.live(`${backend}: applies activity retry policy and preserves the exhausted error`, () =>
      Effect.gen(function*() {
        const cluster = yield* make({ backend, entities })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()
        const successId = `${backend}-retry-success`
        const failureId = `${backend}-retry-failure`

        assert.strictEqual(
          yield* withWorkflow(cluster, RetryWorkflow.execute({ id: successId, succeed: true })),
          3
        )
        const error = yield* withWorkflow(
          cluster,
          RetryWorkflow.execute({ id: failureId, succeed: false })
        ).pipe(Effect.flip)

        assert.deepStrictEqual(retryAttempts.get(successId), [1, 2, 3])
        assert.deepStrictEqual(retryAttempts.get(failureId), [1, 2, 3])
        assert.strictEqual(error._tag, "ClusterIntegrationRetryError")
        assert.strictEqual(error.attempt, 3)
      }))

    it.live(`${backend}: wakes a durable clock after a whole-cluster restart`, () =>
      Effect.gen(function*() {
        const cluster = yield* make({ backend, entities })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()
        const started = yield* Clock.currentTimeMillis
        const executionId = yield* withWorkflow(
          cluster,
          ClockWorkflow.execute({ id: `${backend}-clock` }, { discard: true })
        )
        yield* waitForSuspended(cluster, ClockWorkflow, executionId)
        yield* restart(cluster)

        const result = yield* waitForComplete(cluster, ClockWorkflow, executionId)
        assert(Exit.isSuccess(result.exit))
        assert.isAtLeast(result.exit.value - started, 900)
      }))

    it.live(`${backend}: persists queued work across restart and consumes it once`, () =>
      Effect.gen(function*() {
        const id = `${backend}-queue`
        queueWorkerGate = Latch.makeUnsafe()
        const cluster = yield* make({ backend, entities })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()
        const executionId = yield* withWorkflow(cluster, QueueWorkflow.execute({ id }, { discard: true }))
        yield* waitForSuspended(cluster, QueueWorkflow, executionId)
        yield* restart(cluster)
        queueWorkerGate.openUnsafe()

        const result = yield* waitForComplete(cluster, QueueWorkflow, executionId)
        assert.deepStrictEqual(result.exit, Exit.succeed(`processed:${id}`))
        assert.strictEqual(queueRuns.get(id), 1)
      }))

    it.live(`${backend}: persists interruption across a whole-cluster restart`, () =>
      Effect.gen(function*() {
        const cluster = yield* make({ backend, entities })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()
        const executionId = yield* withWorkflow(
          cluster,
          InterruptWorkflow.execute({ id: `${backend}-interrupt` }, { discard: true })
        )
        yield* waitForSuspended(cluster, InterruptWorkflow, executionId)
        yield* withWorkflow(cluster, InterruptWorkflow.interrupt(executionId))
        yield* restart(cluster)

        const result = yield* waitForComplete(cluster, InterruptWorkflow, executionId)
        assert(Exit.isFailure(result.exit))
        assert.isTrue(Exit.hasInterrupts(result.exit))
        assert.isTrue(Cause.hasInterrupts(result.exit.cause))
      }))

    it.live(`${backend}: replays a persisted activity handoff without leaking workflow resources`, () =>
      Effect.gen(function*() {
        const cluster = yield* make({ backend, entities: ShutdownActivityEntities })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()
        for (
          const [suffix, workflow] of [
            ["default", ShutdownActivityWorkflow],
            ["suspend-on-failure", ShutdownSuspendActivityWorkflow]
          ] as const
        ) {
          const id = `${backend}-shutdown-activity-${suffix}`
          resetActivityHandoffState(id)
          const executionId = yield* withWorkflow(
            cluster,
            workflow.execute({ id }, { discard: true })
          )
          yield* cluster.waitUntil(
            "The shutdown activity workflow did not start",
            Effect.as(activityHandoffState.ready.await, true)
          )

          activityHandoffState.faultArmed = true
          activityHandoffState.start.openUnsafe()

          const result = yield* waitForComplete(cluster, workflow, executionId)
          assert.isTrue(activityHandoffState.persisted.isOpen())
          assert.deepStrictEqual(result.exit, Exit.succeed(`completed:${id}`))
          assert.strictEqual(activityHandoffState.runs.get(id), 1)
          assert.isFalse(activityHandoffState.compensations.has(id))
          assert.deepStrictEqual(activityHandoffState.resourceEvents.get(id), [
            "acquire",
            "release",
            "acquire",
            "release"
          ])
        }
      }))

    it.live(`${backend}: preserves a safe interrupt during a persisted activity handoff`, () =>
      Effect.gen(function*() {
        const id = `${backend}-shutdown-activity-interrupt`
        resetActivityHandoffState(id, { faultReleaseOpen: false })
        const cluster = yield* make({ backend, entities: ShutdownActivityEntities })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()
        const executionId = yield* withWorkflow(
          cluster,
          ShutdownActivityWorkflow.execute({ id }, { discard: true })
        )
        yield* cluster.waitUntil(
          "The shutdown activity workflow did not start",
          Effect.as(activityHandoffState.ready.await, true)
        )

        activityHandoffState.faultArmed = true
        yield* withWorkflow(cluster, ShutdownActivityWorkflow.interrupt(executionId))
        activityHandoffState.start.openUnsafe()
        yield* cluster.waitUntil(
          "The shutdown activity request was not persisted",
          Effect.as(activityHandoffState.persisted.await, true)
        )
        yield* cluster.waitUntil(
          "The shutdown activity request was not processed",
          Effect.sync(() => activityHandoffState.runs.get(id) === 1)
        )
        activityHandoffState.faultRelease.openUnsafe()

        const result = yield* waitForComplete(cluster, ShutdownActivityWorkflow, executionId)
        assert.isTrue(Exit.isFailure(result.exit))
        assert.isTrue(Exit.hasInterrupts(result.exit))
        assert.isTrue(activityHandoffState.compensations.has(id))
      }).pipe(
        Effect.ensuring(Effect.sync(() => {
          activityHandoffState.faultRelease.openUnsafe()
        }))
      ))

    it.live(`${backend}: recovers a persisted activity across an actual owner handoff`, () =>
      Effect.gen(function*() {
        const id = `${backend}-shutdown-activity-handoff`
        resetActivityHandoffState(id)
        const cluster = yield* make({
          backend,
          config: { entityTerminationTimeout: 100 },
          entities: ShutdownActivityWorkflowLayer.pipe(
            Layer.provide(ClusterWorkflowEngine.layer),
            Layer.orDie
          )
        })
        yield* cluster.start(3)
        yield* cluster.waitForStableAssignments()
        const executionId = yield* withWorkflow(
          cluster,
          ShutdownActivityWorkflow.execute({ id }, { discard: true })
        )
        yield* cluster.waitUntil(
          "The shutdown activity workflow did not start",
          Effect.as(activityHandoffState.ready.await, true)
        )

        const owner = workflowOwner(cluster, executionId)
        assert.isDefined(owner)
        const stopping = yield* cluster.stop(owner!).pipe(Effect.forkChild({ startImmediately: true }))
        activityHandoffState.start.openUnsafe()
        yield* cluster.waitUntil(
          "The shutdown activity workflow was not handed to another runner",
          Effect.sync(() => {
            const nextOwner = workflowOwner(cluster, executionId)
            return nextOwner !== undefined && nextOwner !== owner
          })
        )

        const result = yield* waitForComplete(cluster, ShutdownActivityWorkflow, executionId)
        yield* Fiber.join(stopping)
        assert.deepStrictEqual(result.exit, Exit.succeed(`completed:${id}`))
        assert.strictEqual(activityHandoffState.runs.get(id), 1)
        assert.strictEqual((yield* cluster.messageCounts()).unprocessed, 0)
      }))
  }
})
