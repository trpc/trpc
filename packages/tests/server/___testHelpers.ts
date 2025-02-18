import EventEmitter from 'events';
import type { IncomingMessage } from 'http';
import http from 'http';
import type { AddressInfo, Socket } from 'net';
import { on } from 'node:events';
import { waitError } from '@trpc/server/__tests__/waitError';
import type { TRPCWebSocketClient, WebSocketClientOptions } from '@trpc/client';
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  TRPCClientError,
} from '@trpc/client';
import type { WithTRPCConfig } from '@trpc/next';
import { type AnyRouter } from '@trpc/server';
import type { CreateHTTPHandlerOptions } from '@trpc/server/adapters/standalone';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import type { WSSHandlerOptions } from '@trpc/server/adapters/ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import type { HTTPErrorHandler } from '@trpc/server/http';
import type {
  DataTransformerOptions,
  InferrableClientTypes,
} from '@trpc/server/unstable-core-do-not-import';
import { EventSourcePolyfill, NativeEventSource } from 'event-source-polyfill';
import fetch from 'node-fetch';
import type { Mock } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

(global as any).EventSource = NativeEventSource || EventSourcePolyfill;
// This is a hack because the `server.close()` times out otherwise ¯\_(ツ)_/¯
globalThis.fetch = fetch as any;
globalThis.WebSocket = WebSocket as any;

export type CreateClientCallback<TRouter extends AnyRouter> = (opts: {
  httpUrl: string;
  wssUrl: string;
  wsClient: TRPCWebSocketClient;
  transformer?: DataTransformerOptions;
}) => Partial<WithTRPCConfig<TRouter>>;

export function routerToServerAndClientNew<TRouter extends AnyRouter>(
  router: TRouter,
  opts?: {
    server?: Partial<CreateHTTPHandlerOptions<TRouter>>;
    wssServer?: Partial<WSSHandlerOptions<TRouter>>;
    wsClient?: Partial<WebSocketClientOptions>;
    client?: Partial<WithTRPCConfig<TRouter>> | CreateClientCallback<TRouter>;
    transformer?: DataTransformerOptions;
  },
) {
  // http
  type OnError = HTTPErrorHandler<TRouter, IncomingMessage>;
  type CreateContext = NonNullable<
    CreateHTTPHandlerOptions<TRouter>['createContext']
  >;

  const onErrorSpy = vitest.fn<OnError>();
  const createContextSpy = vitest.fn<CreateContext>();
  const serverOverrides: Partial<CreateHTTPHandlerOptions<TRouter>> =
    opts?.server ?? {};

  const onReqAborted = vitest.fn() satisfies Mock;
  const handler = createHTTPHandler({
    router,
    ...serverOverrides,
    onError(it) {
      onErrorSpy(it);
      return opts?.server?.onError?.(it);
    },
    async createContext(it) {
      (createContextSpy as any)(it);

      it.req.on('aborted', onReqAborted);

      return opts?.server?.createContext?.(it) ?? it;
    },
  });
  const onRequestSpy = vitest.fn<typeof handler>();

  const httpServer = http.createServer((...args) => {
    onRequestSpy(...args);
    handler(...args);
  });

  const connections = new Set<Socket>();
  httpServer.on('connection', (conn) => {
    connections.add(conn);
    conn.once('close', () => {
      connections.delete(conn);
    });
  });

  // wss
  let wss = new WebSocketServer({ port: 0 });
  const wssPort = (wss.address() as any).port as number;
  const applyWSSHandlerOpts: WSSHandlerOptions<TRouter> = {
    get wss() {
      return wss;
    },
    router,
    ...((opts?.wssServer as any) ?? {}),
    createContext(it) {
      // (createContextSpy as any)(it);
      return opts?.wssServer?.createContext?.(it) ?? it;
    },
  };
  let wssHandler = applyWSSHandler(applyWSSHandlerOpts);
  const wssUrl = `ws://localhost:${wssPort}`;

  const server = httpServer.listen(0);
  const httpPort = (server.address() as AddressInfo).port;
  const httpUrl = `http://localhost:${httpPort}`;

  // client
  const wsClient = createWSClient({
    url: wssUrl,
    ...opts?.wsClient,
  });
  const trpcClientOptions = {
    links: [
      httpBatchLink({
        url: httpUrl,
        transformer: opts?.transformer as any,
      }),
    ],
    ...(opts?.client
      ? typeof opts.client === 'function'
        ? opts.client({ httpUrl, wssUrl, wsClient })
        : opts.client
      : {}),
  } as WithTRPCConfig<typeof router>;

  const client = createTRPCClient<typeof router>(trpcClientOptions);

  const ctx = {
    wsClient,
    client,
    close: async () => {
      ctx.destroyConnections();
      await Promise.all([
        new Promise((resolve) => server.close(resolve)),
        new Promise((resolve) => {
          wss.close(resolve);
        }),
      ]);
    },
    open: () => {
      if (server.listening) {
        throw new Error('Server is already running');
      }
      server.listen(httpPort);
      wss = new WebSocketServer({ port: wssPort });
      wssHandler = applyWSSHandler(applyWSSHandlerOpts);
    },
    router,
    trpcClientOptions,
    httpPort,
    wssPort,
    httpUrl,
    wssUrl,
    applyWSSHandlerOpts,
    get wssHandler() {
      return wssHandler;
    },
    connections,
    get wss() {
      return wss;
    },
    onErrorSpy,
    createContextSpy,
    onRequestSpy,
    onReqAborted,
    /**
     * Destroy all open connections to the server
     */
    destroyConnections: () => {
      for (const client of ctx.wss.clients) {
        client.close();
      }
      for (const conn of connections) {
        conn.emit('close');
        conn.destroy();
      }
    },
  };
  return ctx;
}

/**
 * @deprecated should not be needed - use deferred instead
 */
export async function waitMs(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function waitTRPCClientError<TRoot extends InferrableClientTypes>(
  fnOrPromise: Promise<unknown> | (() => unknown),
) {
  return waitError<TRPCClientError<TRoot>>(fnOrPromise, TRPCClientError);
}

type EventMap<T> = Record<keyof T, any[]>;

export class IterableEventEmitter<
  T extends EventMap<T>,
> extends EventEmitter<T> {
  toIterable<TEventName extends keyof T & string>(
    eventName: TEventName,
    opts?: NonNullable<Parameters<typeof on>[2]>,
  ): AsyncIterable<T[TEventName]> {
    return on(this as any, eventName, opts) as any;
  }
}
