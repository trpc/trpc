import { Cause, Effect, Exit, FiberMap, Stream } from 'effect';
import type { HttpServerRequest } from 'effect/http';
import type { Socket } from 'effect/socket';
import {
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import type { ProcedureType } from '../internal/types.ts';
import {
  createResponseHandle,
  normalizeCause,
  unexpectedError,
} from '../server/execute.ts';
import { resolveProcedure } from '../server/router.ts';
import {
  runSocket,
  socketFrames,
  type SocketOutbox,
  type SocketSession,
} from '../server/socket-session.ts';
import { parseSocketMessage } from '../server/socket.ts';
import { isTracked } from '../server/subscriptions/index.ts';
import type { V11Core } from './handler.ts';

type RequestId = number | string;

const METHODS = new Set(['query', 'mutation', 'subscription']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Where v11 clients put the last event's id when they reconnect. @internal */
export const inputEventId = (value: unknown): string | undefined =>
  isRecord(value) && typeof value['lastEventId'] === 'string'
    ? value['lastEventId']
    : undefined;

/**
 * v11's `wsLink` protocol over `socket`, until it closes: JSON-RPC-style
 * requests, `started`, `data` and `stopped` results, `subscription.stop`,
 * `PING`/`PONG` and a `connectionParams` message. Each request gets its
 * own `createContext`, like a v12 socket call. The connection's calls run
 * in one `FiberMap` in the session's scope, so `subscription.stop` and a
 * closed socket interrupt them.
 * @internal
 */
export const serveV11Socket = (
  core: V11Core,
  socket: Socket.Socket,
  opts: {
    readonly request: HttpServerRequest.HttpServerRequest;
    readonly platform: unknown;
    readonly idleTimeoutMs: number | false;
  },
): Effect.Effect<void> =>
  runSocket({
    socket,
    frames: socketFrames(socket),
    idleTimeoutMs: opts.idleTimeoutMs,
    open: (outbox) =>
      Effect.map(FiberMap.make<RequestId, void, never>(), (calls) =>
        v11Session(core, outbox, calls, opts),
      ),
  });

function v11Session(
  core: V11Core,
  outbox: SocketOutbox,
  calls: FiberMap.FiberMap<RequestId, void, never>,
  opts: {
    readonly request: HttpServerRequest.HttpServerRequest;
    readonly platform: unknown;
  },
): SocketSession<string | Uint8Array> {
  const { base, output } = core;
  const { request } = opts;
  let connectionParams: Record<string, unknown> | undefined;

  const send = (message: unknown) => outbox.send(JSON.stringify(message));
  const envelope = (id: RequestId | null, jsonrpc: unknown) => ({
    id,
    ...(jsonrpc === '2.0' ? { jsonrpc } : {}),
  });
  const sendError = (
    id: RequestId | null,
    jsonrpc: unknown,
    err: AnyTrpcError,
    path?: string,
    type: ProcedureType | 'unknown' = 'unknown',
  ) => {
    base.report(err, request, path, type === 'unknown' ? undefined : type);
    send({
      ...envelope(id, jsonrpc),
      error: output.serialize(core.errorShape(err, path, type)),
    });
  };

  const call = (
    id: RequestId,
    jsonrpc: unknown,
    method: ProcedureType,
    params: Record<string, unknown>,
  ): Effect.Effect<void> => {
    const path = typeof params['path'] === 'string' ? params['path'] : '';
    const lastEventId =
      typeof params['lastEventId'] === 'string'
        ? params['lastEventId']
        : inputEventId(params['input']);
    const head = envelope(id, jsonrpc);
    const callParams = connectionParams;
    return Effect.gen(function* () {
      const procedure = yield* Effect.promise(async () =>
        resolveProcedure(core.router, path),
      );
      if (!procedure) {
        return yield* Effect.fail(
          new TrpcError({
            code: 'NOT_FOUND',
            message: `No procedure found on path "${path}"`,
          }),
        );
      }
      const type = procedure['~trpc'].type;
      if (type !== method) {
        return yield* Effect.fail(
          new TrpcError({
            code: 'METHOD_NOT_SUPPORTED',
            message: `"${path}" is a ${type}, not a ${method}`,
          }),
        );
      }
      const callInput = yield* Effect.try({
        try: () =>
          params['input'] === undefined
            ? undefined
            : (core.input.deserialize(params['input']) as unknown),
        catch: (cause) =>
          new TrpcError({
            code: 'PARSE_ERROR',
            message: 'Invalid input',
            cause,
          }),
      });
      const exit = yield* Effect.tryPromise({
        try: async (signal) => {
          const ctx = await base.makeContext({
            request,
            platform: opts.platform,
            calls: [{ path, type }],
            signal,
            transport: 'websocket',
            connectionParams: callParams,
          });
          return base.run({
            request,
            procedure,
            path,
            ctx,
            input: callInput,
            signal,
            response: createResponseHandle(),
            lastEventId,
          });
        },
        catch: (cause) => (isTrpcError(cause) ? cause : unexpectedError(cause)),
      });
      if (Exit.isFailure(exit)) {
        return yield* Effect.fail(normalizeCause(exit.cause));
      }
      if (type !== 'subscription') {
        const data = yield* core.settle(exit.value);
        send({
          ...head,
          result: { type: 'data', data: output.serialize(data) },
        });
        return;
      }
      send({ ...head, result: { type: 'started' } });
      yield* Stream.runForEach(
        exit.value as Stream.Stream<unknown, AnyTrpcError>,
        (event) =>
          Effect.sync(() =>
            send({
              ...head,
              result: isTracked(event)
                ? {
                    type: 'data',
                    id: event.id,
                    data: output.serialize({ id: event.id, data: event.data }),
                  }
                : { type: 'data', data: output.serialize(event) },
            }),
          ),
      ).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.sync(() =>
                sendError(id, jsonrpc, normalizeCause(cause), path, type),
              ),
        ),
        Effect.ensuring(
          Effect.sync(() => send({ ...head, result: { type: 'stopped' } })),
        ),
      );
    }).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.sync(() =>
              sendError(id, jsonrpc, normalizeCause(cause), path, method),
            ),
      ),
    ) as Effect.Effect<void>;
  };

  const receive = (message: unknown): Effect.Effect<void> => {
    if (!isRecord(message)) {
      sendError(
        null,
        undefined,
        new TrpcError({ code: 'PARSE_ERROR', message: 'Invalid message' }),
      );
      return Effect.void;
    }
    const { id, jsonrpc, method } = message;
    if (method === 'connectionParams') {
      connectionParams = isRecord(message['data'])
        ? message['data']
        : undefined;
      return Effect.void;
    }
    if (typeof id !== 'number' && typeof id !== 'string') {
      sendError(
        null,
        jsonrpc,
        new TrpcError({ code: 'PARSE_ERROR', message: '`id` is required' }),
      );
      return Effect.void;
    }
    if (method === 'subscription.stop') return FiberMap.remove(calls, id);
    if (typeof method !== 'string' || !METHODS.has(method)) {
      sendError(
        id,
        jsonrpc,
        new TrpcError({
          code: 'PARSE_ERROR',
          message: `Unknown method "${String(method)}"`,
        }),
      );
      return Effect.void;
    }
    if (FiberMap.hasUnsafe(calls, id)) {
      sendError(
        id,
        jsonrpc,
        new TrpcError({ code: 'BAD_REQUEST', message: `Duplicate id ${id}` }),
      );
      return Effect.void;
    }
    return Effect.asVoid(
      FiberMap.run(
        calls,
        id,
        call(
          id,
          jsonrpc,
          method as ProcedureType,
          isRecord(message['params']) ? message['params'] : {},
        ),
      ),
    );
  };

  return {
    frame: (data) =>
      Effect.suspend(() => {
        if (data === 'PING') {
          outbox.send('PONG');
          return Effect.void;
        }
        if (data === 'PONG') return Effect.void;
        const parsed = parseSocketMessage(data);
        if (parsed === undefined) {
          sendError(
            null,
            undefined,
            new TrpcError({ code: 'PARSE_ERROR', message: 'Invalid JSON' }),
          );
          return Effect.void;
        }
        return Effect.forEach(
          Array.isArray(parsed) ? parsed : [parsed],
          (message) => Effect.suspend(() => receive(message)),
          { discard: true },
        );
      }),
    close: () => FiberMap.clear(calls),
  };
}
