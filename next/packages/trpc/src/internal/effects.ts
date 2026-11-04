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
 * the stream has closed. What the iterator throws after that, from the
 * `next()` the stream stopped waiting for or from `return()`, goes to
 * `onLateFailure`: a generator's `finally` runs then.
 * @internal
 */
export const returnUnawaited = <A>(
  iterable: AsyncIterable<A>,
  onLateFailure: (error: unknown) => void = () => {},
): AsyncIterable<A> => ({
  [Symbol.asyncIterator]() {
    const iterator = iterable[Symbol.asyncIterator]();
    let pending: Promise<IteratorResult<A>> | undefined;
    return {
      next: () => {
        const next = iterator.next();
        pending = next;
        const settled = () => {
          if (pending === next) pending = undefined;
        };
        next.then(settled, settled);
        return next;
      },
      return: (value?: unknown) => {
        pending?.catch(onLateFailure);
        try {
          iterator.return?.(value).catch(onLateFailure);
        } catch (error) {
          onLateFailure(error);
        }
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
  /**
   * Aborts `signal` unless `stream` ends: when it fails, too. For a
   * subscription's events, whose iterator may wait for the signal in its
   * `return()` after `next()` failed.
   */
  readonly abortUnlessDone: <A, E, R>(
    stream: Stream.Stream<A, E, R>,
  ) => Stream.Stream<A, E, R>;
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
      abortUnlessDone: (stream) =>
        Stream.onExit(stream, (exit) =>
          Exit.isSuccess(exit)
            ? Effect.void
            : Effect.sync(() => controller.abort()),
        ),
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
 * `stream`, read by a fiber of its own into a bounded queue that `values`
 * reads back, ending or failing as `outcome` says for the fiber's exit.
 * When the reader's scope closes, that fiber is interrupted and `stopped`
 * gets what its teardown failed with, along with how the scope closed.
 * Only the fiber's exit has it reliably: the stream's own exit misses a
 * finalizer that fails while its reader is interrupted handling a value.
 */
const produce = <A, E, R>(
  stream: Stream.Stream<A, E, R>,
  outcome: (exit: Exit.Exit<void, E>) => Cause.Cause<E> | undefined,
  stopped: (
    failure: Cause.Cause<unknown>,
    closed: Exit.Exit<unknown, unknown>,
  ) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const queue = yield* Queue.bounded<A, E | Cause.Done>(
      backpressure.bufferSize,
    );
    const producer = yield* Stream.runForEachArray(stream, (values) =>
      Queue.offerAll(queue, values),
    ).pipe(
      Effect.onExit((exit) => {
        const cause = outcome(exit);
        return cause ? Queue.failCause(queue, cause) : Queue.end(queue);
      }),
      Effect.forkScoped,
    );
    yield* Effect.addFinalizer((closed) =>
      Effect.gen(function* () {
        yield* Fiber.interrupt(producer);
        const failure = teardownFailure(yield* Fiber.await(producer));
        if (failure) yield* stopped(failure, closed);
      }),
    );
    return {
      values: Stream.fromQueue(queue) as Stream.Stream<A, E>,
      producer,
    };
  });

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
      const run = yield* produce(
        stream,
        (exit) => teardownFailure(exit) as Cause.Cause<E> | undefined,
        (failure, closed) =>
          // A failed close means the reader got a failure already.
          Exit.isSuccess(closed)
            ? Effect.failCause(failure as Cause.Cause<never>)
            : Effect.void,
      );
      yield* Effect.forkScoped(
        Effect.andThen(aborted(signal), Fiber.interrupt(run.producer)),
      );
      return run.values;
    }),
  );

/**
 * `stream`, handing what its teardown fails with to `report` once its
 * reader has stopped (left, or ended it early) instead of dropping it.
 * The reader no longer gets it then, and a failure it did get isn't
 * reported again.
 * @internal
 */
export const reportTeardown = <A, E, R>(
  stream: Stream.Stream<A, E, R>,
  report: (failure: Cause.Cause<unknown>) => void,
): Stream.Stream<A, E, R> =>
  Stream.unwrap(
    Effect.map(
      produce(
        stream,
        (exit) => (Exit.isFailure(exit) ? exit.cause : undefined),
        (failure, closed) =>
          Effect.sync(() => {
            if (
              Exit.isSuccess(closed) ||
              Cause.hasInterruptsOnly(closed.cause)
            ) {
              report(failure);
            }
          }),
      ),
      (run) => run.values,
    ),
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
