import { AnyRouter, ProcedureType } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '../TRPCClientError';
import { dataLoader } from '../internals/dataLoader';
import {
  HTTPLinkOptions,
  HTTPResult,
  getUrl,
  httpRequest,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import { transformResult } from './internals/transformResult';
import { TRPCLink } from './types';

export interface HttpBatchLinkOptions extends HTTPLinkOptions {
  maxURLLength?: number;
}

export function httpBatchLink<TRouter extends AnyRouter>(
  opts: HttpBatchLinkOptions,
): TRPCLink<TRouter> {
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  // initialized config
  return (runtime) => {
    type BatchOperation = { id: number; path: string; input: unknown };

    const maxURLLength = opts.maxURLLength || Infinity;

    const batchLoader = (type: ProcedureType) => {
      const validate = (batchOps: BatchOperation[]) => {
        if (maxURLLength === Infinity) {
          // escape hatch for quick calcs
          return true;
        }
        const path = batchOps.map((op) => op.path).join(',');
        const inputs = batchOps.map((op) => op.input);

        const url = getUrl({
          ...resolvedOpts,
          runtime,
          type,
          path,
          inputs,
        });
        return url.length <= maxURLLength;
      };

      const fetch = (batchOps: BatchOperation[]) => {
        const path = batchOps.map((op) => op.path).join(',');
        const inputs = batchOps.map((op) => op.input);

        const { promise, cancel } = httpRequest({
          ...resolvedOpts,
          runtime,
          type,
          path,
          inputs,
        });

        return {
          promise: promise.then((res) => {
            const resJSON = Array.isArray(res.json)
              ? res.json
              : batchOps.map(() => res.json);

            const result = resJSON.map((item) => ({
              meta: res.meta,
              json: item,
            }));

            return result;
          }),
          cancel,
        };
      };

      return { validate, fetch };
    };

    const query = dataLoader<BatchOperation, HTTPResult>(batchLoader('query'));
    const mutation = dataLoader<BatchOperation, HTTPResult>(
      batchLoader('mutation'),
    );
    const subscription = dataLoader<BatchOperation, HTTPResult>(
      batchLoader('subscription'),
    );

    const loaders = { query, subscription, mutation };
    return ({ op }) => {
      return observable((observer) => {
        const loader = loaders[op.type];
        const { promise, cancel } = loader.load(op);

        promise
          .then((res) => {
            const transformed = transformResult(res.json, runtime);

            if (!transformed.ok) {
              observer.error(
                TRPCClientError.from(transformed.error, {
                  meta: res.meta,
                }),
              );
              return;
            }
            observer.next({
              context: res.meta,
              result: transformed.result,
            });
            observer.complete();
          })
          .catch((err) => observer.error(TRPCClientError.from(err)));

        return () => {
          cancel();
        };
      });
    };
  };
}
