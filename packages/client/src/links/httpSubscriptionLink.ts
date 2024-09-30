import { observable } from '@trpc/server/observable';
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

type RecreateOnErrorOpt =
  | {
      type: 'raw';
      event: Event;
    }
  | {
      type: 'http-error';
      status: number;
      event: Event;
    };

type HTTPSubscriptionLinkOptions<TRoot extends AnyClientTypes> = {
  /**
   * EventSource options or a callback that returns them
   */
  eventSourceOptions?: CallbackOrValue<EventSourceInit>;
  /**
   * For a given error, should we reinitialize the underlying EventSource?
   *
   * This is useful where a long running subscription might be interrupted by a recoverable network error,
   * but the existing authorization header might have expired in the mean-time
   */
  shouldRecreateOnError?: (
    opt: RecreateOnErrorOpt,
  ) => boolean | Promise<boolean>;
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

        let eventSource: EventSourceWrapper | null = null;
        let unsubscribed = false;

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

          eventSource = new EventSourceWrapper(url, eventSourceOptions);

          const onStarted = () => {
            observer.next({
              result: {
                type: 'started',
              },
              context: {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                eventSource: eventSource!.getEventSource(),
              },
            });
          };
          eventSource.addEventListener('open', onStarted, { once: true });

          const iterable = sseStreamConsumer<
            Partial<{
              id?: string;
              data: unknown;
            }>
          >({
            from: eventSource,
            deserialize: transformer.output.deserialize,
            tryHandleError: async (ev) => {
              if (
                typeof opts.shouldRecreateOnError === 'function' &&
                eventSource
              ) {
                const recreateOnErrorOpts = createRecreateOnErrorOpts(ev);

                const shouldRestart = await opts.shouldRecreateOnError(
                  recreateOnErrorOpts,
                );

                if (!shouldRestart) {
                  return false;
                }

                eventSource.restart(
                  getUrl({
                    transformer,
                    url: await urlWithConnectionParams(opts),
                    input,
                    path,
                    type,
                    signal: null,
                  }),
                  await resultOf(opts.eventSourceOptions),
                );

                return true;
              }

              return false;
            },
          });

          for await (const chunk of iterable) {
            if (!chunk.ok) {
              // TODO: handle in https://github.com/trpc/trpc/issues/5871
              continue;
            }
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
        }).catch((error) => {
          observer.error(TRPCClientError.from(error));
        });

        return () => {
          observer.complete();
          eventSource?.close();
          unsubscribed = true;
        };
      });
    };
  };
}

function createRecreateOnErrorOpts(ev: Event): RecreateOnErrorOpt {
  if ('status' in ev && typeof ev.status === 'number') {
    return {
      type: 'http-error',
      status: ev.status,
      event: ev,
    };
  }

  return {
    type: 'raw',
    event: ev,
  };
}

/**
 * We wrap EventSource so that is can be reinitialized with new options
 */
class EventSourceWrapper implements Partial<EventSource> {
  private es: EventSource;

  private listeners: Partial<
    Record<
      keyof EventSourceEventMap,
      Parameters<EventSource['addEventListener']>[]
    >
  > = {};
  private *getAllEventListeners() {
    for (const _type in this.listeners) {
      const type = _type as keyof EventSourceEventMap;
      for (const listener of this.listeners[type] ?? []) {
        yield listener;
      }
    }
  }

  constructor(url: string, options: EventSourceInit | undefined) {
    this.es = new EventSource(url, options);
  }

  restart(url: string, options: EventSourceInit | undefined) {
    for (const [type, callback, options] of this.getAllEventListeners()) {
      this.es.removeEventListener(type, callback, options);
    }

    this.es.close();
    this.es = new EventSource(url, options);

    for (const [type, callback, options] of this.getAllEventListeners()) {
      this.es.addEventListener(type, callback, options);
    }
  }

  close() {
    this.listeners = {};
    this.es.close();
  }

  getEventSource() {
    return this.es;
  }

  get readyState() {
    return this.es.readyState;
  }

  addEventListener<TEvent extends keyof EventSourceEventMap>(
    type: TEvent,
    listener: (this: EventSource, ev: EventSourceEventMap[TEvent]) => any,
    options?: boolean | AddEventListenerOptions,
  ) {
    this.listeners[type] ??= [];
    this.listeners[type].push([type, listener as any, options]);

    this.es.addEventListener(type, listener, options);
  }

  removeEventListener<TEvent extends keyof EventSourceEventMap>(
    type: TEvent,
    listener: (this: EventSource, ev: EventSourceEventMap[TEvent]) => any,
    options?: boolean | EventListenerOptions,
  ) {
    this.listeners[type] ??= [];

    const indexToRemove = this.listeners[type]?.findIndex(
      ([_type, thisListener]) => thisListener === listener,
    );
    if (typeof indexToRemove === 'number' && indexToRemove >= 0) {
      this.listeners[type].splice(indexToRemove, 1);
    }
    this.es.removeEventListener(type, listener, options);
  }
}
