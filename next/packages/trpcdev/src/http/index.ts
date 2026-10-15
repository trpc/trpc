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
 * import { serve } from 'trpcdev/http';
 * import { createFetchHandler } from 'trpcdev/server';
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
import { Effect, Layer, Queue } from 'effect';
import {
  HttpEffect,
  HttpServer,
  HttpServerError,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import { Socket } from 'effect/socket';
import {
  HEADER,
  isJsonContentType,
  PROTOCOL_VERSION,
} from '../internal/protocol.ts';
import type { WebSocketLike } from '../server/socket.ts';

/**
 * Anything with a web-standard `fetch` method, like `createFetchHandler()`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface FetchLike {
  fetch(request: Request): Promise<Response>;
}

/**
 * Something that serves WebSockets, like `createFetchHandler()`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface WebSocketHandlerLike {
  websocket(socket: WebSocketLike, opts: { request: Request }): void;
}

/**
 * Options for {@link toHttpEffect} and {@link serve}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface HttpOptions {
  /**
   * Only upgrade requests to this path; others get a 404.
   * @default '/trpc'
   */
  endpoint?: string;
  /**
   * Accept a WebSocket upgrade only when this returns true. Browsers send
   * cookies with cross-site WebSocket requests, so check `origin` when you
   * authenticate with cookies.
   */
  allowOrigin?: (origin: string | undefined) => boolean;
}

/**
 * Adapts a fetch handler to an Effect HTTP app. When the handler serves
 * WebSockets, upgrade requests to the endpoint become WebSocket connections
 * (10).
 *
 * @example
 * ```ts
 * const app = toHttpEffect(handler, {
 *   allowOrigin: (origin) => origin === 'https://app.example.com',
 * });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
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
  const fetch = Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
    HttpEffect.fromWebHandler((web) => {
      const replayed = replayParsedBody(web, request.source);
      return replayed instanceof Response
        ? Promise.resolve(replayed)
        : handler.fetch(replayed);
    }),
  );
  // HttpServer runs apps uninterruptibly; a client disconnect must abort the call.
  if (!('websocket' in handler)) return Effect.interruptible(fetch);
  return Effect.interruptible(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (request.headers['upgrade']?.toLowerCase() !== 'websocket') {
        return yield* fetch;
      }
      const { pathname } = new URL(request.url, 'http://localhost');
      if (pathname !== endpoint && pathname !== `${endpoint}/`) {
        return HttpServerResponse.empty({ status: 404 });
      }
      if (opts.allowOrigin && !opts.allowOrigin(request.headers['origin'])) {
        return HttpServerResponse.empty({ status: 403 });
      }
      const socket = yield* request.upgrade;
      yield* Effect.scoped(
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
          yield* serveSocket(socket, (ws) =>
            handler.websocket(ws, { request: webRequest }),
          ).pipe(Effect.catchTag('SocketError', () => Effect.void));
        }),
      );
      return HttpServerResponse.empty();
    }),
  );
}

/**
 * Serves a fetch handler (and its WebSockets) on the current `HttpServer`.
 *
 * @example
 * ```ts
 * const live = serve(handler).pipe(
 *   Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
 * );
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function serve(
  handler: FetchLike | (FetchLike & WebSocketHandlerLike),
  opts: HttpOptions = {},
): Layer.Layer<never, never, HttpServer.HttpServer> {
  return HttpServer.serve(toHttpEffect(handler, opts));
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

const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/**
 * Exposes an Effect `Socket` as a `WebSocketLike` until it closes. Text
 * frames arrive as strings, binary frames as `Uint8Array`.
 */
const serveSocket = (
  socket: Socket.Socket,
  accept: (ws: WebSocketLike) => void,
) =>
  Effect.gen(function* () {
    const reader = yield* socket.reader;
    const writer = yield* socket.writer;
    const outbox = yield* Queue.unbounded<string | Socket.CloseEvent>();
    const listeners = new Map<string, Array<(event: any) => void>>();
    const emit = (type: string, event: unknown) => {
      for (const listener of listeners.get(type) ?? []) listener(event);
    };
    let readyState = OPEN;
    const closed = (code: number, reason: string) => {
      if (readyState === CLOSED) return;
      readyState = CLOSED;
      emit('close', { code, reason, wasClean: code !== 1006 });
    };
    const ws: WebSocketLike = {
      get readyState() {
        return readyState;
      },
      send(data) {
        if (readyState === OPEN) Queue.offerUnsafe(outbox, data);
      },
      close(code, reason) {
        if (readyState !== OPEN) return;
        readyState = CLOSING;
        Queue.offerUnsafe(outbox, new Socket.CloseEvent(code, reason));
      },
      addEventListener(type, listener) {
        const list = listeners.get(type);
        if (list) list.push(listener);
        else listeners.set(type, [listener]);
      },
    };
    yield* Queue.take(outbox).pipe(
      Effect.flatMap(writer.write),
      Effect.forever,
      Effect.ignore,
      Effect.forkScoped,
    );
    accept(ws);
    yield* reader.pull.pipe(
      Effect.flatMap((frames) =>
        Effect.sync(() => {
          for (const data of frames) emit('message', { data });
        }),
      ),
      Effect.forever,
      Effect.catch((err) =>
        Effect.sync(() => {
          const { reason } = err;
          if (reason._tag === 'SocketCloseError') {
            closed(reason.code, reason.closeReason ?? '');
          }
        }),
      ),
      Effect.ensuring(Effect.sync(() => closed(1006, ''))),
    );
  });
