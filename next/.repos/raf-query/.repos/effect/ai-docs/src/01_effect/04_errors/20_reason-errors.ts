/**
 * @title Creating and handling errors with reasons
 *
 * Define a tagged error with a tagged `reason` field, then recover with
 * `Effect.catchReason`, `Effect.catchReasons`, or by unwrapping the reason into
 * the error channel with `Effect.unwrapReason`.
 */

import { Effect, Schema } from "effect"

export class RateLimitError extends Schema.TaggedError<RateLimitError>()("RateLimitError", {
  retryAfter: Schema.Finite
}) {}

export class QuotaExceededError extends Schema.TaggedError<QuotaExceededError>()("QuotaExceededError", {
  limit: Schema.Int
}) {}

export class SafetyBlockedError extends Schema.TaggedError<SafetyBlockedError>()("SafetyBlockedError", {
  category: Schema.String
}) {}

export class AiError extends Schema.TaggedError<AiError>()("AiError", {
  reason: Schema.Union([RateLimitError, QuotaExceededError, SafetyBlockedError])
}) {}

declare const callModel: Effect.Effect<string, AiError>

export const handleOneReason = callModel.pipe(
  // Use `Effect.catchReason` to handle a specific reason type
  Effect.catchReason(
    "AiError", // The parent error _tag to catch
    "RateLimitError", // The reason _tag to catch
    // The handler for the caught reason
    (reason) => Effect.succeed(`Retry after ${reason.retryAfter} seconds`),
    // Optionally handle all the other reasons with a catch-all handler
    (reason) => Effect.succeed(`Model call failed for reason: ${reason._tag}`)
  )
)

export const handleMultipleReasons = callModel.pipe(
  // Use `Effect.catchReasons` to handle multiple reason types for a given error
  // in one go
  Effect.catchReasons(
    "AiError",
    {
      RateLimitError: (reason) => Effect.succeed(`Retry after ${reason.retryAfter} seconds`),
      QuotaExceededError: (reason) => Effect.succeed(`Quota exceeded at ${reason.limit} tokens`)
    }
    // Optionally handle all the other reasons with a catch-all handler
    // (reason) => Effect.succeed(`Unhandled reason: ${reason._tag}`)
  )
)

export const unwrapAndHandle = callModel.pipe(
  // Use `Effect.unwrapReason` to move the reasons into the error channel, then
  // handle them all with `Effect.catchTags` or other error handling combinators
  Effect.unwrapReason("AiError"),
  Effect.catchTags({
    RateLimitError: (reason) => Effect.succeed(`Back off for ${reason.retryAfter} seconds`),
    QuotaExceededError: (reason) => Effect.succeed(`Increase quota beyond ${reason.limit}`),
    SafetyBlockedError: (reason) => Effect.succeed(`Blocked by safety category: ${reason.category}`)
  })
)
