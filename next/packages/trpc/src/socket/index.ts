/**
 * Serve a fetch handler's router over raw sockets with Effect's
 * `SocketServer`: TCP, TLS or Unix sockets, whatever the platform layer
 * provides (`NodeSocketServer.layer` from `@effect/platform-node`). Calls
 * use the WebSocket protocol, one JSON message per line; `experimental_socketLink` from
 * `@trpc12/trpc/client` is the other end.
 *
 * @example
 * ```ts
 * import { NodeRuntime, NodeSocketServer } from '@effect/platform-node';
 * import { Layer } from 'effect';
 * import { serveSocket } from '@trpc12/trpc/socket';
 *
 * serveSocket(createFetchHandler({ router })).pipe(
 *   Layer.provide(NodeSocketServer.layer({ port: 4000 })),
 *   Layer.launch,
 *   NodeRuntime.runMain,
 * );
 * ```
 * @module
 */
import { Context, Effect, Layer, Stream } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { Socket, SocketServer } from 'effect/socket';
import { decodeLines, encodeLine } from '../internal/lines.ts';
import {
  parseSocketMessage,
  serveSocketConnection,
  SocketCore,
  type SocketCoreShape,
} from '../server/socket.ts';
import { handlerContext } from '../server/handler-context.ts';

/**
 * Options for {@link serveSocket}.
 * @example
 * ```ts
 * serveSocket(handler, { idleTimeoutMs: false });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface SocketOptions {
  /**
   * Close a connection that sends nothing for this long; `experimental_socketLink`'s
   * pings keep a live one open. `false` keeps silent connections.
   * @default 60_000
   */
  readonly idleTimeoutMs?: number | false;
}

/**
 * A handler made by `createFetchHandler()`.
 * @example
 * ```ts
 * const handler: SocketHandlerLike = createFetchHandler({ router });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface SocketHandlerLike {
  fetch(request: Request, ...platform: never[]): Promise<Response>;
}

const serveOne = (
  core: SocketCoreShape,
  socket: Socket.Socket,
  opts: SocketOptions,
): Effect.Effect<void> =>
  serveSocketConnection(core, socket, {
    request: HttpServerRequest.fromWeb(new Request('http://localhost/')),
    transport: 'socket',
    idleTimeoutMs: opts.idleTimeoutMs ?? 60_000,
    messages: decodeLines(Socket.toStream(socket)).pipe(
      Stream.map(parseSocketMessage),
    ),
    encode: encodeLine,
  });

/**
 * Serves `handler`'s router on the current `SocketServer`: every accepted
 * connection is a socket session like a WebSocket one, with
 * `connectionParams`, subscriptions, deferred outputs and aborts.
 * `createContext` gets `info.transport === 'socket'` and a placeholder
 * request (raw sockets have no headers).
 *
 * @example
 * ```ts
 * serveSocket(handler).pipe(Layer.provide(NodeSocketServer.layer({ port: 4000 })));
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function serveSocket(
  handler: SocketHandlerLike,
  opts: SocketOptions = {},
): Layer.Layer<
  never,
  SocketServer.SocketServerError,
  SocketServer.SocketServer
> {
  const core = Context.getOrUndefined(handlerContext(handler), SocketCore);
  if (!core) {
    throw new TypeError(
      'serveSocket() needs a handler from createFetchHandler()',
    );
  }
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const server = yield* SocketServer.SocketServer;
      yield* Effect.forkScoped(
        server.run((socket) => serveOne(core, socket, opts)),
      );
    }),
  );
}
