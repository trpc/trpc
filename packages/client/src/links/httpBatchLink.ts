import { AnyRouter, ProcedureType } from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import { TRPCClientError } from '../TRPCClientError';
import { dataLoader } from '../internals/dataLoader';
import { transformRPCResponse } from '../internals/transformRPCResponse';
import { httpRequest } from '../internals/httpRequest';
import { HttpLinkOptions, TRPCLink } from './core';
import { TRPCAbortError } from '../internals/TRPCAbortErrorSignal';

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
      const input = keyInputPairs.map((op) => op.input);

      const { promise, cancel } = httpRequest({
        url,
        input,
        path,
        runtime,
        type,
        searchParams: `batch=1`,
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
      let done = false;
      onDestroy(() => {
        if (!done) {
          done = true;
          prev(TRPCClientError.from(new TRPCAbortError(), { isDone: true }));
          cancel();
        }
      });
      promise
        .then((envelope) => {
          if (!done) {
            done = true;
            prev(transformRPCResponse({ envelope, runtime }));
          }
        })
        .catch((err) => {
          if (!done) {
            done = true;
            prev(TRPCClientError.from<TRouter>(err));
          }
        });
    };
  };
}
