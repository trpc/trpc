/**
 * Defines named effects whose results can be stored by a workflow engine.
 *
 * An `Activity` is an `Effect` with a stable name and schemas for its success
 * and error values. `make` wraps an effect so the `WorkflowEngine` can execute
 * it, store its result, or replay that result during a workflow run. This module
 * also includes helpers for retry attempts, idempotency keys, and durable races.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Effectable from "../Effectable.ts"
import { dual } from "../Function.ts"
import * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import type { Scope } from "../Scope.ts"
import type * as Types from "../Types.ts"
import * as DurableDeferred from "./DurableDeferred.ts"
import { makeHashDigest } from "./internal/crypto.ts"
import * as Workflow from "./Workflow.ts"
import type { WorkflowEngine, WorkflowInstance } from "./WorkflowEngine.ts"

const TypeId = "~effect/workflow/Activity"

/**
 * Durable workflow activity that behaves as an `Effect` and records its name,
 * result schemas, annotations, and encoded execution form for the workflow
 * engine.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Activity<
  Success extends Schema.Constraint = Schema.Void,
  Error extends Schema.Constraint = Schema.Never,
  R = never
> extends
  Effect.Effect<
    Success["Type"],
    Error["Type"],
    Success["DecodingServices"] | Error["DecodingServices"] | R | WorkflowEngine | WorkflowInstance
  >
{
  readonly [TypeId]: typeof TypeId
  readonly name: string
  readonly successSchema: Success
  readonly errorSchema: Error
  readonly exitSchema: Schema.Exit<Success, Error, Schema.Defect>
  readonly exitSchemaPartial: Schema.Exit<Success, Error, Schema.Unknown>
  readonly annotations: Context.Context<never>
  annotate<I, S>(
    key: Context.Key<I, S>,
    value: S
  ): Activity<Success, Error, R>
  annotateMerge<I>(
    annotations: Context.Context<I>
  ): Activity<Success, Error, R>
  readonly execute: Effect.Effect<
    Success["Type"],
    Error["Type"],
    | Success["DecodingServices"]
    | Success["EncodingServices"]
    | Error["DecodingServices"]
    | Error["EncodingServices"]
    | R
    | Scope
    | WorkflowEngine
    | WorkflowInstance
  >
  readonly executeEncoded: Effect.Effect<
    unknown,
    unknown,
    | Success["DecodingServices"]
    | Success["EncodingServices"]
    | Error["DecodingServices"]
    | Error["EncodingServices"]
    | R
    | Scope
    | WorkflowEngine
    | WorkflowInstance
  >
}

/**
 * Type-erased activity shape for APIs that only need the activity identity,
 * name, annotations, and encoded execution.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Any {
  readonly [TypeId]: typeof TypeId
  readonly name: string
  readonly executeEncoded: Effect.Effect<any, any, any>
  readonly annotations: Context.Context<never>
}

/**
 * Type-erased activity shape that also exposes success and error schemas for
 * derived workflow APIs.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AnyWithProps {
  readonly [TypeId]: typeof TypeId
  readonly name: string
  readonly successSchema: Schema.Top
  readonly errorSchema: Schema.Top
  readonly executeEncoded: Effect.Effect<any, any, any>
}

/**
 * Creates a workflow activity from an effect, using the provided schemas to
 * encode successes and failures for durable execution.
 *
 * **Gotchas**
 *
 * Only completed activity results are memoized. If the activity suspends while
 * awaiting child workflows or a durable clock, its body runs again when the
 * parent workflow replays. Side effects before the suspension can repeat;
 * make those side effects idempotent.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <
  R,
  Success extends Schema.Constraint = Schema.Void,
  Error extends Schema.Constraint = Schema.Never
>(options: {
  readonly name: string
  readonly success?: Success | undefined
  readonly error?: Error | undefined
  readonly execute: Effect.Effect<Success["Type"], Error["Type"], R>
  readonly interruptRetryPolicy?: Schedule.Schedule<any, Cause.Cause<unknown>> | undefined
  readonly annotations?: Context.Context<never> | undefined
}): Activity<Success, Error, Exclude<R, WorkflowInstance | WorkflowEngine | Scope>> => {
  const successSchema = options.success ?? (Schema.Void as any as Success)
  const errorSchema = options.error ?? (Schema.Never as any as Error)
  const successSchemaJson = Schema.toCodecJson(successSchema)
  const errorSchemaJson = Schema.toCodecJson(errorSchema)
  // oxlint-disable-next-line prefer-const
  let execute!: Effect.Effect<Success["Type"], Error["Type"], any>
  const executeWithoutInterrupt = retryOnInterrupt(
    options.name,
    options.interruptRetryPolicy
  )(options.execute)
  const self: Activity<Success, Error, Exclude<R, WorkflowInstance | WorkflowEngine>> = {
    ...Effectable.Prototype<Activity<Success, Error, R>>({
      label: "Activity",
      evaluate(_) {
        return execute
      }
    }),
    [TypeId]: TypeId,
    name: options.name,
    successSchema,
    errorSchema,
    exitSchema: Schema.Exit(successSchemaJson, errorSchemaJson, Schema.Defect()),
    exitSchemaPartial: Schema.Exit(successSchemaJson, errorSchemaJson, Schema.Unknown),
    annotations: options.annotations ?? Context.empty(),
    annotate(tag: Context.Key<any, any>, value: any) {
      return make({
        ...options,
        annotations: Context.add(self.annotations, tag, value)
      })
    },
    annotateMerge(context: Context.Context<any>) {
      return make({
        ...options,
        annotations: Context.merge(self.annotations, context)
      })
    },
    execute: executeWithoutInterrupt,
    executeEncoded: Effect.matchEffect(executeWithoutInterrupt, {
      onFailure: (error) => Effect.flatMap(Effect.orDie(Schema.encodeEffect(errorSchemaJson)(error)), Effect.fail),
      onSuccess: (value) => Effect.orDie(Schema.encodeEffect(successSchemaJson)(value))
    })
  } as any
  execute = makeExecute(self)
  return self
}

const interruptRetryPolicy = Schedule.min([
  Schedule.exponential(400, 1.5),
  Schedule.spaced("10 seconds")
]).pipe(
  Schedule.setInputType<Cause.Cause<unknown>>(),
  Schedule.while((meta) => meta.attempt <= 10 && Cause.hasInterrupts(meta.input))
)

const retryOnInterrupt = (
  name: string,
  policy: Schedule.Schedule<any, Cause.Cause<unknown>> = interruptRetryPolicy
) =>
<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | WorkflowInstance> =>
  Effect.flatMap(InstanceTag, (instance) =>
    effect.pipe(
      Effect.sandbox,
      // A suspension interrupts the activity body on purpose and must surface
      // as a suspended result instead of being retried.
      Effect.retry({ schedule: policy, while: () => !instance.suspended }),
      Effect.catch((cause) =>
        Cause.hasInterrupts(cause) && !instance.suspended
          ? Effect.die(`Activity "${name}" interrupted and retry attempts exhausted`)
          : Effect.failCause(cause)
      )
    ))

/**
 * Retries an effect with `Effect.retry` while updating `CurrentAttempt` for
 * each attempt.
 *
 * @stability unstable
 * @category error handling
 * @since 4.0.0
 */
