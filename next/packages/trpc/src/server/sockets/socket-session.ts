import {
  Cause,
  Channel,
  type Duration,
  Effect,
  FiberHandle,
  Predicate,
  Queue,
  Scope,
  Stream,
} from 'effect';
import { Socket } from 'effect/socket';
import { backpressure } from '../../internal/effects.ts';
import type { WebSocketLike } from './socket.ts';

/**
 * A WebSocket's frames as they arrive, text as strings and binary as
 * bytes. A close fails the stream, as the socket's `pull` does. @internal
 */
export const socketFrames = (
  socket: Socket.Socket,
): Stream.Stream<string | Uint8Array, Socket.SocketError> =>
  Stream.fromChannel(
    Channel.fromTransform((_, scope) =>
      Scope.provide(
        Effect.map(socket.reader, (reader) => reader.pull),
        scope,
      ),
    ),
  );

/**
 * A standard `WebSocket` as an Effect `Socket`: Deno's, a Workers
 * `WebSocketPair` end, or anything `handler.websocket()` receives.
 * @internal
 */
export const fromWebSocketLike = (
  ws: WebSocketLike,
): Effect.Effect<Socket.Socket> =>
  Effect.map(Socket.fromWebSocket(Effect.succeed(ws)), (socket) =>
    typeof ws.bufferedAmount === 'number'
      ? withBufferedAmount(socket, () => Number(ws.bufferedAmount))
      : socket,
  );

const CONNECTING = 0;
const OPEN = 1;

/**
 * Closes `ws` with `code` now if it's open, or once it opens if it's still
 * connecting: some runtimes throw on closing a socket that isn't open yet.
 */
const closeWhenOpen = (ws: WebSocketLike, code: number, reason: string) => {
  if (ws.readyState === OPEN) ws.close(code, reason);
  else if (ws.readyState === CONNECTING) {
    const onOpen = () => {
      ws.removeEventListener('open', onOpen);
      ws.close(code, reason);
    };
    ws.addEventListener('open', onOpen);
  }
};

/**
 * Serves `ws` as an Effect `Socket` with `serve`. Interrupting it closes
 * `ws` with 1012 ("service restart"), so the client reconnects: Effect's
 * `Socket` only lets go of the platform's socket, and a close the session
 * queued may not have been written yet.
 * @internal
 */
export const runWebSocketLike = (
  ws: WebSocketLike,
  serve: (socket: Socket.Socket) => Effect.Effect<void>,
): Effect.Effect<void> =>
  Effect.flatMap(fromWebSocketLike(ws), serve).pipe(
    Effect.onInterrupt(() =>
      Effect.sync(() => closeWhenOpen(ws, 1012, 'Service restart')),
    ),
  );

/**
 * Bytes a socket has accepted but not sent yet. Effect's `Socket` writes
 * without waiting for the peer (WebSockets have no drain event), so
 * whoever holds the platform's socket says how to read them.
 */
const bufferedAmounts = new WeakMap<Socket.Socket, () => number>();

/**
 * Lets `runSocket` wait while `bufferedAmount()` is past the high-water
 * mark. Once the socket closes, the session stops waiting. @internal
 */
export const withBufferedAmount = (
  socket: Socket.Socket,
  bufferedAmount: () => number,
): Socket.Socket => {
  bufferedAmounts.set(socket, bufferedAmount);
  return socket;
};

const unknownAmount = () => 0;

/** How to read `socket`'s unsent bytes; 0 when nobody said. @internal */
export const bufferedAmountOf = (socket: Socket.Socket): (() => number) =>
  bufferedAmounts.get(socket) ?? unknownAmount;

/** Unsent bytes past which a session stops writing until the client reads. @internal */
export const sendHighWaterMark: number = 64 * 1024;
/** WebSockets don't say when their buffer drains, so the writer looks this often. */
const drainPollMs = 10;

/** Writes to a session's socket, in order; once it closes, writes are dropped. @internal */
export interface SocketOutbox {
  /**
   * Queues `data`, waiting while the queue is full: the writer stops
   * taking from it while the socket holds more than `sendHighWaterMark`
   * unsent bytes, so a slow client slows whoever sends.
   */
  readonly send: (data: string | Uint8Array) => Effect.Effect<void>;
  /** Sends the close frame after what's queued, without waiting for the client. */
  readonly close: (code: number, reason?: string) => void;
}

