/**
 * @title Error handling basics
 *
 * Defining custom errors and handling them with Effect.catch and Effect.catchTag.
 */
import { Effect, Schema } from "effect"

// Define custom errors using Schema.TaggedError
export class ParseError extends Schema.TaggedError<ParseError>()("ParseError", {
  input: Schema.String,
  message: Schema.String
}) {}

export class ReservedPortError extends Schema.TaggedError<ReservedPortError>()("ReservedPortError", {
  port: Schema.Int
}) {}

declare const loadPort: (input: string) => Effect.Effect<number, ParseError | ReservedPortError>

export const recovered = loadPort("80").pipe(
  // Catch multiple errors with Effect.catchTag, and return a default port number.
  Effect.catchTag(["ParseError", "ReservedPortError"], (_) => Effect.succeed(3000))
)

export const withFinalFallback = loadPort("invalid").pipe(
  // Catch a specific error with Effect.catchTag
  Effect.catchTag("ReservedPortError", (_) => Effect.succeed(3000)),
  // Catch all errors with Effect.catch
  Effect.catch((_) => Effect.succeed(3000))
)
