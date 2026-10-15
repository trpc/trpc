import { Effect, Exit, Stream } from 'effect';
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
import type { Serializer } from '../serializer/index.ts';
import { emitEvents } from './events.ts';
import {
  createResponseHandle,
  normalizeCause,
  unexpectedError,
} from './execute.ts';
import type { ResponseHandle } from './middleware.ts';
import type { AnyProcedure } from './procedure.ts';
import { getProcedure, type AnyRouter } from './router.ts';

/**
 * The parts of a standard `WebSocket` the handler uses: the server-side
 * socket of Deno, Bun, Cloudflare (`WebSocketPair`, after `accept()`) or
 * `trpcdev/http`'s upgrade.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: any) => void): void;
}

/**
 * A `MessagePort`, a `Worker`, a `worker_threads` port or anything with
 * `postMessage` and a `message` event.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type Transport = 'http' | 'websocket' | 'messagePort';

/** What the fetch handler shares with socket connections. @internal */
export interface SocketCore {
  readonly router: AnyRouter;
  readonly serializer: Serializer;
  run(opts: {
    procedure: AnyProcedure;
    path: string;
    ctx: object;
    input: unknown;
    signal: AbortSignal;
    response: ResponseHandle;
    lastEventId?: string | undefined;
  }): Promise<Exit.Exit<unknown, AnyTrpcError>>;
  makeContext(opts: {
    request: Request;
    calls: ReadonlyArray<{ path: string; type: ProcedureType }>;
    signal: AbortSignal;
    transport: Transport;
    connectionParams: Record<string, unknown> | undefined;
  }): Promise<object>;
  deserializeInput(value: unknown): unknown;
  publicError(err: AnyTrpcError): AnyTrpcError;
  report(
    err: AnyTrpcError,
    request: Request,
    path?: string,
    type?: ProcedureType,
  ): void;
}

/** A connection, whatever carries it. @internal */
export interface Connection {
  send(message: ServerMessage): void;
  onMessage(listener: (message: unknown) => void): void;
  onClose(listener: () => void): void;
  close(code: number, reason: string): void;
}

const OPEN = 1;

/** @internal */
export function webSocketConnection(socket: WebSocketLike): Connection {
  return {
    send(message) {
      if (socket.readyState === OPEN) socket.send(JSON.stringify(message));
    },
    onMessage(listener) {
      socket.addEventListener('message', (event: { data: unknown }) => {
        if (typeof event.data !== 'string') {
          listener(undefined);
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          parsed = undefined;
        }
        listener(parsed);
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
  opts: { request: Request; transport: Transport },
): void {
  const { request, transport } = opts;
  const calls = new Map<number, AbortController>();
  let connectionParams: Record<string, unknown> | undefined;
  let closed = false;

  const wire = (err: AnyTrpcError) =>
    core.serializer.serialize(toWireError(core.publicError(err)));
  const coerceError =
    (path: string, type: ProcedureType) => (cause: unknown) => {
      const err = isTrpcError(cause) ? cause : unexpectedError(cause);
      core.report(err, request, path, type);
      return toWireError(core.publicError(err));
    };
  const sendError = (id: number | null, err: AnyTrpcError) =>
    conn.send({ id, type: 'error', status: err.status, body: wire(err) });

  conn.onClose(() => {
    closed = true;
    for (const controller of calls.values()) controller.abort();
    calls.clear();
  });

  conn.onMessage((raw) => {
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
        return;
      }
      case 'abort': {
        calls.get(message.id)?.abort();
        calls.delete(message.id);
        return;
      }
      case 'request': {
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
  });

  async function handle(
    message: Extract<ClientMessage, { type: 'request' }>,
  ): Promise<void> {
    const { id, path } = message;
    const controller = new AbortController();
    calls.set(id, controller);
    const { signal } = controller;
    const live = () => !signal.aborted && !closed;
    const procedure = getProcedure(core.router, path);
    const type = procedure?.['~trpc'].type;
    try {
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
        calls: [{ path, type }],
        signal,
        transport,
        connectionParams,
      });
      const exit = await core.run({
        procedure,
        path,
        ctx,
        input,
        signal,
        response: createResponseHandle(),
        lastEventId: message.lastEventId,
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
              if (!live()) return;
              if (frame.kind === 'event') {
                conn.send({
                  id,
                  type: 'event',
                  body: frame.body,
                  ...(frame.eventId === undefined
                    ? {}
                    : { eventId: frame.eventId }),
                  ...(frame.deferred === undefined
                    ? {}
                    : { deferred: frame.deferred }),
                });
              } else if (frame.kind === 'chunk') {
                conn.send({
                  id,
                  type: 'chunk',
                  event: frame.event,
                  chunk: frame.chunk,
                });
              } else {
                conn.send({ id, type: 'chunkEnd', event: frame.event });
              }
            },
          ),
          { signal },
        );
        if (!live()) return;
        if (Exit.isFailure(done)) {
          const err = normalizeCause(done.cause);
          core.report(err, request, path, type);
          sendError(id, err);
          return;
        }
        conn.send({ id, type: 'done' });
        return;
      }
      const { head, chunks } = core.serializer.serializeDeferred(exit.value, {
        coerceError: coerceError(path, type),
      });
      if (!chunks) {
        conn.send({ id, type: 'result', body: head });
        return;
      }
      conn.send({ id, type: 'result', body: head, deferred: true });
      await Effect.runPromiseExit(
        Stream.runForEach(chunks, (chunk) =>
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
}
