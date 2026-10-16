import { createServer, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { NodeHttpServer } from '@effect/platform-node';
import { Context, Effect, Exit, Layer, Scope } from 'effect';
import type { HttpOptions } from 'trpcdev/http';
import { TestServer, type TestServerShape } from 'trpcdev/internal/testing';
import type { AnyRouter, FetchHandlerOptions } from 'trpcdev/server';

export interface NodeTestServer extends TestServerShape, AsyncDisposable {
  readonly server: Server;
  /** Drops every open HTTP connection and WebSocket, without a close handshake. */
  dropConnections(): void;
  close(): Promise<void>;
}

/** `TestServer.layer` on `@effect/platform-node`, on a free port, as a Promise for suites not on `@effect/vitest`. */
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
  const layer = TestServer.layer(opts).pipe(
    Layer.provide(
      NodeHttpServer.layer(() => server, {
        port: 0,
        host: '127.0.0.1',
        ...(opts.maxPayload === undefined
          ? {}
          : { websocket: { maxPayload: opts.maxPayload } }),
      }),
    ),
  );
  const scope = Scope.makeUnsafe();
  const test = Context.get(
    await Effect.runPromise(Layer.buildWithScope(layer, scope)),
    TestServer,
  );
  const close = async () => {
    dropConnections();
    await Effect.runPromise(Scope.close(scope, Exit.void));
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
