import { observableSubject } from './observable';
import {
  OperationLink,
  Operation,
  OperationResult,
  PrevCallback,
} from '../links/core';
import { AnyRouter } from 'packages/server/src/router';

export function executeChain<
  TRouter extends AnyRouter,
  TInput = unknown,
  TOutput = unknown,
>(opts: {
  links: OperationLink<TRouter, TInput, TOutput>[];
  op: Operation<TInput>;
}) {
  const $result =
    observableSubject<OperationResult<TRouter, TOutput> | null>(null);
  const $destroyed = observableSubject(false);

  function walk({
    index,
    op,
    stack,
  }: {
    index: number;
    op: Operation<TInput>;
    stack: PrevCallback<TRouter, TOutput>[];
  }) {
    const link = opts.links[index];
    const prev: PrevCallback<TRouter, TOutput> =
      index === 0 ? (value) => $result.set(value) : stack[index - 1];

    link({
      op,
      prev,
      next: (op, prevOp) => {
        const prevStack = stack.slice();
        prevStack[index] = prevOp;
        walk({ index: index + 1, op, stack: prevStack });
      },
      onDestroy: (callback) => {
        const unsub = $destroyed.subscribe({
          onNext: (aborted) => {
            if (aborted) {
              callback();
              unsub();
            }
          },
        });
      },
    });
  }
  walk({ index: 0, op: opts.op, stack: [] });
  return $result;
}
