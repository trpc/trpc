import { observable } from '@trpc/server/observable';
import type { TRPCErrorResponse } from '@trpc/server/rpc';
import type {
  AnyClientTypes,
  inferClientTypes,
  InferrableClientTypes,
} from '@trpc/server/unstable-core-do-not-import';
import {
  run,
  sseStreamConsumer,
} from '@trpc/server/unstable-core-do-not-import';
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

        let eventSource: EventSource | null = null;
        let unsubscribed = false;
        /**
         * The last known error that the client has received
         * Will be reset whenever a new message is received
         */
        let lastKnownError: TRPCClientError<TInferrable> | null = null;

        run(async () => {
          const url = getUrl({
            transformer,
            url: await urlWithConnectionParams(opts),
            input,
            path,
            type,
            signal: null,
          });

          const eventSourceOptions = await resultOf(opts.eventSourceOptions);
          /* istanbul ignore if -- @preserve */
          if (unsubscribed) {
            // already unsubscribed - rare race condition
            return;
          }
          eventSource = new EventSource(url, eventSourceOptions);
          observer.next({
            result: {
              type: 'state',
              state: 'connecting',
              error: null,
            },
          });

          const onStarted = () => {
            observer.next({
              result: {
                type: 'started',
              },
              context: {
                eventSource,
              },
            });

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            eventSource!.removeEventListener('open', onStarted);
          };
          // console.log('starting', new Date());
          eventSource.addEventListener('open', onStarted);

          eventSource.addEventListener('open', () => {
            observer.next({
              result: {
                type: 'state',
                state: 'pending',
              },
            });
          });

          eventSource.addEventListener('error', (event) => {
            switch (eventSource?.readyState) {
              case EventSource.CONNECTING: {
                observer.next({
                  result: {
                    type: 'state',
                    state: 'connecting',
                    error: lastKnownError,
                  },
                });
                return;
              }
              case EventSource.CLOSED: {
                const error =
                  globalThis.ErrorEvent && event instanceof ErrorEvent
                    ? TRPCClientError.from(event.error)
                    : TRPCClientError.from(
                        new Error(`Unknown EventSource error`),
                      );

                observer.next({
                  result: {
                    type: 'state',
                    state: 'connecting',
                    error: lastKnownError ?? error,
                  },
                });
                return;
              }
            }
          });

          const iterable = sseStreamConsumer<{
            id?: string;
            data?: unknown;
          }>({
            from: eventSource,
            deserialize: transformer.output.deserialize,
          });

          for await (const chunk of iterable) {
            if (!chunk.ok) {
              const error = chunk.error as TRPCErrorResponse['error'];

              lastKnownError = TRPCClientError.from({
                error,
              });
              continue;
            }
            lastKnownError = null;
            const chunkData = chunk.data;

            // if the `tracked()`-helper is used, we always have an `id` field
            const data = 'id' in chunkData ? chunkData : chunkData.data;
            observer.next({
              result: {
                data,
              },
            });
          }

          observer.next({
            result: {
              type: 'stopped',
            },
          });
          observer.complete();

          observer.next({
            result: {
              type: 'state',
              state: 'idle',
            },
          });
        }).catch((error) => {
          const trpcError = TRPCClientError.from(error);

          observer.next({
            result: {
              type: 'state',
              state: 'error',
              error: trpcError,
            },
          });
          observer.error(trpcError);
        });

        return () => {
          observer.complete();

          observer.next({
            result: {
              type: 'state',
              state: 'idle',
            },
          });

          eventSource?.close();
          unsubscribed = true;
        };
      });
    };
  };
}
