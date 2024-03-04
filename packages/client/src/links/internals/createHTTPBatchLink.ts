import { observable } from '@trpc/server/observable';
import type {
  AnyRootTypes,
  AnyRouter,
  inferClientTypes,
  ProcedureType,
} from '@trpc/server/unstable-core-do-not-import';
import { transformResult } from '@trpc/server/unstable-core-do-not-import';
import { dataLoader } from '../../internals/dataLoader';
import { TRPCClientError } from '../../TRPCClientError';
import type { HTTPBatchLinkOptions } from '../HTTPBatchLinkOptions';
import type {
  CancelFn,
  Operation,
  TRPCClientRuntime,
  TRPCLink,
} from '../types';
import type { HTTPResult, ResolvedHTTPLinkOptions } from './httpUtils';
import { getUrl, resolveHTTPLinkOptions } from './httpUtils';

/**
 * @internal
 */
export type RequesterFn<TOptions extends HTTPBatchLinkOptions<AnyRootTypes>> = (
  requesterOpts: ResolvedHTTPLinkOptions & {
    runtime: TRPCClientRuntime;
    type: ProcedureType;
    opts: TOptions;
  },
) => (
  batchOps: Operation[],
  unitResolver: (index: number, value: NonNullable<HTTPResult>) => void,
) => {
  promise: Promise<HTTPResult[]>;
  cancel: CancelFn;
};

/**
 * @internal
 */
export function createHTTPBatchLink(
  requester: RequesterFn<HTTPBatchLinkOptions<AnyRootTypes>>,
) {
  return function httpBatchLink<TRouter extends AnyRouter>(
    opts: HTTPBatchLinkOptions<inferClientTypes<TRouter>>,
  ): TRPCLink<TRouter> {
    const resolvedOpts = resolveHTTPLinkOptions(opts);
    const maxURLLength = opts.maxURLLength ?? Infinity;

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
            type,
            path,
            inputs,
          });

          return url.length <= maxURLLength;
        };

        const fetch = requester({
          ...resolvedOpts,
          runtime,
          type,
          opts,
        });

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

          let _res = undefined as HTTPResult | undefined;
          promise
            .then((res) => {
              _res = res;
              const transformed = transformResult(
                res.json,
                resolvedOpts.transformer.output,
              );

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
            .catch((err) => {
              observer.error(
                TRPCClientError.from(err, {
                  meta: _res?.meta,
                }),
              );
            });

          return () => {
            cancel();
          };
        });
      };
    };
  };
}
