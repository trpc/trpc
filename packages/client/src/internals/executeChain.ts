import { AnyRouter } from '@trpc/server';
import { TRPCResult } from '@trpc/server/rpc';
import { TRPCClientError } from '../TRPCClientError';
import {
  Operation,
  OperationLink,
  OperationResponse,
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
  const $result = observableSubject<
    null | TRPCResult<TOutput>,
    TRPCClientError<TRouter>
  >(null);

  const updateResult = (result: OperationResponse<TRouter, TOutput>) => {
    if (result instanceof Error) {
      $result.error(result);
      if (result.isDone) {
        $result.done();
      }
    } else {
      $result.next(result);
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
        $result.subscribe({
          onDone() {
            callback();
          },
        });
      },
    });
  }
  walk({ index: 0, op: opts.op, stack: [] });
  return $result;
}
