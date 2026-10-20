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
 * import { experimental_serveSocket } from '@trpc12/trpc/socket';
 *
 * experimental_serveSocket(createFetchHandler({ router })).pipe(
 *   Layer.provide(NodeSocketServer.layer({ port: 4000 })),
 *   Layer.launch,
 *   NodeRuntime.runMain,
 * );
 * ```
 * @module
 */
import { Context, Effect, Layer, Stream, type Duration } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { Socket, SocketServer } from 'effect/socket';
import { timerOption } from '../internal/duration.ts';
import {
  decodeLines,
  encodeLine,
  limitLineLength,
} from '../internal/lines.ts';
import {
  parseSocketMessage,
  serveSocketConnection,
  SocketCore,
  type SocketCoreShape,
} from '../server/sockets/index.ts';
import { handlerContext } from '../server/handler/index.ts';

/**
 * Options for {@link experimental_serveSocket}.
 * @example
 * ```ts
 * experimental_serveSocket(handler, { idleTimeout: false });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export interface SocketOptions {
  /**
   * Close a connection that sends nothing for this long; `experimental_socketLink`'s
   * pings keep a live one open. `false` keeps silent connections.
   * @default '60 seconds'
   */
  readonly idleTimeout?: Duration.Input | false;
  /**
   * The most bytes one message (one line) may have. A connection that sends
   * a longer one is closed, as a WebSocket over Node's `maxPayload` is.
   * @default 104_857_600 (100 MiB, Node's WebSocket default)
   */
  readonly maxPayload?: number;
}

/**
 * A handler made by `createFetchHandler()`.
 * @example
 * ```ts
 * const handler: SocketHandlerLike = createFetchHandler({ router });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export interface SocketHandlerLike {
  fetch(request: Request, ...platform: never[]): Promise<Response>;
}

const serveOne = (
  core: SocketCoreShape,
  socket: Socket.Socket,
  idleTimeout: Duration.Duration | undefined,
  maxPayload: number,
): Effect.Effect<void> =>
  serveSocketConnection(core, socket, {
    request: HttpServerRequest.fromWeb(new Request('http://localhost/')),
    transport: 'socket',
    idleTimeout,
    messages: decodeLines(
      limitLineLength(Socket.toStream(socket), maxPayload),
    ).pipe(Stream.map(parseSocketMessage)),
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
 * experimental_serveSocket(handler).pipe(Layer.provide(NodeSocketServer.layer({ port: 4000 })));
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_serveSocket(
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
      'experimental_serveSocket() needs a handler from createFetchHandler()',
    );
  }
  const idleTimeout = timerOption(opts.idleTimeout, '60 seconds');
  const maxPayload = opts.maxPayload ?? 104_857_600;
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const server = yield* SocketServer.SocketServer;
      yield* Effect.forkScoped(
        server.run((socket) =>
          serveOne(core, socket, idleTimeout, maxPayload),
        ),
      );
    }),
  );
}
