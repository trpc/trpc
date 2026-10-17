/**
 * Serve a fetch handler with Effect's `HttpServer`, including WebSocket
 * upgrades. The runtime is a platform layer: `NodeHttpServer.layer` from
 * `@effect/platform-node`, `BunHttpServer.layer` from `@effect/platform-bun`,
 * or anything else that provides `HttpServer`.
 *
 * @example
 * ```ts
 * import { createServer } from 'node:http';
 * import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
 * import { Layer } from 'effect';
 * import { serve } from '@trpc12/trpc/http';
 * import { createFetchHandler } from '@trpc12/trpc/server';
 *
 * const handler = createFetchHandler({ router });
 * serve(handler).pipe(
 *   Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
 *   Layer.launch,
 *   NodeRuntime.runMain,
 * );
 * ```
 * @module
 */
import { Effect, type Layer } from 'effect';
import {
  HttpEffect,
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  HttpServerError,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import {
  HEADER,
  isJsonContentType,
  PROTOCOL_VERSION,
} from '../internal/protocol.ts';
import { type FetchHandler, httpApps } from '../server/fetch.ts';
import { socketCores, type WebSocketLike } from '../server/socket.ts';
import { isUpgrade, upgradeTo } from '../server/upgrade.ts';

/**
 * Anything with a web-standard `fetch` method, like `createFetchHandler()`.
 * @since 0.1.0
 * @stability stable
 */
export interface FetchLike {
  fetch(request: Request): Promise<Response>;
}

/**
 * Something that serves WebSockets, like `createFetchHandler()`.
 * @since 0.1.0
 * @stability stable
 */
export interface WebSocketHandlerLike {
  websocket(socket: WebSocketLike, opts: { request: Request }): void;
}

/**
 * Options for {@link toHttpEffect} and {@link serve}.
 * @since 0.1.0
 * @stability stable
 */
export interface HttpOptions {
  /**
   * Only upgrade requests to this path; others get a 404.
   * @default '/trpc'
   */
  endpoint?: string;
}

/**
 * Options for {@link cors}: Effect's `HttpMiddleware.cors` options.
 * @since 0.1.0
 * @stability stable
 */
export type CorsOptions = NonNullable<
  Parameters<typeof HttpMiddleware.cors>[0]
>;

/**
 * Effect's CORS middleware, for the handler's `middleware` option, that
 * also refuses WebSocket upgrades from origins it doesn't allow (403).
 * Browsers send cookies with cross-site WebSocket upgrades and CORS
 * doesn't cover them, so check the origin when you authenticate with
 * cookies. Upgrades without an `origin` (non-browser clients) pass.
 *
 * @example
 * ```ts
 * createFetchHandler({
 *   router,
 *   middleware: [cors({ allowedOrigins: ['https://app.example.com'], credentials: true })],
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function cors(options: CorsOptions = {}): HttpMiddleware.HttpMiddleware {
  const origins = options.allowedOrigins ?? [];
  const allowed =
    typeof origins === 'function'
      ? origins
      : (origin: string) => origins.length === 0 || origins.includes(origin);
  const middleware = HttpMiddleware.cors(options);
  return ((
    app: Effect.Effect<HttpServerResponse.HttpServerResponse, unknown, unknown>,
  ) => {
    const withCors = middleware(app as never);
    return Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
      const origin = request.headers['origin'];
      return isUpgrade(request) && origin !== undefined && !allowed(origin)
        ? Effect.succeed(HttpServerResponse.empty({ status: 403 }))
        : withCors;
    });
  }) as HttpMiddleware.HttpMiddleware;
}

/**
 * Adapts a fetch handler to an Effect HTTP app. A `createFetchHandler()`
 * handler runs as its own `effect/http` app, so requests aren't converted
 * to web `Request`s, and its `middleware` wraps WebSocket upgrades too.
 * Upgrade requests to the endpoint become WebSocket connections (10).
 *
 * @example
 * ```ts
 * const app = toHttpEffect(handler);
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function toHttpEffect(
  handler: FetchLike | (FetchLike & WebSocketHandlerLike),
  opts: HttpOptions = {},
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  HttpServerError.HttpServerError,
  HttpServerRequest.HttpServerRequest
> {
  const endpoint = `/${(opts.endpoint ?? '/trpc').replace(/^\/+|\/+$/g, '')}`;
  const own = httpApps.get(handler);
  const core = socketCores.get(handler);
  const fetch =
    own?.app ??
    Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
      HttpEffect.fromWebHandler((web) => {
        const replayed = replayParsedBody(web, request.source);
        return replayed instanceof Response
          ? Promise.resolve(replayed)
          : handler.fetch(replayed);
      }),
    );
  /** A handler other than `createFetchHandler()`'s gets a web `Request`. */
  const viaWeb = (request: HttpServerRequest.HttpServerRequest) =>
    Effect.gen(function* () {
      const controller = yield* Effect.acquireRelease(
        Effect.sync(() => new AbortController()),
        (controller) => Effect.sync(() => controller.abort()),
      );
      const webRequest = yield* HttpServerRequest.toWeb(request, {
        signal: controller.signal,
      }).pipe(
        Effect.mapError(
          (reason) => new HttpServerError.HttpServerError({ reason }),
        ),
      );
      yield* upgradeTo(request, (ws) =>
        (handler as WebSocketHandlerLike).websocket(ws, {
          request: webRequest,
        }),
      );
    });
  const inner = !('websocket' in handler)
    ? fetch
    : Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        if (!isUpgrade(request)) return yield* fetch;
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname !== endpoint && url.pathname !== `${endpoint}/`) {
          return HttpServerResponse.empty({ status: 404 });
        }
        yield* core
          ? upgradeTo(request, (ws) => core.serveWebSocket(ws, request))
          : Effect.scoped(viaWeb(request));
        return HttpServerResponse.empty();
      });
  const wrapped = (own?.middleware ?? []).reduceRight<
    Effect.Effect<HttpServerResponse.HttpServerResponse, any, any>
  >((app, m) => m(app), inner);
  // HttpServer runs apps uninterruptibly; a client disconnect must abort the call.
  return Effect.interruptible(wrapped) as Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    HttpServerError.HttpServerError,
    HttpServerRequest.HttpServerRequest
  >;
}

