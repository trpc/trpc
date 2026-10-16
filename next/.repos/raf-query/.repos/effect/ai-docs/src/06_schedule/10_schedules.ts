/**
 * @title Working with the Schedule module
 *
 * Build schedules, compose them, and use them with `Effect.retry` and `Effect.repeat`.
 */
import { Duration, Effect, Random, Schedule, Schema } from "effect"

// Production pattern: capped exponential backoff with jitter and max attempts.
// Delays start at 250ms, grow exponentially with jitter, and are capped at 10s.
export const productionRetrySchedule = Schedule.min([
  Schedule.exponential("250 millis"),
  // Cap the delay at 10 seconds to avoid excessively long waits.
  Schedule.spaced("10 seconds")
]).pipe(
  Schedule.jittered,
  Schedule.setInputType<HttpError>(),
  Schedule.while(({ input }) => input.retryable)
)

export const fetchUserProfile = Effect.fn("fetchUserProfile")(
  function*(userId: string) {
    const random = yield* Random.next
    const status = random > 0.7
      ? 200
      : random > 0.3
      ? 503
      : 401

    if (status !== 200) {
      return yield* new HttpError({
        message: `Request for ${userId} failed`,
        status,
        retryable: status >= 500
      })
    }

    return {
      id: userId,
      name: "Ada Lovelace"
    } as const
  }
)

// Use the schedule with `Effect.retry` to retry failures.
export const loadUserWithRetry = fetchUserProfile("user-123").pipe(
  Effect.retry(productionRetrySchedule),
  // If the effect still fails after exhausting the schedule, turn the error
  // into a fatal one.
  Effect.orDie
)

export const loadUserWithInferredInput = fetchUserProfile("user-123").pipe(
  // You can also pass a schedule builder function that assists with inferring
  // the input type. This is especially useful when the schedule needs to
  // inspect the error to determine retryability.
  Effect.retry(($) =>
    $(Schedule.spaced("1 seconds")).pipe(
      Schedule.while(({ input }) => input.retryable)
    )
  ),
  Effect.orDie
)

export class HttpError extends Schema.TaggedError<HttpError>()("HttpError", {
  message: Schema.String,
  status: Schema.Int,
  retryable: Schema.Boolean
}) {}

// Start with a few schedule constructors.
export const maxRetries = Schedule.recurs(5)
export const spacedPolling = Schedule.spaced("30 seconds")
export const exponentialBackoff = Schedule.exponential("200 millis")

// `Schedule.max` continues only while all schedules continue and outputs
// the slowest delay. It is useful for combining a delay pattern with a hard
// attempt cap.
export const retryBackoffWithLimit = Schedule.max([
  Schedule.exponential("250 millis"),
  Schedule.recurs(6)
])

// `Schedule.min` continues while any schedule continues and outputs
// the fastest delay. It is useful for fallback behavior.
//
// This schedule will start at 500ms, exponentially increase, and will be capped
// at 2 seconds.
export const keepTryingUpToTwoSeconds = Schedule.min([
  Schedule.exponential("500 millis"),
  Schedule.spaced("2 seconds")
])

// Use `Schedule.while` to continue only for retryable failures.
// This lets non-retryable errors fail fast, even if attempts remain.
export const retryableOnly = Schedule.exponential("200 millis").pipe(
  // You can use `setInputType` to specify the type of input the schedule will
  // receive.
  Schedule.setInputType<HttpError>(),
  Schedule.while(({ input }) => input.retryable)
)

// `tap` is useful for performing side effects like logging or metrics.
export const instrumentedRetrySchedule = retryableOnly.pipe(
  Schedule.setInputType<HttpError>(),
  Schedule.tap((meta) =>
    Effect.logDebug(
      `Retrying after ${meta.input.status}: ${meta.input.message}. Next retry in ${Duration.toMillis(meta.duration)}ms`
    )
  )
)
