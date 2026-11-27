import type { AnyRouter, ProcedureType } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import {
  pipelineMaxBatchSizeDefault,
  transformResult,
} from '@trpc/server/unstable-core-do-not-import';
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
  getUrl,
  jsonHttpRequester,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import type { PipeliningLoader } from './internals/pipeline';
import type { Operation, OperationLink, TRPCLink } from './types';

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
  // A server that pipelines takes at most this many calls, if it sets no
  // `maxBatchSize`
  const maxItems =
    opts.maxItems ??
    (opts.experimental_pipelining ? pipelineMaxBatchSizeDefault : Infinity);

  return () => {
    // Queries that read others' data, in the requests of what they read
    const pipelining = opts.experimental_pipelining?.(opts, false);
    const batchLoader = (
      type: ProcedureType,
    ): BatchLoader<Operation, HTTPResult> => {
      const loader: PipeliningLoader<Operation> = {
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
        async fetch(batchOps, request) {
          const path = batchOps.map((op) => op.path).join(',');
          const inputs = batchOps.map((op) => op.input);
          const signal = allAbortSignals(...batchOps.map((op) => op.signal));

          const res = await jsonHttpRequester({
            ...resolvedOpts,
            ...request,
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
          const resJSON = Array.isArray(res.json)
            ? res.json
            : batchOps.map(() => res.json);
          const result = resJSON.map((item) => ({
            meta: res.meta,
            json: item,
          }));
          return result;
        },
      };
      return pipelining?.loader(loader) ?? loader;
    };

    const query = dataLoader(batchLoader('query'));
    const mutation = dataLoader(batchLoader('mutation'));

    const loaders = { query, mutation };
    const handler: OperationLink<TRouter> = ({ op }) => {
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
        const promise = loader.load({
          ...op,
          signal,
        });

        let isDone = false;
        let _res = undefined as HTTPResult | undefined;
        promise
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
          });

        return () => {
          if (!isDone) {
            ac.abort();
          }
          cleanup();
        };
      });
    };
    return pipelining?.link(handler) ?? handler;
  };
}
