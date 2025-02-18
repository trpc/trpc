import {
  trpcServerResource,
  type TRPCServerResourceOpts,
} from '@trpc/server/__tests__/trpcServerResource';
import {
  httpBatchLink,
  httpLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';
import type { WithTRPCConfig } from '@trpc/next';
import type { AnyTRPCRouter } from '@trpc/server';
import type { inferClientTypes } from '@trpc/server/unstable-core-do-not-import';
import { EventSourcePolyfill, NativeEventSource } from 'event-source-polyfill';
import fetch from 'node-fetch';
import { WebSocket } from 'ws';
import type { TRPCWebSocketClient, WebSocketClientOptions } from '..';
import {
  createTRPCClient,
  createWSClient,
  splitLink,
  unstable_httpBatchStreamLink,
  wsLink,
} from '..';
import type { TransformerOptions } from '../unstable-internals';

(global as any).EventSource = NativeEventSource || EventSourcePolyfill;
// This is a hack because the `server.close()` times out otherwise ¯\_(ツ)_/¯
globalThis.fetch = fetch as any;
globalThis.WebSocket = WebSocket as any;

export type CreateClientCallback<TRouter extends AnyTRPCRouter> = (opts: {
  httpUrl: string;
  wssUrl: string;
  wsClient: TRPCWebSocketClient;
  transformer: TransformerOptions<inferClientTypes<TRouter>>;
}) => Partial<WithTRPCConfig<TRouter>>;

interface RouterToServerAndClientNewOpts<TRouter extends AnyTRPCRouter>
  extends TRPCServerResourceOpts<TRouter> {
  /**
   * Defaults to being lazy
   */
  wsClient?: Partial<WebSocketClientOptions>;
  client?: Partial<WithTRPCConfig<TRouter>> | CreateClientCallback<TRouter>;
}

export function testServerAndClientResource<TRouter extends AnyTRPCRouter>(
  router: TRouter,
  opts?: RouterToServerAndClientNewOpts<TRouter>,
) {
  const serverResource = trpcServerResource(router, opts);

  // client
  const wsClient = createWSClient({
    url: serverResource.wssUrl,
    lazy: {
      enabled: true,
      closeMs: 0,
    },
    ...opts?.wsClient,
  });

  const transformer = router._def._config.transformer as any;
  const trpcClientOptions = {
    links: [
      splitLink({
        condition: (op) => !!op.context?.['ws'],
        true: wsLink({
          client: wsClient,
          transformer,
        }),
        false: splitLink({
          condition: (op) => op.type === 'subscription',
          true: unstable_httpSubscriptionLink({
            client: wsClient,
            transformer,
            url: serverResource.httpUrl,
          }),

          false: splitLink({
            condition: (op) => !op.context['batch'],
            true: httpLink({
              client: wsClient,
              transformer,
              url: serverResource.httpUrl,
            }),

            // This is the fallback / default link
            false: splitLink({
              condition: (op) => !op.context['stream'],
              true: httpBatchLink({
                client: wsClient,
                transformer,
                url: serverResource.httpUrl,
              }),

              // This is the fallback / default link
              false: unstable_httpBatchStreamLink({
                url: serverResource.httpUrl,
                transformer,
              }),
            }),
          }),
        }),
      }),
    ],
    ...(opts?.client
      ? typeof opts.client === 'function'
        ? opts.client({
            httpUrl: serverResource.httpUrl,
            wssUrl: serverResource.wssUrl,
            wsClient,
            transformer: router._def._config.transformer as any,
          })
        : opts.client
      : {}),
  } as WithTRPCConfig<typeof router>;

  const client = createTRPCClient<typeof router>(trpcClientOptions);

  const ctx = {
    ...serverResource,
    wsClient,
    client,
    trpcClientOptions,
  };
  return ctx;
}
