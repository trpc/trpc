import { observable } from '@trpc/server/observable';
import type {
  AnyClientTypes,
  inferClientTypes,
  InferrableClientTypes,
  SSEStreamConsumerOptions,
} from '@trpc/server/unstable-core-do-not-import';
import {
  run,
  sseStreamConsumer,
} from '@trpc/server/unstable-core-do-not-import';
import { raceAbortSignals } from '../internals/signals';
import { TRPCClientError } from '../TRPCClientError';
import { getTransformer, type TransformerOptions } from '../unstable-internals';
import { getUrl } from './internals/httpUtils';
import type { CallbackOrValue } from './internals/urlWithConnectionParams';
import {
  resultOf,
  type UrlOptionsWithConnectionParams,
} from './internals/urlWithConnectionParams';
import type { TRPCLink } from './types';

async function urlWithConnectionParams(
  opts: UrlOptionsWithConnectionParams,
): Promise<string> {
  let url = await resultOf(opts.url);
  if (opts.connectionParams) {
    const params = await resultOf(opts.connectionParams);

    const prefix = url.includes('?') ? '&' : '?';
    url +=
      prefix + 'connectionParams=' + encodeURIComponent(JSON.stringify(params));
  }

  return url;
}

type HTTPSubscriptionLinkOptions<TRoot extends AnyClientTypes> = {
  /**
   * EventSource options or a callback that returns them
   */
  eventSourceOptions?: CallbackOrValue<EventSourceInit>;
  /**
   * @see https://trpc.io/docs/client/links/httpSubscriptionLink#updatingConfig
   */
  experimental_shouldRecreateOnError?: SSEStreamConsumerOptions['shouldRecreateOnError'];
} & TransformerOptions<TRoot> &
  UrlOptionsWithConnectionParams;

/**
 * @see https://trpc.io/docs/client/links/httpSubscriptionLink
 */
export function unstable_httpSubscriptionLink<
  TInferrable extends InferrableClientTypes,
>(
  opts: HTTPSubscriptionLinkOptions<inferClientTypes<TInferrable>>,
): TRPCLink<TInferrable> {
  const transformer = getTransformer(opts.transformer);

  return () => {
    return ({ op }) => {
      return observable((observer) => {
        const { type, path, input } = op;

        /* istanbul ignore if -- @preserve */
        if (type !== 'subscription') {
          throw new Error('httpSubscriptionLink only supports subscriptions');
        }

        const ac = new AbortController();
        const signal = raceAbortSignals(op.signal, ac.signal);
        const eventSourceStream = sseStreamConsumer<
          Partial<{
            id?: string;
            data: unknown;
          }>
        >({
          url: async () =>
            getUrl({
              transformer,
              url: await urlWithConnectionParams(opts),
              input,
              path,
              type,
              signal: null,
            }),
          init: () => resultOf(opts.eventSourceOptions),
          signal,
          deserialize: transformer.output.deserialize,
          shouldRecreateOnError: opts.experimental_shouldRecreateOnError,
        });

        run(async () => {
          for await (const chunk of eventSourceStream) {
            switch (chunk.type) {
              case 'data':
                const chunkData = chunk.data;

                // if the `tracked()`-helper is used, we always have an `id` field
                const data = 'id' in chunkData ? chunkData : chunkData.data;

                observer.next({
                  result: {
                    data,
                  },
                  context: {
                    eventSource: chunk.eventSource,
                  },
                });
                break;
              case 'opened': {
                observer.next({
                  result: {
                    type: 'started',
                  },
                  context: {
                    eventSource: chunk.eventSource,
                  },
                });
                break;
              }
              case 'error': {
                // TODO: handle in https://github.com/trpc/trpc/issues/5871
                break;
              }
              case 'connecting': {
                // TODO: handle in https://github.com/trpc/trpc/issues/5871
                break;
              }
            }
          }

          observer.next({
            result: {
              type: 'stopped',
            },
          });
          observer.complete();
        }).catch((error) => {
          observer.error(TRPCClientError.from(error));
        });

        return () => {
          observer.complete();
          ac.abort();
        };
      });
    };
  };
}
