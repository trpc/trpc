/**
 * Defines workflow engine services and an in-memory implementation.
 *
 * `WorkflowEngine` registers workflow handlers, runs executions, polls results,
 * resumes suspended runs, executes activities, stores durable deferred results,
 * and schedules durable clocks. `WorkflowInstance` holds the runtime state for
 * one workflow run. The in-memory layer is useful for tests and local
 * development.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Fiber from "../Fiber.ts"
import * as FiberMap from "../FiberMap.ts"
import * as Latch from "../Latch.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import * as Scope from "../Scope.ts"
import type * as Activity from "./Activity.ts"
import type { DurableClock } from "./DurableClock.ts"
import type * as DurableDeferred from "./DurableDeferred.ts"
import * as Workflow from "./Workflow.ts"

/**
 * Service that represents workflow runtimes, responsible for registering and
 * executing workflows and coordinating activities, durable deferreds,
 * interrupts, resumes, and clocks.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class WorkflowEngine extends Context.Service<
  WorkflowEngine,
  {
    /**
     * Register a workflow with the engine.
     */
    readonly register: <
      Name extends string,
      Payload extends Workflow.AnyStructSchema,
      Success extends Schema.Top,
      Error extends Schema.Top,
      R
    >(
      workflow: Workflow.Workflow<Name, Payload, Success, Error>,
      execute: (
        payload: Payload["Type"],
        executionId: string
      ) => Effect.Effect<Success["Type"], Error["Type"], R>
    ) => Effect.Effect<
      void,
      never,
      | Scope.Scope
      | Exclude<
        R,
        | WorkflowEngine
        | WorkflowInstance
        | Workflow.Execution<Name>
        | Scope.Scope
      >
      | Payload["DecodingServices"]
      | Payload["EncodingServices"]
      | Success["DecodingServices"]
      | Success["EncodingServices"]
      | Error["DecodingServices"]
      | Error["EncodingServices"]
    >

    /**
     * Execute a registered workflow.
     */
    readonly execute: <
      Name extends string,
      Payload extends Workflow.AnyStructSchema,
      Success extends Schema.Top,
      Error extends Schema.Top,
      const Discard extends boolean = false
    >(
      workflow: Workflow.Workflow<Name, Payload, Success, Error>,
      options: {
        readonly executionId: string
        readonly payload: Payload["Type"]
        readonly discard?: Discard | undefined
        readonly suspendedRetrySchedule?:
          | Schedule.Schedule<any, unknown>
          | undefined
      }
    ) => Effect.Effect<
      Discard extends true ? string : Success["Type"],
      Error["Type"],
      | Payload["EncodingServices"]
      | Success["DecodingServices"]
      | Error["DecodingServices"]
    >

    /**
     * Poll the current status of a registered workflow execution.
     */
    readonly poll: <
      Name extends string,
      Payload extends Workflow.AnyStructSchema,
      Success extends Schema.Top,
      Error extends Schema.Top
    >(
      workflow: Workflow.Workflow<Name, Payload, Success, Error>,
      executionId: string
    ) => Effect.Effect<
      Option.Option<Workflow.Result<Success["Type"], Error["Type"]>>,
      never,
      Success["DecodingServices"] | Error["DecodingServices"]
    >

    /**
     * Interrupt a registered workflow.
     */
    readonly interrupt: (
      workflow: Workflow.Any,
      executionId: string
    ) => Effect.Effect<void>

    /**
     * Interrupts a registered workflow unsafely, potentially ignoring
     * compensation finalizers and orphaning child workflows.
     */
    readonly interruptUnsafe: (
      workflow: Workflow.Any,
      executionId: string
    ) => Effect.Effect<void>

    /**
     * Resume a registered workflow.
     */
    readonly resume: (
      workflow: Workflow.Any,
      executionId: string
    ) => Effect.Effect<void>

    /**
     * Execute an activity from a workflow.
     */
    readonly activityExecute: <
      Success extends Schema.Constraint,
      Error extends Schema.Constraint,
      R
    >(
      activity: Activity.Activity<Success, Error, R>,
      attempt: number
    ) => Effect.Effect<
      Workflow.Result<Success["Type"], Error["Type"]>,
      never,
      | Success["DecodingServices"]
      | Error["DecodingServices"]
      | R
      | WorkflowInstance
    >

    /**
     * Try to retrieve the result of an DurableDeferred
     */
    readonly deferredResult: <
      Success extends Schema.Constraint,
      Error extends Schema.Constraint
    >(
      deferred: DurableDeferred.DurableDeferred<Success, Error>
    ) => Effect.Effect<
      Option.Option<Exit.Exit<Success["Type"], Error["Type"]>>,
      never,
      WorkflowInstance
    >

    /**
     * Set the result of a DurableDeferred, and then resume any waiting
     * workflows.
     */
    readonly deferredDone: <
      Success extends Schema.Constraint,
      Error extends Schema.Constraint
    >(
      deferred: DurableDeferred.DurableDeferred<Success, Error>,
      options: {
        readonly workflowName: string
        readonly executionId: string
        readonly deferredName: string
        readonly exit: Exit.Exit<Success["Type"], Error["Type"]>
      }
    ) => Effect.Effect<
      void,
      never,
      Success["EncodingServices"] | Error["EncodingServices"]
    >

    /**
     * Schedule a wake up for a DurableClock
     */
    readonly scheduleClock: (
      workflow: Workflow.Any,
      options: {
        readonly executionId: string
        readonly clock: DurableClock
      }
    ) => Effect.Effect<void>
  }
