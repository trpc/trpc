import { observable } from '@trpc/server/observable';
import type {
  AnyRouter,
  inferClientTypes,
} from '@trpc/server/unstable-core-do-not-import';
import type { TransformerOptions } from '../../unstable-internals';
import { getTransformer } from '../../unstable-internals';
import type { TRPCLink } from '../types';
import type {
  TRPCWebSocketClient,
  WebSocketClientOptions,
} from './createWsClient';
import { createWSClient } from './createWsClient';

export type WebSocketLinkOptions<TRouter extends AnyRouter> = {
  client: TRPCWebSocketClient;
} & TransformerOptions<inferClientTypes<TRouter>>;

export function wsLink<TRouter extends AnyRouter>(
  opts: WebSocketLinkOptions<TRouter>,
): TRPCLink<TRouter> {
  const { client } = opts;
  const transformer = getTransformer(opts.transformer);
  return () => {
    return ({ op }) => {
      return observable((observer) => {
        const connStateSubscription =
          op.type === 'subscription'
            ? client.connectionState.subscribe({
                next(result) {
                  observer.next({
                    result,
                    context: op.context,
                  });
                },
              })
            : null;

        const requestSubscription = client
          .request({
            op,
            transformer,
          })
          .subscribe(observer);

        return () => {
          requestSubscription.unsubscribe();
          connStateSubscription?.unsubscribe();
        };
      });
    };
  };
}

export { TRPCWebSocketClient, WebSocketClientOptions, createWSClient };
