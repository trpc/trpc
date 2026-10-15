/**
 * Helpers for testing routers over real HTTP and WebSockets. The server is
 * whatever platform layer you pass, e.g. `NodeHttpServer.layer` from
 * `@effect/platform-node`.
 *
 * @example
 * ```ts
 * await using server = await createTestServer({
 *   router: appRouter,
 *   http: NodeHttpServer.layer(createServer, { port: 0 }),
 * });
 * const client = createTrpcClient<AppRouter>({ links: [httpLink({ url: server.url })] });
 * ```
 * @module
 */
import { Context, Effect, Exit, Layer, Scope } from 'effect';
import { HttpServer } from 'effect/http';
import { NetAddress } from 'effect/net';
import { serve, type HttpOptions } from '../http/index.ts';
import {
  createFetchHandler,
  type FetchHandler,
  type FetchHandlerOptions,
} from '../server/fetch.ts';
import type { AnyRouter } from '../server/router.ts';
import type { WebSocketLike } from '../server/socket.ts';

/**
 * Options for {@link createTestServer}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TestServerOptions<TRouter extends AnyRouter> =
  FetchHandlerOptions<TRouter> &
    Pick<HttpOptions, 'allowOrigin'> & {
      /**
       * The platform's `HttpServer`, listening on a TCP port (use port 0
       * for a free one).
       */
      http: Layer.Layer<HttpServer.HttpServer, unknown>;
    };

/**
 * A running test server.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TestServer extends AsyncDisposable {
  /** The endpoint URL, e.g. `http://127.0.0.1:54321/trpc`. */
  readonly url: string;
  /** The WebSocket endpoint URL, e.g. `ws://127.0.0.1:54321/trpc`. */
  readonly wsUrl: string;
  readonly handler: FetchHandler;
  /** Requests the server has received, in order. */
  readonly requests: ReadonlyArray<{
    method: string;
    url: string;
    headers: Headers;
  }>;
  /** Stops the server and disposes the handler. */
  close(): Promise<void>;
}

/**
 * Serves a router with the given platform server.
 *
 * @example
 * ```ts
 * await using server = await createTestServer({
 *   router,
 *   batch: true,
 *   http: NodeHttpServer.layer(createServer, { port: 0 }),
 * });
 * await fetch(`${server.url}/health`);
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export async function createTestServer<TRouter extends AnyRouter>(
  opts: TestServerOptions<TRouter>,
): Promise<TestServer> {
  const handler = createFetchHandler(opts);
  const requests: { method: string; url: string; headers: Headers }[] = [];
  const recording = {
    fetch(request: Request) {
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
      });
      return handler.fetch(request);
    },
    websocket: (socket: WebSocketLike, o: { request: Request }) =>
      handler.websocket(socket, o),
  };
  const layer = serve(recording, {
    endpoint: opts.endpoint,
    allowOrigin: opts.allowOrigin,
  }).pipe(Layer.provideMerge(opts.http));
  const scope = Scope.makeUnsafe();
  const close = async () => {
    await Effect.runPromise(Scope.close(scope, Exit.void));
    await handler.dispose();
  };
  let origin: string;
  try {
    origin = await Effect.runPromise(
      Effect.gen(function* () {
        const context = yield* Layer.buildWithScope(layer, scope);
        const { address } = Context.get(context, HttpServer.HttpServer);
        if (NetAddress.isUnixPathAddress(address)) {
          return yield* Effect.die(
            new Error('createTestServer needs a TCP address'),
          );
        }
        const url = yield* Effect.fromResult(NetAddress.toUrl(address)).pipe(
          Effect.orDie,
        );
        if (NetAddress.isUnspecified(address.address)) {
          url.hostname = NetAddress.formatIp(NetAddress.ipv4Loopback);
        }
        return url.origin;
      }),
    );
  } catch (cause) {
    await close();
    throw cause;
  }
  const endpoint = (opts.endpoint ?? '/trpc').replace(/^\/+|\/+$/g, '');
  return {
    url: `${origin}/${endpoint}`,
    wsUrl: `${origin.replace(/^http/, 'ws')}/${endpoint}`,
    handler,
    requests,
    close,
    [Symbol.asyncDispose]: close,
  };
}
