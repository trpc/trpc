import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import type {
  Operation,
  OperationLink,
  OperationResultObservable,
} from '../types';

type FIXME = any;
/** @internal */
export function createChain<TRouter extends AnyRouter>(opts: {
  links: OperationLink<TRouter>[];
  op: Operation;
}): OperationResultObservable<TRouter> {
  return observable((observer) => {
    function execute(index = 0, op = opts.op) {
      const next = opts.links[index];
      if (!next) {
        throw new Error(
          'No more links to execute - did you forget to add an ending link?',
        );
      }
      const subscription = next({
        op: op as FIXME,
        next(nextOp) {
          const nextObserver = execute(index + 1, nextOp);

          return nextObserver;
        },
      });
      return subscription;
    }

    const obs$ = execute();
    return obs$.subscribe(observer);
  });
}
