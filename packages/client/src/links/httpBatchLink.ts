import { AnyRouter, ProcedureType } from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import { TRPCClientError } from '../TRPCClientError';
import { dataLoader } from '../internals/dataLoader';
import { transformRPCResponse } from '../internals/transformRPCResponse';
import { httpRequest } from '../internals/httpRequest';
import { HttpLinkOptions, TRPCLink } from './core';
import { TRPCAbortError } from '../internals/TRPCAbortError';

export function httpBatchLink<TRouter extends AnyRouter>(
  opts: HttpLinkOptions,
): TRPCLink<TRouter> {
  const { url } = opts;
  // initialized config
  return (runtime) => {
    // initialized in app
    type Key = { id: number; path: string; input: unknown };
    const fetcher = (type: ProcedureType) => (keyInputPairs: Key[]) => {
      const path = keyInputPairs.map((op) => op.path).join(',');
      const inputs = keyInputPairs.map((op) => op.input);

      const { promise, cancel } = httpRequest({
        url,
        inputs,
        path,
        runtime,
        type,
      });

      return {
        promise: promise.then((res: unknown[] | unknown) => {
          if (!Array.isArray(res)) {
            return keyInputPairs.map(() => res);
          }
          return res;
        }),
        cancel,
      };
    };
    const query = dataLoader<Key, TRPCResponse>(fetcher('query'));
    const mutation = dataLoader<Key, TRPCResponse>(fetcher('mutation'));
    const subscription = dataLoader<Key, TRPCResponse>(fetcher('subscription'));

    const loaders = { query, subscription, mutation };
    return ({ op, prev, onDestroy }) => {
      const loader = loaders[op.type];
      const { promise, cancel } = loader.load(op);
      let isDone = false;
      const prevOnce: typeof prev = (result) => {
        if (isDone) {
          return;
        }
        isDone = true;
        prev(result);
      };
      onDestroy(() => {
        prevOnce(TRPCClientError.from(new TRPCAbortError(), { isDone: true }));
        cancel();
      });
      promise
        .then((envelope) => {
          prevOnce(transformRPCResponse({ envelope, runtime }));
        })
        .catch((err) => {
          prevOnce(TRPCClientError.from<TRouter>(err));
        });
    };
  };
}
