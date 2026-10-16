/**
 * @title Using Effect.gen
 *
 * Use `Effect.gen` to write code in an imperative style similar to async await.
 * You can use `yield*` to access the result of an effect.
 */

import { Effect, Schema } from "effect"

Effect.gen(function*() {
  yield* Effect.log("Starting the file processing...")
  yield* Effect.log("Reading file...")

  // Always return when raising an error, to ensure typescript understands that
  // the function will not continue executing.
  return yield* new FileProcessingError({ message: "Failed to read the file" })
}).pipe(
  // Add additional functionality with .pipe
  Effect.catch((error) => Effect.logError(`An error occurred: ${error}`)),
  Effect.withSpan("fileProcessing", {
    attributes: {
      method: "Effect.gen"
    }
  })
)

// Use Schema.TaggedError to define a custom error
export class FileProcessingError extends Schema.TaggedError<FileProcessingError>()("FileProcessingError", {
  message: Schema.String
}) {}
