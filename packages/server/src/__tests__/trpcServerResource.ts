import type { IncomingMessage } from 'http';
import http from 'http';
import type { AddressInfo, Socket } from 'net';
import type { AnyTRPCRouter } from '@trpc/server';
import type { CreateHTTPHandlerOptions } from '@trpc/server/adapters/standalone';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import type { WSSHandlerOptions } from '@trpc/server/adapters/ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import type { HTTPErrorHandler } from '@trpc/server/http';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { makeAsyncResource } from '../unstable-core-do-not-import/stream/utils/disposable';

export interface TRPCServerResourceOpts<TRouter extends AnyTRPCRouter> {
  server?: Partial<CreateHTTPHandlerOptions<TRouter>>;
  wssServer?: Partial<WSSHandlerOptions<TRouter>>;
}

/**
 * This is a hack in order to prevent typescript error
 * "The inferred type of 'testServerAndClientResource' cannot be named without a reference to X"
 */
export const __getSpy = <T extends (...args: any[]) => void>(): Mock<T> => {
  return vi.fn(() => {
    // noop
  });
};

export function trpcServerResource<TRouter extends AnyTRPCRouter>(
  router: TRouter,
  opts?: TRPCServerResourceOpts<TRouter>,
) {
  // http
  type OnError = HTTPErrorHandler<TRouter, IncomingMessage>;
  type CreateContext = NonNullable<
    CreateHTTPHandlerOptions<TRouter>['createContext']
  >;

  const onErrorSpy = __getSpy<OnError>();
  const createContextSpy = __getSpy<CreateContext>();
  const serverOverrides: Partial<CreateHTTPHandlerOptions<TRouter>> =
    opts?.server ?? {};

  const onReqAborted = __getSpy();
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
  const onRequestSpy = __getSpy<typeof handler>();

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

  const ctx = {
    close: async () => {
      if (!server.listening) {
        throw new Error('Server is not running');
      }
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
  return makeAsyncResource(ctx, ctx.close);
}
