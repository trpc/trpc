/**
 * Low-level helpers for adapting push-based SQL row sources into Effect
 * streams.
 *
 * SQL drivers often expose large query results through cursors, event emitters,
 * or driver-specific streams that push rows as they arrive. This module
 * provides the small interop layer used by SQL integrations to turn those
 * producers into `Stream` values for `Statement.stream` and
 * `Connection.executeStream`, so callers can process large result sets
 * incrementally instead of materializing every row in memory.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "../Cause.ts"
import * as Effect from "../Effect.ts"
import * as Queue from "../Queue.ts"
import type * as Scope from "../Scope.ts"
import * as Stream from "../Stream.ts"

/**
 * Creates a stream from a callback-style producer with pause and resume
 * callbacks that are triggered when the internal queue applies backpressure.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const asyncPauseResume = <A, E = never, R = never>(
  register: (emit: {
    readonly single: (item: A) => void
    readonly array: (arr: ReadonlyArray<A>) => void
    readonly fail: (error: E) => void
    readonly end: () => void
  }) => Effect.Effect<
    {
      onPause(): void
      onResume(): void
    },
    E,
    R | Scope.Scope
  >,
  bufferSize = 128
): Stream.Stream<A, E, R> =>
  Stream.callback<A, E, R>((queue) =>
    Effect.suspend(() => {
      let cbs!: {
        onPause(): void
        onResume(): void
      }

      let paused = false
      const offer = (arr: ReadonlyArray<A>) => {
        if (arr.length === 0) return
        const isFull = Queue.isFullUnsafe(queue)
        if (!isFull || (isFull && paused)) {
          return Effect.runFork(Queue.offerAll(queue, arr))
        }
        paused = true
        cbs.onPause()
        return Queue.offerAll(queue, arr).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              cbs.onResume()
              paused = false
            })
          ),
          Effect.runFork
        )
      }

      return Effect.map(
        register({
          single: (item) => offer([item]),
          array: (chunk) => offer(chunk),
          fail: (error) => Queue.failCauseUnsafe(queue as any, Cause.fail(error)),
          end: () => Queue.endUnsafe(queue as any)
        }),
        (_) => {
          cbs = _
        }
      )
    }), { bufferSize })
