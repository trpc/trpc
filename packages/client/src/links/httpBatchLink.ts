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
  closePipeline,
  failPipelinedBatch,
  hasPipelinedCalls,
  pipelinedRequest,
  pipelineOf,
  planPipelinedBatch,
  sendPipelinedBatch,
  settlePipelinedBatch,
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
          if (
            pipelines(type) &&
            batchOps.length > 1 &&
            planPipelined(batchOps).overLimit
          ) {
            // An operation's calls go in its request before more operations
            // do. A call that reads an operation that comes later can wait
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
          if (pipelines(type)) {
            const plan = planPipelined(batchOps);
            sendPipelinedBatch({ ops: batchOps, plan });
            if (plan.calls.length > 0) {
              const results = fetchPipelined({ batchOps, plan });
              results.catch((error: unknown) =>
                failPipelinedBatch(plan, error),
              );
              return results;
            }
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

    /** Whether the server can make more calls in the requests of a type */
    const pipelines = (type: ProcedureType) =>
      !!opts.experimental_pipelining && type === 'query';

    /** The calls that go in the request of a batch of queries, within the limits */
    const planPipelined = (batchOps: Operation[]) =>
      planPipelinedBatch({
        ops: batchOps,
        fits: (plan) =>
          hasPipelinedCalls(batchOps) &&
          batchOps.length + plan.calls.length <= maxItems &&
          (maxURLLength === Infinity ||
            pipelinedRequest(plan.reads).getUrl({
              ...resolvedOpts,
              type: 'query',
              path: [...batchOps, ...plan.calls]
                .map((sent) => sent.path)
                .join(','),
              inputs: [...batchOps, ...plan.calls].map((sent) => sent.input),
              signal: null,
            }).length <= maxURLLength),
      });

    /** A batch with calls that read their inputs from the data of others */
    async function fetchPipelined(pipelined: {
      batchOps: Operation[];
      plan: PipelinedBatchPlan;
    }) {
      const { batchOps, plan } = pipelined;
      const sent = [...batchOps, ...plan.calls];
      const res = await httpRequest({
        ...resolvedOpts,
        contentTypeHeader: 'application/json',
        ...pipelinedRequest(plan.reads),
        path: sent.map((it) => it.path).join(','),
        inputs: sent.map((it) => it.input),
        type: 'query',
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
        signal: allAbortSignals(...batchOps.map((op) => op.signal)),
      });
      assertPipelinedBatchAccepted({
        json: res.json,
        deserialize: (error) =>
          resolvedOpts.transformer.output.deserialize(error),
      });
      const resJSON = Array.isArray(res.json)
        ? res.json
        : sent.map(() => res.json);
      const results = resJSON.map((item) => ({ meta: res.meta, json: item }));
      settlePipelinedBatch({
        ops: batchOps,
        plan,
        results,
        read: (result) => {
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
      });
      return results.slice(0, batchOps.length);
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
        if (pipelines(op.type)) {
          // Calls can go in its request, until the request goes
          const pipeline = pipelineOf(op);
          if (pipeline) {
            pipeline.open = true;
          }
        }
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
          .then(() => closePipeline(op));

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
