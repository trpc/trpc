import { AnyRouter } from '@trpc/server';
import { TRPCClientError } from '../createTRPCClient';
import {
  Operation,
  OperationLink,
  OperationResult,
  PrevCallback,
} from '../links/core';
import { observableSubject } from './observable';

export function executeChain<
  TRouter extends AnyRouter,
  TInput = unknown,
  TOutput = unknown,
>(opts: {
  links: OperationLink<TRouter, TInput, TOutput>[];
  op: Operation<TInput>;
}) {
  type TError = TRPCClientError<TRouter>;
  const $result = observableSubject<TOutput | null, TError>(null);
  const $destroyed = observableSubject(false);

  const updateResult = (result: OperationResult<TRouter, TOutput>) => {
    if (result instanceof Error) {
      $result.error(result);
      if (result.isDone) {
        $result.done();
      }
    } else {
      $result.next(result.data);
    }
  };
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
      index === 0 ? (value) => updateResult(value) : stack[index - 1];

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
  $result.subscribe({
    onDone() {
      $destroyed.next(true);
    },
  });
  return $result;
}
