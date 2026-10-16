/**
 * Sink adapters for writing Effect chunks into Node writable streams.
 *
 * `fromWritable` creates a `Sink`, `fromWritableChannel` creates a lower-level
 * `Channel`, and `pullIntoWritable` writes from an existing pull loop. All
 * three adapters respect writable-stream backpressure, map writable errors with
 * the supplied `onError` function, and can end the writable when the upstream
 * data is done.
 *
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "effect/Array"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Effect from "effect/Effect"
import { identity, type LazyArg } from "effect/Function"
import * as Pull from "effect/Pull"
import * as Sink from "effect/Sink"
import type { Writable } from "node:stream"

/**
 * Creates a `Sink` that writes chunks to a Node writable stream, respecting
 * backpressure, mapping writable errors with `onError`, and ending the stream
 * on completion unless `endOnDone` is `false`.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromWritable = <E, A = Uint8Array | string>(
  options: {
    readonly evaluate: LazyArg<Writable | NodeJS.WritableStream>
    readonly onError: (error: unknown) => E
    readonly endOnDone?: boolean | undefined
    readonly encoding?: BufferEncoding | undefined
  }
): Sink.Sink<void, A, never, E> =>
  Sink.fromChannel(Channel.mapDone(fromWritableChannel<never, E, A>(options), (_) => [_]))

/**
 * Creates a `Channel` that pulls chunks from upstream and writes them to a
 * Node writable stream, respecting backpressure and optionally ending the
 * writable when upstream is done.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromWritableChannel = <IE, E, A = Uint8Array | string>(
  options: {
    readonly evaluate: LazyArg<Writable | NodeJS.WritableStream>
    readonly onError: (error: unknown) => E
    readonly endOnDone?: boolean | undefined
    readonly encoding?: BufferEncoding | undefined
  }
): Channel.Channel<never, IE | E, void, NonEmptyReadonlyArray<A>, IE> =>
  Channel.fromTransform((pull: Pull.Pull<NonEmptyReadonlyArray<A>, IE, unknown>) => {
    const writable = options.evaluate() as Writable
    return Effect.succeed(pullIntoWritable({ ...options, writable, pull }))
  })

/**
 * Writes Effect chunks into a Node writable stream.
 *
 * **When to use**
 *
 * Use to implement custom Node stream adapters that already have an upstream
 * pull and need direct control over a writable stream.
 *
 * **Details**
 *
 * The loop waits for `drain` when needed, fails on writable errors, and ends
 * the writable on upstream completion unless `endOnDone` is `false`.
 *
 * @category converting
 * @since 4.0.0
 */
export const pullIntoWritable = <A, IE, E>(options: {
  readonly pull: Pull.Pull<NonEmptyReadonlyArray<A>, IE, unknown>
  readonly writable: Writable
  readonly onError: (error: unknown) => E
  readonly endOnDone?: boolean | undefined
  readonly encoding?: BufferEncoding | undefined
}): Pull.Pull<never, IE | E, unknown> =>
  options.pull.pipe(
    Effect.flatMap((chunk) => {
      let i = 0
      return Effect.callback<void, E>((resume) => {
        let cancelled = false
        const loop = () => {
          for (; i < chunk.length;) {
            if (cancelled) {
              return
            }
            const success = options.writable.write(chunk[i++], options.encoding as any)
            if (!success) {
              if (!cancelled) {
                options.writable.once("drain", loop)
              }
              return
            }
          }
          if (!cancelled) {
            resume(Effect.void)
          }
        }
        loop()
        return Effect.sync(() => {
          cancelled = true
          options.writable.off("drain", loop)
        })
      })
    }),
    Effect.forever({ disableYield: true }),
    options.endOnDone !== false ?
      Pull.catchDone((_) => {
        if ("closed" in options.writable && options.writable.closed) {
          return Cause.done(_)
        }
        return Effect.callback<never, E | Cause.Done<unknown>>((resume) => {
          const onFinish = () => resume(Cause.done(_))
          options.writable.once("finish", onFinish)
          options.writable.end()
          return Effect.sync(() => {
            options.writable.off("finish", onFinish)
          })
        })
      }) :
      identity,
    Effect.raceFirst(Effect.callback<never, E>((resume) => {
      const onError = (error: unknown) => resume(Effect.fail(options.onError(error)))
      options.writable.once("error", onError)
      return Effect.sync(() => {
        options.writable.off("error", onError)
      })
    }))
  )
