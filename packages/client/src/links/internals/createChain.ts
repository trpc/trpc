import { observable } from '@trpc/server/observable';
import type { InferrableClientTypes } from '@trpc/server/unstable-core-do-not-import';
import type {
  Operation,
  OperationLink,
  OperationResultObservable,
} from '../types';

/** @internal */
export function createChain<
  TInferrable extends InferrableClientTypes,
  TInput = unknown,
  TOutput = unknown,
>(opts: {
  links: OperationLink<TInferrable, TInput, TOutput>[];
  op: Operation<TInput>;
}): OperationResultObservable<TInferrable, TOutput> {
  return observable((observer) => {
    function execute(index = 0, op = opts.op) {
      const next = opts.links[index];
      if (!next) {
        throw new Error(
          'No more links to execute - did you forget to add an ending link?',
        );
      }
      const subscription = next({
        op,
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
