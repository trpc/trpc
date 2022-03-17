import { AnyRouter } from '@trpc/server';
import { observable } from '../observable/observable';
import { share } from '../observable';
import { Observable } from '../observable/types';
import { TRPCLink } from './types';

export function dedupeLink<
  TRouter extends AnyRouter = AnyRouter,
>(): TRPCLink<TRouter> {
  // initialized config
  return () => {
    // initialized in app
    const pending: Record<string, Observable<any, any>> = {};
    return ({ op, next }) => {
      // initialized for request

      if (op.type !== 'query') {
        // pass through
        return next(op);
      }
      const key = JSON.stringify([op.path, op.input]);
      if (pending[key]) {
        // console.log('hooking into pending', { op });
        return observable((observer) => pending[key].subscribe(observer));
      }

      const shared$ = observable((observer) => {
        function reset() {
          delete pending[key];
        }
        const subscription = next(op).subscribe({
          next(v) {
            observer.next(v);
          },
          error(e) {
            reset();
            observer.error(e);
          },
          complete() {
            reset();
            observer.complete();
          },
        });
        return () => {
          reset();
          subscription.unsubscribe();
        };
      }).pipe(share());
      pending[key] = shared$;
      return shared$;
    };
  };
}
