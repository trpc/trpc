/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import {
  createWSClient,
  WebSocketClientOptions,
  TRPCWebSocketClient,
} from '../../client/src/links/wsLink';
import ws from 'ws';
import { createTRPCClient, CreateTRPCClientOptions } from '../../client/src';
import { AnyRouter, CreateHttpHandlerOptions } from '../src';
import { createHttpServer } from '../src';
import { applyWSSHandler, WSSHandlerOptions } from '../src/ws';

(global as any).fetch = fetch;
(global as any).AbortController = AbortController;
export function routerToServerAndClient<TRouter extends AnyRouter>(
  router: TRouter,
  opts?: {
    server?: Partial<CreateHttpHandlerOptions<TRouter>>;
    wssServer?: Partial<WSSHandlerOptions<TRouter>>;
    wsClient?: Partial<WebSocketClientOptions>;
    client?:
      | Partial<CreateTRPCClientOptions<TRouter>>
      | ((opts: {
          /**
           * @deprecated use `httpUrl`
           */
          url: string;
          httpUrl: string;
          wssUrl: string;
          wsClient: TRPCWebSocketClient;
        }) => Partial<CreateTRPCClientOptions<TRouter>>);
  },
) {
  // http
  const httpServer = createHttpServer({
    router,
    createContext: ({ req, res }) => ({ req, res }),
    ...(opts?.server ?? {
      batching: {
        enabled: true,
      },
    }),
  });
  const { port: httpPort } = httpServer.listen(0);
  const httpUrl = `http://localhost:${httpPort}`;

  // wss
  const wss = new ws.Server({ port: 0 });
  const wssPort = (wss.address() as any).port as number;
  const applyWSSHandlerOpts: WSSHandlerOptions<TRouter> = {
    wss,
    router,
    createContext: ({ req, res }) => ({ req, res }),
    ...((opts?.wssServer as any) ?? {}),
  };
  const wssHandler = applyWSSHandler(applyWSSHandlerOpts);
  const wssUrl = `ws://localhost:${wssPort}`;

  // client
  const wsClient = createWSClient({
    url: wssUrl,
    ...opts?.wsClient,
  });
  const trpcClientOptions: CreateTRPCClientOptions<typeof router> = {
    url: httpUrl,
    ...(opts?.client
      ? typeof opts.client === 'function'
        ? opts.client({ url: httpUrl, httpUrl, wssUrl, wsClient })
        : opts.client
      : {}),
  };
  const client = createTRPCClient<typeof router>(trpcClientOptions);
  return {
    wsClient,
    client,
    close: async () => {
      await Promise.all([
        new Promise((resolve) => httpServer.server.close(resolve)),
        new Promise((resolve) => wss.close(resolve)),
      ]);
    },
    router,
    trpcClientOptions,
    /**
     * @deprecated
     */
    port: httpPort,
    httpPort,
    wssPort,
    httpUrl,
    wssUrl,
    applyWSSHandlerOpts,
    wssHandler,
    wss,
  };
}

export async function waitMs(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type Constructor<T extends {} = {}> = new (...args: any[]) => T;

export async function waitError<TError = Error>(
  /**
   * Function callback or promise that you expect will throw
   */
  fnOrPromise: (() => Promise<unknown> | unknown) | Promise<unknown>,
  /**
   * Force error constructor to be of specific type
   * @default Error
   **/
  errorConstructor?: Constructor<TError>,
): Promise<TError> {
  try {
    if (typeof fnOrPromise === 'function') {
      await fnOrPromise();
    } else {
      await fnOrPromise;
    }
  } catch (cause) {
    expect(cause).toBeInstanceOf(errorConstructor ?? Error);
    return cause as TError;
  }
  throw new Error('Function did not throw');
}
