/**
 * Defines typed durable workflows.
 *
 * A `Workflow` has a stable tag, schemas for payload, success, and failure, and
 * an idempotency key used to derive execution ids. Workflow definitions can be
 * executed, discarded, polled, interrupted, resumed, and registered with a
 * handler layer. This module also includes workflow result types, compensation
 * and cleanup helpers, suspension support, and settings for defect capture or
 * failure suspension.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Fiber from "../Fiber.ts"
import * as Filter from "../Filter.ts"
import { constFalse, constTrue, dual, identity } from "../Function.ts"
import * as Layer from "../Layer.ts"
import type * as Option from "../Option.ts"
import * as Predicate from "../Predicate.ts"
import type { ExitEncoded } from "../rpc/RpcMessage.ts"
import type * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import * as SchemaIssue from "../SchemaIssue.ts"
import * as SchemaParser from "../SchemaParser.ts"
import * as Tranformation from "../SchemaTransformation.ts"
import * as Scope from "../Scope.ts"
import { makeHashDigest } from "./internal/crypto.ts"
import type { WorkflowEngine, WorkflowInstance } from "./WorkflowEngine.ts"

const TypeId = "~effect/workflow/Workflow"

/**
 * Durable workflow definition with typed payload, success, and error schemas
 * plus operations for execution, polling, interruption, resumption, and
 * registration.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Workflow<
  Tag extends string,
  Payload extends AnyStructSchema,
  Success extends Schema.Top,
  Error extends Schema.Top
> {
  new(_: never): {}

  readonly [TypeId]: typeof TypeId
  readonly _tag: Tag
  readonly payloadSchema: Payload
  readonly successSchema: Success
  readonly errorSchema: Error
  readonly annotations: Context.Context<never>
  readonly idempotencyKey: (payload: Payload["Type"]) => string
  readonly suspendedRetrySchedule?: Schedule.Schedule<any, unknown> | undefined

  /**
   * Add an annotation to the workflow.
   */
  annotate<I, S>(
    key: Context.Key<I, S>,
    value: S
  ): Workflow<Tag, Payload, Success, Error>

  /**
   * Merge multiple annotations into the workflow.
   */
  annotateMerge<I>(
    annotations: Context.Context<I>
  ): Workflow<Tag, Payload, Success, Error>

  /**
   * Execute the workflow with the given payload.
   */
  readonly execute: <const Discard extends boolean = false>(
    payload: Payload["~type.make.in"],
    options?: {
      readonly discard?: Discard
    }
  ) => Effect.Effect<
    Discard extends true ? string : Success["Type"],
    Discard extends true ? never : Error["Type"],
    | WorkflowEngine
    | Payload["EncodingServices"]
    | Success["DecodingServices"]
    | Error["DecodingServices"]
  >

  /**
   * Poll the current status of a workflow execution.
   */
  readonly poll: (
    executionId: string
  ) => Effect.Effect<
    Option.Option<Result<Success["Type"], Error["Type"]>>,
    never,
    WorkflowEngine | Success["DecodingServices"] | Error["DecodingServices"]
  >

  /**
   * Interrupt a workflow execution for the given execution ID.
   */
  readonly interrupt: (
    executionId: string
  ) => Effect.Effect<void, never, WorkflowEngine>

  /**
   * Manually resume a workflow execution for the given execution ID.
   */
  readonly resume: (
    executionId: string
  ) => Effect.Effect<void, never, WorkflowEngine>

  /**
   * Create a layer that registers the workflow and provides an effect to
   * execute it.
   */
  readonly toLayer: <R>(
    execute: (
      payload: Payload["Type"],
      executionId: string
    ) => Effect.Effect<Success["Type"], Error["Type"], R>
  ) => Layer.Layer<
    never,
    never,
    | WorkflowEngine
    | Exclude<
      R,
      WorkflowEngine | WorkflowInstance | Execution<Tag> | Scope.Scope
    >
    | Payload["DecodingServices"]
    | Payload["EncodingServices"]
    | Success["DecodingServices"]
    | Success["EncodingServices"]
    | Error["DecodingServices"]
    | Error["EncodingServices"]
  >

  /**
   * For the given payload, compute the deterministic execution ID.
   */
  readonly executionId: (
    payload: Payload["~type.make.in"]
  ) => Effect.Effect<string>

  /**
   * Add compensation logic to an effect inside a Workflow.
   *
   * **Details**
   *
   * The compensation finalizer is called if the entire workflow fails, allowing you to perform cleanup or other actions based on the success value and the cause of the workflow failure.
   *
   * **Gotchas**
   *
   * Compensation finalizers are only registered for top-level effects in the workflow and do not work for nested activities.
   */
  readonly withCompensation: {
    <A, R2>(
      compensation: (
        value: A,
        cause: Cause.Cause<Error["Type"]>
      ) => Effect.Effect<void, never, R2>
    ): <E, R>(
      effect: Effect.Effect<A, E, R>
    ) => Effect.Effect<
      A,
      E,
      R | R2 | WorkflowInstance | Execution<Tag> | Scope.Scope
    >
    <A, E, R, R2>(
      effect: Effect.Effect<A, E, R>,
      compensation: (
        value: A,
        cause: Cause.Cause<Error["Type"]>
      ) => Effect.Effect<void, never, R2>
    ): Effect.Effect<
      A,
      E,
      R | R2 | WorkflowInstance | Execution<Tag> | Scope.Scope
    >
  }
}

