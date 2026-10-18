import { carriesBytes, encodeRecord } from '../internal/frames.ts';
import {
  Cause,
  Context,
  Effect,
  Exit,
  FiberMap,
  Option,
  Queue,
  Stream,
  type Scope,
  type Tracer,
} from 'effect';
import { Headers, HttpTraceContext, type HttpServerRequest } from 'effect/http';
import type { Socket } from 'effect/socket';
import {
  HibernationSlot,
  type ParkedSubscription,
} from '../internal/hibernation.ts';
import {
  isTrpcError,
  toWireError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '../internal/protocol.ts';
import type { ProcedureType } from '../internal/types.ts';
import type { AnySerializer } from '../serializer/index.ts';
import {
  emitEvents,
  type EventFrame,
  createResponseHandle,
  normalizeCause,
  unexpectedError,
} from './execution/index.ts';
import type { HandlerCore } from './core.ts';
import { resolveProcedure, type AnyRouter } from './procedures/index.ts';
import { runSocket, socketFrames } from './socket-session.ts';

/** The span a socket call is a child of: the trace context in its message. */
const traceParent = (trace: unknown): Tracer.AnySpan | undefined =>
  typeof trace === 'object' && trace !== null
    ? Option.getOrUndefined(
        HttpTraceContext.fromHeaders(
          Headers.fromInput(
            Object.entries(trace).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === 'string',
            ),
          ),
        ),
      )
    : undefined;

/**
 * The parts of a standard `WebSocket` the handler uses, which Effect's
 * `Socket.fromWebSocket` reads: the server-side socket of Deno, Bun or
 * Cloudflare (`WebSocketPair`, after `accept()`).
 * @since 0.1.0
 * @stability stable
 */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string | Uint8Array<ArrayBuffer>): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
}

/**
 * A `MessagePort`, a `Worker`, a `worker_threads` port or anything with
 * `postMessage` and a `message` event.
 * @since 0.1.0
 * @stability stable
 */
export interface MessagePortLike {
  postMessage(message: unknown): void;
  /** Node style: the listener receives the message itself. Preferred when present. */
  on?(event: 'message' | 'close', listener: (value: any) => void): unknown;
  /** Web style: the listener receives a `MessageEvent`. */
  addEventListener?(type: string, listener: (event: any) => void): void;
  start?(): void;
}

/**
 * How a call reached the server.
 * @since 0.1.0
 * @stability stable
 */
export type Transport = 'http' | 'websocket' | 'messagePort' | 'socket';

/** What the fetch handler shares with socket connections. @internal */
export interface SocketCoreShape extends Pick<
  HandlerCore,
  'runEffect' | 'makeContextEffect' | 'publicError' | 'report'
> {
  readonly router: AnyRouter;
  readonly serializer: AnySerializer;
  deserializeInput(value: unknown): unknown;
}

/** @internal */
export interface SocketCore {
  readonly _: unique symbol;
}

/** The socket core behind a fetch handler, for adapters outside it. @internal */
export const SocketCore: Context.ServiceClass<
  SocketCore,
  '@trpc12/trpc/SocketCore',
  SocketCoreShape
> = Context.Service<SocketCore, SocketCoreShape>()('@trpc12/trpc/SocketCore');

/** Where a connection's server messages go, whatever carries it. @internal */
export interface Connection {
  send(message: ServerMessage): void;
  /** The client asked for binary messages; transports that have them may send file bytes so. */
  acceptBinary?(): void;
  close(code: number, reason: string): void;
}

