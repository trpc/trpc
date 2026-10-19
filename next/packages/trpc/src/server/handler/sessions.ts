import { Effect, type Duration } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import {
  fromWebSocketLike,
  serveMessagePort,
  serveSocketConnection,
  type MessagePortLike,
  type ServeSocket,
  type SocketCoreShape,
  type SocketDrains,
  type WebSocketLike,
} from '../sockets/index.ts';
import { timerOption } from '../../internal/duration.ts';
import type { HttpHandler } from './http-handler.ts';
import { deserialize } from './input.ts';
import { CurrentPlatform } from './platform.ts';

/**
 * A fetch handler's WebSocket and MessagePort side: the socket core its
 * sessions share, and how each way in starts one. @internal
 */
export interface Sessions {
  readonly core: SocketCoreShape;
  /** Serves an upgraded request's socket in the calling fiber. */
  readonly serveWebSocket: ServeSocket;
  /** Upgrades a web `Request` with `websocket.upgrade`, answering 400 when it throws. */
  readonly upgradeWeb:
    | ((
        request: HttpServerRequest.HttpServerRequest,
      ) => Effect.Effect<HttpServerResponse.HttpServerResponse>)
    | undefined;
  readonly websocket: (
    socket: WebSocketLike,
    opts: { readonly request: Request; readonly platform?: unknown },
  ) => void;
  readonly messagePort: (
    port: MessagePortLike,
    opts?: { readonly request?: Request; readonly platform?: unknown },
  ) => void;
}

/** @internal */
export const makeSessions = (
  handler: HttpHandler,
  drains: SocketDrains,
  opts: {
    readonly idleTimeout?: Duration.Input | false | undefined;
    readonly upgrade?:
      | ((request: Request) => { socket: WebSocketLike; response: Response })
      | undefined;
  } = {},
): Sessions => {
  const base = handler.core;
  const core: SocketCoreShape = {
    router: handler.router,
    serializer: handler.serializer,
    run: base.run,
    makeContext: base.makeContext,
    deserializeInput: (value) => deserialize(handler.serializer, value),
    publicError: base.publicError,
    report: base.report,
    drains,
  };
  const idleTimeout = timerOption(opts.idleTimeout, '60 seconds');
  const serveWebSocketLike = (
    ws: WebSocketLike,
    request: HttpServerRequest.HttpServerRequest,
    platform: unknown,
  ) =>
    Effect.flatMap(fromWebSocketLike(ws), (socket) =>
      serveSocketConnection(core, socket, {
        request,
        platform,
        transport: 'websocket',
        idleTimeout,
      }),
    );
  const upgrade = opts.upgrade;
  return {
    core,
    serveWebSocket: (socket, request) =>
      serveSocketConnection(core, socket, {
        request,
        transport: 'websocket',
        idleTimeout,
      }),
    upgradeWeb:
      upgrade &&
      ((request) =>
        Effect.try(() => upgrade(request.source as Request)).pipe(
          Effect.matchEffect({
            onFailure: () =>
              Effect.succeed(HttpServerResponse.empty({ status: 400 })),
            onSuccess: (upgraded) =>
              Effect.gen(function* () {
                const platform = yield* CurrentPlatform;
                yield* Effect.forkDetach(
                  serveWebSocketLike(upgraded.socket, request, platform),
                  { startImmediately: true },
                );
                return HttpServerResponse.raw(upgraded.response);
              }),
          }),
        )),
    websocket: (socket, o) => {
      Effect.runFork(
        serveWebSocketLike(
          socket,
          HttpServerRequest.fromWeb(o.request),
          o.platform,
        ),
      );
    },
    messagePort: (port, o) => {
      Effect.runFork(
        serveMessagePort(core, port, {
          request: HttpServerRequest.fromWeb(
            o?.request ?? new Request('http://localhost/'),
          ),
          platform: o?.platform,
        }),
      );
    },
  };
};
