import { Effect, Predicate, Queue } from 'effect';
import type { HttpServerError, HttpServerRequest } from 'effect/http';
import { Socket } from 'effect/socket';
import type { WebSocketLike } from './socket.ts';

/** @internal */
export const isUpgrade = (
  request: HttpServerRequest.HttpServerRequest,
): boolean => request.headers['upgrade']?.toLowerCase() === 'websocket';

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
    const outbox = yield* Queue.unbounded<
      string | Uint8Array | Socket.CloseEvent
    >();
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
          if (Predicate.isTagged(reason, 'SocketCloseError')) {
            closed(reason.code, reason.closeReason ?? '');
          }
        }),
      ),
      Effect.ensuring(Effect.sync(() => closed(1006, ''))),
    );
  });

/**
 * Upgrades `request` and hands the socket to `onSocket` as a
 * `WebSocketLike`, until it closes. @internal
 */
export const upgradeTo = (
  request: HttpServerRequest.HttpServerRequest,
  onSocket: (ws: WebSocketLike) => void,
): Effect.Effect<void, HttpServerError.HttpServerError> =>
  Effect.scoped(
    Effect.flatMap(request.upgrade, (socket) =>
      serveSocket(socket, onSocket).pipe(
        Effect.catchTag('SocketError', () => Effect.void),
      ),
    ),
  );
