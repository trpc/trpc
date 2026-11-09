import type * as Arr from "../../Array.ts"
import * as Channel from "../../Channel.ts"
import * as Effect from "../../Effect.ts"
import type * as Pull from "../../Pull.ts"
import * as Stream from "../../Stream.ts"

/**
 * Opens `stream` on its first pull rather than when it is run, so a consumer
 * that runs it without pulling, such as a Web `ReadableStream`, leaves the
 * body unread.
 *
 * @internal
 */
export const openOnFirstPull = <A, E, R>(stream: Stream.Stream<A, E, R>): Stream.Stream<A, E, R> =>
  Stream.fromChannel(Channel.fromTransform((_, scope) =>
    Effect.sync(() => {
      let pull: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void, R> | undefined
      return Effect.suspend(() =>
        pull ?? Effect.flatMap(Channel.toPullScoped(stream.channel, scope), (upstream) => {
          pull = upstream
          return upstream
        })
      )
    })
  ))
