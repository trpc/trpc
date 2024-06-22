import { observable } from '@trpc/server/observable';
import type {
  AnyClientTypes,
  inferClientTypes,
  InferrableClientTypes,
  MaybePromise,
  SSEMessage,
} from '@trpc/server/unstable-core-do-not-import';
import {
  run,
  sseStreamConsumer,
} from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from '../TRPCClientError';
import { getTransformer, type TransformerOptions } from '../unstable-internals';
import { getUrl } from './internals/httpUtils';
import type { TRPCLink } from './types';

type HTTPSubscriptionLinkOptions<TRoot extends AnyClientTypes> = {
  /**
   * The URL to connect to (can be a function that returns a URL)
   */
  url: string | (() => MaybePromise<string>);
  /**
   * EventSource options
   */
  eventSourceOptions?: EventSourceInit;
} & TransformerOptions<TRoot>;

/**
 * Get the result of a value or function that returns a value
 */
const resultOf = <T>(value: T | (() => T)): T => {
  return typeof value === 'function' ? (value as () => T)() : value;
};

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

        run(async () => {
          const url = getUrl({
            transformer,
            url: await resultOf(opts.url),
            input,
            path,
            type,
            AbortController: null,
          });

          /* istanbul ignore if -- @preserve */
          if (unsubscribed) {
            // already unsubscribed - rare race condition
            return;
          }
          eventSource = new EventSource(url, opts.eventSourceOptions);
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
          const iterable = sseStreamConsumer<Partial<SSEMessage>>({
            from: eventSource,
            deserialize: transformer.input.deserialize,
          });

          for await (const chunk of iterable) {
            // if the `sse({})`-helper is used, we always have an `id` field
            const data = 'id' in chunk ? chunk : chunk.data;
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
