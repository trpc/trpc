/**
 * The cluster workflow engine runs durable workflows on top of cluster sharding
 * and message storage. It adapts `WorkflowEngine.WorkflowEngine` so workflow
 * executions, activities, deferred completions, resumes, interrupts, and durable
 * clock wakeups are represented as persisted cluster entity messages.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as DateTime from "../DateTime.ts"
import * as Deferred from "../Deferred.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Fiber from "../Fiber.ts"
import * as Headers from "../http/Headers.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as PrimaryKey from "../PrimaryKey.ts"
import * as RcMap from "../RcMap.ts"
import type * as Record from "../Record.ts"
import * as Rpc from "../rpc/Rpc.ts"
import { ClientAbort } from "../rpc/RpcSchema.ts"
import * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import * as Scope from "../Scope.ts"
import * as Semaphore from "../Semaphore.ts"
import * as Activity from "../workflow/Activity.ts"
import * as DurableClock from "../workflow/DurableClock.ts"
import * as DurableDeferred from "../workflow/DurableDeferred.ts"
import * as Workflow from "../workflow/Workflow.ts"
import * as WorkflowEngine from "../workflow/WorkflowEngine.ts"
import * as ClusterSchema from "./ClusterSchema.ts"
import * as DeliverAt from "./DeliverAt.ts"
import * as Entity from "./Entity.ts"
import * as EntityAddress from "./EntityAddress.ts"
import * as EntityId from "./EntityId.ts"
import * as EntityType from "./EntityType.ts"
import * as Envelope from "./Envelope.ts"
import * as ClusterAbandon from "./internal/clusterAbandon.ts"
import { CurrentActivationScope } from "./internal/entityActivation.ts"
import * as Message from "./Message.ts"
import { MessageStorage } from "./MessageStorage.ts"
import type { WithExitEncoded } from "./Reply.ts"
import * as Reply from "./Reply.ts"
import * as Sharding from "./Sharding.ts"
import * as Snowflake from "./Snowflake.ts"

/**
 * Creates a `WorkflowEngine` implementation backed by cluster sharding and
 * message storage.
 *
 * **Details**
 *
 * Workflow executions, activities, deferred completions, resumes, interrupts,
 * and durable clock wakeups are coordinated through persisted cluster entities.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.gen(function*() {
  const sharding = yield* Sharding.Sharding
  const storage = yield* MessageStorage

  const workflows = new Map<string, Workflow.Any>()
  const entities = new Map<
    string,
    Entity.Entity<
      string,
      | Rpc.Rpc<
        "run",
        Schema.Struct<
          Record<
            typeof payloadParentKey,
            Schema.optional<
              Schema.Struct<{
                workflowName: typeof Schema.String
                executionId: typeof Schema.String
              }>
            >
          >
        >,
        Schema.declare<Workflow.Result<any, any>>
      >
      | Rpc.Rpc<"deferred", Schema.Struct<{ name: typeof Schema.String; exit: typeof ExitUnknown }>, typeof ExitUnknown>
      | Rpc.Rpc<
        "activity",
        Schema.Struct<
          { name: typeof Schema.String; attempt: typeof Schema.Int; withTransaction: typeof Schema.Boolean }
        >,
        Schema.declare<Workflow.Result<any, any>>
      >
      | typeof ResumeRpc
    >
  >()
  const partialEntities = new Map<
    string,
    Entity.Entity<
      string,
      | Rpc.Rpc<"deferred", Schema.Struct<{ name: typeof Schema.String; exit: typeof ExitUnknown }>, typeof ExitUnknown>
      | Rpc.Rpc<
        "activity",
        Schema.Struct<{ name: typeof Schema.String; attempt: typeof Schema.Int }>,
        Schema.declare<Workflow.Result<any, any>>
      >
      | typeof ResumeRpc
    >
  >()
  const ensureEntity = (workflow: Workflow.Any) => {
    let entity = entities.get(workflow._tag)
    if (!entity) {
      entity = makeWorkflowEntity(workflow) as any
      workflows.set(workflow._tag, workflow)
      entities.set(workflow._tag, entity as any)
    }
    return entity!
  }
  const ensurePartialEntity = (workflowName: string) => {
    let entity = partialEntities.get(workflowName)
    if (!entity) {
      entity = makePartialWorkflowEntity(workflowName) as any
      partialEntities.set(workflowName, entity as any)
    }
    return entity!
  }

  const activities = new Map<string, {
    readonly activity: Activity.Any
    readonly context: Context.Context<any>
  }>()
  const interruptedActivities = new Set<string>()
  const deferredState = WorkflowEngine.makeDeferredState()
  // Rebuilds share an activation; overlapping activations have separate results.
  // Weak keys do not retain scopes, but contexts captured by clients, activities,
  // or finalizers can keep a closed scope (and its results) reachable until later.
  const pendingByActivation = new WeakMap<Scope.Scope, ActivationState>()
  // Closes the scopes retained by suspended runs. The latest run already closed
  // its own scope with its real exit, so earlier finalizers observe success and
  // skip superseded compensations. Abandonment releases owner-local resources
  // without running durable finalizers, so the run can replay elsewhere.
  const closeRuns = (state: ActivationState, abandoned: boolean) =>
    Effect.suspend(() => {
      const scope = state.scope
      if (abandoned) {
        for (const instance of state.instances) instance.abandoned = true
      }
      state.instances.clear()
      state.scope = Scope.makeUnsafe()
      return Scope.close(scope, Exit.void)
    })
  const clients = yield* RcMap.make({
    lookup: Effect.fnUntraced(function*(workflowName: string) {
      const entity = entities.get(workflowName)
      if (!entity) {
        return yield* Effect.die(`Workflow ${workflowName} not registered`)
      }
      yield* RcMap.invalidate(clientsPartial, workflowName)
      return yield* entity.client
    }),
    idleTimeToLive: "5 minutes"
  })
  const clientsPartial = yield* RcMap.make({
    lookup: Effect.fnUntraced(function*(workflowName: string) {
      const entity = entities.get(workflowName) ?? ensurePartialEntity(workflowName)
      return yield* entity.client
    }),
    idleTimeToLive: "5 minutes"
  })
  const entityAddressFor = (options: {
    readonly workflow: Workflow.Any
    readonly entityType: string
    readonly executionId: string
  }) => {
    const shardGroup = Context.get(options.workflow.annotations, ClusterSchema.ShardGroup)(
      options.executionId as EntityId.EntityId
    )
    const entityId = EntityId.make(options.executionId)
    return EntityAddress.make({
      entityType: EntityType.make(options.entityType),
      entityId,
      shardId: sharding.getShardId(entityId, shardGroup)
    })
  }

  const sendDiscard = Effect.fnUntraced(function*(options: {
    readonly rpc: Rpc.AnyWithProps
    readonly address: EntityAddress.EntityAddress
    readonly payload: unknown
  }) {
    const payload = (options.rpc.payloadSchema as any).make(options.payload)
    const span = yield* Effect.orDie(Effect.currentSpan)
    const envelope = Envelope.makeRequest<any>({
      requestId: yield* sharding.getSnowflake,
      address: options.address,
      tag: options.rpc._tag as any,
      payload,
      headers: Headers.empty,
      traceId: span.traceId,
      spanId: span.spanId,
      sampled: span.sampled
    })
    yield* sharding.sendOutgoing(
      new Message.OutgoingRequest({
        envelope,
        context: Context.empty() as Context.Context<any>,
        lastReceivedReply: Option.none(),
        rpc: options.rpc,
        respond: () => Effect.void,
        annotations: Context.get(options.rpc.annotations, ClusterSchema.Dynamic)(
          options.rpc.annotations,
          envelope as any
        )
      }),
      true
    )
  })

  const requestIdFor = Effect.fnUntraced(function*(options: {
    readonly workflow: Workflow.Any
    readonly entityType: string
    readonly executionId: string
    readonly tag: string
    readonly id: string
  }) {
    const address = entityAddressFor(options)
    return yield* storage.requestIdForPrimaryKey({ address, tag: options.tag, id: options.id })
  })

  const replyForRequestId = Effect.fnUntraced(function*(requestId: Snowflake.Snowflake) {
    const replies = yield* storage.repliesForUnfiltered([requestId])
    const last = replies[replies.length - 1]
    if (last && last._tag === "WithExit") {
      return Option.some(last as WithExitEncoded<Workflow.ResultEncoded<any, any>>)
    }
    return Option.none<WithExitEncoded<Workflow.ResultEncoded<any, any>>>()
  })

  const requestReply = Effect.fnUntraced(function*(options: {
    readonly workflow: Workflow.Any
    readonly entityType: string
    readonly executionId: string
    readonly tag: string
    readonly id: string
  }) {
    const requestId = yield* requestIdFor(options)
    if (Option.isNone(requestId)) {
      return Option.none<WithExitEncoded<Workflow.ResultEncoded<any, any>>>()
    }
    return yield* replyForRequestId(requestId.value)
  })

  const resetActivityAttempt = Effect.fnUntraced(
    function*(options: {
      readonly workflow: Workflow.Any
      readonly executionId: string
      readonly activity: Activity.Any
      readonly attempt: number
    }) {
      const requestId = yield* requestIdFor({
        workflow: options.workflow,
        entityType: `Workflow/${options.workflow._tag}`,
        executionId: options.executionId,
        tag: "activity",
        id: activityPrimaryKey(options.activity.name, options.attempt)
      })
      if (Option.isNone(requestId)) return
      yield* sharding.reset(requestId.value)
    },
    Effect.retry({
      times: 3,
      schedule: Schedule.exponential(250)
    }),
    Effect.orDie
  )

  const clearClock = Effect.fnUntraced(function*(options: {
    readonly workflow: Workflow.Any
    readonly executionId: string
  }) {
    const shardGroup = Context.get(options.workflow.annotations, ClusterSchema.ShardGroup)(
      options.executionId as EntityId.EntityId
    )
    const entityId = EntityId.make(options.executionId)
    const shardId = sharding.getShardId(entityId, shardGroup)
    const clockAddress = EntityAddress.make({
      entityType: ClockEntity.type,
      entityId,
      shardId
    })
    yield* storage.clearAddress(clockAddress)
  })

  const resume = Effect.fnUntraced(function*(workflow: Workflow.Any, executionId: string, mode: WakeMode) {
    const maybeReply = yield* requestReply({
      workflow,
      entityType: `Workflow/${workflow._tag}`,
      executionId,
      tag: "run",
      id: ""
    })

    const maybeSuspended = Option.filter(maybeReply, isSuspendedReply)

    if (Option.isNone(maybeSuspended)) return
    // Replies without `failed` retain automatic wakes for compatibility.
    if (mode === "automatic" && isFailedReply(maybeSuspended.value)) return
    if (
      !(yield* sharding.reset(
        Snowflake.Snowflake(maybeSuspended.value.requestId),
        { expectedReplyId: Snowflake.Snowflake(maybeSuspended.value.id) }
      ))
    ) {
      return yield* Effect.fail(new Error("Failed to reset workflow run"))
    }
    yield* sharding.pollStorage
  })

  // Activations load a persisted interrupt when they start, so the per-call
  // check reads only memory.
  const interruptPending = (instance: WorkflowEngine.WorkflowInstance["Service"]) =>
    Effect.map(Effect.serviceOption(CurrentActivationScope), (activation) => {
      const pending = Option.isSome(activation) ? pendingByActivation.get(activation.value) : undefined
      return pending?.workflowName === instance.workflow._tag && pending.executionId === instance.executionId &&
        pending.results.has(InterruptSignal.name)
    })

  const sendResumeParent = Effect.fnUntraced(function*(options: {
    readonly workflowName: string
    readonly executionId: string
  }, childExecutionId: string) {
    const requestId = yield* requestIdFor({
      workflow: workflows.get(options.workflowName)!,
      entityType: `Workflow/${options.workflowName}`,
      executionId: options.executionId,
      tag: "resume",
      id: childExecutionId
    })
    if (Option.isNone(requestId)) {
      const client = (yield* RcMap.get(clientsPartial, options.workflowName))(options.executionId)
      return yield* client.resume({ childExecutionId }, { discard: true })
    }
    const reply = yield* replyForRequestId(requestId.value)
    if (Option.isNone(reply)) return
    yield* sharding.reset(requestId.value)
  }, Effect.scoped)

  // Subscribe to the run's next reply before reading storage, so a reply
  // cannot fall between the read and the subscription. Returns `true` when the
  // stored reply already settles the wait, `false` when a new reply arrived.
  const awaitRunReply = Effect.fnUntraced(function*(
    workflow: Workflow.Any,
    request: Envelope.Request<any>,
    isSettled: (reply: WithExitEncoded<Workflow.ResultEncoded<any, any>>) => boolean
  ) {
    const waiter = yield* storage.registerReplyHandler(
      new Message.OutgoingRequest<any>({
        envelope: request,
        context: Context.empty() as Context.Context<any>,
        rpc: ensureEntity(workflow).protocol.requests.get("run")!,
        lastReceivedReply: Option.none(),
        respond: () => Effect.void,
        annotations: Context.empty()
      })
    ).pipe(Effect.forkScoped({ startImmediately: true }))
    const reply = yield* replyForRequestId(request.requestId)
    if (Option.isSome(reply) && isSettled(reply.value)) return true
    yield* Fiber.join(waiter)
    return false
  }, Effect.scoped)

  // A child or deferred may complete while a run is still unwinding. Wait for
  // the run's reply so the wake cannot fall between the run's last read and
  // its suspended reply.
  const waitForRunReply = (workflow: Workflow.Any, request: Entity.Request<any>) =>
    awaitRunReply(workflow, request, () => true).pipe(
      Effect.asVoid,
      Effect.catchTag("EntityNotAssignedToRunner", () => ClusterAbandon.interrupt),
      Effect.catchCause((cause) => ClusterAbandon.isCause(cause) ? ClusterAbandon.interrupt : Effect.failCause(cause))
    )

  // Wake an external caller once its run publishes a reply other than
  // `Suspended`. Replies are only observed on the runner that saves them, so
  // callers on other runners, and any failure here, leave delivery to the
  // caller's retry schedule.
  const awaitComplete = Effect.fnUntraced(function*(workflow: Workflow.Any, executionId: string) {
    const address = entityAddressFor({ workflow, entityType: `Workflow/${workflow._tag}`, executionId })
    if (!sharding.hasShardId(address.shardId)) return yield* Effect.never
    const requestId = yield* storage.requestIdForPrimaryKey({ address, tag: "run", id: "" })
    if (Option.isNone(requestId)) return yield* Effect.never
    const request = Envelope.makeRequest<any>({
      requestId: requestId.value,
      address,
      tag: "run",
      payload: {},
      headers: Headers.empty
    })
    // A replay that suspends again re-arms the wait, so it does not spend a
    // step of the caller's retry schedule.
    let settled = false
    while (!settled) {
      settled = yield* awaitRunReply(workflow, request, (reply) => !isSuspendedReply(reply))
    }
  }, Effect.catchCause(() => Effect.never))

  const interrupt = Effect.fnUntraced(
    function*(workflow: Workflow.Any, executionId: string) {
      ensureEntity(workflow)
      const requestId = yield* requestIdFor({
        workflow,
        entityType: `Workflow/${workflow._tag}`,
        executionId,
        tag: "run",
        id: ""
      })
      if (Option.isNone(requestId)) {
        return Option.none()
      }
      const reply = yield* replyForRequestId(requestId.value)

      const nonSuspendedReply = Option.filter(
        reply,
        (reply) => !isSuspendedReply(reply)
      )
      if (Option.isSome(nonSuspendedReply)) {
        return Option.none()
      }

      yield* engine.deferredDone(InterruptSignal, {
        workflowName: workflow._tag,
        executionId,
        deferredName: InterruptSignal.name,
        exit: Exit.void
      })

      return requestId
    },
    Effect.retry({
      while: (e) => e._tag === "PersistenceError",
      times: 3,
      schedule: Schedule.exponential(250)
    }),
    Effect.orDie
  )

  const engine = WorkflowEngine.makeUnsafe({
    register: (workflow, execute) =>
      Effect.suspend(() => {
        const existing = workflows.get(workflow._tag)
        const registration = sharding.registerEntity(
          ensureEntity(workflow),
          Effect.gen(function*() {
            const address = yield* Entity.CurrentAddress
            const executionId = address.entityId
            const activation = yield* CurrentActivationScope
            let pending = pendingByActivation.get(activation)
            if (!pending) {
              const results = new Map<string, Exit.Exit<unknown, unknown>>()
              // A new owner must see an interrupt persisted before it took over.
              // Publish the cache only once loaded, so a retried build repeats
              // a failed lookup.
              const interrupt = yield* Effect.orDie(requestReply({
                workflow,
                entityType: `Workflow/${workflow._tag}`,
                executionId,
                tag: "deferred",
                id: InterruptSignal.name
              }))
              if (Option.isSome(interrupt)) {
                const decoded = decodeDeferredWithExit(interrupt.value as any)
                results.set(
                  InterruptSignal.name,
                  (decoded.exit._tag === "Success" ? decoded.exit.value : decoded.exit) as Exit.Exit<unknown, unknown>
                )
              }
              pending = {
                workflowName: workflow._tag,
                executionId,
                results,
                instances: new Set(),
                scope: Scope.makeUnsafe()
              }
              yield* Scope.addFinalizer(activation, closeRuns(pending, true))
              pendingByActivation.set(activation, pending)
            }
            // Retain awaited names through reply persistence, including suspension.
            // Replays reuse the request id but track a fresh set of awaits.
            let currentRun: {
              readonly request: Entity.Request<any>
              readonly instance: WorkflowEngine.WorkflowInstance["Service"]
              // Activity awaits must wake the run after suspension without preempting it.
              readonly activityAwaits: Map<string, number>
            } | undefined
            // Concurrent automatic wakes share one wait for the current run to
            // publish its reply. Explicit wakes cannot be dropped, because an
            // automatic wake skips the reset of a failure suspension, so they
            // wait outside the gate. Operator resume does not use the gate.
            const resumeGate = Semaphore.makeUnsafe(1)
            const waitForCurrentRunReply = Effect.suspend(() =>
              currentRun ? waitForRunReply(workflow, currentRun.request) : Effect.void
            )
            const resumeCurrentRun = (mode: WakeMode) =>
              ensureSuccess(
                mode === "explicit"
                  ? Effect.andThen(waitForCurrentRunReply, resume(workflow, executionId, mode))
                  : resumeGate.withPermitsIfAvailable(1)(waitForCurrentRunReply).pipe(
                    // Release the gate before reset can start another run, so later
                    // completions can wake that replay.
                    Effect.flatMap((waited) =>
                      Option.isSome(waited) ? resume(workflow, executionId, mode) : Effect.void
                    )
                  )
              )
            return {
              run: (request: Entity.Request<any>) => {
                // Each run gets a fresh scope under the activation's parent, so
                // replays rebuild compensations while suspended runs keep theirs.
                const instance = WorkflowEngine.WorkflowInstance.initial(workflow, executionId, {
                  scope: Scope.forkUnsafe(pending.scope)
                })
                pending.instances.add(instance)
                currentRun = { request, instance, activityAwaits: new Map() }
                const parent = (request.payload as any)[payloadParentKey] as
                  | { workflowName: string; executionId: string; detached?: boolean }
                  | undefined
                return execute(workflow.payloadSchema.make(request.payload) as object, executionId).pipe(
                  Effect.onExit((exit) => {
                    const suspendOnFailure = Context.get(workflow.annotations, Workflow.SuspendOnFailure)
                    // An annotated cluster abandonment means this owner can no
                    // longer finish the run. Do not resume the parent, but
                    // still allow a pending durable interrupt to take effect.
                    instance.abandoned ||= exit._tag === "Failure" && ClusterAbandon.isCause(exit.cause)
                    if (instance.abandoned) {
                      instance.suspended = false
                    }
                    // Abandoned runs never wake the parent; another owner replays them.
                    const resumeParent = parent && !parent.detached && !instance.abandoned
                      ? ensureSuccess(sendResumeParent(parent, executionId))
                      : Effect.void
                    if (
                      !instance.suspended &&
                      !instance.abandoned &&
                      !(suspendOnFailure && exit._tag === "Failure")
                    ) {
                      if (exit._tag === "Success" || !Cause.hasInterruptsOnly(exit.cause)) {
                        return resumeParent
                      }
                      // `interruptUnsafe` cuts the run off without a result and
                      // its replay applies the interrupt. Retain the scope like a
                      // suspended run, so `closeRuns` supersedes it and only the
                      // final run's compensations observe the interrupt.
                      return engine.deferredResult(InterruptSignal).pipe(
                        Effect.flatMap((maybeExit) => {
                          if (Option.isNone(maybeExit)) {
                            return resumeParent
                          }
                          instance.suspended = true
                          return Effect.void
                        }),
                        Effect.orDie
                      )
                    }
                    return engine.deferredResult(InterruptSignal).pipe(
                      Effect.flatMap((maybeExit) => {
                        if (Option.isNone(maybeExit)) {
                          return Effect.void
                        }
                        instance.suspended = false
                        instance.interrupted = true
                        // The interrupt completes the run, so wake the parent
                        // to observe it.
                        return Effect.ignore(clearClock({ workflow, executionId })).pipe(
                          Effect.andThen(resumeParent),
                          Effect.andThen(
                            Effect.withFiber<void>((fiber) => Effect.interruptible(Fiber.interrupt(fiber)))
                          )
                        )
                      }),
                      Effect.orDie
                    )
                  }),
                  Workflow.intoResult,
                  Effect.onExit((exit) =>
                    Exit.isSuccess(exit) && exit.value._tag === "Suspended"
                      ? Effect.void
                      : closeRuns(pending, instance.abandoned)
                  ),
                  (effect) => deferredState.trackRun(instance, effect),
                  // Request middleware and local callers may carry another entity's context.
                  Effect.provideService(CurrentActivationScope, activation)
                ) as any
              },

              activity(request: Entity.Request<any>) {
                const payload = request.payload as { name: string; attempt: number }
                const activityId = `${executionId}/${payload.name}`
                const instance = WorkflowEngine.WorkflowInstance.initial(workflow, executionId, {
                  awaitedDeferreds: currentRun?.activityAwaits
                })
                interruptedActivities.delete(activityId)
                const entry = activities.get(activityId)
                if (!entry) {
                  // Replay may never register a losing race activity. Answer it
                  // without waiting; a later registration can reset this reply.
                  return Effect.succeed(new Workflow.Suspended({})).pipe(Rpc.wrap({ fork: true }))
                }
                const context = entry.context.pipe(
                  Context.add(WorkflowEngine.WorkflowInstance, instance),
                  Context.add(CurrentActivationScope, activation),
                  Context.add(Activity.CurrentAttempt, payload.attempt)
                )
                return entry.activity.executeEncoded.pipe(
                  Effect.provideContext(context),
                  Workflow.intoResult,
                  Effect.catchCause((cause) => {
                    // we only want to store interrupts as suspends when the
                    // client requested it
                    const suspend = cause.reasons.some((f) =>
                      f._tag === "Interrupt" && f.annotations.has(ClientAbort.key)
                    )
                    if (suspend) {
                      interruptedActivities.add(activityId)
                      return Effect.succeed(new Workflow.Suspended({}))
                    }
                    return Effect.failCause(cause)
                  }),
                  Effect.provideService(WorkflowEngine.WorkflowInstance, instance),
                  Effect.provideService(Activity.CurrentAttempt, payload.attempt),
                  Effect.ensuring(Effect.sync(() => {
                    activities.delete(activityId)
                  })),
                  Rpc.wrap({ fork: true, uninterruptible: true })
                )
              },

              deferred: (request: Entity.Request<any>) => {
                const payload = request.payload as any
                pending.results.set(payload.name, payload.exit)
                const mode: WakeMode = payload.name === InterruptSignal.name ? "explicit" : "automatic"
                // Await registers before reading the cache. If this run has not
                // registered yet, a later await will see the result just stored.
                // Check when the wake runs and skip preemption too: interrupting
                // a later await would require waiting for its reply before reset.
                // A run completing its own deferred also reads it from the cache
                // when it awaits later, unless an activity is already parked on it.
                // A run only reads InterruptSignal while suspending, so an interrupt
                // always waits for the current run's reply before it resets the run.
                const wake = Effect.suspend(() =>
                  currentRun && mode === "automatic" && !currentRun.instance.awaitedDeferreds.has(payload.name)
                    ? currentRun.activityAwaits.has(payload.name)
                      // Hold an activity wake until the run has published its reply.
                      ? resumeCurrentRun(mode)
                      : currentRun.instance.completedDeferreds.has(payload.name)
                      ? Effect.void
                      : ensureSuccess(resume(workflow, executionId, mode))
                    : deferredState.deferredDone(executionId, payload.name).pipe(
                      Effect.andThen(resumeCurrentRun(mode))
                    )
                )
                // An asynchronous reply releases the RPC concurrency permit while
                // the wake waits; the pending request still occupies mailbox capacity.
                // The activation owns the wake so it survives handler rebuilds,
                // but activation shutdown still interrupts it for durable redelivery.
                const reply = Deferred.makeUnsafe<Exit.Exit<unknown, unknown>>()
                return wake.pipe(
                  Effect.as(payload.exit),
                  Deferred.into(reply),
                  Effect.forkIn(activation, { startImmediately: true }),
                  Effect.as(reply)
                )
              },

              resume: () => resumeCurrentRun("automatic").pipe(Rpc.wrap({ fork: true, uninterruptible: true }))
            }
          }),
          // Alongside the run, let deferred handlers briefly acquire a permit to
          // fork their wake and return an asynchronous reply.
          { concurrency: 2, maxIdleTime: entityMaxIdleTime }
        ) as Effect.Effect<void, never, Scope.Scope>
        if (existing === undefined || existing === workflow) return registration
        return Effect.logWarning(
          `Workflow "${workflow._tag}" is already registered with payload shape ${
            payloadShape(
              existing
            )
          }; ignoring duplicate definition with payload shape ${payloadShape(workflow)}`
        ).pipe(Effect.andThen(registration))
      }),

    execute: (workflow, { detached, discard, executionId, parent, payload }) => {
      ensureEntity(workflow)
      return RcMap.get(clients, workflow._tag).pipe(
        Effect.flatMap((make) =>
          make(executionId).run(
            parent ?
              {
                ...payload,
                // A detached child keeps its parent for observability only.
                [payloadParentKey]: detached
                  ? { workflowName: parent.workflow._tag, executionId: parent.executionId, detached: true }
                  : { workflowName: parent.workflow._tag, executionId: parent.executionId }
              } :
              payload,
            { discard }
          )
        ),
        Effect.orDie,
        Effect.scoped
      )
    },

    poll: Effect.fnUntraced(function*(workflow, executionId) {
      const entity = ensureEntity(workflow)
      const exitSchema = Schema.toCodecJson(Rpc.exitSchema(entity.protocol.requests.get("run")!))
      const reply = yield* requestReply({
        workflow,
        entityType: `Workflow/${workflow._tag}`,
        executionId,
        tag: "run",
        id: ""
      })
      if (Option.isNone(reply)) return Option.none()
      const exit = yield* (Schema.decodeUnknownEffect(exitSchema)(reply.value.exit) as Effect.Effect<
        Exit.Exit<any, any>,
        Schema.SchemaError
      >)
      return Option.some(yield* exit)
    }, Effect.orDie),

    interrupt: (workflow, executionId) => Effect.asVoid(interrupt(workflow, executionId)),
    interruptUnsafe: Effect.fnUntraced(function*(workflow, executionId) {
      const requestId = yield* interrupt(workflow, executionId)
      if (Option.isNone(requestId)) return
      const entity = ensureEntity(workflow)
      const runRpc = entity.protocol.requests.get("run")!
      yield* Effect.orDie(sharding.sendOutgoing(
        new Message.OutgoingEnvelope({
          rpc: runRpc,
          envelope: new Envelope.Interrupt({
            id: yield* sharding.getSnowflake,
            address: entityAddressFor({
              workflow,
              entityType: `Workflow/${workflow._tag}`,
              executionId
            }),
            requestId: requestId.value
          })
        }),
        false
      ))
    }),

    resume: (workflow, executionId) => ensureSuccess(resume(workflow, executionId, "explicit")),

    awaitComplete,

    activityExecute: Effect.fnUntraced(
      function*(activity, attempt) {
        const services = yield* Effect.context<WorkflowEngine.WorkflowInstance>()
        const instance = Context.get(services, WorkflowEngine.WorkflowInstance)
        yield* Effect.annotateCurrentSpan("executionId", instance.executionId)
        const activityId = `${instance.executionId}/${activity.name}`
        // A pending interrupt replays only to rebuild compensations, so it must
        // not run new activities. Finalizers run once `interrupted` is set.
        if (!instance.interrupted && (yield* interruptPending(instance))) {
          const reply = yield* retryPersistence(requestReply({
            workflow: instance.workflow,
            entityType: `Workflow/${instance.workflow._tag}`,
            executionId: instance.executionId,
            tag: "activity",
            id: activityPrimaryKey(activity.name, attempt)
          }))
          // Suspend so `onExit` applies the interrupt to the run.
          if (Option.isNone(reply) || isSuspendedReply(reply.value)) {
            return new Workflow.Suspended({})
          }
        }
        const client = (yield* RcMap.get(clientsPartial, instance.workflow._tag))(instance.executionId)
        while (true) {
          if (!activities.has(activityId)) {
            activities.set(activityId, { activity, context: services })
          }
          const result = yield* retryPersistence(
            client.activity({
              name: activity.name,
              attempt,
              withTransaction: Context.get(activity.annotations, ClusterSchema.WithTransaction)
            })
          )
          // If the activity has suspended and did not execute, we need to resume
          // it by resetting the attempt and re-executing.
          if (result._tag === "Suspended" && (activities.has(activityId) || interruptedActivities.has(activityId))) {
            yield* resetActivityAttempt({
              workflow: instance.workflow,
              executionId: instance.executionId,
              activity,
              attempt
            })
            continue
          }
          activities.delete(activityId)
          return result
        }
      },
      Effect.scoped
    ),

    deferredResult: (deferred) =>
      WorkflowEngine.WorkflowInstance.pipe(
        Effect.flatMap(Effect.fnUntraced(function*(instance) {
          const activation = yield* Effect.serviceOption(CurrentActivationScope)
          const pending = Option.isSome(activation) ? pendingByActivation.get(activation.value) : undefined
          // Captured contexts can cross workflow boundaries. Never use another
          // execution's completion, even if its deferred has the same name.
          const exit = pending?.workflowName === instance.workflow._tag && pending.executionId === instance.executionId
            ? pending.results.get(deferred.name)
            : undefined
          if (exit) {
            return Option.some(exit)
          }
          const requestId = yield* requestIdFor({
            workflow: instance.workflow,
            entityType: `Workflow/${instance.workflow._tag}`,
            executionId: instance.executionId,
            tag: "deferred",
            id: deferred.name
          })
          if (Option.isNone(requestId)) {
            return Option.none<Exit.Exit<unknown, unknown>>()
          }
          const reply = yield* replyForRequestId(requestId.value)
          if (Option.isSome(reply)) {
            return Option.some(deferredReplyExit(reply.value))
          }
          // The first completion saved under the deferred name wins, so a
          // request the owner has not processed yet already holds the result.
          const [request] = yield* storage.unprocessedMessagesById([requestId.value])
          if (request?.envelope._tag === "Request") {
            return Option.some(decodeDeferredPayload(request.envelope.payload).exit)
          }
          // It was processed after the first read, so its reply is stored now.
          return Option.map(yield* replyForRequestId(requestId.value), deferredReplyExit)
        })),
        Effect.retry({
          while: (e) => e._tag === "PersistenceError",
          times: 3,
          schedule: Schedule.exponential(250)
        }),
        Effect.orDie
      ),

    deferredDone: Effect.fnUntraced(
      function*({ deferredName, executionId, exit, workflowName }) {
        const instance = yield* Effect.serviceOption(WorkflowEngine.WorkflowInstance)
        // Activities run with their own instance, so their completions still
        // wake a run that suspended before reaching the await. An interrupt
        // must wake the run even when it signals itself.
        if (
          Option.isSome(instance) && instance.value.executionId === executionId &&
          deferredName !== InterruptSignal.name
        ) {
          instance.value.completedDeferreds.add(deferredName)
        }
        const workflow = workflows.get(workflowName)
        if (workflow) {
          return yield* Effect.orDie(sendDiscard({
            rpc: DeferredRpc,
            address: entityAddressFor({
              workflow,
              entityType: `Workflow/${workflowName}`,
              executionId
            }),
            payload: {
              name: deferredName,
              exit
            }
          }))
        }
        const client = yield* RcMap.get(clientsPartial, workflowName)
        return yield* Effect.orDie(
          client(executionId).deferred({
            name: deferredName,
            exit
          }, { discard: true })
        )
      },
      Effect.scoped
    ),

    scheduleClock(workflow, options) {
      return DateTime.now.pipe(
        Effect.flatMap((now) =>
          sendDiscard({
            rpc: ClockRpc,
            address: entityAddressFor({
              workflow,
              entityType: ClockEntity.type,
              executionId: options.executionId
            }),
            payload: {
              name: options.clock.name,
              workflowName: workflow._tag,
              wakeUp: DateTime.mapEpochMillis(
                DateTime.addDuration(now, options.clock.duration),
                Math.ceil
              )
            }
          })
        ),
        Effect.orDie
      )
    }
  })

  return engine
})

const retryPolicy = Schedule.min([
  Schedule.exponential(200, 1.5),
  Schedule.spaced("1 minute")
])

// A transient storage failure must not become the workflow result. Requests
// are saved under a primary key, so a retry after a lost acknowledgement is
// deduplicated instead of running the activity again.
const retryPersistence = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.retry({ schedule: retryPolicy, while: (e) => e._tag === "PersistenceError" }),
    Effect.orDie
  )

// A cluster abandonment means this owner can no longer complete the effect, so
// retrying it would only wait on a retired run. Re-raise it as an annotated
// interrupt, so the activation can unwind and its shard can be released.
const ensureSuccess = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.sandbox,
    Effect.retry({ schedule: retryPolicy, while: (cause) => !ClusterAbandon.isCause(cause) }),
    Effect.catchIf(ClusterAbandon.isCause, () => ClusterAbandon.interrupt),
    Effect.orDie
  )

const AnyOrVoid = Schema.Union([Schema.Undefined, Schema.Any])
const ExitUnknown = Schema.Exit(AnyOrVoid, AnyOrVoid, Schema.Any)

const ActivityRpc = Rpc.make("activity", {
  payload: {
    name: Schema.String,
    attempt: Schema.Int,
    withTransaction: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(false))
    )
  },
  primaryKey: ({ attempt, name }) => activityPrimaryKey(name, attempt),
  success: Workflow.Result({
    success: AnyOrVoid,
    error: AnyOrVoid
  })
})
  .annotate(ClusterSchema.Persisted, true)
  .annotate(
    ClusterSchema.Dynamic,
    (annotations, request) =>
      (request.payload as any).withTransaction
        ? Context.add(annotations, ClusterSchema.WithTransaction, true)
        : annotations
  )

const DeferredRpc = Rpc.make("deferred", {
  payload: {
    name: Schema.String,
    exit: ExitUnknown
  },
  primaryKey: ({ name }) => name,
  success: ExitUnknown
})
  .annotate(ClusterSchema.Persisted, true)
  .annotate(ClusterSchema.Uninterruptible, true)

type WakeMode = "explicit" | "automatic"

interface ActivationState {
  readonly workflowName: string
  readonly executionId: string
  readonly results: Map<string, Exit.Exit<unknown, unknown>>
  // Every run forks its scope from here, so runs that suspended keep their
  // resources and durable finalizers until the execution finishes.
  scope: Scope.Closeable
  readonly instances: Set<WorkflowEngine.WorkflowInstance["Service"]>
}

const isSuspendedReply = (reply: WithExitEncoded<Workflow.ResultEncoded<any, any>>) =>
  reply.exit._tag === "Success" && reply.exit.value._tag === "Suspended"

const isFailedReply = (reply: WithExitEncoded<Workflow.ResultEncoded<any, any>>) =>
  reply.exit._tag === "Success" && reply.exit.value._tag === "Suspended" && reply.exit.value.failed === true

const decodeDeferredWithExit = Schema.decodeSync(Schema.toCodecJson(Reply.WithExit.schema(DeferredRpc)))
const decodeDeferredPayload = Schema.decodeUnknownSync(Schema.toCodecJson(DeferredRpc.payloadSchema))
const deferredReplyExit = (reply: WithExitEncoded<Workflow.ResultEncoded<any, any>>): Exit.Exit<unknown, unknown> => {
  const decoded = decodeDeferredWithExit(reply as any)
  return decoded.exit._tag === "Success" ? decoded.exit.value : decoded.exit
}

const ResumeRpc = Rpc.make("resume", {
  // Older persisted resume envelopes have an empty payload and use the empty key.
  payload: { childExecutionId: Schema.optional(Schema.String) },
  // Different children must not share an in-flight wake: the parent may have
  // already started another run when the next child finishes.
  primaryKey: ({ childExecutionId }) => childExecutionId ?? ""
})
  .annotate(ClusterSchema.Persisted, true)
  .annotate(ClusterSchema.Uninterruptible, "server")

const payloadParentKey = "~effect/cluster/ClusterWorkflowEngine/payloadParentKey"

// Workflow state is durable, so an idle entity (completed or suspended) can
// be released quickly and is rebuilt from storage when the next message
// arrives. This keeps completed and suspended executions from holding
// `maxResidentEntities` slots for the full `entityMaxIdleTime`.
const entityMaxIdleTime = Duration.seconds(10)

const makeWorkflowEntity = (workflow: Workflow.Any) =>
  Entity.make(`Workflow/${workflow._tag}`, [
    Rpc.make("run", {
      payload: {
        ...workflow.payloadSchema.fields,
        [payloadParentKey]: Schema.optional(Schema.Struct({
          workflowName: Schema.String,
          executionId: Schema.String,
          detached: Schema.optional(Schema.Boolean)
        }))
      },
      primaryKey: () => "",
      success: Workflow.Result({
        success: workflow.successSchema,
        error: workflow.errorSchema
      })
    })
      .annotate(ClusterSchema.Persisted, true)
      .annotate(ClusterSchema.Uninterruptible, true),

    DeferredRpc,
    ResumeRpc,
    ActivityRpc
  ]).annotateMerge(workflow.annotations)

const makePartialWorkflowEntity = (workflowName: string) =>
  Entity.make(`Workflow/${workflowName}`, [
    DeferredRpc,
    ResumeRpc,
    ActivityRpc
  ])

const activityPrimaryKey = (activity: string, attempt: number) => `${activity}/${attempt}`

class ClockPayload extends Schema.Class<ClockPayload>(`Workflow/DurableClock/Run`)({
  name: Schema.String,
  workflowName: Schema.String,
  wakeUp: Schema.DateTimeUtcFromMillis
}) {
  [PrimaryKey.symbol]() {
    return this.name
  }
  [DeliverAt.symbol]() {
    return this.wakeUp
  }
}

const ClockRpc = Rpc.make("run", { payload: ClockPayload })
  .annotate(ClusterSchema.Persisted, true)
  .annotate(ClusterSchema.Uninterruptible, true)

const ClockEntity = Entity.make("Workflow/-/DurableClock", [
  ClockRpc
])

const ClockEntityLayer = ClockEntity.toLayer(
  Effect.gen(function*() {
    const engine = yield* WorkflowEngine.WorkflowEngine
    const address = yield* Entity.CurrentAddress
    const executionId = address.entityId
    return {
      run(request) {
        const deferred = DurableClock.make({ name: request.payload.name, duration: Duration.zero }).deferred
        return ensureSuccess(engine.deferredDone(deferred, {
          workflowName: request.payload.workflowName,
          executionId,
          deferredName: deferred.name,
          exit: Exit.void
        }))
      }
    }
  }),
  { maxIdleTime: entityMaxIdleTime }
)

const InterruptSignal = DurableDeferred.make("Workflow/InterruptSignal")

/**
 * Layer that provides `WorkflowEngine.WorkflowEngine` using the cluster workflow
 * engine implementation.
 *
 * **Details**
 *
 * It requires cluster sharding and message storage, and also registers the
 * durable clock entity used for workflow wakeups.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<
  WorkflowEngine.WorkflowEngine,
  never,
  Sharding.Sharding | MessageStorage
> = ClockEntityLayer.pipe(
  Layer.provideMerge(Layer.effect(WorkflowEngine.WorkflowEngine)(make))
)

const payloadShape = (workflow: Workflow.Any): string => {
  try {
    const { definitions, schema } = Schema.toJsonSchemaDocument(workflow.payloadSchema)
    return JSON.stringify(Object.keys(definitions).length === 0 ? schema : { ...schema, $defs: definitions })
  } catch {
    return "<unavailable>"
  }
}
