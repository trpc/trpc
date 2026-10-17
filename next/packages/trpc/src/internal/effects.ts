/**
 * Leaner takes on Effect helpers the client runs on. Each original carries
 * code these uses never reach (a concurrent mode, a logger, a latch), and
 * that code lands in every client bundle.
 *
 * @internal
 */
import {
  Cause,
  Channel,
  Effect,
  Exit,
  Fiber,
  Pull,
  Scope,
  Stream,
} from 'effect';

/** `Effect.forEach`, one item after another. @internal */
export const forEachSeq = <A, B, E, R>(
  items: Iterable<A>,
  f: (item: A) => Effect.Effect<B, E, R>,
): Effect.Effect<B[], E, R> =>
  Effect.gen(function* () {
    const out: B[] = [];
    for (const item of items) out.push(yield* f(item));
    return out;
  });

const done: IteratorReturnResult<undefined> = { done: true, value: undefined };

/**
 * `Stream.toAsyncIterable`, also ending quietly when `signal` aborts. A
 * failure while closing after the stream failed is dropped, not logged.
 * @internal
 */
export function toAsyncIterable<A, E>(
  stream: Stream.Stream<A, E>,
  signal?: AbortSignal,
): AsyncIterable<A> {
  return {
    [Symbol.asyncIterator]() {
      const scope = Scope.makeUnsafe();
      let pull: Pull.Pull<ReadonlyArray<A>, E, void> | undefined;
      let buffer: Iterator<A> | undefined;
      let fiber:
        | Fiber.Fiber<ReadonlyArray<A>, E | Cause.Done<void>>
        | undefined;
      let closed: Promise<IteratorResult<A>> | undefined;
      const onAbort = () => void close(Exit.void);
      const close = (exit: Exit.Exit<unknown, unknown>) => {
        signal?.removeEventListener('abort', onAbort);
        return (closed ??= Effect.runPromise(
          Effect.as(
            Effect.andThen(
              fiber ? Fiber.interrupt(fiber) : Effect.void,
              Scope.close(scope, exit),
            ),
            done,
          ),
        ));
      };
      if (signal?.aborted) void close(Exit.void);
      else signal?.addEventListener('abort', onAbort, { once: true });
      return {
        async next() {
          if (closed) return closed;
          if (buffer) {
            const next = buffer.next();
            if (!next.done) return next;
            buffer = undefined;
          }
          const current = (fiber = Effect.runFork(
            pull ??
              Effect.flatMap(
                Channel.toPullScoped(Stream.toChannel(stream), scope),
                (first) => (pull = first),
              ),
          ));
          const exit = await Effect.runPromise(Fiber.await(current));
          if (fiber === current) fiber = undefined;
          if (Exit.isSuccess(exit)) {
            buffer = exit.value[Symbol.iterator]();
            return buffer.next();
          }
          if (Pull.isDoneCause(exit.cause)) return close(Exit.void);
          if (closed && Cause.hasInterruptsOnly(exit.cause)) return closed;
          await close(exit).catch(() => {});
          throw Cause.squash(exit.cause);
        },
        return: () => close(Exit.void),
        async throw(error: unknown) {
          await close(Exit.die(error)).catch(() => {});
          throw error;
        },
      };
    },
  };
}

/** `Stream.toReadableStream`, read through {@link toAsyncIterable}. @internal */
export function toReadableStream<A, E>(
  stream: Stream.Stream<A, E>,
): ReadableStream<A> {
  let iterator: AsyncIterator<A> | undefined;
  return new ReadableStream<A>({
    async pull(controller) {
      iterator ??= toAsyncIterable(stream)[Symbol.asyncIterator]();
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await iterator?.return?.();
    },
  });
}