/** A WebSocket frame as a client message, or `undefined` if it isn't JSON text. @internal */
export function parseSocketMessage(data: unknown): unknown {
  if (typeof data !== 'string') return undefined;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * A server message as a WebSocket frame: a binary record for file bytes
 * once the client asked for binary messages, JSON text otherwise. @internal
 */
export const encodeWebSocketMessage = (
  message: ServerMessage,
  binary: boolean,
): string | Uint8Array =>
  binary && message.type === 'chunk' && carriesBytes(message.chunk)
    ? encodeRecord(message)
    : JSON.stringify(message);

/**
 * Serves calls over an Effect `Socket` until it closes (10): a WebSocket
 * from `request.upgrade` or `Socket.fromWebSocket`, one client message per
 * frame, unless `messages` frames them otherwise (raw sockets' lines).
 * @internal
 */
export const serveSocketConnection = (
  core: SocketCoreShape,
  socket: Socket.Socket,
  opts: {
    readonly request: HttpServerRequest.HttpServerRequest;
    readonly platform?: unknown;
    readonly transport: Transport;
    /** Close the socket after this long without a message. */
    readonly idleTimeoutMs: number | false;
    readonly messages?: Stream.Stream<unknown, Socket.SocketError>;
    /** `binary` is set once the client's `init` asks for binary messages. */
    readonly encode?: (
      message: ServerMessage,
      binary: boolean,
    ) => string | Uint8Array;
  },
): Effect.Effect<void> => {
  const encode = opts.encode ?? encodeWebSocketMessage;
  return runSocket({
    socket,
    frames:
      opts.messages ?? Stream.map(socketFrames(socket), parseSocketMessage),
    idleTimeoutMs: opts.idleTimeoutMs,
    open: (outbox) =>
      Effect.gen(function* () {
        let binary = false;
        const receiver = yield* connectionReceiver(
          core,
          {
            send: (message) => outbox.send(encode(message, binary)),
            acceptBinary: () => {
              binary = true;
            },
            close: (code, reason) => outbox.close(code, reason),
          },
          opts,
        );
        return { frame: receiver.receive, close: () => receiver.close };
      }),
  });
};

/**
 * A port's messages until its `close` event. It listens when called, not
 * when the stream runs: a fiber may start later than the port's next
 * message, and ports without a listener drop theirs. @internal
 */
export const portMessages = (port: MessagePortLike): Stream.Stream<unknown> => {
  const queue = Effect.runSync(Queue.unbounded<unknown, Cause.Done>());
  const offer = (message: unknown) => {
    Queue.offerUnsafe(queue, message);
  };
  const end = () => {
    Queue.endUnsafe(queue);
  };
  if (port.on) {
    port.on('message', offer);
    port.on('close', end);
  } else {
    port.addEventListener?.('message', (e: { data: unknown }) => offer(e.data));
    port.addEventListener?.('close', end);
  }
  port.start?.();
  return Stream.fromQueue(queue);
};

/** A subscription's event frame as the message for call `id`. @internal */
export function frameMessage(id: number, frame: EventFrame): ServerMessage {
  switch (frame.kind) {
    case 'event':
      return {
        id,
        type: 'event',
        body: frame.body,
        ...(frame.eventId === undefined ? {} : { eventId: frame.eventId }),
        ...(frame.deferred === undefined ? {} : { deferred: frame.deferred }),
      };
    case 'chunk':
      return { id, type: 'chunk', event: frame.event, chunk: frame.chunk };
    case 'chunkEnd':
      return { id, type: 'chunkEnd', event: frame.event };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Serves calls over a `MessagePort` (10) until it closes. Each request
 * message is one call with its own `createContext`, like an HTTP request;
 * `connectionParams` from the client's `init` message reach `createContext`.
 * It listens to `port` when called, as `portMessages` does.
 * @internal
 */
export const serveMessagePort = (
  core: SocketCoreShape,
  port: MessagePortLike,
  opts: {
    readonly request: HttpServerRequest.HttpServerRequest;
    readonly platform?: unknown;
  },
): Effect.Effect<void> => {
  const messages = portMessages(port);
  return Effect.gen(function* () {
    const receiver = yield* connectionReceiver(
      core,
      {
        send: (message) => port.postMessage(message),
        close: () => (port as { close?: () => void }).close?.(),
      },
      { ...opts, transport: 'messagePort' },
    );
    yield* Stream.runForEach(messages, receiver.receive).pipe(
      Effect.ensuring(receiver.close),
    );
  }).pipe(Effect.scoped);
};

/** What `connectionReceiver()` returns. @internal */
export interface ConnectionReceiver {
  /** Handles one client message; a request's call runs in its own fiber. */
  readonly receive: (message: unknown) => Effect.Effect<void>;
  /** Interrupts the connection's calls and ignores later messages. */
  readonly close: Effect.Effect<void>;
}

/**
 * The connection protocol, one message at a time. Each call is a fiber in
 * a `FiberMap` keyed by its id, in the caller's scope, so an `abort`, the
 * connection's close or the end of the scope interrupts it.
 * @internal
 */
export const connectionReceiver = (
  core: SocketCoreShape,
  conn: Connection,
  opts: {
    request: HttpServerRequest.HttpServerRequest;
    /** What `createContext` gets as `platform`. */
    platform?: unknown;
    transport: Transport;
    /** Params from an earlier `init`, for a connection served before. */
    connectionParams?: Record<string, unknown> | undefined;
    onInit?: (connectionParams: Record<string, unknown> | undefined) => void;
    /**
     * Keeps a publisher subscription on the connection instead of running
     * it. `false` runs it as usual.
     */
    hibernate?: (
      call: ParkedSubscription & { id: number; path: string },
    ) => boolean;
    /** The client aborted, or the parked call failed. */
    unpark?: (id: number) => void;
  },
): Effect.Effect<ConnectionReceiver, never, Scope.Scope> =>
  Effect.map(FiberMap.make<number, void, never>(), (calls) => {
    const { request } = opts;
    let connectionParams = opts.connectionParams;
    let closed = false;
    /** The client named another serializer, so its calls would decode wrong. */
    let refused = false;

    const wire = (err: AnyTrpcError) =>
      core.serializer.serialize(toWireError(core.publicError(err)));
    const asTrpcError = (cause: unknown) =>
      isTrpcError(cause) ? cause : unexpectedError(cause);
    const coerceError =
      (path: string, type: ProcedureType) => (cause: unknown) => {
        const err = asTrpcError(cause);
        core.report(err, request, path, type);
        return toWireError(core.publicError(err));
      };
    const sendError = (id: number | null, err: AnyTrpcError) =>
      conn.send({ id, type: 'error', body: wire(err) });

    /**
     * One request's call. Its `AbortSignal`, shared by `createContext` and
     * the procedure, aborts when the fiber is interrupted.
     */
    const call = (
      message: Extract<ClientMessage, { type: 'request' }>,
    ): Effect.Effect<void> => {
      const { id, path } = message;
      const callParams = connectionParams;
      const controller = new AbortController();
      let type: ProcedureType | undefined;
      let parked = false;
      return Effect.gen(function* () {
        const procedure = yield* Effect.tryPromise({
          try: async () => resolveProcedure(core.router, path),
          catch: asTrpcError,
        });
        const kind = procedure?.['~trpc'].type;
        type = kind;
        if (!procedure || !kind) {
          return yield* Effect.fail(
            new TrpcError({
              code: 'NOT_FOUND',
              message: `No procedure at path "${path}"`,
            }),
          );
        }
        if (kind !== message.method) {
          return yield* Effect.fail(
            new TrpcError({
              code: 'METHOD_NOT_SUPPORTED',
              message: `"${path}" is a ${kind}, not a ${String(message.method)}`,
            }),
          );
        }
        const input = yield* Effect.try({
          try: () => core.deserializeInput(message.input),
          catch: asTrpcError,
        });
        const ctx = yield* core.makeContextEffect({
          request,
          platform: opts.platform,
          calls: [{ path, type: kind }],
          signal: controller.signal,
          transport: opts.transport,
          connectionParams: callParams,
        });
        const hibernate = kind === 'subscription' ? opts.hibernate : undefined;
        const services = hibernate
          ? Context.make(HibernationSlot, {
              park: (sub) => (parked = hibernate({ ...sub, id, path })),
            })
          : undefined;
        const exit = yield* core.runEffect({
          request,
          procedure,
          path,
          ctx,
          input,
          signal: controller.signal,
          response: createResponseHandle(),
          lastEventId: message.lastEventId,
          services,
          parent: traceParent(message.trace),
        });
        if (Exit.isFailure(exit)) {
          return yield* Effect.fail(normalizeCause(exit.cause));
        }
        if (kind === 'subscription') {
          yield* emitEvents(
            exit.value as Stream.Stream<unknown, AnyTrpcError>,
            core.serializer,
            coerceError(path, kind),
            (frame) => Effect.sync(() => conn.send(frameMessage(id, frame))),
          );
          if (!parked) conn.send({ id, type: 'done' });
          return;
        }
        const serialized = core.serializer.serializeDeferred(exit.value, {
          coerceError: coerceError(path, kind),
        });
        if (!serialized.chunks) {
          conn.send({ id, type: 'result', body: serialized.head });
          return;
        }
        conn.send({
          id,
          type: 'result',
          body: serialized.head,
          deferred: true,
        });
        yield* Stream.runForEach(serialized.chunks, (chunk) =>
          Effect.sync(() => conn.send({ id, type: 'chunk', chunk })),
        ).pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause) ? Effect.interrupt : Effect.void,
          ),
        );
        conn.send({ id, type: 'done' });
      }).pipe(
        Effect.catchCause((cause) => {
          if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt;
          return Effect.sync(() => {
            if (parked) opts.unpark?.(id);
            const err = normalizeCause(cause);
            core.report(err, request, path, type);
            sendError(id, err);
          });
        }),
        Effect.onInterrupt(() => Effect.sync(() => controller.abort())),
      );
    };

    const receive = (raw: unknown): Effect.Effect<void> =>
      Effect.suspend(() => {
        if (closed) return Effect.void;
        if (!isRecord(raw) || typeof raw['type'] !== 'string') {
          sendError(
            null,
            new TrpcError({ code: 'PARSE_ERROR', message: 'Invalid message' }),
          );
          return Effect.void;
        }
        const message = raw as ClientMessage;
        switch (message.type) {
          case 'init': {
            if (message.version !== PROTOCOL_VERSION) {
              sendError(
                null,
                new TrpcError({
                  code: 'UNSUPPORTED_PROTOCOL',
                  message: `Unsupported protocol version "${String(message.version)}", expected "${PROTOCOL_VERSION}"`,
                }),
              );
              conn.close(1002, 'Unsupported protocol version');
              return Effect.void;
            }
            connectionParams = isRecord(message.connectionParams)
              ? message.connectionParams
              : undefined;
            if (message.binary === true) conn.acceptBinary?.();
            refused =
              typeof message.serializer === 'string' &&
              message.serializer !== core.serializer.name;
            conn.send({ type: 'init', serializer: core.serializer.name });
            if (!refused) opts.onInit?.(connectionParams);
            return Effect.void;
          }
          case 'ping':
            conn.send({ type: 'pong' });
            return Effect.void;
          case 'abort':
            opts.unpark?.(message.id);
            return FiberMap.remove(calls, message.id);
          case 'request': {
            if (refused) return Effect.void;
            if (
              typeof message.id !== 'number' ||
              FiberMap.hasUnsafe(calls, message.id)
            ) {
              sendError(
                null,
                new TrpcError({
                  code: 'BAD_REQUEST',
                  message: 'Each request needs a unique numeric id',
                }),
              );
              return Effect.void;
            }
            return Effect.asVoid(
              FiberMap.run(calls, message.id, call(message)),
            );
          }
          default:
            sendError(
              null,
              new TrpcError({
                code: 'BAD_REQUEST',
                message: 'Unknown message',
              }),
            );
            return Effect.void;
        }
      });

    const close = Effect.suspend(() => {
      closed = true;
      return FiberMap.clear(calls);
    });

    return { receive, close };
  });
