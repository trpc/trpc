import { observable } from '@trpc/server/observable';
import type {
  AnyRouter,
  inferClientTypes,
} from '@trpc/server/unstable-core-do-not-import';
import { transformResult } from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from '../../TRPCClientError';
import type { TransformerOptions } from '../../unstable-internals';
import { getTransformer } from '../../unstable-internals';
import type { TRPCLink } from '../types';
import {
  createWSClient,
  TRPCWebSocketClient,
  WebSocketClientOptions,
} from './createWSClient';

export type WebSocketLinkOptions<TRouter extends AnyRouter> = {
  client: TRPCWebSocketClient;
} & TransformerOptions<inferClientTypes<TRouter>>;

/**
 * @see https://trpc.io/docs/v11/client/links/wsLink
 * @deprecated
 * 🙋‍♂️ **Contributors needed** to continue supporting WebSockets!
 * See https://github.com/trpc/trpc/issues/6109
 */
export function wsLink<TRouter extends AnyRouter>(
  opts: WebSocketLinkOptions<TRouter>,
): TRPCLink<TRouter> {
  const transformer = getTransformer(opts.transformer);
  return () => {
    const { client } = opts;
    return ({ op }) => {
      return observable((observer) => {
        const { type, path, id, context } = op;

        const input = transformer.input.serialize(op.input);

        const connState =
          type === 'subscription'
            ? client.connectionState.subscribe({
                next(result) {
                  observer.next({
                    result,
                    context,
                  });
                },
              })
            : null;
        const unsubscribeRequest = client.request({
          op: { type, path, input, id, context, signal: null },
          callbacks: {
            error(err) {
              observer.error(err);
              unsubscribeRequest();
            },
            complete() {
              observer.complete();
            },
            next(event) {
              const transformed = transformResult(event, transformer.output);

              if (!transformed.ok) {
                observer.error(TRPCClientError.from(transformed.error));
                return;
              }
              observer.next({
                result: transformed.result,
              });

              if (op.type !== 'subscription') {
                // if it isn't a subscription we don't care about next response

                unsubscribeRequest();
                observer.complete();
              }
            },
          },
          lastEventId: undefined,
        });
        return () => {
          unsubscribeRequest();
          connState?.unsubscribe();
        };
      });
    };
  };
}

export { TRPCWebSocketClient, WebSocketClientOptions, createWSClient };
