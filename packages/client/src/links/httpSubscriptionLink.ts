import type { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { TRPCResponse } from '@trpc/server/rpc';
import { jsonlStreamConsumer } from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from '../TRPCClientError';
import type { HTTPLinkOptions } from './httpLink';
import {
  fetchHTTPResponse,
  getBody,
  getUrl,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import type { TRPCLink } from './types';

/**
 * @see https://trpc.io/docs/client/links/httpBatchStreamLink
 */
export function unstable_httpSubscriptionLink<TRouter extends AnyRouter>(
  opts: HTTPLinkOptions<TRouter['_def']['_config']['$types']>,
): TRPCLink<TRouter> {
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  return () => {
    return ({ op }) => {
      return observable((observer) => {
        const { type, path, input } = op;
        /* istanbul ignore if -- @preserve */
        if (type !== 'subscription') {
          throw new Error('httpSubscriptionLink only supports subscriptions');
        }

        const ac = resolvedOpts.AbortController
          ? new resolvedOpts.AbortController()
          : null;

        fetchHTTPResponse(
          {
            ...resolvedOpts,
            type,
            contentTypeHeader: 'application/json',
            trpcAcceptHeader: 'application/jsonl',
            getUrl,
            getBody,
            inputs: [input],
            path,
            headers() {
              if (!opts.headers) {
                return {};
              }
              if (typeof opts.headers === 'function') {
                return opts.headers({
                  op,
                });
              }
              return opts.headers;
            },
          },
          ac,
        )
          .then(async (res) => {
            const [head] = await jsonlStreamConsumer<Record<'0', Promise<any>>>(
              {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                from: res.body!,
                deserialize: resolvedOpts.transformer.output.deserialize,
              },
            );
            let json: TRPCResponse = await Promise.resolve(head[0]);

            if ('error' in json) {
              observer.error(
                TRPCClientError.from(json, {
                  meta: {
                    response: res,
                  },
                }),
              );
              return;
            }

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
            observer.next({
              result: {
                type: 'started',
              },
            });
            for await (const chunk of json.result
              .data as AsyncIterable<unknown>) {
              observer.next({
                result: {
                  type: 'data',
                  data: chunk,
                },
              });
            }
            observer.next({
              result: {
                type: 'stopped',
              },
            });
            observer.complete();
          })
          .catch((cause) => {
            observer.error(TRPCClientError.from(cause));
          });

        return () => {
          ac?.abort();
        };
      });
    };
  };
}
