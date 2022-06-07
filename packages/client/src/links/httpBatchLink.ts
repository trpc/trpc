import { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { dataLoader } from '../internals/dataLoader';
import {
  HTTPLinkOptions,
  HTTPRequestOptions,
  HTTP_METHOD_UNDEFINED_ERROR_MESSAGE,
  HTTP_SUBSCRIPTION_UNSUPPORTED_ERROR_MESSAGE,
  ResponseShape,
  getUrl,
  httpRequest,
} from './internals/httpUtils';
import { TRPCLink } from './types';

export interface HttpBatchLinkOptions extends HTTPLinkOptions {
  maxURLLength?: number;
}

export function httpBatchLink<TRouter extends AnyRouter>(
  opts: HttpBatchLinkOptions,
): TRPCLink<TRouter> {
  // initialized config
  return (runtime) => {
    type BatchOperation = { id: number; path: string; input: unknown };

    const maxURLLength = opts.maxURLLength || Infinity;

    const batchLoader = (
      type: HTTPRequestOptions['type'],
      method: HTTPRequestOptions['method'],
    ) => {
      const validate = (batchOps: BatchOperation[]) => {
        if (maxURLLength === Infinity) {
          // escape hatch for quick calcs
          return true;
        }

        const path = batchOps.map((op) => op.path).join(',');
        const inputs = batchOps.map((op) => op.input);

        const url = getUrl({
          url: opts.url,
          runtime,
          type,
          method,
          path,
          inputs,
        });
        return url.length <= maxURLLength;
      };

      const fetch = (batchOps: BatchOperation[]) => {
        const path = batchOps.map((op) => op.path).join(',');
        const inputs = batchOps.map((op) => op.input);

        const { promise, cancel } = httpRequest({
          url: opts.url,
          runtime,
          type,
          method,
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

    const loaders = {
      query: {
        GET: dataLoader<BatchOperation, ResponseShape>(
          batchLoader('query', 'GET'),
        ),
        POST: dataLoader<BatchOperation, ResponseShape>(
          batchLoader('query', 'POST'),
        ),
      },
      mutation: {
        GET: dataLoader<BatchOperation, ResponseShape>(
          batchLoader('mutation', 'GET'),
        ),
        POST: dataLoader<BatchOperation, ResponseShape>(
          batchLoader('mutation', 'POST'),
        ),
      },
    };

    return ({ op }) => {
      const { type, method } = op;
      if (type === 'subscription') {
        throw new Error(HTTP_SUBSCRIPTION_UNSUPPORTED_ERROR_MESSAGE);
      }
      if (!method) {
        // this should never happen
        throw new Error(HTTP_METHOD_UNDEFINED_ERROR_MESSAGE);
      }

      return observable((observer) => {
        const loader = loaders[type][method];
        const { promise, cancel } = loader.load(op);

        promise
          .then((res) => {
            observer.next({
              context: res.meta,
              data: res.json as any,
            });
            observer.complete();
          })
          .catch((err) => observer.error(err as any));

        return () => {
          cancel();
        };
      });
    };
  };
}
