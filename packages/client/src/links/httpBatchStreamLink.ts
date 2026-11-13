import type { AnyRouter, ProcedureType } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { TRPCErrorShape, TRPCResponse } from '@trpc/server/rpc';
import type { AnyClientTypes } from '@trpc/server/unstable-core-do-not-import';
import { jsonlStreamConsumer } from '@trpc/server/unstable-core-do-not-import';
import type { BatchLoader } from '../internals/dataLoader';
import { dataLoader } from '../internals/dataLoader';
import { allAbortSignals, raceAbortSignals } from '../internals/signals';
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
 * Options for {@link httpBatchStreamLink}. Takes the same options as
 * `httpBatchLink`, plus `streamHeader`.
 *
 * @see https://trpc.io/docs/client/links/httpBatchStreamLink#options
 */
export type HTTPBatchStreamLinkOptions<TRoot extends AnyClientTypes> =
  HTTPBatchLinkOptions<TRoot> & {
    /**
     * Which header to use to signal the server that the client wants a streaming response.
     * - `'trpc-accept'` (default): sends `trpc-accept: application/jsonl` header
     * - `'accept'`: sends `Accept: application/jsonl` header, which can avoid CORS preflight for cross-origin streaming queries. Be aware that `application/jsonl` is not an official MIME type and so this is not completely spec-compliant - you should test that your infrastructure supports this value.
     * @default 'trpc-accept'
     */
    streamHeader?: 'trpc-accept' | 'accept';
  };

/**
 * A terminating link that batches calls like `httpBatchLink`, but streams each
 * response back as soon as it is ready.
 *
 * @see https://trpc.io/docs/client/links/httpBatchStreamLink
 */
export function httpBatchStreamLink<TRouter extends AnyRouter>(
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
          if (
            pipelines(type) &&
            batchOps.length > 1 &&
            planPipelined(batchOps).left.length > 0
          ) {
            // An operation's calls go in its request before more operations do
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
              // A batch with calls that read their inputs from the data of others
              const sent = fetchBatch(batchOps, plan);
              sent.catch((error: unknown) => failPipelinedBatch(plan, error));
              const results = await sent;
              settlePipelinedBatch({
                ops: batchOps,
                plan,
                results,
                read: (result) => {
                  if ('error' in result.json) {
                    throw TRPCClientError.from(result.json, {
                      meta: result.meta,
                    });
                  }
                  return { data: result.json.result.data };
                },
              });
              return results.slice(0, batchOps.length);
            }
          }
          return fetchBatch(batchOps, null);
        },
      };

      async function fetchBatch(
        batchOps: Operation[],
        /** The calls the server makes after the operations, in the same request */
        plan: PipelinedBatchPlan | null,
      ) {
        const sent = [...batchOps, ...(plan?.calls ?? [])];
        const pipelined = plan && pipelinedRequest(plan.reads);
        const path = sent.map((it) => it.path).join(',');
        const inputs = sent.map((it) => it.input);

        const batchSignals = allAbortSignals(
          ...batchOps.map((op) => op.signal),
        );
        const abortController = new AbortController();

        const responsePromise = fetchHTTPResponse({
          ...resolvedOpts,
          signal: raceAbortSignals(batchSignals, abortController.signal),
          type,
          contentTypeHeader: 'application/json',
          trpcAcceptHeader: 'application/jsonl',
          trpcAcceptHeaderKey: opts.streamHeader ?? 'trpc-accept',
          ...(pipelined ?? { getUrl, getBody }),
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
        });

        const res = await responsePromise;

        if (!res.ok) {
          // Server returned a non-2xx response (e.g. batching disabled).
          // The body is plain JSON, not JSONL, so parse it directly and
          // propagate the same error to every operation in the batch.
          const json = (await res.json()) as TRPCResponse;
          if (pipelined) {
            assertPipelinedBatchAccepted({
              json,
              deserialize: (error) =>
                resolvedOpts.transformer.output.deserialize(error),
            });
          }
          if ('error' in json) {
            json.error = resolvedOpts.transformer.output.deserialize(
              json.error,
            );
          }

          return sent.map((): Promise<HTTPResult> =>
            Promise.resolve({
              json,
              meta: {
                response: res,
              },
            }),
          );
        }

        const [head] = await jsonlStreamConsumer<Record<string, Promise<any>>>({
          // oxlint-disable-next-line typescript/no-non-null-assertion
          from: res.body!,
          deserialize: (data) =>
            resolvedOpts.transformer.output.deserialize(data),
          // onError: console.error,
          formatError(opts) {
            const error = opts.error as TRPCErrorShape;
            return TRPCClientError.from({
              error,
            });
          },
          abortController,
        });
        const promises = Object.keys(sent).map(
          async (key): Promise<HTTPResult> => {
            let json: TRPCResponse = await Promise.resolve(head[key]);

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
      }
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

    const query = dataLoader(batchLoader('query'));
    const mutation = dataLoader(batchLoader('mutation'));

    const loaders = { query, mutation };
    return ({ op }) => {
      return observable((observer) => {
        /* istanbul ignore if -- @preserve */
        if (op.type === 'subscription') {
          throw new Error(
            'Subscriptions are unsupported by `httpBatchStreamLink` - use `httpSubscriptionLink` or `wsLink`',
          );
        }
        const ac = new AbortController();
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
          signal: raceAbortSignals(op.signal, ac.signal),
        });

        let isDone = false;
        let _res = undefined as HTTPResult | undefined;
        void promise
          .then((res) => {
            isDone = true;
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
        };
      });
    };
  };
}

/**
 * @deprecated Use {@link httpBatchStreamLink} instead.
 */
export const unstable_httpBatchStreamLink = httpBatchStreamLink;
