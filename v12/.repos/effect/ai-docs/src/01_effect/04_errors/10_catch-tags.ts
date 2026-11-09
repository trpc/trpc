/**
 * @title Catch multiple errors with Effect.catchTags
 *
 * Use `Effect.catchTags` to handle several tagged errors in one place.
 */

import { Effect, Schema } from "effect"

export class ValidationError extends Schema.TaggedError<ValidationError>()("ValidationError", {
  message: Schema.String
}) {}

export class NetworkError extends Schema.TaggedError<NetworkError>()("NetworkError", {
  statusCode: Schema.Int
}) {}

declare const fetchUser: (id: string) => Effect.Effect<string, ValidationError | NetworkError>

export const userOrFallback = fetchUser("123").pipe(
  Effect.catchTags({
    ValidationError: (error) => Effect.succeed(`Validation failed: ${error.message}`),
    NetworkError: (error) => Effect.succeed(`Network request failed with status ${error.statusCode}`)
  })
)
