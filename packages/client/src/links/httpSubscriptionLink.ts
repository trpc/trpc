import { observable } from '@trpc/server/observable';
import type {
  AnyClientTypes,
  inferClientTypes,
  InferrableClientTypes,
  SSEChunk,
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
  url: string;
} & TransformerOptions<TRoot>;

/**
 * @see https://trpc.io/docs/client/links/httpSubscriptionLink
 */
export function unstable_httpSubscriptionLink<
  TInferrable extends InferrableClientTypes,
>(
  opts: HTTPSubscriptionLinkOptions<inferClientTypes<TInferrable>>,
): TRPCLink<TInferrable> {
  const resolvedOpts = {
    url: opts.url.toString().replace(/\/$/, ''), // Remove any trailing slashes
    transformer: getTransformer(opts.transformer),
  };
  return () => {
    return ({ op }) => {
      return observable((observer) => {
        const { type, path, input } = op;
        /* istanbul ignore if -- @preserve */
        if (type !== 'subscription') {
          throw new Error('httpSubscriptionLink only supports subscriptions');
        }

        const url = getUrl({
          ...resolvedOpts,
          input,
          path,
          type,
          AbortController: null,
        });
        const eventSource = new EventSource(url, {
          withCredentials: true,
        });

        run(async () => {
          const onStarted = () => {
            observer.next({
              result: {
                type: 'started',
              },
            });
            // console.log('started', new Date());
            eventSource?.removeEventListener('open', onStarted);
          };
          // console.log('starting', new Date());
          eventSource.addEventListener('open', onStarted);
          const iterable = sseStreamConsumer<SSEChunk>({
            from: eventSource,
            deserialize: resolvedOpts.transformer.input.deserialize,
          });

          for await (const chunk of iterable) {
            observer.next({
              result: {
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
        }).catch((error) => {
          observer.error(TRPCClientError.from(error));
        });

        return () => {
          eventSource.close();
          observer.complete();
        };
      });
    };
  };
}
