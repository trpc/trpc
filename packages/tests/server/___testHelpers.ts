import type { IncomingMessage } from 'http';
import http from 'http';
import type { AddressInfo, Socket } from 'net';
import type { TRPCWebSocketClient, WebSocketClientOptions } from '@trpc/client';
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  TRPCClientError,
} from '@trpc/client';
import type { WithTRPCConfig } from '@trpc/next';
import {
  isTrackedEnvelope,
  tracked,
  type AnyRouter,
  type TrackedEnvelope,
} from '@trpc/server';
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
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';

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

  const onReqAborted = vitest.fn();
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
  const wss = new WebSocketServer({ port: 0 });
  const wssPort = (wss.address() as any).port as number;
  const applyWSSHandlerOpts: WSSHandlerOptions<TRouter> = {
    wss,
    router,
    ...((opts?.wssServer as any) ?? {}),
    createContext(it) {
      // (createContextSpy as any)(it);
      return opts?.wssServer?.createContext?.(it) ?? it;
    },
  };
  const wssHandler = applyWSSHandler(applyWSSHandlerOpts);
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
    router,
    trpcClientOptions,
    httpPort,
    wssPort,
    httpUrl,
    wssUrl,
    applyWSSHandlerOpts,
    wssHandler,
    connections,
    wss,
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

export async function waitMs(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type Constructor<T extends object = object> = new (...args: any[]) => T;

export async function waitError<TError extends Error = Error>(
  /**
   * Function callback or promise that you expect will throw
   */
  fnOrPromise: Promise<unknown> | (() => unknown),
  /**
   * Force error constructor to be of specific type
   * @default Error
   **/
  errorConstructor?: Constructor<TError>,
): Promise<TError> {
  let res;
  try {
    if (typeof fnOrPromise === 'function') {
      res = await fnOrPromise();
    } else {
      res = await fnOrPromise;
    }
  } catch (cause) {
    // needs to be instanceof Error or DOMException
    if (
      cause instanceof Error === false &&
      cause instanceof DOMException === false
    ) {
      throw new Error(
        'Expected function to throw an error, but it threw something else',
      );
    }
    if (errorConstructor) {
      expect((cause as Error).name).toBe(errorConstructor.name);
    }
    return cause as TError;
  }

  // eslint-disable-next-line no-console
  console.warn('Expected function to throw, but it did not. Result:', res);
  throw new Error('Function did not throw');
}

export async function waitTRPCClientError<TRoot extends InferrableClientTypes>(
  fnOrPromise: Promise<unknown> | (() => unknown),
) {
  return waitError<TRPCClientError<TRoot>>(fnOrPromise, TRPCClientError);
}
/* eslint-disable no-console */
export const suppressLogs = () => {
  const log = console.log;
  const error = console.error;
  const noop = () => {
    // ignore
  };
  console.log = noop;
  console.error = noop;
  return () => {
    console.log = log;
    console.error = error;
  };
};

/**
 * Pause logging until the promise resolves or throws
 */
export const suppressLogsUntil = async (fn: () => Promise<void>) => {
  const release = suppressLogs();

  try {
    await fn();
  } finally {
    release();
  }
};
export const ignoreErrors = async (fn: () => unknown) => {
  /* eslint-enable no-console */
  const release = suppressLogs();
  try {
    await fn();
  } catch {
    // ignore
  } finally {
    release();
  }
};

export const doNotExecute = (_func: () => void) => true;
