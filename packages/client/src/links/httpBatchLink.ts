import { AnyRouter, ProcedureType } from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import { TRPCClientError } from '../TRPCClientError';
import { TRPCAbortError } from '../internals/TRPCAbortError';
import { dataLoader } from '../internals/dataLoader';
import { httpRequest } from '../internals/httpRequest';
import { transformRPCResponse } from '../internals/transformRPCResponse';
import { HTTPLinkOptions, TRPCLink } from './core';

export interface HttpBatchLinkOptions extends HTTPLinkOptions {
  maxBatchSize?: number;
}

export function httpBatchLink<TRouter extends AnyRouter>(
  opts: HttpBatchLinkOptions,
): TRPCLink<TRouter> {
  const { url, maxBatchSize } = opts;
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

    const query = dataLoader<Key, TRPCResponse>(fetcher('query'), {
      maxBatchSize,
    });

    const mutation = dataLoader<Key, TRPCResponse>(fetcher('mutation'), {
      maxBatchSize,
    });

    const subscription = dataLoader<Key, TRPCResponse>(
      fetcher('subscription'),
      { maxBatchSize },
    );

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
        .catch((cause) => {
          prevOnce(TRPCClientError.from<TRouter>(cause));
        });
    };
  };
}
