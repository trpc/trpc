import {
  HTTPErrorResponseEnvelope,
  HTTPResponseEnvelope,
} from 'packages/server/src/http';
import { observable } from '../observable';

export type Operation<TInput = unknown> = {
  type: 'query' | 'mutation' | 'subscription';
  input: TInput;
  path: string;
};
export type PrevCallback = (result: HTTPResponseEnvelope<unknown, any>) => void;
export type OperationLink = (opts: {
  op: Operation;
  prev: PrevCallback;
  next: (op: Operation, callback: PrevCallback) => void;
  onDestroy: (callback: () => void) => void;
}) => void;

export type TRPCLink = () => OperationLink;

export function createChain(links: OperationLink[]) {
  return {
    call(_op: Operation) {
      const $result = observable<HTTPResponseEnvelope<any, any> | null>(null);
      const $aborted = observable(false);

      function walk({
        index,
        op,
        stack,
      }: {
        index: number;
        op: Operation;
        stack: PrevCallback[];
      }) {
        const link = links[index];
        const prev: PrevCallback =
          index === 0
            ? (value: HTTPResponseEnvelope) => $result.set(value)
            : stack[index - 1];

        link({
          op,
          prev,
          next: (op, prevOp) => {
            const prevStack = stack.slice();
            prevStack[index] = prevOp;
            walk({ index: index + 1, op, stack: prevStack });
          },
          onDestroy: (callback) => {
            const unsub = $aborted.subscribe({
              onNext(aborted) {
                if (aborted) {
                  callback();
                  unsub();
                }
              },
            });
          },
        });
      }
      walk({ index: 0, op: _op, stack: [] });
      return {
        get: $result.get,
        subscribe: (
          callback: (value: HTTPResponseEnvelope<unknown, any>) => void,
        ) => {
          return $result.subscribe({
            onNext: (v) => {
              if (v) {
                callback(v);
              }
            },
          });
        },
        abort: () => {
          $aborted.set(true);
        },
      };
    },
  };
}
