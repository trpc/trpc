import { behaviorSubject, observable } from '@trpc/server/observable';
import type { TRPC_ERROR_CODE_NUMBER, TRPCErrorShape } from '@trpc/server/rpc';
import { TRPC_ERROR_CODES_BY_KEY } from '@trpc/server/rpc';
import type {
  AnyClientTypes,
  EventSourceLike,
  inferClientTypes,
  InferrableClientTypes,
} from '@trpc/server/unstable-core-do-not-import';
import {
  run,
  sseStreamConsumer,
} from '@trpc/server/unstable-core-do-not-import';
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
 * tRPC error codes that are considered retryable
 * With out of the box SSE, the client will reconnect when these errors are encountered
 */
const codes5xx: TRPC_ERROR_CODE_NUMBER[] = [
  TRPC_ERROR_CODES_BY_KEY.BAD_GATEWAY,
  TRPC_ERROR_CODES_BY_KEY.SERVICE_UNAVAILABLE,
  TRPC_ERROR_CODES_BY_KEY.GATEWAY_TIMEOUT,
  TRPC_ERROR_CODES_BY_KEY.INTERNAL_SERVER_ERROR,
];

/**
 * @see https://trpc.io/docs/client/links/httpSubscriptionLink
 */
export function unstable_httpSubscriptionLink<
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
              input,
              path,
              type,
              signal: null,
            }),
          init: () => resultOf(opts.eventSourceOptions, { op }),
          signal,
          deserialize: transformer.output.deserialize,
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
                connectionState.next({
                  type: 'state',
                  state: 'pending',
                  error: null,
                });
                break;
              }
              case 'serialized-error': {
                const error = TRPCClientError.from({ error: chunk.error });

                if (codes5xx.includes(chunk.error.code)) {
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
          connectionSub.unsubscribe();
        };
      });
    };
  };
}