/**
 * Schema constraint for workflow payload schemas that expose struct fields.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface AnyStructSchema extends Schema.Top {
  readonly fields: Schema.Struct.Fields
}

/**
 * Type-level marker for services associated with a specific workflow
 * execution tag.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export interface Execution<Tag extends string> {
  readonly _: unique symbol
  readonly _tag: Tag
}

/**
 * Type-erased workflow shape for APIs that operate on workflows without
 * preserving their specific payload, success, or error types.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Any {
  new(_: never): {}

  readonly [TypeId]: typeof TypeId
  readonly _tag: string
  readonly executionId: (payload: any) => Effect.Effect<string>
  readonly payloadSchema: AnyStructSchema
  readonly successSchema: Schema.Top
  readonly errorSchema: Schema.Top
  readonly annotations: Context.Context<never>
  readonly idempotencyKey: (payload: any) => string
  readonly suspendedRetrySchedule?: Schedule.Schedule<any, unknown> | undefined
}

/**
 * Type-erased workflow shape that also exposes executable operations needed by
 * workflow proxy and engine helpers.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AnyWithProps extends Any {
  readonly payloadSchema: AnyStructSchema
  readonly successSchema: Schema.Top
  readonly errorSchema: Schema.Top
  readonly execute: (
    payload: any,
    options?: { readonly discard?: boolean }
  ) => Effect.Effect<any, any, any>
  readonly resume: (
    executionId: string
  ) => Effect.Effect<void, never, WorkflowEngine>
}

/**
 * Extracts the payload schema from a `Workflow`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type PayloadSchema<W> = W extends Workflow<
  infer _Name,
  infer _Payload,
  infer _Success,
  infer _Error
> ? _Payload
  : never

/**
 * Computes the schema services required by clients that execute or poll
 * workflows.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type RequirementsClient<Workflows extends Any> = Workflows extends Workflow<
  infer _Name,
  infer _Payload,
  infer _Success,
  infer _Error
> ?
    | _Payload["EncodingServices"]
    | _Success["DecodingServices"]
    | _Error["DecodingServices"]
  : never

/**
 * Computes the schema services required by handlers that decode workflow
 * payloads and encode workflow results.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type RequirementsHandler<Workflows extends Any> = Workflows extends Workflow<
  infer _Name,
  infer _Payload,
  infer _Success,
  infer _Error
> ?
    | _Payload["DecodingServices"]
    | _Payload["EncodingServices"]
    | _Success["DecodingServices"]
    | _Success["EncodingServices"]
    | _Error["DecodingServices"]
    | _Error["EncodingServices"]
  : never

const EngineTag = Context.Service<WorkflowEngine, WorkflowEngine["Service"]>(
  "effect/workflow/WorkflowEngine" satisfies typeof WorkflowEngine.key
)

const InstanceTag = Context.Service<
  WorkflowInstance,
  WorkflowInstance["Service"]
>(
  "effect/workflow/WorkflowEngine/WorkflowInstance" satisfies typeof WorkflowInstance.key
)

const makeExecutionIdFromPayload = (self: AnyWithProps, payload: unknown) =>
  makeHashDigest(`${self._tag.length}:${self._tag}:${self.idempotencyKey(payload)}`)

const Proto = {
  [TypeId]: TypeId,
  annotate(this: AnyWithProps, tag: Context.Key<any, any>, value: any) {
    return makeProto({
      _tag: this._tag,
      payloadSchema: this.payloadSchema,
      successSchema: this.successSchema,
      errorSchema: this.errorSchema,
      annotations: Context.add(this.annotations, tag, value),
      idempotencyKey: this.idempotencyKey,
      suspendedRetrySchedule: this.suspendedRetrySchedule
    })
  },
  annotateMerge(this: AnyWithProps, context: Context.Context<any>) {
    return makeProto({
      _tag: this._tag,
      payloadSchema: this.payloadSchema,
      successSchema: this.successSchema,
      errorSchema: this.errorSchema,
      annotations: Context.merge(this.annotations, context),
      idempotencyKey: this.idempotencyKey,
      suspendedRetrySchedule: this.suspendedRetrySchedule
    })
  },
  execute<const Discard extends boolean = false>(
    this: AnyWithProps,
    fields: any,
    opts?: { readonly discard?: Discard } | undefined
  ) {
    return Effect.suspend(() => {
      const payload = this.payloadSchema.make(fields)
      const run = Effect.flatMap(
        EngineTag,
        (engine) =>
          Effect.flatMap(makeExecutionIdFromPayload(this, payload), (executionId) =>
            Effect.andThen(
              Effect.annotateCurrentSpan({ executionId }),
              engine.execute(this as any, {
                executionId,
                payload,
                discard: opts?.discard,
                suspendedRetrySchedule: this.suspendedRetrySchedule
              })
            ))
      )
      // Register with the parent before the execution id is computed, so a
      // sibling that suspends first waits for this child to be dispatched.
      return opts?.discard ? run : withPendingActivity(run)
    }).pipe(
      Effect.withSpan(
        `${this._tag}.execute`,
        {},
        { captureStackTrace: false }
      )
    ) as any
  },
  poll(this: Workflow<string, AnyStructSchema, Schema.Top, Schema.Top>, executionId: string) {
    return Effect.flatMap(EngineTag, (engine) => engine.poll(this, executionId)).pipe(
      Effect.withSpan(`${this._tag}.poll`, { attributes: { executionId } }, { captureStackTrace: false })
    )
  },
  interrupt(this: AnyWithProps, executionId: string) {
    return Effect.flatMap(EngineTag, (engine) => engine.interrupt(this, executionId)).pipe(
      Effect.withSpan(`${this._tag}.interrupt`, { attributes: { executionId } }, { captureStackTrace: false })
    )
  },
  resume(this: Workflow<string, AnyStructSchema, Schema.Top, Schema.Top>, executionId: string) {
    return Effect.flatMap(EngineTag, (engine) => engine.resume(this, executionId)).pipe(
      Effect.withSpan(`${this._tag}.resume`, { attributes: { executionId } }, { captureStackTrace: false })
    )
  },
  toLayer(this: Workflow<string, AnyStructSchema, Schema.Top, Schema.Top>, execute: any) {
    return Layer.effectDiscard(
      Effect.flatMap(EngineTag, (engine) => engine.register(this, execute))
    )
  },
  executionId(this: AnyWithProps, payload: any) {
    return Effect.flatMap(
      Effect.orDie(this.payloadSchema.makeEffect(payload)),
      (payload) => makeExecutionIdFromPayload(this, payload)
    )
  },
  withCompensation: ((...args: ReadonlyArray<any>) => (withCompensation as any)(...args))
}

const makeProto = <
  const Tag extends string,
  Payload extends AnyStructSchema,
  Success extends Schema.Top,
  Error extends Schema.Top
>(options: {
  readonly _tag: Tag
  readonly payloadSchema: Payload
  readonly successSchema: Success
  readonly errorSchema: Error
  readonly annotations: Context.Context<never>
  readonly idempotencyKey: (payload: Payload["Type"]) => string
  readonly suspendedRetrySchedule?: Schedule.Schedule<any, unknown> | undefined
}): Workflow<Tag, Payload, Success, Error> => {
  function Workflow() {}
  Object.setPrototypeOf(Workflow, Proto)
  Object.assign(Workflow, options)
  return Workflow as any
}

/**
 * Creates a durable workflow definition with schemas, annotations, and
 * deterministic execution IDs derived from the workflow tag and idempotency
 * key.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <
  const Tag extends string,
  Payload extends Schema.Struct.Fields | AnyStructSchema,
  Success extends Schema.Top = Schema.Void,
  Error extends Schema.Top = Schema.Never
>(tag: Tag, options: {
  readonly payload: Payload
  readonly idempotencyKey: (
    payload: Payload extends Schema.Struct.Fields ? Schema.Struct.Type<Payload>
      : Payload["Type"]
  ) => string
  readonly success?: Success
  readonly error?: Error
  readonly suspendedRetrySchedule?: Schedule.Schedule<any, unknown> | undefined
  readonly annotations?: Context.Context<never>
}): Workflow<
  Tag,
  Payload extends Schema.Struct.Fields ? Schema.Struct<Payload> : Payload,
  Success,
  Error
> =>
  makeProto<Tag, Payload extends Schema.Struct.Fields ? Schema.Struct<Payload> : Payload, Success, Error>({
    _tag: tag,
    payloadSchema: (Schema.isSchema(options.payload)
      ? options.payload
      : Schema.Struct(options.payload as any)) as Payload extends Schema.Struct.Fields ? Schema.Struct<Payload>
        : Payload,
    successSchema: options.success ?? (Schema.Void as any),
    errorSchema: options.error ?? (Schema.Never as any),
    annotations: options.annotations ?? Context.empty(),
    idempotencyKey: options.idempotencyKey as any,
    suspendedRetrySchedule: options.suspendedRetrySchedule
  })

const ResultTypeId = "~effect/workflow/Workflow/Result"

/**
 * Returns `true` when a value is a workflow `Result`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isResult = <A = unknown, E = unknown>(
  u: unknown
): u is Result<A, E> => Predicate.hasProperty(u, ResultTypeId)

/**
 * Result of a workflow execution, either a completed exit or a suspended
 * workflow state.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Result<A, E> = Complete<A, E> | Suspended

/**
 * Encoded representation of a workflow `Result`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ResultEncoded<A, E> =
  | CompleteEncoded<A, E>
  | typeof Suspended.Encoded

/**
 * Encoded representation of a completed workflow result containing an encoded
 * `Exit`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface CompleteEncoded<A, E> {
  readonly _tag: "Complete"
  readonly exit: ExitEncoded<A, E>
}

/**
 * Schema constructor for `Complete` workflow results using the supplied
 * success and error schemas.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface CompleteSchema<
  Success extends Schema.Constraint,
  Error extends Schema.Constraint
> extends
  Schema.declareConstructor<
    Complete<Success["Type"], Error["Type"]>,
    Complete<Success["Encoded"], Error["Encoded"]>,
    readonly [Schema.Exit<Success, Error, Schema.Defect>]
  >
{
  readonly success: Success
  readonly error: Error
}

/**
 * Represents a completed workflow execution with its success or failure `Exit`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class Complete<A, E> extends Data.TaggedClass("Complete")<{
  readonly exit: Exit.Exit<A, E>
}> {
  /**
   * Marks this value as a workflow result for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ResultTypeId] = ResultTypeId

  /**
   * Builds the schema for completed workflow results from success and error schemas.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static Schema<Success extends Schema.Constraint, Error extends Schema.Constraint>(options: {
    readonly success: Success
    readonly error: Error
  }): CompleteSchema<Success, Error> {
    // TODO: extract to a helper function
    const schema = Schema.declareConstructor<
      Complete<Success["Type"], Error["Type"]>,
      Complete<Success["Encoded"], Error["Encoded"]>
    >()(
      [Schema.Exit(options.success, options.error, Schema.Defect())],
      ([exit]) => (input, ast, options) => {
        if (!(isResult(input) && input._tag === "Complete")) {
          return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
        }
        return Effect.mapBothEager(
          SchemaParser.decodeEffect(exit)(input.exit, options),
          {
            onSuccess: (exit) => new Complete({ exit }),
            onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "exit", issue, input, options)
          }
        )
      },
      {
        expected: "Workflow.Complete",
        toCodecJson: ([exit]) =>
          Schema.link<Complete<Success["Encoded"], Error["Encoded"]>>()(
            Schema.Struct({
              _tag: Schema.tag("Complete"),
              exit
            }),
            Tranformation.transform({
              decode: (encoded) => new Complete({ exit: encoded.exit }),
              encode: (result) => (({
                _tag: "Complete",
                exit: result.exit
              }) as const)
            })
          )
      }
    )
    return Schema.make(schema.ast, {
      success: options.success,
      error: options.error
    })
  }
}

/**
 * Represents a suspended workflow execution, optionally carrying the cause that
 * triggered suspension.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class Suspended extends Schema.Class<Suspended>(
  "effect/workflow/Workflow/Suspended"
)({
  _tag: Schema.tag("Suspended"),
  cause: Schema.optional(Schema.Cause(Schema.Never, Schema.Defect()))
}) {
  /**
   * Marks this value as a workflow result for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ResultTypeId] = ResultTypeId
}

/**
 * Creates a schema for workflow results using the supplied success and error
 * schemas.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Result = <
  Success extends Schema.Constraint,
  Error extends Schema.Constraint
>(options: {
  readonly success: Success
  readonly error: Error
}) => Schema.Union([Complete.Schema(options), Suspended])

const AnyOrVoid = Schema.Union([Schema.Any, Schema.Void])

/**
 * Schema for encoded workflow results with generic success and error payloads.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ResultEncoded: Schema.Codec<ResultEncoded<any, any>> = Schema.toEncoded(
  Schema.toCodecJson(
    Result({
      success: AnyOrVoid,
      error: AnyOrVoid
    })
  )
) as any

/**
 * Runs an effect as a workflow execution and converts its outcome into a
 * `Result`, handling suspension, defect capture, interruption, and workflow
 * scope finalization.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const intoResult = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<
  Result<A, E>,
  never,
  Exclude<R, Scope.Scope> | WorkflowInstance
> =>
  Effect.contextWith((context: Context.Context<WorkflowInstance>) => {
    const instance = Context.get(context, InstanceTag)
    const captureDefects = Context.get(instance.workflow.annotations, CaptureDefects)
    const suspendOnFailure = Context.get(instance.workflow.annotations, SuspendOnFailure)
    return effect.pipe(
      // so we can use external interruption to suspend the workflow
      Effect.forkChild({ startImmediately: true }),
      Effect.flatMap((fiber) => Effect.onInterrupt(Fiber.join(fiber), () => Fiber.interrupt(fiber))),
      Effect.interruptible,
      suspendOnFailure
        ? Effect.catchCause((cause) => {
          if (instance.abandoned) {
            return Effect.failCause(cause)
          }
          instance.suspended = true
          if (!Cause.hasInterruptsOnly(cause)) {
            instance.cause = Cause.die(Cause.squash(cause))
          }
          return Effect.interrupt
        })
        : identity,
      Effect.scoped,
      Effect.matchCauseEffect({
        onSuccess: (value) => Effect.succeed(new Complete({ exit: Exit.succeed(value) })),
        onFailure: (cause): Effect.Effect<Result<A, E>> => {
          const [interrupts, reasons] = Arr.partition(
            cause.reasons,
            Filter.fromPredicate(Cause.isInterruptReason)
          )
          const hasInterruptsOnly = interrupts.length === cause.reasons.length
          const filtered = reasons.length === 0 ? cause : Cause.fromReasons(reasons)
          const abandoned = instance.abandoned && !instance.interrupted && hasInterruptsOnly
          instance.abandoned = abandoned
          if (instance.suspended && hasInterruptsOnly && !abandoned) {
            return Effect.succeed(new Suspended({ cause: instance.cause }))
          }
          if (!instance.interrupted && hasInterruptsOnly) {
            // External interrupts exit without a result. When the cluster has
            // marked this attempt abandoned, owner-local resources are
            // released without running durable workflow finalizers so the run
            // can replay elsewhere.
            return Effect.failCause(filtered as Cause.Cause<never>)
          }
          return !captureDefects && Cause.hasDies(cause)
            ? Effect.failCause(filtered as Cause.Cause<never>)
            : Effect.succeed(new Complete({ exit: Exit.failCause(filtered) }))
        }
      }),
      (eff) =>
        Effect.onExitPrimitive(eff, (exit) => {
          if (Exit.isFailure(exit)) {
            return Scope.close(instance.scope, exit)
          } else if (exit.value._tag === "Complete") {
            return Scope.close(instance.scope, exit.value.exit)
          }
          return Effect.void
        }, true),
      Effect.uninterruptible
    )
  })

/**
 * Wraps an activity-like effect so workflow suspension waits for currently
 * running activities to finish or suspend.
 *
 * @stability unstable
 * @category resource management
 * @since 4.0.0
 */
