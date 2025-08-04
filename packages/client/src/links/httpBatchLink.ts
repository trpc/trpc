import type { AnyTRPCRouter, TRPCProcedureType } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { TRPCErrorShape, TRPCResponse } from '@trpc/server/rpc';
import {
  jsonlStreamConsumer,
  transformResult,
} from '@trpc/server/unstable-core-do-not-import';
import type { BatchLoader } from '../internals/dataLoader';
import { dataLoader } from '../internals/dataLoader';
import { allAbortSignals, raceAbortSignals } from '../internals/signals';
import type { NonEmptyArray } from '../internals/types';
import { TRPCClientError } from '../TRPCClientError';
import type { HTTPBatchLinkOptions } from './HTTPLinkOptions';
import type { HTTPResult } from './internals/httpUtils';
import {
  fetchHTTPResponse,
  getBody,
  getUrl,
  jsonHttpRequester,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import type { Operation, TRPCLink } from './types';

/**
 * @see https://trpc.io/docs/client/links/httpBatchLink
 */
export function httpBatchLink<TRouter extends AnyTRPCRouter>(
  opts: HTTPBatchLinkOptions<TRouter['_def']['_config']['$types']>,
): TRPCLink<TRouter> {
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  const maxURLLength = opts.maxURLLength ?? Infinity;
  const maxItems = opts.maxItems ?? Infinity;
  const streaming = opts.streaming ?? false;

  return () => {
    const batchLoader = (
      type: TRPCProcedureType,
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
            signal: null,
          });

          return url.length <= maxURLLength;
        },
        async fetch(batchOps) {
          const path = batchOps.map((op) => op.path).join(',');
          const inputs = batchOps.map((op) => op.input);
          const signal = allAbortSignals(...batchOps.map((op) => op.signal));
          const abortController = new AbortController();

          const headersFn = () => {
            if (typeof opts.headers === 'function') {
              return opts.headers({
                opList: batchOps as NonEmptyArray<Operation>,
              });
            }
            return opts.headers ?? {};
          };

          if (!streaming) {
            // Non-streaming mode
            const res = await jsonHttpRequester({
              ...resolvedOpts,
              path,
              inputs,
              type,
              headers: headersFn,
              signal,
            });
            const resJSON = Array.isArray(res.json)
              ? res.json
              : batchOps.map(() => res.json);
            const result = resJSON.map((item) => ({
              meta: res.meta,
              json: item,
            }));
            return result;
          }

          // Streaming mode
          const responsePromise = fetchHTTPResponse({
            ...resolvedOpts,
            signal: raceAbortSignals(signal, abortController.signal),
            type,
            contentTypeHeader: 'application/json',
            trpcAcceptHeader: 'application/jsonl',
            getUrl,
            getBody,
            inputs,
            path,
            headers: headersFn,
          });

          const res = await responsePromise;

          const [head] = await jsonlStreamConsumer<
            Record<string, Promise<TRPCResponse>>
          >({
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            from: res.body!,
            deserialize: resolvedOpts.transformer.output.deserialize,
            // onError: console.error,
            formatError(opts) {
              const error = opts.error as TRPCErrorShape;
              return TRPCClientError.from({
                error,
              });
            },
            abortController,
          });

          // Map responses back to operations
          const promises = Object.keys(batchOps).map(
            async (key): Promise<HTTPResult> => {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              let json = await Promise.resolve(head[key]!);

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
        },
      };
    };

    const query = dataLoader(batchLoader('query'));
    const mutation = dataLoader(batchLoader('mutation'));

    const loaders = { query, mutation };
    return ({ op }) => {
      return observable((observer) => {
        /* istanbul ignore if -- @preserve */
        if (op.type === 'subscription') {
          throw new Error(
            'Subscriptions are unsupported by `httpBatchLink` - use `httpSubscriptionLink` or `wsLink`',
          );
        }
        const loader = loaders[op.type];
        const promise = loader.load(op);

        let _res = undefined as HTTPResult | undefined;
        promise
          .then((res) => {
            _res = res;
            if (streaming) {
              if ('error' in res.json) {
                observer.error(
                  TRPCClientError.from(res.json, {
                    meta: res.meta,
                  }),
                );
              } else if ('result' in res.json) {
                observer.next({
                  context: res.meta,
                  result: res.json.result,
                });
                observer.complete();
              } else {
                observer.complete();
              }
              return;
            }

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
          // noop
        };
      });
    };
  };
}
