import { AnyRouter } from '@trpc/server';
import { observable } from '../rx/observable';
import { share } from '../rx/operators';
import { Observable } from '../rx/types';
import { TRPCLink } from './core2';

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
        return observable((observer) => next(op).subscribe(observer));
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
        const next$ = next(op).subscribe({
          next(v) {
            reset();
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
          next$.unsubscribe();
        };
      }).pipe(share());
      pending[key] = shared$;
      return shared$;
    };
  };
}
