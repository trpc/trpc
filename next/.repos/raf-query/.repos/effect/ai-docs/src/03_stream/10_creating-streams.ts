/**
 * @title Creating streams from common data sources
 *
 * Learn how to create streams from various data sources. Includes:
 *
 * - `Stream.fromIterable` for arrays and other iterables
 * - `Stream.fromEffectSchedule` for polling effects
 * - `Stream.paginate` for paginated APIs
 * - `Stream.fromAsyncIterable` for async iterables
 * - `Stream.fromEventListener` for DOM events
 * - `Stream.callback` for any callback-based API
 * - `NodeStream.fromReadable` for Node.js readable streams
 */
import { NodeStream } from "@effect/platform-node"
import { Array, Effect, Queue, Schedule, Schema, Stream } from "effect"
import * as Option from "effect/Option"
import { Readable } from "node:stream"

// `Stream.fromIterable` turns any iterable into a stream.
export const numbers = Stream.fromIterable<number>([1, 2, 3, 4, 5])

// `Stream.fromEffectSchedule` turns a single effect into a polling stream.
// This is useful for metrics, health checks, and cache refresh loops.
export const samples = Stream.fromEffectSchedule(
  Effect.succeed(3),
  Schedule.spaced("30 seconds")
).pipe(
  // Stream.take limits the number of elements emitted by the stream.
  Stream.take(3)
)

// Use `Stream.paginate` when reading APIs that return one page at a time.
// The function returns the current page of values and optionally the next
// cursor.
export const fetchJobsPage = Stream.paginate(
  0, // start with page 0 (the cursor)
  Effect.fn(function*(page) {
    // Simulate network latency
    yield* Effect.sleep("50 millis")

    const results = Array.range(0, 100).map((i) => `Job ${i + 1 + page * 100}`)

    // only return 10 pages of results
    const nextPage = page <= 10
      ? Option.some(page + 1)
      : Option.none()

    return [results, nextPage] as const
  })
)

class LetterError extends Schema.TaggedError<LetterError>()("LetterError", {
  cause: Schema.Defect()
}) {}

async function* asyncIterable() {
  yield "a"
  yield "b"
  yield "c"
}

// Create a stream from an async iterable.
// The second argument is a function that converts any errors thrown by the
// async iterable into a typed error.
export const letters = Stream.fromAsyncIterable(
  asyncIterable(),
  (cause) => new LetterError({ cause })
)

const button = document.getElementById("my-button")!

// `Stream.fromEventListener` creates a stream from an event listener.
export const events = Stream.fromEventListener<PointerEvent>(button, "click")

// You can also use `Stream.callback` to create a stream from any callback-based
// API.
export const callbackStream = Stream.callback<PointerEvent>(Effect.fn(function*(queue) {
  // You can use the `Queue` apis to emit values into the stream from the
  // callback.
  function onEvent(event: PointerEvent) {
    Queue.offerUnsafe(queue, event)
  }
  // register the event listener and add a finalizer to unregister it when the
  // stream is finished.
  yield* Effect.acquireRelease(
    Effect.sync(() => button.addEventListener("click", onEvent)),
    () => Effect.sync(() => button.removeEventListener("click", onEvent))
  )
}))

export class NodeStreamError extends Schema.TaggedError<NodeStreamError>()("NodeStreamError", {
  cause: Schema.Defect()
}) {}

// Create a stream from a Node.js readable stream.
//
// It takes options to convert any errors emitted by the stream into a typed
// error, and to evaluate the stream lazily.
export const nodeStream = NodeStream.fromReadable({
  evaluate: () => Readable.from(["Hello", " ", "world", "!"]),
  onError: (cause) => new NodeStreamError({ cause }),
  closeOnDone: true // true by default
})
