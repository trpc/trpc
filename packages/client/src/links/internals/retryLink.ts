/* istanbul ignore file -- @preserve */
// We're not actually exporting this link
import type { Unsubscribable } from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';
import type { InferrableClientTypes } from '@trpc/server/unstable-core-do-not-import/clientish/inferrable';
import type { TRPCClientError } from '../../TRPCClientError';
import type { Operation, TRPCLink } from '../types';

interface RetryLinkOptions<TInferrable extends InferrableClientTypes> {
  /**
   * The retry function
   */
  retry: (opts: RetryFnOptions<TInferrable>) => boolean;
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
   * The number of attempts that have been made
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
    return ({ op, next }) => {
      // initialized for request
      return observable((observer) => {
        let next$: Unsubscribable | null = null;
        let attempts = 0;
        function attempt() {
          attempts++;
          next$?.unsubscribe();
          next$ = next(op).subscribe({
            error(error) {
              const shouldRetry = opts.retry({
                op,
                attempts,
                error,
              });
              shouldRetry ? attempt() : observer.error(error);
            },
            next(result) {
              observer.next(result);
            },
            complete() {
              observer.complete();
            },
          });
        }
        attempt();
        return () => {
          next$?.unsubscribe();
        };
      });
    };
  };
}
