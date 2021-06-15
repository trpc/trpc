import { AnyRouter, ProcedureType } from '@trpc/server';
import { JSONRPC2Response } from '@trpc/server/jsonrpc2';
import { TRPCClientError } from '../createTRPCClient';
import { dataLoader } from '../internals/dataLoader';
import { httpRequest } from '../internals/httpRequest';
import { HttpLinkOptions, TRPCLink } from './core';

export function httpBatchLink<TRouter extends AnyRouter>(
  opts: HttpLinkOptions,
): TRPCLink<TRouter> {
  const { url } = opts;
  // initialized config
  return (runtime) => {
    // initialized in app
    type Key = { path: string; input: unknown };
    const fetcher = (type: ProcedureType) => (keyInputPairs: Key[]) => {
      const path = keyInputPairs.map(({ path }) => path).join(',');
      const input = keyInputPairs.map(({ input }) => input);

      const { promise, cancel } = httpRequest({
        url,
        input,
        path,
        runtime,
        type,
        searchParams: 'batch=1',
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
    const query = dataLoader<Key, JSONRPC2Response>(fetcher('query'));
    const mutation = dataLoader<Key, JSONRPC2Response>(fetcher('mutation'));
    const subscription = dataLoader<Key, JSONRPC2Response>(
      fetcher('subscription'),
    );

    const loaders = { query, subscription, mutation };
    return ({ op, prev, onDestroy }) => {
      const loader = loaders[op.type];
      const { promise, cancel } = loader.load(op);
      onDestroy(() => cancel());
      promise
        .then((result) =>
          prev(
            'error' in result
              ? TRPCClientError.from(result)
              : (result.result as any),
          ),
        )
        .catch((err) => prev(TRPCClientError.from<TRouter>(err)));
    };
  };
}
