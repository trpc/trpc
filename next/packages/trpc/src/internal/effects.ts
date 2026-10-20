/**
 * Effect helpers the client's streams and the server's calls share.
 *
 * @internal
 */
import { Effect, Exit, Stream } from 'effect';

/**
 * `Stream.callback` options for a producer that must keep pace with its
 * reader (a slow client): `Queue.offer` waits once this many are unread.
 * @internal
 */
export const backpressure = { bufferSize: 16, strategy: 'suspend' } as const;

/**
 * For `Stream.fromAsyncIterable`: closing doesn't wait for the iterator's
 * `return()`. A generator paused at an `await` returns only once that
 * settles, and a procedure usually awaits its `signal`, which aborts once
 * the stream has closed.
 * @internal
 */
export const returnUnawaited = <A>(
  iterable: AsyncIterable<A>,
): AsyncIterable<A> => ({
  [Symbol.asyncIterator]() {
    const iterator = iterable[Symbol.asyncIterator]();
    return {
      next: () => iterator.next(),
      return: (value?: unknown) => {
        iterator.return?.(value).catch(() => {});
        return Promise.resolve({ done: true, value });
      },
    };
  },
});

/**
 * An `AbortSignal` shared by several steps that take one (`createContext`,
 * then the resolver, then the stream it returns), aborted when a step it
 * wraps is interrupted: what `Effect.tryPromise`'s signal is to one promise.
 * @internal
 */
export interface InterruptSignal {
  readonly signal: AbortSignal;
  /**
   * Aborts `signal` if `self` is interrupted. Wrap a stream itself, not
   * only the effect that runs it: its finalizers may wait for a resolver
   * that awaits the signal.
   */
  readonly abortOnInterrupt: {
    <A, E, R>(self: Stream.Stream<A, E, R>): Stream.Stream<A, E, R>;
    <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>;
  };
}

/** @internal */
export const interruptSignal = (): Effect.Effect<InterruptSignal> =>
  Effect.sync(() => {
    const controller = new AbortController();
    const onExit = (exit: Exit.Exit<unknown, unknown>) =>
      Exit.hasInterrupts(exit)
        ? Effect.sync(() => controller.abort())
        : Effect.void;
    return {
      signal: controller.signal,
      abortOnInterrupt: ((
        self: Stream.Stream<unknown, unknown, unknown> | Effect.Effect<unknown>,
      ) =>
        Stream.isStream(self)
          ? Stream.onExit(self, onExit)
          : Effect.onExit(self, onExit)) as InterruptSignal['abortOnInterrupt'],
    };
  });

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
