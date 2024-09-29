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
import {
  isTrackedEnvelope,
  tracked,
  type TrackedEnvelope,
} from '@trpc/server/unstable-core-do-not-import/stream/tracked';
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
    createContext(it) {
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

function isAsyncIterable<TValue, TReturn = unknown>(
  value: unknown,
): value is AsyncIterable<TValue, TReturn> {
  return !!value && typeof value === 'object' && Symbol.asyncIterator in value;
}

/**
 * Zod schema for an async iterable
 * - validates that the value is an async iterable
 * - validates each item in the async iterable
 * - validates the return value of the async iterable
 */
export function zAsyncGenerator<
  TYieldIn,
  TYieldOut,
  TReturnIn = void,
  TReturnOut = void,
>(
  yieldSchema: z.ZodType<TYieldIn, any, TYieldOut>,
  returnSchema?: z.ZodType<TReturnIn, any, TReturnOut>,
) {
  return z
    .custom<AsyncGenerator<TYieldIn, TReturnIn>>((val) => isAsyncIterable(val))
    .transform(async function* (iter) {
      const iterator = iter[Symbol.asyncIterator]();
      let next;
      while ((next = await iterator.next()) && !next.done) {
        yield yieldSchema.parseAsync(next.value);
      }
      if (returnSchema) {
        return await returnSchema.parseAsync(next.value);
      }
      return;
    }) as any as z.ZodType<
    AsyncGenerator<TYieldIn, TReturnIn, unknown>,
    any,
    AsyncGenerator<TYieldOut, TReturnOut, unknown>
  >;
}

/**
 * Zod schema for an async iterable
 * - validates that the value is an async iterable
 * - validates each item in the async iterable
 */
export function zAsyncIterable<TYieldIn, TYieldOut>(
  yieldSchema: z.ZodType<TYieldIn, any, TYieldOut>,
) {
  return z
    .custom<AsyncIterable<TYieldIn, void, unknown>>((val) =>
      isAsyncIterable(val),
    )
    .transform(async function* (iter) {
      for await (const data of iter) {
        yield yieldSchema.parseAsync(data);
      }
    });
}

/**
 * Zod schema for an async iterable
 * - validates that the value is an async iterable
 * - validates each item in the async iterable
 */
export function zAsyncIterableTracked<TYieldIn, TYieldOut>(
  yieldSchema: z.ZodType<TYieldIn, any, TYieldOut>,
) {
  const trackedEnvelopeSchema =
    z.custom<TrackedEnvelope<TYieldIn>>(isTrackedEnvelope);
  return z
    .custom<AsyncGenerator<TrackedEnvelope<TYieldIn>, any, any>>((val) =>
      isAsyncIterable(val),
    )
    .transform(async function* (iter) {
      for await (const data of iter) {
        const [id, value] = trackedEnvelopeSchema.parse(data);
        yield tracked(id, yieldSchema.parse(value));
      }
    });
}