/**
 * Serves a fetch handler (and its WebSockets) on the current `HttpServer`.
 * A `createFetchHandler()` handler serves its `routes`, so other paths get
 * the router's 404; merge `handler.routes` with your own routes to serve
 * both.
 *
 * @example
 * ```ts
 * const live = serve(handler).pipe(
 *   Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
 * );
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function serve(
  handler: FetchLike | (FetchLike & WebSocketHandlerLike),
  opts: HttpOptions = {},
): Layer.Layer<never, never, HttpServer.HttpServer> {
  const partial = handler as Partial<FetchHandler>;
  return partial.routes && opts.endpoint === undefined
    ? HttpRouter.serve(partial.routes, {
        disableLogger: true,
        disableListenLog: true,
      })
    : HttpServer.serve(toHttpEffect(handler, opts));
}

/**
 * A Node request whose body a framework middleware already read
 * (`express.json()`, `express.text()`, `express.raw()`) is rebuilt from
 * `req.body`; the stream itself is empty by then.
 */
function replayParsedBody(web: Request, source: object): Request | Response {
  const node = source as { readableEnded?: unknown; body?: unknown };
  if (node.readableEnded !== true || web.method === 'GET') return web;
  const { body } = node;
  const replay =
    typeof body === 'string' || body instanceof Uint8Array
      ? body
      : body !== undefined && isJsonContentType(web.headers.get('content-type'))
        ? JSON.stringify(body)
        : undefined;
  if (replay === undefined) {
    const message =
      'The request body was already read by another middleware. Mount tRPC before body parsers, or use one that sets req.body.';
    return Response.json(
      {
        json: {
          error: { code: 'INTERNAL_SERVER_ERROR', message, defined: false },
        },
      },
      { status: 500, headers: { [HEADER.version]: PROTOCOL_VERSION } },
    );
  }
  const headers = new Headers(web.headers);
  headers.delete('content-length');
  return new Request(web, {
    method: web.method,
    body: replay as BodyInit,
    headers,
  });
}
