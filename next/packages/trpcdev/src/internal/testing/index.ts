/**
 * A test server for routers over real HTTP and WebSockets, as an Effect
 * layer over the platform's `HttpServer`. Semi-public: importable, with no
 * compatibility promise.
 *
 * @example
 * ```ts
 * import { it } from '@effect/vitest';
 *
 * const server = TestServer.layer({ router: appRouter }).pipe(
 *   Layer.provide(NodeHttpServer.layer(createServer, { port: 0 })),
 * );
 *
 * it.layer(server)('serves', (it) => {
 *   it.effect('health', () =>
 *     Effect.gen(function* () {
 *       const { url } = yield* TestServer;
 *       const client = createTrpcClient<AppRouter>({ links: [httpLink({ url })] });
 *       expect(yield* Effect.promise(() => client.health.query())).toBe('ok');
 *     }),
 *   );
 * });
 * ```
 * @module
 * @stability internal
 */
import { Context, Effect, Layer, type Scope } from 'effect';
import { HttpServer } from 'effect/http';
import { NetAddress } from 'effect/net';
import { serve, type HttpOptions } from '../../http/index.ts';
import {
  createFetchHandler,
  type FetchHandler,
  type FetchHandlerOptions,
} from '../../server/fetch.ts';
import type { AnyRouter } from '../../server/router.ts';
import type { WebSocketLike } from '../../server/socket.ts';

/**
 * Options for {@link TestServer.layer}.
 * @since 12.0.0-alpha.0
 * @stability internal
 */
export type TestServerOptions<TRouter extends AnyRouter> =
  FetchHandlerOptions<TRouter> & Pick<HttpOptions, 'allowOrigin'>;

/**
 * A request the test server received.
 * @since 12.0.0-alpha.0
 * @stability internal
 */
export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
}

/**
 * The running test server.
 * @since 12.0.0-alpha.0
 * @stability internal
 */
export interface TestServerShape {
  /** The endpoint URL, e.g. `http://127.0.0.1:54321/trpc`. */
  readonly url: string;
  /** The WebSocket endpoint URL, e.g. `ws://127.0.0.1:54321/trpc`. */
  readonly wsUrl: string;
  readonly handler: FetchHandler;
  /** Requests the server has received, in order. */
  readonly requests: ReadonlyArray<RecordedRequest>;
}

const make = <TRouter extends AnyRouter>(
  opts: TestServerOptions<TRouter>,
): Effect.Effect<TestServerShape, never, HttpServer.HttpServer | Scope.Scope> =>
  Effect.gen(function* () {
    const handler = yield* Effect.acquireRelease(
      Effect.sync(() => createFetchHandler(opts)),
      (h) => Effect.promise(() => h.dispose()),
    );
    const requests: RecordedRequest[] = [];
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
    yield* Layer.build(
      serve(recording, {
        endpoint: opts.endpoint,
        allowOrigin: opts.allowOrigin,
      }),
    );
    const { address } = yield* HttpServer.HttpServer;
    if (NetAddress.isUnixPathAddress(address)) {
      return yield* Effect.die(new Error('TestServer needs a TCP address'));
    }
    const origin = yield* Effect.fromResult(NetAddress.toUrl(address)).pipe(
      Effect.orDie,
    );
    if (NetAddress.isUnspecified(address.address)) {
      origin.hostname = NetAddress.formatIp(NetAddress.ipv4Loopback);
    }
    const endpoint = (opts.endpoint ?? '/trpc').replace(/^\/+|\/+$/g, '');
    return {
      url: `${origin.origin}/${endpoint}`,
      wsUrl: `${origin.origin.replace(/^http/, 'ws')}/${endpoint}`,
      handler,
      requests,
    };
  });

/**
 * The test server service. `TestServer.layer(opts)` serves a router on the
 * `HttpServer` you provide (port 0 for a free one) until the layer's scope
 * closes, then disposes the handler.
 * @since 12.0.0-alpha.0
 * @stability internal
 */
export interface TestServer {
  readonly _: unique symbol;
}

/**
 * The `TestServer` key, with `TestServer.layer(opts)`.
 * @since 12.0.0-alpha.0
 * @stability internal
 */
export interface TestServerClass extends Context.ServiceClass<
  TestServer,
  'trpcdev/TestServer',
  TestServerShape
> {
  layer<TRouter extends AnyRouter>(
    opts: TestServerOptions<TRouter>,
  ): Layer.Layer<TestServer, never, HttpServer.HttpServer>;
}

/**
 * @since 12.0.0-alpha.0
 * @stability internal
 */
export const TestServer: TestServerClass = Object.assign(
  Context.Service<TestServer, TestServerShape>()('trpcdev/TestServer'),
  {
    layer: <TRouter extends AnyRouter>(opts: TestServerOptions<TRouter>) =>
      Layer.effect(TestServer)(make(opts)),
  },
);
