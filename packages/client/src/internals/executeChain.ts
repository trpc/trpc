import { observable } from './observable';
import {
  OperationLink,
  Operation,
  OperationResult,
  PrevCallback,
  OperationContext,
} from '../links/core';
import { AnyRouter } from 'packages/server/src/router';

export function executeChain<TRouter extends AnyRouter>(opts: {
  links: OperationLink<TRouter>[];
  op: Omit<Operation<TRouter>, 'context'> & { context?: OperationContext };
}) {
  const $result = observable<OperationResult<TRouter> | null>(null);
  const $destroyed = observable(false);
  const { context = {} } = opts.op;

  function walk({
    index,
    op,
    stack,
  }: {
    index: number;
    op: Operation;
    stack: PrevCallback<TRouter>[];
  }) {
    const link = opts.links[index];
    const prev: PrevCallback<TRouter> =
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
        const unsub = $destroyed.subscribe((aborted) => {
          if (aborted) {
            callback();
            unsub();
          }
        });
      },
    });
  }
  walk({ index: 0, op: { ...opts.op, context }, stack: [] });
  return {
    get: $result.get,
    subscribe: (callback: (value: OperationResult<TRouter>) => void) => {
      return $result.subscribe((v) => {
        if (v) {
          callback(v);
        }
      });
    },
    destroy: () => {
      $destroyed.set(true);
      $result.destroy();
    },
  };
}
