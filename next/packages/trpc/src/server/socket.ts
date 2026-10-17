import { carriesBytes, encodeRecord } from '../internal/frames.ts';
import { Context, Effect, Exit, Option, Stream, type Tracer } from 'effect';
import { Headers, HttpTraceContext, type HttpServerRequest } from 'effect/http';
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
import { emitEvents, type EventFrame } from './events.ts';
import {
  createResponseHandle,
  normalizeCause,
  unexpectedError,
} from './execute.ts';
import type { ResponseHandle } from './middleware.ts';
import type { AnyProcedure } from './procedure.ts';
import { resolveProcedure, type AnyRouter } from './router.ts';

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
 * The parts of a standard `WebSocket` the handler uses: the server-side
 * socket of Deno, Bun, Cloudflare (`WebSocketPair`, after `accept()`) or
 * `@trpc12/trpc/http`'s upgrade.
 * @since 0.1.0
 * @stability stable
 */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: any) => void): void;
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
export interface SocketCore {
  readonly router: AnyRouter;
  readonly serializer: AnySerializer;
  run(opts: {
    procedure: AnyProcedure;
    path: string;
    ctx: object;
    input: unknown;
    signal: AbortSignal;
    response: ResponseHandle;
    lastEventId?: string | undefined;
    services?: Context.Context<never> | undefined;
    request?: HttpServerRequest.HttpServerRequest | undefined;
    parent?: Tracer.AnySpan | undefined;
  }): Promise<Exit.Exit<unknown, AnyTrpcError>>;
  makeContext(opts: {
    request: HttpServerRequest.HttpServerRequest;
    platform: unknown;
    calls: ReadonlyArray<{ path: string; type: ProcedureType }>;
    signal: AbortSignal;
    transport: Transport;
    connectionParams: Record<string, unknown> | undefined;
  }): Promise<object>;
  deserializeInput(value: unknown): unknown;
  publicError(err: AnyTrpcError): AnyTrpcError;
  report(
    err: AnyTrpcError,
    request: HttpServerRequest.HttpServerRequest,
    path?: string,
    type?: ProcedureType,
  ): void;
  /** Serves an upgraded socket, for `@trpc12/trpc/http`. */
  serveWebSocket(
    socket: WebSocketLike,
    request: HttpServerRequest.HttpServerRequest,
  ): void;
}

/** The socket core behind each fetch handler, for adapters outside it. @internal */
export const socketCores: WeakMap<object, SocketCore> = new WeakMap();

/** A connection, whatever carries it. @internal */
export interface Connection {
  send(message: ServerMessage): void;
  /** The client asked for binary messages; transports that have them may send file bytes so. */
  acceptBinary?(): void;
  onMessage(listener: (message: unknown) => void): void;
  onClose(listener: () => void): void;
  close(code: number, reason: string): void;
}

const OPEN = 1;

/** A WebSocket frame as a client message, or `undefined` if it isn't JSON text. @internal */
export function parseSocketMessage(data: unknown): unknown {
  if (typeof data !== 'string') return undefined;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}

/** @internal */
export function webSocketConnection(socket: WebSocketLike): Connection {
  let binary = false;
  return {
    send(message) {
      if (socket.readyState !== OPEN) return;
      socket.send(
        binary && message.type === 'chunk' && carriesBytes(message.chunk)
          ? encodeRecord(message)
          : JSON.stringify(message),
      );
    },
    acceptBinary() {
      binary = true;
    },
    onMessage(listener) {
      socket.addEventListener('message', (event: { data: unknown }) => {
        listener(parseSocketMessage(event.data));
      });
    },
    onClose(listener) {
      socket.addEventListener('close', listener);
      socket.addEventListener('error', listener);
    },
    close(code, reason) {
      socket.close(code, reason);
    },
  };
}

/** @internal */
export function messagePortConnection(port: MessagePortLike): Connection {
  return {
    send(message) {
      port.postMessage(message);
    },
    onMessage(listener) {
      if (port.on) port.on('message', listener);
      else
        port.addEventListener?.('message', (e: { data: unknown }) =>
          listener(e.data),
        );
      port.start?.();
    },
    onClose(listener) {
      if (port.on) port.on('close', listener);
      else port.addEventListener?.('close', listener);
    },
    close() {
      (port as { close?: () => void }).close?.();
    },
  };
}

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
 * Serves calls over a connection (10). Each request message is one call
 * with its own `createContext`, like an HTTP request; `connectionParams`
 * from the client's `init` message reach `createContext`.
 * @internal
 */
export function serveConnection(
  core: SocketCore,
  conn: Connection,
  opts: {
    request: HttpServerRequest.HttpServerRequest;
    platform?: unknown;
    transport: Transport;
    /** Close the connection after this long without a message. */
    idleTimeoutMs?: number | false | undefined;
  },
): void {
  const receiver = connectionReceiver(core, conn, opts);
  const idleMs = opts.idleTimeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (!idleMs) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      receiver.close();
      conn.close(1001, 'Idle timeout');
    }, idleMs);
  };
  conn.onClose(() => {
    clearTimeout(timer);
    receiver.close();
  });
  conn.onMessage((message) => {
    arm();
    receiver.receive(message);
  });
  arm();
}

/** What `connectionReceiver()` returns. @internal */
export interface ConnectionReceiver {
  readonly receive: (message: unknown) => void;
  /** Aborts the connection's calls. */
  readonly close: () => void;
}

/**
 * The connection protocol, one message at a time, for transports that
 * deliver messages themselves (a hibernating Durable Object).
 * @internal
 */