>()("effect/workflow/WorkflowEngine") {}

/**
 * Service that contains workflow runtime state for one execution.
 *
 * **When to use**
 *
 * Use to read or update workflow execution, suspension, interruption,
 * lifetime, failure, and activity coordination state inside workflow engine
 * internals.
 *
 * **Details**
 *
 * The service stores the execution ID, workflow definition, long-lived scope,
 * suspension and interruption flags, the stored failure cause, and activity
 * coordination state for a single workflow run.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class WorkflowInstance extends Context.Service<
  WorkflowInstance,
  {
    /**
     * The workflow execution ID.
     */
    readonly executionId: string

    /**
     * The workflow definition.
     */
    readonly workflow: Workflow.Any

    /**
     * A scope that represents the lifetime of the workflow.
     *
     * It is only closed when the workflow is completed.
     */
    readonly scope: Scope.Closeable

    /**
     * Whether the workflow has requested to be suspended.
     */
    suspended: boolean

    /**
     * Whether the workflow has requested to be interrupted.
     */
    interrupted: boolean

    /**
     * Whether the current workflow run has been abandoned for replay. When
     * `true`, callbacks registered with `Workflow.addFinalizer` are skipped as
     * the owner-local scope closes.
     */
    abandoned: boolean

    /**
     * When SuspendOnFailure is triggered, the cause of the failure is stored
     * here.
     */
    cause: Cause.Cause<never> | undefined

    /** Deferred names this run parked on; their completions preempt the run. */
    readonly awaitedDeferreds: Set<string>

    /** Deferred names this run completed itself; their completions need not wake it. */
    readonly completedDeferreds: Set<string>

    readonly activityState: {
      count: number
      readonly latch: Latch.Latch
    }
  }
>()("effect/workflow/WorkflowEngine/WorkflowInstance") {
  static initial(
    workflow: Workflow.Any,
    executionId: string,
    scope = Scope.makeUnsafe()
  ): WorkflowInstance["Service"] {
    return WorkflowInstance.of({
      executionId,
      workflow,
      scope,
      suspended: false,
      interrupted: false,
      abandoned: false,
      cause: undefined,
      awaitedDeferreds: new Set(),
      completedDeferreds: new Set(),
      activityState: {
        count: 0,
        latch: Latch.makeUnsafe()
      }
    })
  }
}

/**
 * Tracks live workflow runs so deferred completions can wake them.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface DeferredState {
  /** Tracks and provides a run until it completes or suspends. */
  readonly trackRun: <A, E, R>(
    instance: WorkflowInstance["Service"],
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, Exclude<R, WorkflowInstance>>

  /** Preempts a run parked on the completed deferred. */
  readonly deferredDone: (
    executionId: string,
    name: string
  ) => Effect.Effect<void>
}

