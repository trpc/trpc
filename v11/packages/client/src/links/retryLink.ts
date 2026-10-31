/* istanbul ignore file -- @preserve */
// We're not actually exporting this link
import type { Unsubscribable } from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';
import type { InferrableClientTypes } from '@trpc/server/unstable-core-do-not-import';
import { inputWithTrackedEventId } from '../internals/inputWithTrackedEventId';
import type { TRPCClientError } from '../TRPCClientError';
import type { Operation, TRPCLink } from './types';

interface RetryLinkOptions<TInferrable extends InferrableClientTypes> {
  /**
   * The retry function
   */
  retry: (opts: RetryFnOptions<TInferrable>) => boolean;
  /**
   * The delay between retries in ms (defaults to 0)
   */
  retryDelayMs?: (attempt: number) => number;
}

interface RetryFnOptions<TInferrable extends InferrableClientTypes> {
  /**
   * The operation that failed
   */
  op: Operation;
  /**
   * The error that occurred
   */
  error: TRPCClientError<TInferrable>;
  /**
   * The number of attempts that have been made (including the first call)
   */
  attempts: number;
}

/**
 * @see https://trpc.io/docs/v11/client/links/retryLink
 */
export function retryLink<TInferrable extends InferrableClientTypes>(
  opts: RetryLinkOptions<TInferrable>,
): TRPCLink<TInferrable> {
  // initialized config
  return () => {
    // initialized in app
    return (callOpts) => {
      // initialized for request
      return observable((observer) => {
        let next$: Unsubscribable;
        let currentAttempt = 0;
        let disposed = false;
        let callNextTimeout: ReturnType<typeof setTimeout> | undefined =
          undefined;

        let lastEventId: string | undefined = undefined;

        attempt(1);

        function opWithLastEventId() {
          const op = callOpts.op;
          if (!lastEventId) {
            return op;
          }

          return {
            ...op,
            input: inputWithTrackedEventId(op.input, lastEventId),
          };
        }

        function attempt(attempts: number) {
          if (disposed) {
            return;
          }
          currentAttempt = attempts;
          const op = opWithLastEventId();

          const subscription = callOpts.next(op).subscribe({
            error(error) {
              const shouldRetry = opts.retry({
                op,
                attempts,
                error,
              });
              if (disposed) {
                return;
              }
              if (!shouldRetry) {
                observer.error(error);
                return;
              }
              const delayMs = opts.retryDelayMs?.(attempts) ?? 0;
              if (disposed) {
                return;
              }

              if (delayMs <= 0) {
                attempt(attempts + 1);
                return;
              }
              callNextTimeout = setTimeout(
                () => attempt(attempts + 1),
                delayMs,
              );
            },
            next(envelope) {
              //
              if (
                (!envelope.result.type || envelope.result.type === 'data') &&
                envelope.result.id
              ) {
                //
                lastEventId = envelope.result.id;
              }

              observer.next(envelope);
            },
            complete() {
              observer.complete();
            },
          });

          // A synchronous error may have already subscribed the next attempt.
          if (disposed) {
            subscription.unsubscribe();
          } else if (currentAttempt === attempts) {
            next$ = subscription;
          }
        }
        return () => {
          disposed = true;
          next$.unsubscribe();
          clearTimeout(callNextTimeout);
        };
      });
    };
  };
}
