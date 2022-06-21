import { AnyRouter, ProcedureType } from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import { getFetch } from '..';
import { TRPCClientError } from '../TRPCClientError';
import { TRPCAbortError } from '../internals/TRPCAbortError';
import { dataLoader } from '../internals/dataLoader';
import { getAbortController } from '../internals/fetchHelpers';
import { httpRequest } from '../internals/httpRequest';
import { transformRPCResponse } from '../internals/transformRPCResponse';
import { HTTPHeaders, HTTPLinkBaseOptions, Operation, TRPCLink } from './core';

type GetHeadersFn = (opts: {
  operations: Operation<unknown>[];
}) => HTTPHeaders | Promise<HTTPHeaders>;
export interface HttpBatchLinkOptions extends HTTPLinkBaseOptions {
  maxBatchSize?: number;
  headers?: HTTPHeaders | GetHeadersFn;
}

export function httpBatchLink<TRouter extends AnyRouter>(
  opts: HttpBatchLinkOptions,
): TRPCLink<TRouter> {
  const { url, maxBatchSize } = opts;
  // initialized config
  return (runtime) => {
    // initialized in app
    const getHeaders: GetHeadersFn = async (arg1) => {
      const val = opts.headers;
      return {
        ...(await runtime.headers()),
        ...(typeof val === 'function' ? await val(arg1) : val),
      };
    };

    type Key = Operation<unknown>;
    const fetcher = (type: ProcedureType) => (pairs: Key[]) => {
      const path = pairs.map((op) => op.path).join(',');
      const inputs = pairs.map((op) => op.input);

      const { promise, cancel } = httpRequest({
        url,
        inputs,
        path,
        type,
        fetch: getFetch(opts.fetch ?? runtime.fetch),
        AbortController: getAbortController(
          opts.AbortController ?? runtime.AbortController,
        ),
        headers: () => getHeaders({ operations: pairs }),
        transformer: runtime.transformer,
      });

      return {
        promise: promise.then((res: unknown[] | unknown) => {
          if (!Array.isArray(res)) {
            return pairs.map(() => res);
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