/**
 * Creates deferred state shared by workflow engines.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeDeferredState = (): DeferredState => {
  const running = new Map<string, {
    readonly instance: WorkflowInstance["Service"]
    readonly fiber: Fiber.Fiber<unknown, unknown>
  }>()
  return {
    trackRun: (instance, effect) =>
      Effect.withFiber((fiber) => {
        const run = { instance, fiber: fiber as Fiber.Fiber<unknown, unknown> }
        running.set(instance.executionId, run)
        return Effect.ensuring(
          Effect.provideService(effect, WorkflowInstance, instance),
          Effect.sync(() => {
            if (running.get(instance.executionId) !== run) return
            running.delete(instance.executionId)
          })
        )
      }),
    deferredDone: (executionId, name) =>
      Effect.withFiber((current) => {
        const run = running.get(executionId)
        if (!run) return Effect.void
        if (
          run.fiber === current ||
          run.fiber.pollUnsafe() ||
          !run.instance.awaitedDeferreds.has(name)
        ) {
          return Effect.void
        }
        // The engine stores the completion before waking this run. Replay
        // observes it after the interrupted run reports suspension.
        run.instance.suspended = true
        return Fiber.interrupt(run.fiber)
      })
  }
}

/**
 * Low-level workflow engine contract that works with encoded payloads and
 * results before `makeUnsafe` adds typed schema decoding and encoding.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export interface Encoded {
  readonly register: (
    workflow: Workflow.Any,
    execute: (
      payload: object,
      executionId: string
    ) => Effect.Effect<unknown, unknown, WorkflowInstance | WorkflowEngine>
  ) => Effect.Effect<void, never, Scope.Scope>
  readonly execute: <const Discard extends boolean>(
    workflow: Workflow.Any,
    options: {
      readonly executionId: string
      readonly payload: object
      readonly discard: Discard
      readonly parent?: WorkflowInstance["Service"] | undefined
    }
  ) => Effect.Effect<
    Discard extends true ? void : Workflow.Result<unknown, unknown>
  >
  readonly poll: (
    workflow: Workflow.Any,
    executionId: string
  ) => Effect.Effect<Option.Option<Workflow.Result<unknown, unknown>>>
  readonly interrupt: (
    workflow: Workflow.Any,
    executionId: string
  ) => Effect.Effect<void>
  readonly interruptUnsafe: (
    workflow: Workflow.Any,
    executionId: string
  ) => Effect.Effect<void>
  readonly resume: (
    workflow: Workflow.Any,
    executionId: string
  ) => Effect.Effect<void>
  readonly activityExecute: (
    activity: Activity.Any,
    attempt: number
  ) => Effect.Effect<
    Workflow.Result<unknown, unknown>,
    never,
    WorkflowInstance
  >
  readonly deferredResult: (
    deferred: DurableDeferred.Any
  ) => Effect.Effect<
    Option.Option<Exit.Exit<unknown, unknown>>,
    never,
    WorkflowInstance
  >
  readonly deferredDone: (options: {
    readonly workflowName: string
    readonly executionId: string
    readonly deferredName: string
    readonly exit: Exit.Exit<unknown, unknown>
  }) => Effect.Effect<void>
  readonly scheduleClock: (
    workflow: Workflow.Any,
    options: {
      readonly executionId: string
      readonly clock: DurableClock
    }
  ) => Effect.Effect<void>
}

/**
 * Builds a typed `WorkflowEngine` service from a low-level encoded
 * implementation.
 *
 * **When to use**
 *
 * Use when wiring a trusted low-level workflow engine implementation into the
 * typed `WorkflowEngine` service.
 *
 * **Gotchas**
 *
 * The implementation must correctly persist, resume, and encode workflow state.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeUnsafe = (options: Encoded): WorkflowEngine["Service"] =>
  WorkflowEngine.of({
    register: Effect.fnUntraced(function*(workflow, execute) {
      const services = yield* Effect.context<WorkflowEngine>()
      yield* options.register(workflow, (payload, executionId) =>
        Effect.suspend(() =>
          execute(payload, executionId)
        ).pipe(
          Effect.updateContext(
            (input) => Context.merge(services, input) as Context.Context<any>
          )
        ))
    }),
    execute: Effect.fnUntraced(function*<
      Name extends string,
      Payload extends Workflow.AnyStructSchema,
      Success extends Schema.Top,
      Error extends Schema.Top,
      const Discard extends boolean = false
    >(
      self: Workflow.Workflow<Name, Payload, Success, Error>,
      opts: {
        readonly executionId: string
        readonly payload: Payload["Type"]
        readonly discard?: Discard | undefined
        readonly suspendedRetrySchedule?:
          | Schedule.Schedule<any, unknown>
          | undefined
      }
    ) {
      const payload = opts.payload
      const executionId = opts.executionId
      const suspendedRetrySchedule = opts.suspendedRetrySchedule ?? defaultRetrySchedule
      yield* Effect.annotateCurrentSpan({ executionId })
      let result = Option.none<Workflow.Result<Success["Type"], Error["Type"]>>()

      // link interruption with parent workflow
      const parentInstance = yield* Effect.serviceOption(WorkflowInstance)
      if (Option.isSome(parentInstance)) {
        const instance = parentInstance.value
        yield* Effect.addFinalizer(() => {
          if (!instance.interrupted || (Option.isSome(result) && result.value._tag === "Complete")) {
            return Effect.void
          }
          return options.interrupt(self, executionId)
        })
      }
      const run = options.execute(self, {
        executionId,
        payload: payload as object,
        discard: opts.discard ?? false,
        parent: Option.getOrUndefined(parentInstance)
      }) as Effect.Effect<Workflow.Result<Success["Type"], Error["Type"]>>

      if (opts.discard) {
        yield* run
        return executionId
      }

      if (Option.isSome(parentInstance)) {
        const wrapped = yield* Workflow.wrapActivityResult(
          run,
          (result) => result._tag === "Suspended"
        )
        result = Option.some(wrapped)
        if (wrapped._tag === "Suspended") {
          return yield* Workflow.suspend(parentInstance.value)
        }
        return yield* wrapped.exit
      }

      let sleep: Effect.Effect<any> | undefined
      while (true) {
        const wrapped = yield* run
        result = Option.some(wrapped)
        if (wrapped._tag === "Complete") {
          return yield* wrapped.exit as Exit.Exit<any>
        }
        sleep ??= (yield* Schedule.toStepWithSleep(suspendedRetrySchedule))(
          void 0
        ).pipe(
          Effect.catch(() =>
            Effect.die(
              `${self._tag}.execute: suspendedRetrySchedule exhausted`
            )
          )
        )
        yield* sleep
      }
    }),
    poll: options.poll,
    interrupt: options.interrupt,
    interruptUnsafe: options.interruptUnsafe,
    resume: options.resume,
    activityExecute: Effect.fnUntraced(function*<
      Success extends Schema.Constraint,
      Error extends Schema.Constraint,
      R
    >(activity: Activity.Activity<Success, Error, R>, attempt: number) {
      const result = yield* options.activityExecute(activity, attempt)
      if (result._tag === "Suspended") {
        return result
      }
      const exit = yield* Effect.orDie(
        Schema.decodeEffect(activity.exitSchemaPartial)(toJsonExit(result.exit))
      )
      return new Workflow.Complete({ exit })
    }),
    deferredResult: Effect.fnUntraced(
      function*<Success extends Schema.Constraint, Error extends Schema.Constraint>(
        deferred: DurableDeferred.DurableDeferred<Success, Error>
      ) {
        const instance = yield* WorkflowInstance
        yield* Effect.annotateCurrentSpan({
          executionId: instance.executionId
        })
        const exit = yield* options.deferredResult(deferred)
        if (Option.isNone(exit)) {
          return Option.none()
        }
        return Option.some(
          yield* Effect.orDie(
            Schema.decodeEffect(deferred.exitSchema)(toJsonExit(exit.value))
          ) as Effect.Effect<Exit.Exit<Success["Type"], Error["Type"]>>
        )
      },
      Effect.withSpan(
        "WorkflowEngine.deferredResult",
        (deferred) => ({
          attributes: { name: deferred.name }
        }),
        { captureStackTrace: false }
      )
    ),
    deferredDone: Effect.fnUntraced(
      function*<Success extends Schema.Constraint, Error extends Schema.Constraint>(
        deferred: DurableDeferred.DurableDeferred<Success, Error>,
        opts: {
          readonly workflowName: string
          readonly executionId: string
          readonly deferredName: string
          readonly exit: Exit.Exit<Success["Type"], Error["Type"]>
        }
      ) {
        return yield* options.deferredDone({
          workflowName: opts.workflowName,
          executionId: opts.executionId,
          deferredName: opts.deferredName,
          exit: yield* Schema.encodeEffect(deferred.exitSchema)(
            opts.exit
          ) as Effect.Effect<Exit.Exit<unknown, unknown>>
        })
      },
      Effect.withSpan(
        "WorkflowEngine.deferredDone",
        (_, { deferredName, executionId }) => ({
          attributes: { name: deferredName, executionId }
        }),
        { captureStackTrace: false }
      )
    ),
    scheduleClock: (workflow, opts) =>
      options.scheduleClock(workflow, opts).pipe(
        Effect.withSpan(
          "WorkflowEngine.scheduleClock",
          {
            attributes: {
              executionId: opts.executionId,
              name: opts.clock.name
            }
          },
          {
            captureStackTrace: false
          }
        )
      )
  })

const defaultRetrySchedule = Schedule.min([
  Schedule.exponential(200, 1.5),
  Schedule.spaced(30000)
])

/**
 * Layer that provides an in-memory `WorkflowEngine`.
 *
 * **When to use**
 *
 * Use to run tests and local development workflows where durability is not
 * needed.
 *
 * **Gotchas**
 *
 * This layer keeps state only in memory and is not suitable for production
 * workflows that require durability.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerMemory: Layer.Layer<WorkflowEngine> = Layer.effect(WorkflowEngine)(
  Effect.gen(function*() {
    const scope = yield* Effect.scope

    const workflows = new Map<string, {
      readonly workflow: Workflow.Any
      readonly execute: (
        payload: object,
        executionId: string
      ) => Effect.Effect<unknown, unknown, WorkflowInstance | WorkflowEngine>
      readonly scope: Scope.Scope
    }>()

    type ExecutionState = {
      readonly payload: object
      readonly execute: (
        payload: object,
        executionId: string
      ) => Effect.Effect<unknown, unknown, WorkflowInstance | WorkflowEngine>
      readonly parent: string | undefined
      instance: WorkflowInstance["Service"]
      interrupted: boolean
      resumeRequested: boolean
      fiber: Fiber.Fiber<Workflow.Result<unknown, unknown>> | undefined
    }
    const executions = new Map<string, ExecutionState>()

    type ActivityState = {
      exit: Exit.Exit<Workflow.Result<unknown, unknown>> | undefined
    }
    const activities = new Map<string, ActivityState>()

    const deferredState = makeDeferredState()

    const resume = Effect.fnUntraced(function*(executionId: string): Effect.fn.Return<void> {
      const state = executions.get(executionId)
      if (!state) return
      const exit = state.fiber?.pollUnsafe()
      if (exit && exit._tag === "Success" && exit.value._tag === "Complete") {
        return
      } else if (state.fiber && !exit) {
        // A child can finish while the parent is still releasing its activity.
        // Preserve the wake until that run has published its suspended result.
        if (!state.resumeRequested) {
          state.resumeRequested = true
          yield* Fiber.await(state.fiber).pipe(
            Effect.flatMap(() => {
              state.resumeRequested = false
              return resume(executionId)
            }),
            Effect.forkIn(scope)
          )
        }
        return
      }

      const entry = workflows.get(state.instance.workflow._tag)!
      const instance = WorkflowInstance.initial(
        state.instance.workflow,
        state.instance.executionId,
        state.instance.scope
      )
      state.instance = instance
      state.fiber = yield* state.execute(state.payload, state.instance.executionId).pipe(
        Effect.onExit(() => {
          if (!state.interrupted) {
            return Effect.void
          }
          instance.interrupted = true
          instance.suspended = false
          return Effect.withFiber((fiber) => Effect.interruptible(Fiber.interrupt(fiber)))
        }),
        Workflow.intoResult,
        Effect.provideService(WorkflowEngine, engine),
        (effect) => deferredState.trackRun(instance, effect),
        Effect.tap((result) => {
          if (!state.parent || result._tag !== "Complete") {
            return Effect.void
          }
          return Effect.forkIn(resume(state.parent), scope)
        }),
        Effect.forkIn(entry.scope)
      )
    })

    const deferredResults = new Map<string, Exit.Exit<any, any>>()

    const clocks = yield* FiberMap.make<string>()

    const engine = makeUnsafe({
      register: Effect.fnUntraced(function*(workflow, execute) {
        workflows.set(workflow._tag, {
          workflow,
          execute,
          scope: yield* Effect.scope
        })
      }),
      execute: Effect.fnUntraced(function*(workflow, options) {
        const entry = workflows.get(workflow._tag)
        if (!entry) {
          return yield* Effect.orDie(Effect.fail(`Workflow ${workflow._tag} is not registered`))
        }

        let state = executions.get(options.executionId)
        if (!state) {
          state = {
            payload: options.payload,
            execute: entry.execute,
            instance: WorkflowInstance.initial(workflow, options.executionId),
            interrupted: false,
            resumeRequested: false,
            fiber: undefined,
            parent: options.parent?.executionId
          }
          executions.set(options.executionId, state)
          yield* resume(options.executionId)
        }
        if (options.discard) return
        // Capture together so a wake that swaps in a replay cannot desync them.
        const instance = state.instance
        const exit = yield* Fiber.await(state.fiber!)
        if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause) && instance.suspended) {
          // A completion preempted the run; the caller retries into the replay.
          return new Workflow.Suspended({}) as any
        }
        return (yield* exit) as any
      }),
      interrupt: Effect.fnUntraced(function*(_workflow, executionId) {
        const state = executions.get(executionId)
        if (!state) return
        state.interrupted = true
        yield* resume(executionId)
      }),
      interruptUnsafe: Effect.fnUntraced(function*(_workflow, executionId) {
        const state = executions.get(executionId)
        if (!state) return
        state.interrupted = true
        if (state.fiber) {
          yield* Fiber.interrupt(state.fiber)
        }
      }),
      resume(_workflow, executionId) {
        return resume(executionId)
      },
      activityExecute: Effect.fnUntraced(function*(activity, attempt) {
        const instance = yield* WorkflowInstance
        const activityId = `${instance.executionId}/${activity.name}/${attempt}`
        let state = activities.get(activityId)
        if (state) {
          const exit = state.exit
          if (exit && exit._tag === "Success" && exit.value._tag === "Suspended") {
            state.exit = undefined
          } else if (exit) {
            return yield* exit
          }
        } else {
          state = { exit: undefined }
          activities.set(activityId, state)
        }
        const activityInstance = WorkflowInstance.initial(instance.workflow, instance.executionId)
        activityInstance.interrupted = instance.interrupted
        return yield* activity.executeEncoded.pipe(
          Workflow.intoResult,
          Effect.provideService(WorkflowInstance, activityInstance),
          Effect.onExit((exit) => {
            state.exit = exit
            return Effect.void
          })
        )
      }),
      poll: (_workflow, executionId) =>
        Effect.suspend(() => {
          const state = executions.get(executionId)
          if (!state) {
            return Effect.succeedNone
          }
          const exit = state.fiber?.pollUnsafe()
          if (!exit) {
            return Effect.succeedNone
          }
          return exit._tag === "Success"
            ? Effect.succeedSome(exit.value)
            : Effect.die(exit.cause)
        }),
      deferredResult: Effect.fnUntraced(function*(deferred) {
        const instance = yield* WorkflowInstance
        const id = `${instance.executionId}/${deferred.name}`
        return Option.fromNullishOr(deferredResults.get(id))
      }),
      deferredDone: (options) =>
        Effect.suspend(() => {
          const id = `${options.executionId}/${options.deferredName}`
          if (deferredResults.has(id)) return Effect.void
          deferredResults.set(id, options.exit)
          const wake = Effect.andThen(
            deferredState.deferredDone(options.executionId, options.deferredName),
            resume(options.executionId)
          )
          return Effect.flatMap(Effect.serviceOption(WorkflowInstance), (instance) =>
            // A workflow finalizer cannot wait for its own run's cleanup.
            // The engine scope owns the wake so cleanup still precedes replay.
            Option.isSome(instance) && instance.value.executionId === options.executionId
              ? wake.pipe(Effect.forkIn(scope), Effect.asVoid)
              : wake)
        }),
      scheduleClock: (workflow, options) =>
        engine.deferredDone(options.clock.deferred, {
          workflowName: workflow._tag,
          executionId: options.executionId,
          deferredName: options.clock.deferred.name,
          exit: Exit.void
        }).pipe(
          Effect.delay(options.clock.duration),
          FiberMap.run(clocks, `${options.executionId}/${options.clock.name}`, { onlyIfMissing: true }),
          Effect.asVoid
        )
    })

    return engine
  })
)

const toJsonExit = Exit.map((value: any) => value ?? null)
