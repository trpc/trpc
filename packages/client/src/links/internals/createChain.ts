import { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { Operation, OperationLink, OperationResultObservable } from '../types';

function execute<
  TRouter extends AnyRouter,
  TInput = unknown,
  TOutput = unknown,
> (
  links: OperationLink<TRouter, TInput, TOutput>[],
  op: Operation<TInput>,
  index = 0,
) {
  const next = links[index];
  if (!next) {
    throw new Error(
      'No more links to execute - did you forget to add an ending link?',
    );
  }
  const subscription = next({
    op,
    next(nextOp) {
      const nextObserver = execute(links, nextOp, index + 1);
      return nextObserver;
    },
  });
  return subscription;
}

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
    const obs$ = execute(opts.links, opts.op);
    return obs$.subscribe(observer);
  });
}