export const wrapActivityResult = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  isSuspend: (value: A) => boolean
): Effect.Effect<A, E, R | WorkflowInstance> =>
  Effect.contextWith((context: Context.Context<WorkflowInstance>) => {
    const instance = Context.get(context, InstanceTag)
    return Effect.acquireUseRelease(
      Effect.sync(() => adoptActivityUnsafe(context, instance) ?? registerActivityUnsafe(instance)),
      () => effect,
      (registration, exit) => {
        releaseActivityUnsafe(registration)
        const isSuspended = Exit.isSuccess(exit) && isSuspend(exit.value)
        if (
          Exit.isSuccess(exit) &&
          isResult(exit.value) &&
          exit.value._tag === "Suspended" &&
          exit.value.cause
        ) {
          instance.cause = instance.cause
            ? Cause.combine(instance.cause, exit.value.cause)
            : exit.value.cause
        }
        return isSuspended && instance.activityState.count > 0
          ? waitForZero(instance)
          : Effect.void
      }
    )
  })

interface ActivityRegistration {
  readonly instance: WorkflowInstance["Service"]
  state: "pending" | "adopted" | "released"
}

const PendingActivityRegistration = Context.Service<ActivityRegistration>(
  "effect/workflow/Workflow/PendingActivityRegistration"
)

