// @vitest-environment node
import type { IncomingMessage } from 'node:http';
import { initTRPC } from '@trpc/server';
import type {
  CreateWSSContextFnOptions,
  WSClient,
  WSSHandlerOptions,
  WSServer,
} from '@trpc/server/adapters/ws';
import {
  applyWSSHandler,
  getWSConnectionHandler,
} from '@trpc/server/adapters/ws';
import type { TRPCResponseMessage } from '@trpc/server/rpc';
import type { RawData } from 'ws';
import WebSocket, { WebSocketServer } from 'ws';

/** A client that has only the members the adapter reads, and no `ws` class. */
function wrapSocket(socket: WebSocket): WSClient {
  return {
    get readyState() {
      return socket.readyState;
    },
    send: (data: string) => socket.send(data),
    close: () => socket.close(),
    terminate: () => socket.terminate(),
    on: (
      event: 'message' | 'close' | 'error',
      listener: (...args: any[]) => void,
    ) => {
      socket.on(event, listener);
    },
    once: (event: 'close', listener: (...args: any[]) => void) => {
      socket.once(event, listener);
    },
  };
}

interface WrappedServer extends WSServer {
  close: () => void;
}

/** A server that is not a `ws` `WebSocketServer`, only its read members. */
function wrapServer(wss: WebSocketServer): WrappedServer {
  const clients = new Set<WSClient>();
  return {
    clients,
    on(
      _event: 'connection',
      listener: (client: WSClient, request: IncomingMessage) => void,
    ) {
      wss.on('connection', (socket, request) => {
        const client = wrapSocket(socket);
        clients.add(client);
        listener(client, request);
      });
    },
    close: () => wss.close(),
  };
}

test('a server that is not a `ws` server serves the router and broadcasts', async () => {
  const t = initTRPC.create();
  const router = t.router({ ping: t.procedure.query(() => 'pong') });

  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  // No cast: the point of the test is that this object satisfies the option.
  const server = wrapServer(wss);
  const handler = applyWSSHandler({ router, wss: server });

  await new Promise<void>((resolve) => wss.once('listening', resolve));
  const address = wss.address();
  assert(typeof address === 'object' && address !== null);

  const messages: TRPCResponseMessage[] = [];
  const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
  client.on('message', (data: RawData) => {
    // oxlint-disable-next-line typescript/no-base-to-string
    messages.push(JSON.parse(data.toString('utf8')) as TRPCResponseMessage);
  });
  await new Promise<void>((resolve, reject) => {
    client.once('open', resolve);
    client.once('error', reject);
  });

  client.send(
    JSON.stringify({ id: 1, method: 'query', params: { path: 'ping' } }),
  );
  await vi.waitFor(() => {
    expect(messages.some((message) => message.id === 1)).toBe(true);
  });
  const response = messages.find((message) => message.id === 1);
  assert(response && 'result' in response);
  expect(response.result).toEqual({ type: 'data', data: 'pong' });

  handler.broadcastReconnectNotification();
  await vi.waitFor(() => {
    expect(
      messages.some(
        (message) => 'method' in message && message.method === 'reconnect',
      ),
    ).toBe(true);
  });

  client.terminate();
  await new Promise<void>((resolve) => wss.close(() => resolve()));
});

test('router-only generic forms accept a structural server', () => {
  const t = initTRPC.create();
  const router = t.router({ ping: t.procedure.query(() => 'pong') });
  const wss = new WebSocketServer({ noServer: true });
  const server: WSServer = wrapServer(wss);

  const options: WSSHandlerOptions<typeof router, WSServer> = {
    router,
    wss: server,
  };
  const handler = applyWSSHandler<typeof router>(options);
  const onConnection = getWSConnectionHandler<typeof router>(options);

  expect(handler.broadcastReconnectNotification).toBeTypeOf('function');
  expect(onConnection).toBeTypeOf('function');
  wss.close();
});

test('a real `ws` server still satisfies the option', () => {
  const t = initTRPC.create();
  const router = t.router({ ping: t.procedure.query(() => 'pong') });
  const wss = new WebSocketServer({ noServer: true });
  const handler = applyWSSHandler({ router, wss });
  expect(handler.broadcastReconnectNotification).toBeTypeOf('function');
  wss.close();
});

test('the default types keep `ws` members in context and on the server', async () => {
  const t = initTRPC.create();
  const router = t.router({ ping: t.procedure.query(() => 'pong') });
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });

  const createContext = vi.fn((opts: CreateWSSContextFnOptions) => {
    // Compile-time: a default `ws` socket still exposes its own API.
    opts.res.ping();
    const protocol: string = opts.res.protocol;
    opts.res.on('pong', () => undefined);
    return { protocol };
  });
  const options: WSSHandlerOptions<typeof router> = {
    router,
    wss,
    createContext,
  };
  const defaultParameters: Parameters<typeof applyWSSHandler>[0] = {
    router,
    wss,
    createContext,
  };
  applyWSSHandler(defaultParameters);

  // Compile-time: explicit router generics also retain concrete `ws` context.
  const explicitRouterHandler = () =>
    applyWSSHandler<typeof router>({
      router,
      wss,
      createContext: (opts) => {
        opts.res.ping();
        return {};
      },
    });
  void explicitRouterHandler;

  // Compile-time: the default option still exposes `ws` members and clients.
  for (const client of options.wss.clients) client.ping();

  await new Promise<void>((resolve) => wss.once('listening', resolve));
  const address = wss.address();
  assert(typeof address === 'object' && address !== null);

  const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
  await new Promise<void>((resolve, reject) => {
    client.once('open', resolve);
    client.once('error', reject);
  });
  await vi.waitFor(() => {
    expect(createContext).toHaveBeenCalledTimes(1);
  });
  expect(createContext.mock.calls[0]![0].res).toBeInstanceOf(WebSocket);

  client.terminate();
  await new Promise<void>((resolve) => options.wss.close(() => resolve()));
});