export function connectionReceiver(
  core: SocketCore,
  conn: Pick<Connection, 'send' | 'close' | 'acceptBinary'>,
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
): ConnectionReceiver {
  const { request } = opts;
  const calls = new Map<number, AbortController>();
  let connectionParams = opts.connectionParams;
  let closed = false;
  /** The client named another serializer, so its calls would decode wrong. */
  let refused = false;

  const wire = (err: AnyTrpcError) =>
    core.serializer.serialize(toWireError(core.publicError(err)));
  const coerceError =
    (path: string, type: ProcedureType) => (cause: unknown) => {
      const err = isTrpcError(cause) ? cause : unexpectedError(cause);
      core.report(err, request, path, type);
      return toWireError(core.publicError(err));
    };
  const sendError = (id: number | null, err: AnyTrpcError) =>
    conn.send({ id, type: 'error', body: wire(err) });

  const close = () => {
    closed = true;
    for (const controller of calls.values()) controller.abort();
    calls.clear();
  };

  const receive = (raw: unknown) => {
    if (closed) return;
    if (!isRecord(raw) || typeof raw['type'] !== 'string') {
      sendError(
        null,
        new TrpcError({ code: 'PARSE_ERROR', message: 'Invalid message' }),
      );
      return;
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
          return;
        }
        connectionParams = isRecord(message.connectionParams)
          ? message.connectionParams
          : undefined;
        if (message.binary === true) conn.acceptBinary?.();
        refused =
          typeof message.serializer === 'string' &&
          message.serializer !== core.serializer.name;
        conn.send({ type: 'init', serializer: core.serializer.name });
        if (refused) return;
        opts.onInit?.(connectionParams);
        return;
      }
      case 'ping':
        conn.send({ type: 'pong' });
        return;
      case 'abort': {
        calls.get(message.id)?.abort();
        calls.delete(message.id);
        opts.unpark?.(message.id);
        return;
      }
      case 'request': {
        if (refused) return;
        if (typeof message.id !== 'number' || calls.has(message.id)) {
          sendError(
            null,
            new TrpcError({
              code: 'BAD_REQUEST',
              message: 'Each request needs a unique numeric id',
            }),
          );
          return;
        }
        void handle(message);
        return;
      }
      default:
        sendError(
          null,
          new TrpcError({ code: 'BAD_REQUEST', message: 'Unknown message' }),
        );
    }
  };

  async function handle(
    message: Extract<ClientMessage, { type: 'request' }>,
  ): Promise<void> {
    const { id, path } = message;
    const callParams = connectionParams;
    const controller = new AbortController();
    calls.set(id, controller);
    const { signal } = controller;
    const live = () => !signal.aborted && !closed;
    let type: ProcedureType | undefined;
    let parked = false;
    try {
      const procedure = await resolveProcedure(core.router, path);
      type = procedure?.['~trpc'].type;
      if (!procedure || !type) {
        throw new TrpcError({
          code: 'NOT_FOUND',
          message: `No procedure at path "${path}"`,
        });
      }
      if (type !== message.method) {
        throw new TrpcError({
          code: 'METHOD_NOT_SUPPORTED',
          message: `"${path}" is a ${type}, not a ${String(message.method)}`,
        });
      }
      const input = core.deserializeInput(message.input);
      const ctx = await core.makeContext({
        request,
        platform: opts.platform,
        calls: [{ path, type }],
        signal,
        transport: opts.transport,
        connectionParams: callParams,
      });
      const hibernate = type === 'subscription' ? opts.hibernate : undefined;
      const services = hibernate
        ? Context.make(HibernationSlot, {
            park: (sub) => (parked = hibernate({ ...sub, id, path })),
          })
        : undefined;
      const exit = await core.run({
        request,
        procedure,
        path,
        ctx,
        input,
        signal,
        response: createResponseHandle(),
        lastEventId: message.lastEventId,
        services,
        parent: traceParent(message.trace),
      });
      if (!live()) return;
      if (Exit.isFailure(exit)) {
        const err = normalizeCause(exit.cause);
        core.report(err, request, path, type);
        sendError(id, err);
        return;
      }
      if (type === 'subscription') {
        const done = await Effect.runPromiseExit(
          emitEvents(
            exit.value as Stream.Stream<unknown, AnyTrpcError>,
            core.serializer,
            coerceError(path, type),
            (frame) => {
              if (live()) conn.send(frameMessage(id, frame));
            },
          ),
          { signal },
        );
        if (!live()) return;
        if (Exit.isFailure(done)) {
          if (parked) opts.unpark?.(id);
          const err = normalizeCause(done.cause);
          core.report(err, request, path, type);
          sendError(id, err);
          return;
        }
        if (!parked) conn.send({ id, type: 'done' });
        return;
      }
      const serialized = core.serializer.serializeDeferred(exit.value, {
        coerceError: coerceError(path, type),
      });
      if (!serialized.chunks) {
        conn.send({ id, type: 'result', body: serialized.head });
        return;
      }
      conn.send({ id, type: 'result', body: serialized.head, deferred: true });
      await Effect.runPromiseExit(
        Stream.runForEach(serialized.chunks, (chunk) =>
          Effect.sync(() => {
            if (live()) conn.send({ id, type: 'chunk', chunk });
          }),
        ),
        { signal },
      );
      if (live()) conn.send({ id, type: 'done' });
    } catch (cause) {
      if (!live()) return;
      const err = isTrpcError(cause) ? cause : unexpectedError(cause);
      core.report(err, request, path, type);
      sendError(id, err);
    } finally {
      if (calls.get(id) === controller) calls.delete(id);
    }
  }

  return { receive, close };
}
