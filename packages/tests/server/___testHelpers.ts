import {
  trpcServerResource,
  type TRPCServerResourceOpts,
} from '@trpc/server/__tests__/trpcServerResource';
import type { TRPCWebSocketClient, WebSocketClientOptions } from '@trpc/client';
import { createTRPCClient, createWSClient, httpBatchLink } from '@trpc/client';
import type { WithTRPCConfig } from '@trpc/next';
import type { AnyTRPCRouter } from '@trpc/server';
import type { DataTransformerOptions } from '@trpc/server/unstable-core-do-not-import';
import { EventSourcePolyfill, NativeEventSource } from 'event-source-polyfill';
import fetch from 'node-fetch';
import { WebSocket } from 'ws';

(global as any).EventSource = NativeEventSource || EventSourcePolyfill;
// This is a hack because the `server.close()` times out otherwise ¯\_(ツ)_/¯
globalThis.fetch = fetch as any;
globalThis.WebSocket = WebSocket as any;

export type CreateClientCallback<TRouter extends AnyTRPCRouter> = (opts: {
  httpUrl: string;
  wssUrl: string;
  wsClient: TRPCWebSocketClient;
  transformer?: DataTransformerOptions;
}) => Partial<WithTRPCConfig<TRouter>>;

interface RouterToServerAndClientNewOpts<TRouter extends AnyTRPCRouter>
  extends TRPCServerResourceOpts<TRouter> {
  wsClient?: Partial<WebSocketClientOptions>;
  client?: Partial<WithTRPCConfig<TRouter>> | CreateClientCallback<TRouter>;
  transformer?: DataTransformerOptions;
}

/**
 * @deprecated Use `testServerAndClientResource` instead
 */
export function routerToServerAndClientNew<TRouter extends AnyTRPCRouter>(
  router: TRouter,
  opts?: RouterToServerAndClientNewOpts<TRouter>,
) {
  const serverResource = trpcServerResource(router, opts);

  // client
  const wsClient = createWSClient({
    url: serverResource.wssUrl,
    ...opts?.wsClient,
  });
  const trpcClientOptions = {
    links: [
      httpBatchLink({
        url: serverResource.httpUrl,
        transformer: opts?.transformer as any,
      }),
    ],
    ...(opts?.client
      ? typeof opts.client === 'function'
        ? opts.client({
            httpUrl: serverResource.httpUrl,
            wssUrl: serverResource.wssUrl,
            wsClient,
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
