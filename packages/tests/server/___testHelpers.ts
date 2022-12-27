import './___packages';
import {
  TRPCWebSocketClient,
  WebSocketClientOptions,
  createTRPCClientProxy,
  createTRPCUntypedClient,
  createWSClient,
  httpBatchLink,
} from '@trpc/client/src';
import { WithTRPCConfig } from '@trpc/next/src';
import { AnyRouter as AnyNewRouter } from '@trpc/server/src';
import {
  CreateHTTPHandlerOptions,
  createHTTPServer,
} from '@trpc/server/src/adapters/standalone';
import {
  WSSHandlerOptions,
  applyWSSHandler,
} from '@trpc/server/src/adapters/ws';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import ws from 'ws';

(global as any).fetch = fetch;
(global as any).AbortController = AbortController;
(global as any).WebSocket = ws;
export function routerToServerAndClientNew<TRouter extends AnyNewRouter>(
  router: TRouter,
  opts?: {
    server?: Partial<CreateHTTPHandlerOptions<TRouter>>;
    wssServer?: Partial<WSSHandlerOptions<TRouter>>;
    wsClient?: Partial<WebSocketClientOptions>;
    client?:
      | Partial<WithTRPCConfig<TRouter>>
      | ((opts: {
          httpUrl: string;
          wssUrl: string;
          wsClient: TRPCWebSocketClient;
        }) => Partial<WithTRPCConfig<AnyNewRouter>>);
  },
) {
  // http
  const httpServer = createHTTPServer({
    router: router,
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
  const trpcClientOptions = {
    links: [httpBatchLink({ url: httpUrl })],
    ...(opts?.client
      ? typeof opts.client === 'function'
        ? opts.client({ httpUrl, wssUrl, wsClient })
        : opts.client
      : {}),
  } as WithTRPCConfig<typeof router>;

  const client = createTRPCUntypedClient<typeof router>(trpcClientOptions);
  const proxy = createTRPCClientProxy<typeof router>(client);
  return {
    wsClient,
    client,
    proxy,
    close: async () => {
      await Promise.all([
        new Promise((resolve) => httpServer.server.close(resolve)),
        new Promise((resolve) => {
          wss.clients.forEach((ws) => ws.close());
          wss.close(resolve);
        }),
      ]);
    },
    router,
    trpcClientOptions,
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

type Constructor<T extends object = object> = new (...args: any[]) => T;

export async function waitError<TError extends Error = Error>(
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
    expect(cause).toBeInstanceOf(Error);
    if (errorConstructor) {
      expect((cause as Error).name).toBe(errorConstructor.name);
    }
    return cause as TError;
  }
  throw new Error('Function did not throw');
}

export const ignoreErrors = async (fn: () => Promise<unknown> | unknown) => {
  try {
    await fn();
  } catch {
    // ignore
  }
};
