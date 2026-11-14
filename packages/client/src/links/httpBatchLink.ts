import type { AnyRouter, ProcedureType } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { transformResult } from '@trpc/server/unstable-core-do-not-import';
import type { BatchLoader } from '../internals/dataLoader';
import { dataLoader } from '../internals/dataLoader';
import {
  allAbortSignals,
  raceAbortSignalsWithCleanup,
} from '../internals/signals';
import type { NonEmptyArray } from '../internals/types';
import { TRPCClientError } from '../TRPCClientError';
import type { HTTPBatchLinkOptions } from './HTTPBatchLinkOptions';
import type { HTTPResult } from './internals/httpUtils';
import {
  getBody,
  getUrl,
  httpRequest,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import type { BatchPipelining } from './internals/pipeline';
import type { Operation, TRPCLink } from './types';

/**
 * A terminating link that batches calls made in the same tick into one HTTP
 * request.
 *
 * @see https://trpc.io/docs/client/links/httpBatchLink
 */
export function httpBatchLink<TRouter extends AnyRouter>(
  opts: HTTPBatchLinkOptions<TRouter['_def']['_config']['$types']>,
): TRPCLink<TRouter> {
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  const maxURLLength = opts.maxURLLength ?? Infinity;
  const maxItems = opts.maxItems ?? Infinity;

  return () => {
    /** Calls that read the data of others, in the requests of what they read */
    const pipelining =
      opts.experimental_pipelining?.({
        ...resolvedOpts,
        maxItems,
        maxURLLength,
        read(result) {
          const transformed = transformResult(
            result.json,
            resolvedOpts.transformer.output,
          );
          if (!transformed.ok) {
            throw TRPCClientError.from(transformed.error, {
              meta: result.meta,
            });
          }
          return { data: transformed.result.data };
        },
      }) ?? null;

    const batchLoader = (
      type: ProcedureType,
    ): BatchLoader<Operation, HTTPResult> => {
      return {
        validate(batchOps) {
          if (pipelining?.splits(batchOps)) {
            return false;
          }
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
          const pipelined = pipelining?.take(batchOps) ?? null;
          const results = fetchBatch(batchOps, pipelined);
          pipelined?.settle(results);
          return pipelined
            ? (await results).slice(0, batchOps.length)
            : results;
        },
      };

      async function fetchBatch(
        batchOps: Operation[],
        /** The calls the server makes after the operations, in the same request */
        pipelined: ReturnType<BatchPipelining['take']>,
      ) {
        const sent = pipelined ? [...batchOps, ...pipelined.calls] : batchOps;
        const path = sent.map((it) => it.path).join(',');
        const inputs = sent.map((it) => it.input);
        const signal = allAbortSignals(...batchOps.map((op) => op.signal));

        const res = await httpRequest({
          ...resolvedOpts,
          contentTypeHeader: 'application/json',
          getUrl,
          getBody,
          ...pipelined?.request,
          path,
          inputs,
          type,
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
          signal,
        });
        pipelined?.accepted(res.json);
        const resJSON = Array.isArray(res.json)
          ? res.json
          : sent.map(() => res.json);
        const result = resJSON.map((item) => ({
          meta: res.meta,
          json: item,
        }));
        return result;
      }
    };

    const query = dataLoader(batchLoader('query'));
    const mutation = dataLoader(batchLoader('mutation'));

    const loaders = { query, mutation };
    return ({ op }) => {
      return observable((observer) => {
        /* istanbul ignore if -- @preserve */
        if (op.type === 'subscription') {
          throw new Error(
            'Subscriptions are unsupported by `httpLink` - use `httpSubscriptionLink` or `wsLink`',
          );
        }
        const ac = new AbortController();
        const { signal, cleanup } = raceAbortSignalsWithCleanup(
          op.signal,
          ac.signal,
        );
        const loader = loaders[op.type];
        pipelining?.open(op);
        const promise = loader.load({
          ...op,
          signal,
        });

        let isDone = false;
        let _res = undefined as HTTPResult | undefined;
        void promise
          .then((res) => {
            isDone = true;
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
            isDone = true;
            observer.error(
              TRPCClientError.from(err, {
                meta: _res?.meta,
              }),
            );
          })
          .then(() => pipelining?.close(op));

        return () => {
          if (!isDone) {
            ac.abort();
          }
          cleanup();
        };
      });
    };
  };
}
