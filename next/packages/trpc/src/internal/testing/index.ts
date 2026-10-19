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
 *       const client = createTrpcClient({ router: routerType<AppRouter>(), links: [httpLink({ url })] });
 *       expect(yield* Effect.promise(() => client.health.query())).toBe('ok');
 *     }),
 *   );
 * });
 * ```
 * @module
 * @stability internal
 */
import { Context, Effect, Layer, type Scope } from 'effect';
import { HttpRouter, HttpServer, HttpServerRequest } from 'effect/http';
import { NetAddress } from 'effect/net';
import {
  createFetchHandler,
  type FetchHandler,
  type FetchHandlerOptions,
} from '../../server/handler/index.ts';
import type { AnyRouter } from '../../server/procedures/index.ts';

/**
 * Options for {@link TestServer.layer}.
 * @since 0.1.0
 * @stability internal
 */
export type TestServerOptions<TRouter extends AnyRouter> =
  FetchHandlerOptions<TRouter>;

/**
 * A request the test server received.
 * @since 0.1.0
 * @stability internal
 */
export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
}

/**
 * The running test server.
 * @since 0.1.0
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
    yield* Layer.build(
      HttpRouter.serve(handler.routes, {
        disableLogger: true,
        disableListenLog: true,
        middleware: (app) =>
          Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
            if (request.headers['upgrade']?.toLowerCase() !== 'websocket') {
              requests.push({
                method: request.method,
                url: `${origin.origin}${request.url}`,
                headers: new Headers(request.headers),
              });
            }
            return app;
          }),
      }),
    );
    yield* Effect.addFinalizer(() => Effect.promise(() => handler.drain()));
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
 * @since 0.1.0
 * @stability internal
 */
export interface TestServer {
  readonly _: unique symbol;
}

/**
 * The `TestServer` key, with `TestServer.layer(opts)`.
 * @since 0.1.0
 * @stability internal
 */
export interface TestServerClass extends Context.ServiceClass<
  TestServer,
  '@trpc12/trpc/TestServer',
  TestServerShape
> {
  layer<TRouter extends AnyRouter>(
    opts: TestServerOptions<TRouter>,
  ): Layer.Layer<TestServer, never, HttpServer.HttpServer>;
}

/**
 * @since 0.1.0
 * @stability internal
 */
export const TestServer: TestServerClass = Object.assign(
  Context.Service<TestServer, TestServerShape>()('@trpc12/trpc/TestServer'),
  {
    layer: <TRouter extends AnyRouter>(opts: TestServerOptions<TRouter>) =>
      Layer.effect(TestServer)(make(opts)),
  },
);