const registerActivityUnsafe = (instance: WorkflowInstance["Service"]): ActivityRegistration => {
  const state = instance.activityState
  if (state.count === 0) state.latch.closeUnsafe()
  state.count++
  return { instance, state: "pending" }
}

const adoptActivityUnsafe = (
  context: Context.Context<never>,
  instance: WorkflowInstance["Service"]
): ActivityRegistration | undefined => {
  const pending = Context.getOrUndefined(context, PendingActivityRegistration)
  if (!pending || pending.instance !== instance) {
    return undefined
  }
  if (pending.state !== "pending") {
    throw new Error("Workflow.wrapActivityResult: pending child registration has already been consumed")
  }
  pending.state = "adopted"
  return pending
}

const releaseActivityUnsafe = (registration: ActivityRegistration) => {
  if (registration.state === "released") return
  registration.state = "released"
  const state = registration.instance.activityState
  state.count--
  if (state.count === 0) state.latch.openUnsafe()
}

/**
 * Registers a pending child workflow execution with the current workflow
 * instance before any asynchronous work runs. `wrapActivityResult` adopts the
 * registration once the execution is dispatched.
 */
const withPendingActivity = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.contextWith((context: Context.Context<never>) => {
    const instance = Context.getOrUndefined(context, InstanceTag)
    if (!instance) return effect
    return Effect.acquireUseRelease(
      Effect.sync(() => registerActivityUnsafe(instance)),
      (registration) => Effect.provideService(effect, PendingActivityRegistration, registration),
      (registration) => Effect.sync(() => releaseActivityUnsafe(registration))
    )
  })

