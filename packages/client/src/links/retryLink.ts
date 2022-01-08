import { AnyRouter } from '@trpc/server';
import { observable } from '../rx/observable';
import { Unsubscribable } from '../rx/types';
import { TRPCLink } from './types';

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

        function attempt() {
          attempts++;
          next$?.unsubscribe();
          next$ = next(op).subscribe({
            error(error) {
              if (attempts >= opts.attempts) {
                observer.error(error);
                observer.complete();
                return;
              }
              attempt();
            },
            next(result) {
              if ('result' in result.data) {
                observer.next(result);
                return;
              }
              if (attempts >= opts.attempts) {
                observer.next(result);
                observer.complete();
                return;
              }
              attempt();
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