export const retry: {
  <E, O extends Types.NoExcessProperties<Omit<Effect.Retry.Options<E>, "schedule">, O>>(
    options: O
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Retry.Return<R, E, A, O>
  <A, E, R, O extends Types.NoExcessProperties<Omit<Effect.Retry.Options<E>, "schedule">, O>>(
    self: Effect.Effect<A, E, R>,
    options: O
  ): Effect.Retry.Return<R, E, A, O>
} = dual(
  2,
  (effect: Effect.Effect<any, any, any>, options: {}) =>
    Effect.suspend(() => {
      let attempt = 1
      return Effect.suspend(() => Effect.provideService(effect, CurrentAttempt, attempt++)).pipe(Effect.retry(options))
    })
)

/**
 * Context reference containing the current activity retry attempt, defaulting
 * to `1`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const CurrentAttempt = Context.Reference<number>(
  "effect/workflow/Activity/CurrentAttempt",
  { defaultValue: () => 1 }
)

/**
 * Computes a deterministic activity idempotency key from the current workflow
 * execution ID, the supplied name, and optionally the current attempt.
 *
 * @stability unstable
 * @category idempotency
 * @since 4.0.0
 */
export const idempotencyKey: (
  name: string,
  options?: {
    readonly includeAttempt?: boolean | undefined
  } | undefined
) => Effect.Effect<string, never, WorkflowInstance> = Effect.fnUntraced(function*(name: string, options?: {
  readonly includeAttempt?: boolean | undefined
}) {
  const instance = yield* InstanceTag
  let key = `${instance.executionId}`
  if (options?.includeAttempt) {
    const attempt = yield* CurrentAttempt
    key += `-${attempt}`
  }
  key += `-${name}`
  return yield* makeHashDigest(key)
})

/**
 * Runs a non-empty collection of activities as a durable race and returns the
 * first completed success or failure using unioned success and error schemas.
 *
 * @stability unstable
 * @category racing
 * @since 4.0.0
 */
export const raceAll = <const Activities extends NonEmptyReadonlyArray<Any>>(
  name: string,
  activities: Activities
): Effect.Effect<
  Activities[number] extends Activity<infer _A, infer _E, infer _R> ? _A["Type"] : never,
  Activities[number] extends Activity<infer _A, infer _E, infer _R> ? _E["Type"] : never,
  | (Activities[number] extends Activity<infer Success, infer Error, infer R>
    ? Success["DecodingServices"] | Error["DecodingServices"] | R
    : never)
  | WorkflowEngine
  | WorkflowInstance
> =>
  DurableDeferred.raceAll({
    name: `Activity/${name}`,
    success: Schema.Union(
      activities.map((activity) => (activity as any).successSchema)
    ),
    error: Schema.Union(
      activities.map((activity) => (activity as any).errorSchema)
    ),
    effects: activities.map((activity) => (activity as any)) as any
  }) as any

// -----------------------------------------------------------------------------
// internal
// -----------------------------------------------------------------------------

const EngineTag = Context.Service<WorkflowEngine, WorkflowEngine["Service"]>(
  "effect/workflow/WorkflowEngine" satisfies typeof WorkflowEngine.key
)
const InstanceTag = Context.Service<WorkflowInstance, WorkflowInstance["Service"]>(
  "effect/workflow/WorkflowEngine/WorkflowInstance" satisfies typeof WorkflowInstance.key
)

const makeExecute = Effect.fnUntraced(function*<
  R,
  Success extends Schema.Constraint = typeof Schema.Void,
  Error extends Schema.Constraint = typeof Schema.Never
>(activity: Activity<Success, Error, R>) {
  const engine = yield* EngineTag
  const instance = yield* InstanceTag
  const attempt = yield* CurrentAttempt
  yield* Effect.annotateCurrentSpan({ executionId: instance.executionId })
  const result = yield* Workflow.wrapActivityResult(
    engine.activityExecute(activity, attempt),
    (_) => _._tag === "Suspended"
  )
  if (result._tag === "Suspended") {
    return yield* Workflow.suspend(instance)
  }
  return yield* result.exit
}, (effect, activity) =>
  Effect.withSpan(effect, activity.name, {
    captureStackTrace: false
  }))
