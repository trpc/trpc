/* istanbul ignore file -- @preserve */
// We're not actually exporting this link
import { AnyRouter } from '@trpc/server';
import { observable, Unsubscribable } from '@trpc/server/observable';
import { TRPCLink } from '../types';

/**
 * @internal used for testing
 */
export function retryLink<TRouter extends AnyRouter = AnyRouter>(opts: {
  attempts: number;
}): TRPCLink<TRouter> {
  // initialized config
  return () => {
    // initialized in app
    return ({ op, next }) => {
      // initialized for request
      return observable((observer) => {
        let next$: Unsubscribable | null = null;
        let attempts = 0;
        let isDone = false;
        function attempt() {
          attempts++;
          next$?.unsubscribe();
          next$ = next(op).subscribe({
            error(error) {
              /* istanbul ignore if -- @preserve */
              if (attempts >= opts.attempts) {
                observer.error(error);
                return;
              }
              attempt();
            },
            next(result) {
              observer.next(result);
            },
            complete() {
              if (isDone) {
                observer.complete();
              }
            },
          });
        }
        attempt();
        return () => {
          isDone = true;
          next$?.unsubscribe();
        };
      });
    };
  };
}
