import { Effect, Queue, Stream } from "effect";

/**
 * A stream of what `subscribe` emits. Subscribes in the consuming fiber as
 * soon as the stream starts, so nothing emitted after that is missed
 * (`Stream.callback` subscribes on a forked fiber, a scheduler tick later),
 * and unsubscribes when the stream ends.
 */
export function listen<A>(
	subscribe: (emit: (value: A) => void) => () => void,
): Stream.Stream<A> {
	return Stream.unwrap(
		Effect.gen(function* () {
			const queue = yield* Queue.unbounded<A>();
			yield* Effect.acquireRelease(
				Effect.sync(() =>
					subscribe((value) => {
						Queue.offerUnsafe(queue, value);
					}),
				),
				(unsubscribe) => Effect.sync(unsubscribe),
			);
			return Stream.fromQueue(queue);
		}),
	);
}
