/**
 * The retry loop `retryLink`, `experimental_durableLink` and `httpLink`'s
 * resumed streams share, and how `experimental_durableLink` asks `httpLink`
 * to resume a streamed output mid-stream: a call option under a symbol, so
 * it stays out of the typed call options.
 *
 * @internal
 */
import { Effect, Stream, type Duration } from 'effect';
import type { AnyTrpcError } from '../../internal/error.ts';

/** @internal */
export interface Retries {
  readonly retries: number;
  readonly delay: (attempt: number, error: AnyTrpcError) => Duration.Input;
  readonly retry: (error: AnyTrpcError, attempt: number) => boolean;
}

/**
 * `attempt(0)`, then `attempt(n)` after a failure `retry` accepts, up to
 * `retries` times. Unlike `Stream.retry`'s schedule, the count doesn't
 * restart when a value arrives.
 * @internal
 */
export const retrying = <A>(
  opts: Retries,
  attempt: (n: number) => Stream.Stream<A, AnyTrpcError>,
): Stream.Stream<A, AnyTrpcError> => {
  const run = (n: number): Stream.Stream<A, AnyTrpcError> =>
    Stream.catch(attempt(n), (error) =>
      n < opts.retries && opts.retry(error, n + 1)
        ? Stream.unwrap(
            Effect.as(Effect.sleep(opts.delay(n + 1, error)), run(n + 1)),
          )
        : Stream.fail(error),
    );
  return run(0);
};

/** @internal */
export const RESUME: unique symbol = Symbol.for('@trpc12/trpc/resume');

/** @internal */
export const resumeOf = (context: object): Retries | undefined =>
  (context as { [RESUME]?: Retries })[RESUME];

/** @internal */
export const withResume = <T extends object>(context: T, resume: Retries): T =>
  Object.assign({ ...context }, { [RESUME]: resume });
