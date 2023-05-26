import { AnyRouter, ProcedureType } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '../../TRPCClientError';
import { dataLoader } from '../../internals/dataLoader';
import { NonEmptyArray } from '../../internals/types';
import { transformResult } from '../../shared/transformResult';
import {
  HTTPLinkBaseOptions,
  HTTPResult,
  ResolvedHTTPLinkOptions,
  getUrl,
  resolveHTTPLinkOptions,
} from '../internals/httpUtils';
import {
  CancelFn,
  HTTPHeaders,
  Operation,
  TRPCClientRuntime,
  TRPCLink,
} from '../types';

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

/**
 * @internal
 */
export type RequesterFn = (
  resolvedOpts: ResolvedHTTPLinkOptions,
  runtime: TRPCClientRuntime,
  type: ProcedureType,
  opts: HttpBatchLinkOptions,
) => (
  batchOps: Operation[],
  unitResolver: (index: number, value: NonNullable<HTTPResult>) => void,
) => {
  promise: Promise<HTTPResult[]>;
  cancel: CancelFn;
};

export function makeHttpBatchLink(requester: RequesterFn) {
  return function httpBatchLink<TRouter extends AnyRouter>(
    opts: HttpBatchLinkOptions,
  ): TRPCLink<TRouter> {
    const resolvedOpts = resolveHTTPLinkOptions(opts);
    const maxURLLength = opts.maxURLLength || Infinity;

    // initialized config
    return (runtime) => {
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

        const fetch = requester(resolvedOpts, runtime, type, opts);

        return { validate, fetch };
      };

      const query = dataLoader<Operation, HTTPResult>(batchLoader('query'));
      const mutation = dataLoader<Operation, HTTPResult>(
        batchLoader('mutation'),
      );
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
  };
}
