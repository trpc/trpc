import { behaviorSubject, observable } from '@trpc/server/observable';
import type { TRPCErrorShape, TRPCResult } from '@trpc/server/rpc';
import type {
  AnyClientTypes,
  EventSourceLike,
  inferClientTypes,
  InferrableClientTypes,
} from '@trpc/server/unstable-core-do-not-import';
import {
  retryableRpcCodes,
  run,
  sseStreamConsumer,
} from '@trpc/server/unstable-core-do-not-import';
import { inputWithTrackedEventId } from '../internals/inputWithTrackedEventId';
import { raceAbortSignals } from '../internals/signals';
import { TRPCClientError } from '../TRPCClientError';
import type { TRPCConnectionState } from '../unstable-internals';
import { getTransformer, type TransformerOptions } from '../unstable-internals';
import { getUrl } from './internals/httpUtils';
import {
  resultOf,
  type UrlOptionsWithConnectionParams,
} from './internals/urlWithConnectionParams';
import type { Operation, TRPCLink } from './types';

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

type HTTPSubscriptionLinkOptions<
  TRoot extends AnyClientTypes,
  TEventSource extends EventSourceLike.AnyConstructor = typeof EventSource,
> = {
  /**
   * EventSource ponyfill
   */
  EventSource?: TEventSource;
  /**
   * EventSource options or a callback that returns them
   */
  eventSourceOptions?:
    | EventSourceLike.InitDictOf<TEventSource>
    | ((opts: {
        op: Operation;
      }) =>
        | EventSourceLike.InitDictOf<TEventSource>
        | Promise<EventSourceLike.InitDictOf<TEventSource>>);
} & TransformerOptions<TRoot> &
  UrlOptionsWithConnectionParams;

/**
 * @see https://trpc.io/docs/client/links/httpSubscriptionLink
 */
export function httpSubscriptionLink<
  TInferrable extends InferrableClientTypes,
  TEventSource extends EventSourceLike.AnyConstructor,
>(
  opts: HTTPSubscriptionLinkOptions<
    inferClientTypes<TInferrable>,
    TEventSource
  >,
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

        let lastEventId: string | undefined = undefined;
        const ac = new AbortController();
        const signal = raceAbortSignals(op.signal, ac.signal);
        const eventSourceStream = sseStreamConsumer<{
          EventSource: TEventSource;
          data: Partial<{
            id?: string;
            data: unknown;
          }>;
          error: TRPCErrorShape;
        }>({
          url: async () =>
            getUrl({
              transformer,
              url: await urlWithConnectionParams(opts),
              input: inputWithTrackedEventId(input, lastEventId),
              path,
              type,
              signal: null,
            }),
          init: () => resultOf(opts.eventSourceOptions, { op }),
          signal,
          deserialize: (data) => transformer.output.deserialize(data),
          EventSource:
            opts.EventSource ??
            (globalThis.EventSource as never as TEventSource),
        });

        const connectionState = behaviorSubject<
          TRPCConnectionState<TRPCClientError<any>>
        >({
          type: 'state',
          state: 'connecting',
          error: null,
        });

        const connectionSub = connectionState.subscribe({
          next(state) {
            observer.next({
              result: state,
            });
          },
        });
        run(async () => {
          for await (const chunk of eventSourceStream) {
            switch (chunk.type) {
              case 'ping':
                // do nothing
                break;
              case 'data':
                const chunkData = chunk.data;

                let result: TRPCResult<unknown>;
                if (chunkData.id) {
                  // if the `tracked()`-helper is used, we always have an `id` field
                  lastEventId = chunkData.id;
                  result = {
                    id: chunkData.id,
                    data: chunkData,
                  };
                } else {
                  result = {
                    data: chunkData.data,
                  };
                }

                observer.next({
                  result,
                  context: {
                    eventSource: chunk.eventSource,
                  },
                });
                break;
              case 'connected': {
                observer.next({
                  result: {
                    type: 'started',
                  },
                  context: {
                    eventSource: chunk.eventSource,
                  },
                });
                connectionState.next({
                  type: 'state',
                  state: 'pending',
                  error: null,
                });
                break;
              }
              case 'serialized-error': {
                const error = TRPCClientError.from({ error: chunk.error });

                if (retryableRpcCodes.includes(chunk.error.code)) {
                  //
                  connectionState.next({
                    type: 'state',
                    state: 'connecting',
                    error,
                  });
                  break;
                }
                //
                // non-retryable error, cancel the subscription
                throw error;
              }
              case 'connecting': {
                const lastState = connectionState.get();

                const error = chunk.event && TRPCClientError.from(chunk.event);
                if (!error && lastState.state === 'connecting') {
                  break;
                }

                connectionState.next({
                  type: 'state',
                  state: 'connecting',
                  error,
                });
                break;
              }
              case 'timeout': {
                connectionState.next({
                  type: 'state',
                  state: 'connecting',
                  error: new TRPCClientError(
                    `Timeout of ${chunk.ms}ms reached while waiting for a response`,
                  ),
                });
              }
            }
          }
          observer.next({
            result: {
              type: 'stopped',
            },
          });
          connectionState.next({
            type: 'state',
            state: 'idle',
            error: null,
          });
          observer.complete();
        }).catch((error) => {
          observer.error(TRPCClientError.from(error));
        });

        return () => {
          observer.complete();
          ac.abort();
          connectionSub.unsubscribe();
        };
      });
    };
  };
}

/**
 * @deprecated use {@link httpSubscriptionLink} instead
 */
export const unstable_httpSubscriptionLink = httpSubscriptionLink;
