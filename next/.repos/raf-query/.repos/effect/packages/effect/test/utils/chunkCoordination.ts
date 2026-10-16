import type * as Arr from "effect/Array"
import type * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"

export interface ChunkCoordination<A> {
  readonly queue: Queue.Queue<Arr.NonEmptyReadonlyArray<A>, Cause.Done>
  readonly stream: Stream.Stream<A>
  readonly offer: Effect.Effect<void>
  readonly proceed: Effect.Effect<void>
  readonly awaitNext: Effect.Effect<void>
}

export const chunkCoordination = <A>(
  chunks: ReadonlyArray<Arr.NonEmptyReadonlyArray<A>>
): Effect.Effect<ChunkCoordination<A>> =>
  Effect.gen(function*() {
    let i = 0
    const queue = yield* Queue.unbounded<Arr.NonEmptyReadonlyArray<A>, Cause.Done>()
    const ps = yield* Queue.unbounded<void>()
    return {
      queue,
      stream: Stream.flattenArray(Stream.fromQueue(queue)),
      offer: Effect.gen(function*() {
        if (i < chunks.length) {
          yield* Queue.offer(queue, chunks[i++])
        }
        if (i >= chunks.length) {
          yield* Queue.end(queue)
        }
      }),
      proceed: Effect.asVoid(Queue.offer(ps, void 0)),
      awaitNext: Queue.take(ps)
    }
  })
