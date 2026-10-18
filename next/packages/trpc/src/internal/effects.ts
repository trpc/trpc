/**
 * Effect helpers the client's streams share.
 *
 * @internal
 */
import { Effect, Stream } from 'effect';

/**
 * `Stream.callback` options for a producer that must keep pace with its
 * reader (a slow client): `Queue.offer` waits once this many are unread.
 * @internal
 */
export const backpressure = { bufferSize: 16, strategy: 'suspend' } as const;

/**
 * `Stream.toAsyncIterable`, also ending quietly when `signal` aborts: the
 * iterator returns, which interrupts a pending `next()` and closes the
 * stream without starting it.
 * @internal
 */
export function toAsyncIterable<A, E>(
  stream: Stream.Stream<A, E>,
  signal?: AbortSignal,
): AsyncIterable<A> {
  if (!signal) return Stream.toAsyncIterable(stream);
  return {
    [Symbol.asyncIterator]() {
      const release = () => signal.removeEventListener('abort', onAbort);
      const iterator = Stream.toAsyncIterable(
        Stream.ensuring(stream, Effect.sync(release)),
      )[Symbol.asyncIterator]() as Required<AsyncIterator<A>>;
      const onAbort = () => void iterator.return();
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      return {
        next: () => iterator.next(),
        return: () => {
          release();
          return iterator.return();
        },
        throw: (error: unknown) => iterator.throw(error),
      };
    },
  };
}
