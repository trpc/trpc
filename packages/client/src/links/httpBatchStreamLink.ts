import type { AnyRouter, ProcedureType } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { TRPCResponse } from '@trpc/server/rpc';
import type { AnyRootTypes } from '@trpc/server/unstable-core-do-not-import';
import { jsonlStreamConsumer } from '@trpc/server/unstable-core-do-not-import';
import type { BatchLoader } from '../internals/dataLoader';
import { dataLoader } from '../internals/dataLoader';
import type { NonEmptyArray } from '../internals/types';
import { TRPCClientError } from '../TRPCClientError';
import type { HTTPBatchLinkOptions } from './HTTPBatchLinkOptions';
import type { HTTPResult } from './internals/httpUtils';
import {
  fetchHTTPResponse,
  getBody,
  getUrl,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import type { Operation, TRPCLink } from './types';

export type HTTPBatchStreamLinkOptions<TRoot extends AnyRootTypes> =
  HTTPBatchLinkOptions<TRoot> & {
    /**
     * Maximum number of calls in a single batch request
     * @default Infinity
     */
    maxItems?: number;
  };

/**
 * @see https://trpc.io/docs/client/links/httpBatchStreamLink
 */
export function unstable_httpBatchStreamLink<TRouter extends AnyRouter>(
  opts: HTTPBatchStreamLinkOptions<TRouter['_def']['_config']['$types']>,
): TRPCLink<TRouter> {
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  const maxURLLength = opts.maxURLLength ?? Infinity;
  const maxItems = opts.maxItems ?? Infinity;

  return () => {
    const batchLoader = (
      type: ProcedureType,
    ): BatchLoader<Operation, HTTPResult> => {
      return {
        validate(batchOps) {
          if (maxURLLength === Infinity && maxItems === Infinity) {
            // escape hatch for quick calcs
            return true;
          }
          if (batchOps.length > maxItems) {
            return false;
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
        },
        fetch(batchOps) {
          const path = batchOps.map((op) => op.path).join(',');
          const inputs = batchOps.map((op) => op.input);

          const ac = resolvedOpts.AbortController
            ? new resolvedOpts.AbortController()
            : null;
          const responsePromise = fetchHTTPResponse(
            {
              ...resolvedOpts,
              type,
              contentTypeHeader: 'application/json',
              trpcAcceptHeader: 'application/jsonl',
              getUrl,
              getBody,
              inputs,
              path,
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
            },
            ac,
          );

          return {
            promise: responsePromise.then(async (res) => {
              if (!res.body) {
                throw new Error('Received response without body');
              }
              const [head] = await jsonlStreamConsumer<
                Record<string, Promise<any>>
              >({
                from: res.body,
                deserialize: resolvedOpts.transformer.output.deserialize,
                // onError: console.error,
              });

              const promises = Object.keys(batchOps).map(
                async (key): Promise<HTTPResult> => {
                  let json: TRPCResponse = await head[key];

                  if ('result' in json) {
                    /**
                     * Not very pretty, but we need to unwrap nested data as promises
                     * Our stream producer will only resolve top-level async values or async values that are directly nested in another async value
                     */
                    const result = await Promise.resolve(json.result);
                    json = {
                      result: {
                        data: await Promise.resolve(result.data),
                      },
                    };
                  }

                  return {
                    json,
                    meta: {
                      response: res,
                    },
                  };
                },
              );
              return promises;
            }),
            cancel() {
              ac?.abort();
            },
          };
        },
      };
    };

    const query = dataLoader(batchLoader('query'));
    const mutation = dataLoader(batchLoader('mutation'));
    const subscription = dataLoader(batchLoader('subscription'));

    const loaders = { query, subscription, mutation };
    return ({ op }) => {
      return observable((observer) => {
        const loader = loaders[op.type];
        const { promise, cancel } = loader.load(op);

        let _res = undefined as HTTPResult | undefined;
        promise
          .then((res) => {
            _res = res;
            if ('error' in res.json) {
              observer.error(
                TRPCClientError.from(res.json, {
                  meta: res.meta,
                }),
              );
              return;
            } else if ('result' in res.json) {
              observer.next({
                context: res.meta,
                result: res.json.result,
              });
              observer.complete();
              return;
            }

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
}
