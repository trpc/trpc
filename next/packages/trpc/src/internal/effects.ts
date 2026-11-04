/**
 * Effect helpers the client's streams and the server's calls share.
 *
 * @internal
 */
import { Cause, Effect, Exit, Fiber, Queue, Stream } from 'effect';

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

const aborted = (signal: AbortSignal): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    const release = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      release();
      resume(Effect.void);
    };
    signal.addEventListener('abort', onAbort);
    return Effect.sync(release);
  });

/** What a stopped fiber's teardown failed with, without its interruption. */
const teardownFailure = (
  exit: Exit.Exit<unknown, unknown>,
): Cause.Cause<unknown> | undefined => {
  if (Exit.isSuccess(exit)) return undefined;
  const reasons = exit.cause.reasons.filter(
    (reason) => !Cause.isInterruptReason(reason),
  );
  return reasons.length > 0 ? Cause.fromReasons(reasons) : undefined;
};

/**
 * `stream`, ending when `signal` aborts. A fiber reads it into a bounded
 * queue; aborting interrupts that fiber, so the source's finalizers run
 * straight away, and the stream ends once the values already queued are
 * read. If a finalizer fails, the stream fails with it after them. A
 * failure the reader hasn't seen fails the scope's close instead, so
 * `return()` (`break`) rejects with it.
 */
const endOnAbort = <A, E>(
  stream: Stream.Stream<A, E>,
  signal: AbortSignal,
): Stream.Stream<A, E> =>
  Stream.unwrap(
    Effect.gen(function* () {
      if (signal.aborted) return Stream.empty;
      const queue = yield* Queue.bounded<A, E | Cause.Done>(
        backpressure.bufferSize,
      );
      const producer = yield* Stream.runForEachArray(stream, (values) =>
        Queue.offerAll(queue, values),
      ).pipe(
        Effect.onExit((exit) => {
          const failure = teardownFailure(exit);
          return failure
            ? Queue.failCause(queue, failure as Cause.Cause<E>)
            : Queue.end(queue);
        }),
        Effect.forkScoped,
      );
      yield* Effect.addFinalizer((closed) =>
        Effect.gen(function* () {
          yield* Fiber.interrupt(producer);
          const failure = teardownFailure(yield* Fiber.await(producer));
          // A failed close means the reader got a failure already.
          if (failure && Exit.isSuccess(closed)) {
            yield* Effect.failCause(failure as Cause.Cause<never>);
          }
        }),
      );
      yield* Effect.forkScoped(
        Effect.andThen(aborted(signal), Fiber.interrupt(producer)),
      );
      return Stream.fromQueue(queue);
    }),
  );

/**
 * `Stream.toAsyncIterable`, also ending when `signal` aborts: a pending
 * `next()` resolves `{ done: true }` once the values already received are
 * read, and an already aborted signal never starts the stream. A finalizer
 * that fails on abort rejects the next `next()` after those values, once;
 * on `return()` (`break`), `return()` rejects with it.
 * @internal
 */
export function toAsyncIterable<A, E>(
  stream: Stream.Stream<A, E>,
  signal?: AbortSignal,
): AsyncIterable<A> {
  if (!signal) return Stream.toAsyncIterable(stream);
  return Stream.toAsyncIterable(endOnAbort(stream, signal));
}
