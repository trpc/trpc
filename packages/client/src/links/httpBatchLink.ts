import { HTTPResponseEnvelope, ProcedureType, AnyRouter } from '@trpc/server';
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

      const { promise, cancel } = httpRequest<
        HTTPResponseEnvelope<unknown, any>[]
      >({
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
    const query = dataLoader<Key, HTTPResponseEnvelope<TRouter, unknown>>(
      fetcher('query'),
    );
    const mutation = dataLoader<Key, HTTPResponseEnvelope<TRouter, unknown>>(
      fetcher('mutation'),
    );
    const subscription = dataLoader<
      Key,
      HTTPResponseEnvelope<TRouter, unknown>
    >(fetcher('subscription'));

    const loaders = { query, subscription, mutation };
    return ({ op, prev, onDestroy }) => {
      const loader = loaders[op.type];
      const { promise, cancel } = loader.load(op);
      onDestroy(() => cancel());
      promise
        .then((v) => (v.ok ? prev(v) : prev(TRPCClientError.from<TRouter>(v))))
        .catch((v) => prev(TRPCClientError.from<TRouter>(v)));
    };
  };
}
