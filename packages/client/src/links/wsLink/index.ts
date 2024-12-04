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
import type {
  TRPCWebSocketClient,
  WebSocketClientOptions,
} from './createWsClient';
import { createWSClient } from './createWsClient';

export type WebSocketLinkOptions<TRouter extends AnyRouter> = {
  client: TRPCWebSocketClient;
} & TransformerOptions<inferClientTypes<TRouter>>;

/**
 * Creates a tRPC link that transforms operation requests into WebSocket messages.
 *
 * This link connects a tRPC client to a WebSocket transport by:
 * - Serializing inputs using the provided transformer
 * - Converting tRPC operations into WebSocket requests
 * - Deserializing and validating responses
 * - Setting up cleanup for aborted requests
 *
 * @param opts - Link configuration
 * @param opts.client - WebSocket client to handle the actual transport
 * @param opts.transformer - Data transformer for serializing requests and deserializing responses
 *
 * @returns A tRPC link that uses WebSocket transport
 */
export function wsLink<TRouter extends AnyRouter>(
  opts: WebSocketLinkOptions<TRouter>,
): TRPCLink<TRouter> {
  const { client } = opts;
  const transformer = getTransformer(opts.transformer);
  return () => {
    return ({ op: { id, type, path, context, signal, input } }) => {
      const transformedInput = transformer.input.serialize(input);

      return observable((observer) => {
        const connState =
          type === 'subscription'
            ? opts.client.connectionState.subscribe({
                next(result) {
                  observer.next({
                    result,
                    context,
                  });
                },
              })
            : null;

        const abortRequest = client.request({
          op: { id, type, path, input: transformedInput },
          callbacks: {
            ...observer,
            next(event) {
              const transformed = transformResult(event, transformer.output);

              if (!transformed.ok) {
                observer.error(TRPCClientError.from(transformed.error));
                return;
              }

              observer.next({
                result: transformed.result,
              });
            },
          },
        });
        signal?.addEventListener('abort', abortRequest);

        return () => {
          abortRequest();
          signal?.removeEventListener('abort', abortRequest);
          connState?.unsubscribe();
        };
      });
    };
  };
}

export { TRPCWebSocketClient, WebSocketClientOptions, createWSClient };
