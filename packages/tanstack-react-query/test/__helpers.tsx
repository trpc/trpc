import '@testing-library/dom';
import '@testing-library/jest-dom/vitest';
import * as Http from 'node:http';
import type * as Net from 'node:net';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type {
  CreateTRPCClientOptions,
  Operation,
  TRPCWebSocketClient,
  WebSocketClientOptions,
} from '@trpc/client';
import {
  createTRPCClient,
  createWSClient,
  getUntypedClient,
  httpBatchLink,
  splitLink,
  unstable_httpBatchStreamLink,
  unstable_httpSubscriptionLink,
  wsLink,
} from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import {
  createHTTPHandler,
  type CreateHTTPHandlerOptions,
} from '@trpc/server/adapters/standalone';
import {
  applyWSSHandler,
  type WSSHandlerOptions,
} from '@trpc/server/adapters/ws';
import type { HTTPErrorHandler } from '@trpc/server/http';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import/stream/utils/disposable';
import type { DataTransformerOptions } from '@trpc/server/unstable-core-do-not-import/transformer';
import { EventSourcePolyfill, NativeEventSource } from 'event-source-polyfill';
import * as React from 'react';
import { WebSocket, WebSocketServer } from 'ws';
import { createTRPCContext, createTRPCOptionsProxy } from '../src';

(global as any).EventSource = NativeEventSource || EventSourcePolyfill;
// This is a hack because the `server.close()` times out otherwise ¯\_(ツ)_/¯
globalThis.fetch = fetch as any;
globalThis.WebSocket = WebSocket as any;

/**
 * TODO: Remove this duplication from tests/server package: https://github.com/trpc/trpc/pull/6383
 */
export type CreateClientCallback<TRouter extends AnyTRPCRouter> = (opts: {
  httpUrl: string;
  wssUrl: string;
  wsClient: TRPCWebSocketClient;
  transformer?: DataTransformerOptions;
}) => Partial<CreateTRPCClientOptions<TRouter>>;

/**
 * TODO: Remove this duplication from tests/server package: https://github.com/trpc/trpc/pull/6383
 */
export function routerToServerAndClientNew<TRouter extends AnyTRPCRouter>(
  router: TRouter,
  opts?: {
    server?: Partial<CreateHTTPHandlerOptions<TRouter>>;
    wssServer?: Partial<WSSHandlerOptions<TRouter>>;
    wsClient?: Partial<WebSocketClientOptions>;
    client?: CreateClientCallback<TRouter>;
    transformer?: DataTransformerOptions;
  },
) {
  // http
  type OnError = HTTPErrorHandler<TRouter, Http.IncomingMessage>;
  type CreateContext = NonNullable<
    CreateHTTPHandlerOptions<TRouter>['createContext']
  >;

  const onErrorSpy = vi.fn<OnError>();
  const createContextSpy = vi.fn<CreateContext>();
  const serverOverrides: Partial<CreateHTTPHandlerOptions<TRouter>> =
    opts?.server ?? {};

  const onReqAborted = vi.fn();
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
  const onRequestSpy = vi.fn<typeof handler>();

  const httpServer = Http.createServer((...args) => {
    onRequestSpy(...args);
    handler(...args);
  });

  const connections = new Set<Net.Socket>();
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
  const httpPort = (server.address() as Net.AddressInfo).port;
  const httpUrl = `http://localhost:${httpPort}`;

  // client
  const wsClient = createWSClient({
    url: wssUrl,
    ...opts?.wsClient,
  });

  const client = createTRPCClient<typeof router>({
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
  });

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

export function getServerAndReactClient<TRouter extends AnyTRPCRouter>(
  appRouter: TRouter,
  opts?: {
    subscriptions?: 'ws' | 'http';
  },
) {
  const spyLink = vi.fn((_op: Operation<unknown>) => {
    // noop
  });

  const ctx = routerToServerAndClientNew(appRouter, {
    client: (clientOpts) => ({
      links: [
        () => {
          // here we just got initialized in the app - this happens once per app
          // useful for storing cache for instance
          return ({ next, op }) => {
            // this is when passing the result to the next link

            spyLink(op);
            return next(op);
          };
        },
        splitLink({
          condition: (op) => op.type === 'subscription',
          true:
            opts?.subscriptions === 'http'
              ? unstable_httpSubscriptionLink({
                  url: clientOpts.httpUrl,
                  transformer: clientOpts.transformer as any,
                })
              : wsLink({
                  client: clientOpts.wsClient,
                  transformer: clientOpts.transformer as any,
                }),
          false: splitLink({
            condition: (op) => !!op.context['stream'],
            true: unstable_httpBatchStreamLink({
              url: clientOpts.httpUrl,
              transformer: clientOpts.transformer as any,
            }),
            false: httpBatchLink({
              url: clientOpts.httpUrl,
              transformer: clientOpts.transformer as any,
            }),
          }),
        }),
      ],
    }),
  });

  const queryClient = new QueryClient();

  const trpcClient = createTRPCOptionsProxy({
    client: getUntypedClient(ctx.client),
    queryClient,
  });

  const trpcServer = createTRPCOptionsProxy({
    router: appRouter,
    ctx: {},
    queryClient,
  });

  const { TRPCProvider, useTRPC } = createTRPCContext<TRouter>();

  function renderApp(ui: React.ReactNode) {
    return render(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={ctx.client} queryClient={queryClient}>
          {ui}
        </TRPCProvider>
      </QueryClientProvider>,
    );
  }

  return makeAsyncResource(
    {
      opts: ctx,
      queryClient,
      renderApp,
      spyLink,
      useTRPC,
      trpcClient,
      trpcServer,
      /** @deprecated use resource manager instead */
      close: ctx.close,
    },
    async () => {
      await ctx.close();
    },
  );
}