const waitForZero = Effect.fnUntraced(function*(instance: WorkflowInstance["Service"]) {
  const state = instance.activityState
  while (true) {
    if (state.count > 0) {
      yield* state.latch.await
      yield* Effect.yieldNow
      continue
    }
    yield* Effect.yieldNow
    if (state.count === 0) return
  }
})

/**
 * Accesses the workflow scope, which is only closed when the workflow execution fully completes.
 *
 * @stability unstable
 * @category resource management
 * @since 4.0.0
 */
export const scope: Effect.Effect<
  Scope.Scope,
  never,
  WorkflowInstance
> = Effect.map(
  InstanceTag,
  (instance) => instance.scope as Scope.Scope
)

/**
 * Provides the workflow scope to the given effect, and closes the scope only when the workflow execution fully completes.
 *
 * @stability unstable
 * @category resource management
 * @since 4.0.0
 */
export const provideScope = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, Exclude<R, Scope.Scope> | WorkflowInstance> =>
  Effect.flatMap(scope, (scope) => Scope.provide(effect, scope))

/**
 * Adds an exit finalizer to the current workflow scope, preserving the
 * services available when the finalizer is registered.
 *
 * **Details**
 *
 * Body-level `Effect.onExit` finalizers cannot observe a deposited workflow
 * interrupt. Use this function for terminal-state work that must observe it.
 * Finalizers are skipped when a cluster owner abandons a run attempt for
 * replay; owner-local scope finalizers registered with {@link provideScope}
 * still run.
 *
 * @stability unstable
 * @category resource management
 * @since 4.0.0
 */
