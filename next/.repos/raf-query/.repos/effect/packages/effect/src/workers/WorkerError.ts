/**
 * Typed error model for worker APIs.
 *
 * This module defines the `WorkerError` wrapper, the reason variants for spawn,
 * send, receive, and unknown worker failures, a schema union for those reasons,
 * and a guard for recognizing worker errors at runtime.
 *
 * @stability unstable
 * @since 4.0.0
 */
import { hasProperty } from "../Predicate.ts"
import * as Schema from "../Schema.ts"

const TypeId = "~effect/workers/WorkerError" as const

/**
 * Type-level identifier used to brand `WorkerError` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = typeof TypeId

/**
 * Returns `true` when a value is a `WorkerError`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isWorkerError = (u: unknown): u is WorkerError => hasProperty(u, TypeId)

/**
 * Worker error reason for failures while spawning or setting up a worker.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class WorkerSpawnError extends Schema.Error<WorkerSpawnError>(
  "effect/workers/WorkerError/WorkerSpawnError"
)({
  _tag: Schema.tag("WorkerSpawnError"),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

/**
 * Worker error reason for failures while sending a message to a worker.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class WorkerSendError extends Schema.Error<WorkerSendError>(
  "effect/workers/WorkerError/WorkerSendError"
)({
  _tag: Schema.tag("WorkerSendError"),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

/**
 * Worker error reason for failures while receiving or handling a message from a
 * worker.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class WorkerReceiveError extends Schema.Error<WorkerReceiveError>(
  "effect/workers/WorkerError/WorkerReceiveError"
)({
  _tag: Schema.tag("WorkerReceiveError"),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

/**
 * Worker error reason for an unclassified worker failure.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class WorkerUnknownError extends Schema.Error<WorkerUnknownError>(
  "effect/workers/WorkerError/WorkerUnknownError"
)({
  _tag: Schema.tag("WorkerUnknownError"),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

/**
 * Union of the specific failure reasons that can be wrapped by a `WorkerError`.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export type WorkerErrorReason =
  | WorkerSpawnError
  | WorkerSendError
  | WorkerReceiveError
  | WorkerUnknownError

/**
 * Schema for decoding and encoding all supported worker error reason variants.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const WorkerErrorReason: Schema.Union<[
  typeof WorkerSpawnError,
  typeof WorkerSendError,
  typeof WorkerReceiveError,
  typeof WorkerUnknownError
]> = Schema.Union([
  WorkerSpawnError,
  WorkerSendError,
  WorkerReceiveError,
  WorkerUnknownError
])

/**
 * Error raised by worker APIs, wrapping a specific `WorkerErrorReason` and
 * exposing its message and cause.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class WorkerError extends Schema.Error<WorkerError>(TypeId)({
  _tag: Schema.tag("WorkerError"),
  reason: WorkerErrorReason
}) {
  // @effect-diagnostics-next-line overriddenSchemaConstructor:off
  constructor(props: {
    readonly reason: WorkerErrorReason
  }) {
    super({
      ...props,
      cause: props.reason.cause
    } as any)
  }
  /**
   * Marks this value as a worker error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId]: TypeId = TypeId

  override get message(): string {
    return this.reason.message
  }
}
