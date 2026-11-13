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
  getUrl,
  httpRequest,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import {
  pipelineOf,
  planPipelinedBatch,
  resultsOfPipelinedBatch,
  pipelinedRequest,
} from './internals/pipeline';
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
          const plan = planPipelinedBatch(batchOps);
          const path = plan.sent.map((op) => op.path).join(',');
          const inputs = plan.sent.map((op) => op.input);

          const url = getUrl({
            ...resolvedOpts,
            url: pipelinedRequest({ link: resolvedOpts, reads: plan.reads })
              .url,
            type,
            path,
            inputs,
            signal: null,
          });

          return url.length <= maxURLLength;
        },
        async fetch(batchOps) {
          const plan = planPipelinedBatch(batchOps);
          if (plan.sent.length === 0) {
            return resultsOfPipelinedBatch({ batchOps, plan, results: [] });
          }
          const path = plan.sent.map((op) => op.path).join(',');
          const inputs = plan.sent.map((op) => op.input);
          const signal = allAbortSignals(...plan.sent.map((op) => op.signal));

          const res = await httpRequest({
            ...resolvedOpts,
            contentTypeHeader: 'application/json',
            getUrl,
            ...pipelinedRequest({ link: resolvedOpts, reads: plan.reads }),
            path,
            inputs,
            type,
            headers() {
              if (!opts.headers) {
                return {};
              }
              if (typeof opts.headers === 'function') {
                return opts.headers({
                  opList: plan.sent as NonEmptyArray<Operation>,
                });
              }
              return opts.headers;
            },
            signal,
          });
          const resJSON = Array.isArray(res.json)
            ? res.json
            : plan.sent.map(() => res.json);
          const results = resJSON.map((item) => ({
            meta: res.meta,
            json: item,
          }));
          return resultsOfPipelinedBatch({ batchOps, plan, results });
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
            'Subscriptions are unsupported by `httpLink` - use `httpSubscriptionLink` or `wsLink`',
          );
        }
        const ac = new AbortController();
        const { signal, cleanup } = raceAbortSignalsWithCleanup(
          op.signal,
          ac.signal,
        );
        const loader = loaders[op.type];
        const pipeline = pipelineOf(op);
        if (pipeline && opts.pipelining && op.type === 'query') {
          pipeline.accepted = true;
        }
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
  };
}
