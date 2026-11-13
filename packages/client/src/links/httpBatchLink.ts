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
  jsonHttpRequester,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import {
  assertPipelinedBatchAccepted,
  pipelinedRequest,
  pipelineOf,
  planPipelinedBatch,
  resultsOfPipelinedBatch,
} from './internals/pipeline';
import type { PipelinedBatchPlan } from './internals/pipeline';
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
          const plan = opts.experimental_pipelining
            ? planPipelinedBatch(batchOps)
            : null;
          if (plan) {
            // What is sent, and how, differs for a batch with a read
            return (
              plan.sent.length <= maxItems &&
              pipelinedRequest(plan.reads).getUrl({
                ...resolvedOpts,
                type,
                path: plan.sent.map((op) => op.path).join(','),
                inputs: plan.sent.map((op) => op.input),
                signal: null,
              }).length <= maxURLLength
            );
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
          const plan = opts.experimental_pipelining
            ? planPipelinedBatch(batchOps)
            : null;
          if (plan) {
            return fetchPipelined({ batchOps, plan, type });
          }
          const path = batchOps.map((op) => op.path).join(',');
          const inputs = batchOps.map((op) => op.input);
          const signal = allAbortSignals(...batchOps.map((op) => op.signal));

          const res = await jsonHttpRequester({
            ...resolvedOpts,
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
    };

    /** A batch where an operation reads its input from another's data */
    async function fetchPipelined(pipelined: {
      batchOps: Operation[];
      plan: PipelinedBatchPlan<Operation>;
      type: ProcedureType;
    }) {
      const { batchOps, plan } = pipelined;
      if (plan.sent.length === 0) {
        return resultsOfPipelinedBatch({ batchOps, plan, results: [] });
      }
      const res = await httpRequest({
        ...resolvedOpts,
        contentTypeHeader: 'application/json',
        ...pipelinedRequest(plan.reads),
        path: plan.sent.map((op) => op.path).join(','),
        inputs: plan.sent.map((op) => op.input),
        type: pipelined.type,
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
        signal: allAbortSignals(...plan.sent.map((op) => op.signal)),
      });
      assertPipelinedBatchAccepted({
        json: res.json,
        deserialize: (error) =>
          resolvedOpts.transformer.output.deserialize(error),
      });
      const resJSON = Array.isArray(res.json)
        ? res.json
        : plan.sent.map(() => res.json);
      return resultsOfPipelinedBatch({
        batchOps,
        plan,
        results: resJSON.map((item) => ({ meta: res.meta, json: item })),
      });
    }

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
        if (opts.experimental_pipelining && op.type === 'query') {
          // Tells who sent the operation that others can read from it
          const pipeline = pipelineOf(op);
          if (pipeline) {
            pipeline.accepted = true;
          }
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
