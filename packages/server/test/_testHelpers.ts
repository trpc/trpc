/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import WebSocket from 'ws';
import { createTRPCClient, CreateTRPCClientOptions } from '../../client/src';
import { AnyRouter, CreateHttpHandlerOptions, webSocketHandler } from '../src';
import { createHttpServer } from '../src/adapters/standalone';
import { CreateWebSocketServerOptions } from '../src/websockets/createWebSocketServer';
(global as any).fetch = fetch;
(global as any).AbortController = AbortController;
export function routerToServerAndClient<TRouter extends AnyRouter>(
  router: TRouter,
  opts?: {
    server?: Partial<CreateHttpHandlerOptions<TRouter>>;
    wssServer?: Partial<CreateWebSocketServerOptions<TRouter>>;
    client?:
      | Partial<CreateTRPCClientOptions<TRouter>>
      | ((opts: {
          /**
           * @deprecated
           */
          url: string;
          httpUrl: string;
          wssUrl: string;
        }) => Partial<CreateTRPCClientOptions<TRouter>>);
  },
) {
  // http
  const httpServer = createHttpServer({
    router,
    createContext: () => ({}),
    ...(opts?.server ?? {}),
  });
  const { port: httpPort } = httpServer.listen(0);
  const httpUrl = `http://localhost:${httpPort}`;

  // wss
  const wss = new WebSocket.Server({ port: 0 });
  const wssPort = (wss.address() as any).port as number;
  webSocketHandler({
    wss,
    router,
    createContext: () => ({}),
    ...(opts?.wssServer ?? {}),
  });
  const wssUrl = `ws://localhost:${wssPort}`;

  // client
  const trpcClientOptions: CreateTRPCClientOptions<typeof router> = {
    url: httpUrl,
    ...(opts?.client
      ? typeof opts.client === 'function'
        ? opts.client({ url: httpUrl, httpUrl, wssUrl })
        : opts.client
      : {}),
  };
  const client = createTRPCClient<typeof router>(trpcClientOptions);

  return {
    client,
    close: () => {
      httpServer.server.close();
      wss.close();
    },
    router,
    trpcClientOptions,
    /**
     * @deprecated
     */
    port: httpPort,
    httpPort,
    wssPort,
  };
}
