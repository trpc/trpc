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

export {
  createWSClient,
  jsonEncoder,
  type Encoder,
  type TRPCWebSocketClient,
  type WebSocketClientOptions,
};
