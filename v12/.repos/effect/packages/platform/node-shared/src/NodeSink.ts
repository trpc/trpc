/**
 * Sink adapters for writing Effect chunks into Node writable streams.
 *
 * `fromWritable` creates a `Sink`, `fromWritableChannel` creates a lower-level
 * `Channel`, and `pullIntoWritable` writes from an existing pull loop. All
 * three adapters respect writable-stream backpressure, map writable errors with
 * the supplied `onError` function, and can end the writable when the upstream
 * data is done.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "effect/Array"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import { constVoid, identity, type LazyArg } from "effect/Function"
import * as Pull from "effect/Pull"
import * as Sink from "effect/Sink"
import { finished, type Writable } from "node:stream"
import { destroyStream } from "./internal/stream.ts"

/**
 * Creates a `Sink` that writes chunks to a Node writable stream, respecting
 * backpressure and mapping writable errors with `onError`. Unless `endOnDone`
 * is `false`, the writable is ended on completion and destroyed on upstream
 * failure or interruption.
 *
 * @stability unstable
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
 * Node writable stream, respecting backpressure. Unless `endOnDone` is
 * `false`, the writable is ended when upstream is done and destroyed on
 * upstream failure or interruption.
 *
 * @stability unstable
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
    const write = pullIntoWritable({ ...options, writable, pull })
    return Effect.succeed(
      options.endOnDone === false
        ? write
        : Effect.onError(write, (cause) => Pull.isDoneCause(cause) ? Effect.void : releaseWritable(writable))
    )
  })

// Destroy the writable and wait for destruction to settle, keeping any
// destruction error handled.
const releaseWritable = (writable: Writable): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    const onDestroyed = () => resume(Effect.void)
    if (writable.closed) {
      // Destruction may be complete with its error still queued.
      const cleanup = finished(writable, { readable: false }, () => {
        cleanup()
        onDestroyed()
      })
    } else {
      destroyStream(writable, constVoid, onDestroyed)
    }
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
 * @stability unstable
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
  Effect.withFiber((fiber) => {
    const dispatcher = fiber.currentDispatcher
    const completion = Deferred.makeUnsafe<void>()
    const failure = Deferred.makeUnsafe<never, E>()
    const onError = (error: unknown) => Deferred.doneUnsafe(failure, Effect.failSync(() => options.onError(error)))
    let errorEmitted = false
    const onStreamError = (error: unknown) => {
      errorEmitted = true
      onError(error)
    }
    // finished() only reports once, so keep listening for errors from writes
    // made after the writable has finished.
    options.writable.on("error", onStreamError)
    const cleanup = finished(options.writable, { readable: false }, (error) => {
      if (error) {
        onError(error)
      } else {
        Deferred.doneUnsafe(completion, Effect.void)
      }
    })
    return options.pull.pipe(
      Effect.flatMap((chunk) => {
        let i = 0
        return Effect.callback<void, E>((resume) => {
          let cancelled = false
          // Let Node finish auto-destruction before attempting another write.
          const onFinish = () => dispatcher.scheduleTask(loop, 0)
          const loop = () => {
            options.writable.off("drain", loop)
            options.writable.off("finish", onFinish)
            for (; i < chunk.length;) {
              if (cancelled) {
                return
              }
              const success = options.writable.write(chunk[i++], options.encoding as any, (error) => {
                if (!error) return
                if (options.writable.closed) {
                  // Closed streams can reject writes through the callback only;
                  // there is no pending destruction to wait for.
                  onError(error)
                } else {
                  // Let Node initiate auto-destruction before failure cleanup
                  // checks whether an error event is still pending.
                  dispatcher.scheduleTask(() => onError(error), 0)
                }
              })
              if (!success) {
                if (!cancelled) {
                  options.writable.once("drain", loop)
                  // A normally finished writable will never emit drain. Resume
                  // the loop so any remaining writes can report their errors.
                  options.writable.once("finish", onFinish)
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
            options.writable.off("finish", onFinish)
          })
        })
      }),
      Effect.forever({ disableYield: true }),
      options.endOnDone !== false ?
        Pull.catchDone((_) => {
          options.writable.end()
          return Effect.andThen(Deferred.await(completion), Cause.done(_))
        }) :
        identity,
      Effect.raceFirst(Deferred.await(failure)),
      Effect.ensuring(Effect.sync(() => {
        cleanup()
        const removeErrorListener = () => {
          options.writable.off("error", onStreamError)
          options.writable.off("error", removeErrorListener)
          options.writable.off("close", removeErrorListener)
        }
        if (options.writable.errored && !options.writable.closed && !errorEmitted) {
          // A write callback can fail before asynchronous _destroy completes.
          // Keep handling Node's pending error until it is emitted (or closed),
          // without delaying failure for callback-only errors on closed streams.
          options.writable.once("error", removeErrorListener)
          options.writable.once("close", removeErrorListener)
        } else {
          removeErrorListener()
        }
      }))
    )
  })
