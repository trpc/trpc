import { createServer, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { NodeHttpServer } from '@effect/platform-node';
import type { HttpOptions } from 'trpcdev/http';
import type { AnyRouter, FetchHandlerOptions } from 'trpcdev/server';
import {
  createTestServer as createServerWith,
  type TestServer,
} from 'trpcdev/testing';

export interface NodeTestServer extends TestServer {
  readonly server: Server;
  /** Drops every open HTTP connection and WebSocket, without a close handshake. */
  dropConnections(): void;
}

/** `createTestServer` on `@effect/platform-node`, on a free port. */
export async function createTestServer<TRouter extends AnyRouter>(
  opts: FetchHandlerOptions<TRouter> &
    Pick<HttpOptions, 'allowOrigin'> & { maxPayload?: number },
): Promise<NodeTestServer> {
  const server = createServer();
  const sockets = new Set<Duplex>();
  server.on('upgrade', (_req, socket: Duplex) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  const dropConnections = () => {
    server.closeAllConnections();
    for (const socket of sockets) socket.destroy();
  };
  const test = await createServerWith({
    ...opts,
    http: NodeHttpServer.layer(() => server, {
      port: 0,
      host: '127.0.0.1',
      ...(opts.maxPayload === undefined
        ? {}
        : { websocket: { maxPayload: opts.maxPayload } }),
    }),
  });
  const close = async () => {
    dropConnections();
    await test.close();
  };
  return {
    url: test.url,
    wsUrl: test.wsUrl,
    handler: test.handler,
    requests: test.requests,
    server,
    dropConnections,
    close,
    [Symbol.asyncDispose]: close,
  };
}
