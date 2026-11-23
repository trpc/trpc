import type { Unsubscribable } from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';
import type {
  AnyRouter,
  inferClientTypes,
} from '@trpc/server/unstable-core-do-not-import';
import type { TransformerOptions } from '../../unstable-internals';
import { getTransformer } from '../../unstable-internals';
import type { TRPCLink } from '../types';
import type {
  Encoder,
  TRPCWebSocketClient,
  WebSocketClientOptions,
} from './createWsClient';
import { createWSClient, jsonEncoder } from './createWsClient';
import { callUserCallback } from './wsClient/utils';

/**
 * Options for {@link wsLink}.
 *
 * @see https://trpc.io/docs/client/links/wsLink#wslink--createwsclient-options
 */
export type WebSocketLinkOptions<TRouter extends AnyRouter> = {
  /**
   * The client made with `createWSClient`.
   */
  client: TRPCWebSocketClient;
} & TransformerOptions<inferClientTypes<TRouter>>;

/**
 * A terminating link that sends calls over a WebSocket.
 *
 * @see https://trpc.io/docs/client/links/wsLink
 */
export function wsLink<TRouter extends AnyRouter>(
  opts: WebSocketLinkOptions<TRouter>,
): TRPCLink<TRouter> {
  const { client } = opts;
  const transformer = getTransformer(opts.transformer);
  return () => {
    return ({ op }) => {
      return observable((observer) => {
        let connStateSubscription: Unsubscribable | null = null;
        if (op.type === 'subscription') {
          // The current state is sent during `subscribe`, and a throwing
          // `onConnectionStateChange` must not stop the request below from
          // being sent. The client guards the states it sends later.
          let isSubscribing = true;
          connStateSubscription = client.connectionState.subscribe({
            next(result) {
              const emit = () =>
                observer.next({
                  result,
                  context: op.context,
                });
              if (isSubscribing) {
                callUserCallback(emit);
              } else {
                emit();
              }
            },
          });
          isSubscribing = false;
        }

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

export {
  createWSClient,
  jsonEncoder,
  type Encoder,
  type TRPCWebSocketClient,
  type WebSocketClientOptions,
};
