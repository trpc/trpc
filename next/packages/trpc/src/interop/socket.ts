import { Cause, Effect, Exit, FiberMap, Scope, Stream } from 'effect';
import type { HttpServerRequest } from 'effect/http';
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
import { parseSocketMessage, type WebSocketLike } from '../server/socket.ts';
import { isTracked } from '../server/tracked.ts';
import type { V11Core } from './handler.ts';

type RequestId = number | string;

const OPEN = 1;
const METHODS = new Set(['query', 'mutation', 'subscription']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Where v11 clients put the last event's id when they reconnect. @internal */
export const inputEventId = (value: unknown): string | undefined =>
  isRecord(value) && typeof value['lastEventId'] === 'string'
    ? value['lastEventId']
    : undefined;

/**
 * v11's `wsLink` protocol over `socket`: JSON-RPC-style requests, `started`,
 * `data` and `stopped` results, `subscription.stop`, `PING`/`PONG` and a
 * `connectionParams` message. Each request gets its own `createContext`,
 * like a v12 socket call. The connection's calls run in one `FiberMap`, so
 * `subscription.stop` and a closed socket interrupt them.
 * @internal
 */
export function serveV11Socket(
  core: V11Core,
  socket: WebSocketLike,
  opts: {
    readonly request: HttpServerRequest.HttpServerRequest;
    readonly platform: unknown;
    readonly idleTimeoutMs: number | false;
  },
): void {
  const { base, output } = core;
  const { request } = opts;
  let connectionParams: Record<string, unknown> | undefined;
  const scope = Scope.makeUnsafe();
  const calls = Effect.runSync(
    FiberMap.make<RequestId, void, never>().pipe(Scope.provide(scope)),
  );
  const fork = Effect.runSync(FiberMap.runtime(calls)<never>());

  const send = (message: unknown) => {
    if (socket.readyState === OPEN) socket.send(JSON.stringify(message));
  };
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

  const receive = (message: unknown) => {
    if (!isRecord(message)) {
      sendError(
        null,
        undefined,
        new TrpcError({ code: 'PARSE_ERROR', message: 'Invalid message' }),
      );
      return;
    }
    const { id, jsonrpc, method } = message;
    if (method === 'connectionParams') {
      connectionParams = isRecord(message['data'])
        ? message['data']
        : undefined;
      return;
    }
    if (typeof id !== 'number' && typeof id !== 'string') {
      sendError(
        null,
        jsonrpc,
        new TrpcError({ code: 'PARSE_ERROR', message: '`id` is required' }),
      );
      return;
    }
    if (method === 'subscription.stop') {
      Effect.runFork(FiberMap.remove(calls, id));
      return;
    }
    if (typeof method !== 'string' || !METHODS.has(method)) {
      sendError(
        id,
        jsonrpc,
        new TrpcError({
          code: 'PARSE_ERROR',
          message: `Unknown method "${String(method)}"`,
        }),
      );
      return;
    }
    if (FiberMap.hasUnsafe(calls, id)) {
      sendError(
        id,
        jsonrpc,
        new TrpcError({ code: 'BAD_REQUEST', message: `Duplicate id ${id}` }),
      );
      return;
    }
    fork(
      id,
      call(
        id,
        jsonrpc,
        method as ProcedureType,
        isRecord(message['params']) ? message['params'] : {},
      ),
    );
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (opts.idleTimeoutMs === false) return;
    clearTimeout(timer);
    timer = setTimeout(
      () => socket.close(1001, 'Idle timeout'),
      opts.idleTimeoutMs,
    );
  };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    Effect.runFork(Scope.close(scope, Exit.void));
  };
  socket.addEventListener('close', close);
  socket.addEventListener('error', close);
  socket.addEventListener('message', (event: { data: unknown }) => {
    if (closed) return;
    arm();
    if (event.data === 'PING') {
      if (socket.readyState === OPEN) socket.send('PONG');
      return;
    }
    if (event.data === 'PONG') return;
    const parsed = parseSocketMessage(event.data);
    if (parsed === undefined) {
      sendError(
        null,
        undefined,
        new TrpcError({ code: 'PARSE_ERROR', message: 'Invalid JSON' }),
      );
      return;
    }
    for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
      receive(message);
    }
  });
  arm();
}
