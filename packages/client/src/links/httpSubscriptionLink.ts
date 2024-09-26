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
  eventSourceOptions?: () => EventSourceInit | Promise<EventSourceInit>;
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

          eventSource.addEventListener('error', async (ev) => {
            if (
              'status' in ev &&
              typeof ev.status === 'number' &&
              [401, 403].includes(ev.status)
            ) {
              console.log('Restarted EventSource due to 401/403 error');

              eventSource?.restart(
                url,
                await resultOf(opts.eventSourceOptions),
              );
            }
          });

          const iterable = sseStreamConsumer<
            Partial<{
              id?: string;
              data: unknown;
            }>
          >({
            from: eventSource,
            deserialize: transformer.output.deserialize,
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

/**
 * We wrap EventSource so that is can be reinitialized with new options
 */
class EventSourceWrapper implements Partial<EventSource> {
  private es: EventSource;

  private listeners: Partial<Record<keyof EventSourceEventMap, any[][]>> = {};

  constructor(url: string, options: EventSourceInit | undefined) {
    this.es = new EventSource(url, options);
  }

  restart(url: string, options: EventSourceInit | undefined) {
    this.es.close();
    this.es = new EventSource(url, options);

    for (const type in this.listeners) {
      for (const [t, l, o] of this.listeners[
        type as keyof EventSourceEventMap
      ] ?? []) {
        this.es.addEventListener(t as string, l, o);
      }
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
    this.listeners[type].push([type, listener, options]);

    this.es.addEventListener(type, listener, options);
  }

  removeEventListener<TEvent extends keyof EventSourceEventMap>(
    type: TEvent,
    listener: (this: EventSource, ev: EventSourceEventMap[TEvent]) => any,
    options?: boolean | EventListenerOptions,
  ) {
    this.listeners[type] ??= [];
    for (const [t, l, o] of this.listeners[type] ?? []) {
      if (t === type && l === listener) {
        this.listeners[type].splice(this.listeners[type].indexOf([t, l, o]), 1);
      }
    }

    this.es.removeEventListener(type, listener, options);
  }
}