export const addFinalizer: <R>(
  f: (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void, never, R>
) => Effect.Effect<
  void,
  never,
  WorkflowInstance | R
> = Effect.fnUntraced(function*<R>(
  f: (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void, never, R>
) {
  const instance = yield* InstanceTag
  const services = yield* Effect.context<R>()
  yield* Scope.addFinalizerExit(
    instance.scope,
    (exit) => instance.abandoned ? Effect.void : Effect.provideContext(f(exit), services)
  )
})

/**
 * Adds compensation logic to an effect inside a Workflow.
 *
 * **When to use**
 *
 * Use when a top-level workflow step needs compensating cleanup if the overall
 * workflow later fails after the step succeeds.
 *
 * **Details**
 *
 * The compensation finalizer is called if the entire workflow fails, allowing you to perform cleanup or other actions based on the success value and the cause of the workflow failure.
 *
 * **Gotchas**
 *
 * Compensation finalizers are only registered for top-level effects in the workflow and do not work for nested activities.
 *
 * @stability unstable
 * @category compensation
 * @since 4.0.0
 */
export const withCompensation: {
  <A, R2>(
    compensation: (value: A, cause: Cause.Cause<unknown>) => Effect.Effect<void, never, R2>
  ): <E, R>(
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R | R2 | WorkflowInstance | Scope.Scope>
  <A, E, R, R2>(
    effect: Effect.Effect<A, E, R>,
    compensation: (value: A, cause: Cause.Cause<unknown>) => Effect.Effect<void, never, R2>
  ): Effect.Effect<A, E, R | R2 | WorkflowInstance | Scope.Scope>
} = dual(2, <A, E, R, R2>(
  effect: Effect.Effect<A, E, R>,
  compensation: (value: A, cause: Cause.Cause<unknown>) => Effect.Effect<void, never, R2>
): Effect.Effect<A, E, R | R2 | WorkflowInstance | Scope.Scope> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.tap(
      restore(effect),
      (value) => addFinalizer((exit) => Exit.isSuccess(exit) ? Effect.void : compensation(value, exit.cause))
    )
  ))

/**
 * Marks a workflow instance as suspended and interrupts the current fiber to
 * stop execution until it is resumed.
 *
 * @stability unstable
 * @category interruption
 * @since 4.0.0
 */
export const suspend = (instance: WorkflowInstance["Service"]): Effect.Effect<never> =>
  Effect.interruptible(Effect.callback<never>(() => {
    instance.suspended = true
    const fiber = Fiber.getCurrent()!
    fiber.interruptUnsafe(fiber.id)
  }))

/**
 * Captures defects for a workflow and includes them in the result of the workflow or its activities.
 *
 * **Details**
 *
 * By default, this annotation is set to `true`, meaning defects are captured.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const CaptureDefects = Context.Reference<boolean>(
  "effect/workflow/Workflow/CaptureDefects",
  {
    defaultValue: constTrue
  }
)

/**
 * Marks a workflow to suspend when it encounters any error.
 *
 * **Details**
 *
 * The suspended execution can later be resumed with the workflow's `resume` method, for example `MyWorkflow.resume(executionId)`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const SuspendOnFailure = Context.Reference<boolean>(
  "effect/workflow/Workflow/SuspendOnFailure",
  {
    defaultValue: constFalse
  }
)
