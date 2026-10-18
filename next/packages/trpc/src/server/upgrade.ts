import { Effect } from 'effect';
import type { HttpServerError, HttpServerRequest } from 'effect/http';
import type { Socket } from 'effect/socket';
import { runSocket, socketFrames } from './socket-session.ts';
import type { WebSocketLike } from './socket.ts';

/** @internal */
export const isUpgrade = (
  request: HttpServerRequest.HttpServerRequest,
): boolean => request.headers['upgrade']?.toLowerCase() === 'websocket';

/** Serves an upgraded request's socket until it closes. @internal */
export type ServeSocket = (
  socket: Socket.Socket,
  request: HttpServerRequest.HttpServerRequest,
) => Effect.Effect<void>;

/**
 * How each of our handlers serves an upgraded socket, so
 * `@trpc12/trpc/http` hands it Effect's `Socket` instead of a `WebSocket`.
 * @internal
 */
export const socketServers: WeakMap<object, ServeSocket> = new WeakMap();

/** Upgrades `request` and serves its socket until it closes. @internal */
export const upgradeTo = (
  request: HttpServerRequest.HttpServerRequest,
  serve: (socket: Socket.Socket) => Effect.Effect<void>,
): Effect.Effect<void, HttpServerError.HttpServerError> =>
  Effect.flatMap(request.upgrade, serve);

const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/**
 * Serves `socket` to `accept` as a standard `WebSocket`, for a
 * `websocket()` handler that isn't ours: its contract is the `WebSocket`
 * shape, and Effect only adapts the other way (`Socket.fromWebSocket`).
 * @internal
 */
export const serveAsWebSocket = (
  socket: Socket.Socket,
  accept: (ws: WebSocketLike) => void,
): Effect.Effect<void> =>
  runSocket({
    socket,
    frames: socketFrames(socket),
    idleTimeoutMs: false,
    open: (outbox) =>
      Effect.sync(() => {
        const listeners = new Map<string, Set<(event: any) => void>>();
        const emit = (type: string, event: unknown) => {
          for (const listener of listeners.get(type) ?? []) listener(event);
        };
        let readyState = OPEN;
        accept({
          get readyState() {
            return readyState;
          },
          send(data) {
            if (readyState === OPEN) outbox.send(data);
          },
          close(code, reason) {
            if (readyState !== OPEN) return;
            readyState = CLOSING;
            outbox.close(code ?? 1000, reason);
          },
          addEventListener(type, listener) {
            const set = listeners.get(type) ?? new Set();
            listeners.set(type, set.add(listener));
          },
          removeEventListener(type, listener) {
            listeners.get(type)?.delete(listener);
          },
        });
        return {
          frame: (data) => emit('message', { data }),
          close: (event) => {
            readyState = CLOSED;
            emit('close', {
              code: event.code,
              reason: event.reason ?? '',
              wasClean: event.code !== 1006,
            });
          },
        };
      }),
  });
