import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import type {
  Operation,
  OperationLink,
  OperationResultObservable,
} from '../types';

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
    function execute({ index, op }: { index: number; op: Operation<TInput> }) {
      const next = opts.links[index];
      if (!next) {
        throw new Error(
          'No more links to execute - did you forget to add an ending link?',
        );
      }
      const subscription = next({
        op,
        next(nextOp) {
          const nextObserver = execute({ index: index + 1, op: nextOp });

          return nextObserver;
        },
      });
      return subscription;
    }

    const obs$ = execute({ index: 0, op: opts.op });
    return obs$.subscribe(observer);
  });
}
