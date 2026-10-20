import { Context, Effect, Queue } from 'effect';
import type { HttpServerError, HttpServerRequest } from 'effect/http';
import { Socket } from 'effect/socket';
import {
  bufferedAmountOf,
  runSocket,
  socketFrames,
  withBufferedAmount,
} from './socket-session.ts';
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

/** @internal */
export interface UpgradeServer {
  readonly _: unique symbol;
}

/**
 * How one of our handlers serves an upgraded socket, so
 * `@trpc12/trpc/http` hands it Effect's `Socket` instead of a `WebSocket`.
 * @internal
 */
export const UpgradeServer: Context.ServiceClass<
  UpgradeServer,
  '@trpc12/trpc/UpgradeServer',
  ServeSocket
> = /* @__PURE__ */ Context.Service<UpgradeServer, ServeSocket>()(
  '@trpc12/trpc/UpgradeServer',
);

/**
 * The TCP socket under a Node upgrade (`IncomingMessage.socket`). `ws`
 * writes to it directly, so what it hasn't sent yet is `ws`'s
 * `bufferedAmount`, which Effect's `Socket` keeps to itself. Bun's
 * request is a web `Request`, without one.
 */
const nodeSocketOf = (request: HttpServerRequest.HttpServerRequest) =>
  (request.source as { socket?: { readonly writableLength: number } }).socket;

/** Upgrades `request` and serves its socket until it closes. @internal */
export const upgradeTo = (
  request: HttpServerRequest.HttpServerRequest,
  serve: (socket: Socket.Socket) => Effect.Effect<void>,
): Effect.Effect<void, HttpServerError.HttpServerError> =>
  Effect.flatMap(request.upgrade, (socket) => {
    const tcp = nodeSocketOf(request);
    return serve(
      tcp ? withBufferedAmount(socket, () => tcp.writableLength) : socket,
    );
  });

const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

const encoder = /* @__PURE__ */ new TextEncoder();
const byteLength = (data: string | Uint8Array) =>
  typeof data === 'string' ? encoder.encode(data).byteLength : data.byteLength;

/**
 * Serves `socket` to `accept` as a standard `WebSocket`, for a
 * `websocket()` handler that isn't ours: its contract is the `WebSocket`
 * shape, and Effect only adapts the other way (`Socket.fromWebSocket`).
 * Its `send` can't wait, so it queues, and `bufferedAmount` counts what
 * hasn't reached the socket yet, for the handler to wait on.
 * @internal
 */
export const serveAsWebSocket = (
  socket: Socket.Socket,
  accept: (ws: WebSocketLike) => void,
): Effect.Effect<void> =>
  runSocket({
    socket,
    frames: socketFrames(socket),
    idleTimeout: undefined,
    open: (outbox) =>
      Effect.gen(function* () {
        const unsent = bufferedAmountOf(socket);
        const pending = yield* Queue.unbounded<
          string | Uint8Array | Socket.CloseEvent
        >();
        let queuedBytes = 0;
        yield* Queue.take(pending).pipe(
          Effect.flatMap((item) =>
            Socket.isCloseEvent(item)
              ? Effect.sync(() => outbox.close(item.code, item.reason))
              : Effect.ensuring(
                  outbox.send(item),
                  Effect.sync(() => (queuedBytes -= byteLength(item))),
                ),
          ),
          Effect.forever,
          Effect.forkScoped,
        );
        const listeners = new Map<string, Set<(event: any) => void>>();
        const emit = (type: string, event: unknown) => {
          for (const listener of listeners.get(type) ?? []) listener(event);
        };
        let readyState = OPEN;
        accept({
          get readyState() {
            return readyState;
          },
          get bufferedAmount() {
            return queuedBytes + unsent();
          },
          send(data) {
            if (readyState !== OPEN) return;
            queuedBytes += byteLength(data);
            Queue.offerUnsafe(pending, data);
          },
          close(code, reason) {
            if (readyState !== OPEN) return;
            readyState = CLOSING;
            Queue.offerUnsafe(
              pending,
              new Socket.CloseEvent(code ?? 1000, reason),
            );
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
          frame: (data) => Effect.sync(() => emit('message', { data })),
          close: (event) =>
            Effect.sync(() => {
              readyState = CLOSED;
              emit('close', {
                code: event.code,
                reason: event.reason ?? '',
                wasClean: event.code !== 1006,
              });
            }),
        };
      }),
  });
