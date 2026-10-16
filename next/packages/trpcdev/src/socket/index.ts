/**
 * Serve a fetch handler's router over raw sockets with Effect's
 * `SocketServer`: TCP, TLS or Unix sockets, whatever the platform layer
 * provides (`NodeSocketServer.layer` from `@effect/platform-node`). Calls
 * use the WebSocket protocol, one JSON message per line; `socketLink` from
 * `trpcdev/client` is the other end.
 *
 * @example
 * ```ts
 * import { NodeRuntime, NodeSocketServer } from '@effect/platform-node';
 * import { Layer } from 'effect';
 * import { serveSocket } from 'trpcdev/socket';
 *
 * serveSocket(createFetchHandler({ router })).pipe(
 *   Layer.provide(NodeSocketServer.layer({ port: 4000 })),
 *   Layer.launch,
 *   NodeRuntime.runMain,
 * );
 * ```
 * @module
 */
import { Effect, Layer, Queue, Stream } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { Socket, SocketServer } from 'effect/socket';
import type { ServerMessage } from '../internal/protocol.ts';
import { decodeLines, encodeLine } from '../internal/lines.ts';
import {
  parseSocketMessage,
  serveConnection,
  socketCores,
  type Connection,
  type SocketCore,
} from '../server/socket.ts';

/**
 * Options for {@link serveSocket}.
 * @example
 * ```ts
 * serveSocket(handler, { idleTimeoutMs: false });
 * ```
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface SocketOptions {
  /**
   * Close a connection that sends nothing for this long; `socketLink`'s
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
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface SocketHandlerLike {
  fetch(request: Request, ...platform: never[]): Promise<Response>;
}

const serveOne = (
  core: SocketCore,
  socket: Socket.Socket,
  opts: SocketOptions,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const writer = yield* socket.writer;
    const outbox = yield* Queue.unbounded<string | Socket.CloseEvent>();
    yield* Queue.take(outbox).pipe(
      Effect.flatMap((chunk) => writer.write(chunk)),
      Effect.forever,
      Effect.ignore,
      Effect.forkScoped,
    );
    const listeners: Array<(message: unknown) => void> = [];
    const closers: Array<() => void> = [];
    const conn: Connection = {
      send: (message: ServerMessage) => {
        Queue.offerUnsafe(outbox, encodeLine(message));
      },
      onMessage: (listener) => listeners.push(listener),
      onClose: (listener) => closers.push(listener),
      close: (code, reason) => {
        Queue.offerUnsafe(outbox, new Socket.CloseEvent(code, reason));
      },
    };
    serveConnection(core, conn, {
      request: HttpServerRequest.fromWeb(new Request('http://localhost/')),
      transport: 'socket',
      idleTimeoutMs: opts.idleTimeoutMs ?? 60_000,
    });
    yield* decodeLines(Socket.toStream(socket)).pipe(
      Stream.runForEach((line) =>
        Effect.sync(() => {
          const message = parseSocketMessage(line);
          for (const listener of listeners) listener(message);
        }),
      ),
      Effect.ignore,
    );
    for (const close of closers) close();
  }).pipe(Effect.scoped);

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
 * @since 12.0.0-alpha.0
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
  const core = socketCores.get(handler);
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
