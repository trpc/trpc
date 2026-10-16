/**
 * @title Using Effect.fn and Effect.fnUntraced
 *
 * When writing reusable functions that return an Effect, use `Effect.fn` or
 * `Effect.fnUntraced` to use the generator syntax.
 *
 * Use `Effect.fn("name")` when the function should create a tracing span. Prefer
 * `Effect.fnUntraced` when tracing is not needed, particularly for library
 * implementations and hot paths.
 *
 * **Avoid creating functions that only wrap and return an `Effect.gen`**.
 */

import { Effect, Schema } from "effect"

// Pass a string to Effect.fn, which will improve stack traces and also
// attach a tracing span (using Effect.withSpan behind the scenes).
//
// The name string should match the function name.
//
export const effectFunction = Effect.fn("effectFunction")(
  // You can use `Effect.fn.Return` to specify the return type of the function.
  // It accepts the same type parameters as `Effect.Effect`.
  function*(n: number): Effect.fn.Return<string, SomeError> {
    yield* Effect.logInfo("Received number:", n)

    // Always return when raising an error, to ensure typescript understands that
    // the function will not continue executing.
    return yield* new SomeError({ message: "Failed to read the file" })
  },
  // Add additional functionality by passing in additional arguments.
  // **Do not** use .pipe with Effect.fn
  Effect.catch((error) => Effect.logError(`An error occurred: ${error}`)),
  Effect.annotateLogs({
    method: "effectFunction"
  })
)

// Effect.fnUntraced avoids tracing and stack-frame capture while still reusing
// the generator body. This is preferred for library functions that do not
// represent a useful tracing boundary.
export const validateBatchSize = Effect.fnUntraced(function*(size: number): Effect.fn.Return<number, SomeError> {
  if (!Number.isInteger(size) || size <= 0) {
    return yield* new SomeError({ message: "Batch size must be a positive integer" })
  }
  return size
})

// Use Schema.TaggedError to define a custom error
export class SomeError extends Schema.TaggedError<SomeError>()("SomeError", {
  message: Schema.String
}) {}
