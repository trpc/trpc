import { AnyRouter, ProcedureType } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '../TRPCClientError';
import { dataLoader } from '../internals/dataLoader';
import { NonEmptyArray } from '../internals/types';
import {
  HTTPLinkBaseOptions,
  HTTPResult,
  getUrl,
  httpRequest,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import { transformResult } from './internals/transformResult';
import { HTTPHeaders, Operation, TRPCLink } from './types';

export interface HttpBatchLinkOptions extends HTTPLinkBaseOptions {
  maxURLLength?: number;
  /**
   * Headers to be set on outgoing requests or a callback that of said headers
   * @link http://trpc.io/docs/client/headers
   */
  headers?:
    | HTTPHeaders
    | ((opts: {
        opList: NonEmptyArray<Operation>;
      }) => HTTPHeaders | Promise<HTTPHeaders>);
}

export function httpBatchLink<TRouter extends AnyRouter>(
  opts: HttpBatchLinkOptions,
): TRPCLink<TRouter> {
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  // initialized config
  return (runtime) => {
    const maxURLLength = opts.maxURLLength || Infinity;

    const batchLoader = (type: ProcedureType) => {
      const validate = (batchOps: Operation[]) => {
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

      const fetch = (batchOps: Operation[]) => {
        const path = batchOps.map((op) => op.path).join(',');
        const inputs = batchOps.map((op) => op.input);

        const { promise, cancel } = httpRequest({
          ...resolvedOpts,
          runtime,
          type,
          path,
          inputs,
          headers() {
            if (!opts.headers) {
              return {};
            }
            if (typeof opts.headers === 'function') {
              return opts.headers({
                opList: batchOps as NonEmptyArray<Operation>,
              });
            }
            return opts.headers;
          },
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

    const query = dataLoader<Operation, HTTPResult>(batchLoader('query'));
    const mutation = dataLoader<Operation, HTTPResult>(batchLoader('mutation'));
    const subscription = dataLoader<Operation, HTTPResult>(
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
