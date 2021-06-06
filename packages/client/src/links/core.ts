import { HTTPResponseEnvelope } from 'packages/server/src/http';
import { DataTransformer } from 'packages/server/src/transformer';
import { TRPCClientError } from '../createTRPCClient';
import { observable } from '../observable';

export type Operation<TInput = unknown> = {
  type: 'query' | 'mutation' | 'subscription';
  input: TInput;
  path: string;
};
type ResponseEnvelope = HTTPResponseEnvelope<any, any>;
type ErrorResult = TRPCClientError<any>;

type OperationResult = ResponseEnvelope | ErrorResult;

export type PrevCallback = (result: OperationResult) => void;
export type OperationLink = (opts: {
  op: Operation;
  prev: PrevCallback;
  next: (op: Operation, callback: PrevCallback) => void;
  onDestroy: (callback: () => void) => void;
}) => void;

export type TRPCLink = (opts: LinkRuntimeOptions) => OperationLink;

export type LinkRuntimeOptions = {
  transformer: DataTransformer;
  headers: () => Record<string, string | string[] | undefined>;
  fetch: typeof fetch;
  AbortController?: typeof AbortController;
};

export function createChain(links: OperationLink[]) {
  return {
    call(_op: Operation) {
      const $result = observable<OperationResult | null>(null);
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
        subscribe: (callback: (value: OperationResult) => void) => {
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
