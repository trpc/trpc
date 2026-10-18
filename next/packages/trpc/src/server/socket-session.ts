import {
  Channel,
  Effect,
  FiberHandle,
  Predicate,
  Queue,
  Scope,
  Stream,
} from 'effect';
import { Socket } from 'effect/socket';
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
): Effect.Effect<Socket.Socket> => Socket.fromWebSocket(Effect.succeed(ws));

/** Writes to a session's socket, in order; once it closes, writes are dropped. @internal */
export interface SocketOutbox {
  readonly send: (data: string | Uint8Array) => void;
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
 * the session it returns gets each of `frames`. With `idleTimeoutMs`, a
 * socket that sends nothing for that long is closed with 1001 ("going
 * away"), and its session closes then rather than when the peer answers.
 * @internal
 */
export const runSocket = <A>(opts: {
  readonly socket: Socket.Socket;
  readonly frames: Stream.Stream<A, unknown>;
  readonly idleTimeoutMs: number | false;
  readonly open: (
    outbox: SocketOutbox,
  ) => Effect.Effect<SocketSession<A>, never, Scope.Scope>;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const writer = yield* opts.socket.writer;
    const queue = yield* Queue.unbounded<
      string | Uint8Array | Socket.CloseEvent
    >();
    yield* Queue.take(queue).pipe(
      Effect.flatMap(writer.write),
      Effect.forever,
      Effect.ignore,
      Effect.forkScoped,
    );
    let closing = false;
    const outbox: SocketOutbox = {
      send: (data) => {
        if (!closing) Queue.offerUnsafe(queue, data);
      },
      close: (code, reason) => {
        if (closing) return;
        closing = true;
        Queue.offerUnsafe(queue, new Socket.CloseEvent(code, reason));
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
    const idleMs = opts.idleTimeoutMs;
    const idle = yield* FiberHandle.make();
    const arm = idleMs
      ? FiberHandle.run(
          idle,
          Effect.sleep(idleMs).pipe(
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
      Effect.catch((err) => end(closeOf(err))),
      Effect.ensuring(end(new Socket.CloseEvent(1006))),
    );
  }).pipe(Effect.scoped);
