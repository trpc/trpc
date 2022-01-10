import { AnyRouter } from '@trpc/server';
import { observable } from '../../rx/observable';
import { Operation, OperationLink, OperationResultObservable } from '../types';

/** @internal */
export function createChain<
  TRouter extends AnyRouter,
  TInput = unknown,
  TOutput = unknown,
>(opts: {
  links: OperationLink<TRouter, TInput, TOutput>[];
  op: Operation<TInput>;
}): OperationResultObservable<TRouter, TOutput> {
  return observable((observer) => {
    function execute(index = 0, op = opts.op) {
      const next = opts.links[index];
      const next$ = next({
        op,
        next(nextOp) {
          const nextObserver = execute(index + 1, nextOp);

          return nextObserver;
        },
      });
      return next$;
    }

    const obs$ = execute();
    return obs$.subscribe(observer);
  });
}