/** What handles a session's frames and its end. @internal */
export interface SocketSession<A> {
  /** Runs before the next frame is read. */
  readonly frame: (frame: A) => Effect.Effect<void>;
  /** Runs once, when the socket closes or idles out. */
  readonly close: (event: Socket.CloseEvent) => Effect.Effect<void>;
}

const closeOf = (err: unknown): Socket.CloseEvent =>
  Socket.isSocketError(err) &&
  Predicate.isTagged(err.reason, 'SocketCloseError')
    ? new Socket.CloseEvent(err.reason.code, err.reason.closeReason)
    : new Socket.CloseEvent(1006);

/**
 * Runs a session on `socket` until it closes: `open` gets the outbox, and
 * the session it returns gets each of `frames`. With `idleTimeout`, a
 * socket that sends nothing for that long is closed with 1001 ("going
 * away"), and its session closes then rather than when the peer answers.
 * Sends wait for a slow client (see `SocketOutbox.send`) when the socket's
 * unsent bytes can be read (`withBufferedAmount`).
 * @internal
 */
export const runSocket = <A>(opts: {
  readonly socket: Socket.Socket;
  readonly frames: Stream.Stream<A, unknown>;
  readonly idleTimeout: Duration.Duration | undefined;
  readonly open: (
    outbox: SocketOutbox,
  ) => Effect.Effect<SocketSession<A>, never, Scope.Scope>;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const writer = yield* opts.socket.writer;
    const bufferedAmount = bufferedAmountOf(opts.socket);
    // A close fails the queue with its event once what's queued is written;
    // a queue that isn't open drops sends.
    const queue = yield* Queue.bounded<string | Uint8Array, Socket.CloseEvent>(
      backpressure.bufferSize,
    );
    /** Cleared by a close: flush the rest without waiting for the client. */
    let patient = true;
    /** Drops what's queued and lets waiting senders go. */
    const stop = () => {
      patient = false;
      Queue.shutdownUnsafe(queue);
    };
    const drained: Effect.Effect<void> = Effect.suspend(() =>
      patient && bufferedAmount() > sendHighWaterMark
        ? Effect.andThen(Effect.sleep(drainPollMs), drained)
        : Effect.void,
    );
    yield* Queue.take(queue).pipe(
      Effect.flatMap((data) => Effect.andThen(writer.write(data), drained)),
      Effect.forever,
      Effect.catchIf(Socket.isCloseEvent, (event) => writer.write(event)),
      Effect.ignore,
      Effect.ensuring(Effect.sync(stop)),
      Effect.forkScoped,
    );
    const outbox: SocketOutbox = {
      send: (data) => Effect.asVoid(Queue.offer(queue, data)),
      close: (code, reason) => {
        patient = false;
        Queue.failCauseUnsafe(
          queue,
          Cause.fail(new Socket.CloseEvent(code, reason)),
        );
      },
    };
    const session = yield* opts.open(outbox);
    let ended = false;
    const end = (event: Socket.CloseEvent) =>
      Effect.suspend(() => {
        if (ended) return Effect.void;
        ended = true;
        return session.close(event);
      });
    const idleTimeout = opts.idleTimeout;
    const idle = yield* FiberHandle.make();
    const arm = idleTimeout
      ? FiberHandle.run(
          idle,
          Effect.sleep(idleTimeout).pipe(
            Effect.andThen(
              Effect.sync(() => outbox.close(1001, 'Idle timeout')),
            ),
            Effect.andThen(end(new Socket.CloseEvent(1001, 'Idle timeout'))),
          ),
        )
      : Effect.void;
    yield* arm;
    yield* opts.frames.pipe(
      Stream.runForEach((frame) =>
        Effect.andThen(
          arm,
          Effect.suspend(() => (ended ? Effect.void : session.frame(frame))),
        ),
      ),
      Effect.catch((err) =>
        Effect.andThen(Effect.sync(stop), end(closeOf(err))),
      ),
      Effect.ensuring(
        Effect.andThen(Effect.sync(stop), end(new Socket.CloseEvent(1006))),
      ),
    );
  }).pipe(Effect.scoped);
