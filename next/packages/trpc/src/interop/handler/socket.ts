import { Cause, Effect, Exit, FiberMap, Stream, type Duration } from 'effect';
import type { HttpServerRequest } from 'effect/http';
import type { Socket } from 'effect/socket';
import { interruptSignal } from '../../internal/effects.ts';
import { TrpcError, type AnyTrpcError } from '../../internal/error.ts';
import type { ProcedureType } from '../../internal/types.ts';
import {
  createResponseHandle,
  normalizeCause,
} from '../../server/execution/index.ts';
import { resolveProcedureEffect } from '../../server/procedures/index.ts';
import {
  runSocket,
  socketFrames,
  type SocketOutbox,
  type SocketSession,
  parseSocketMessage,
} from '../../server/sockets/index.ts';
import { isTracked } from '../../server/subscriptions/index.ts';
import { BATCH_TOO_LARGE } from './errors.ts';
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
    readonly idleTimeout: Duration.Duration | undefined;
  },
): Effect.Effect<void> =>
  runSocket({
    socket,
    frames: socketFrames(socket),
    idleTimeout: opts.idleTimeout,
    open: (outbox) =>
      Effect.gen(function* () {
        const calls = yield* FiberMap.make<RequestId, void, never>();
        // Closed before its calls are interrupted, so no `stopped` result
        // goes out: `wsLink` would end those subscriptions instead of
        // resending them with their `lastEventId` once it reconnects.
        const close = Effect.andThen(
          Effect.sync(() => outbox.close(1012, 'Service restart')),
          FiberMap.clear(calls),
        );
        const leave = core.drains.add(() => close);
        if (leave) yield* Effect.addFinalizer(() => Effect.sync(leave));
        else yield* close;
        return v11Session(core, outbox, calls, opts);
      }),
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
  ) =>
    Effect.suspend(() => {
      base.report(err, request, path, type === 'unknown' ? undefined : type);
      return send({
        ...envelope(id, jsonrpc),
        error: output.serialize(core.errorShape(err, path, type)),
      });
    });

  /** Its signal aborts when `subscription.stop` or a closed socket interrupts it. */
  const call = (
    id: RequestId,
    jsonrpc: unknown,
    method: ProcedureType,
    params: Record<string, unknown>,
  ): Effect.Effect<void> => {
    const path = typeof params['path'] === 'string' ? params['path'] : '';
    const head = envelope(id, jsonrpc);
    const callParams = connectionParams;
    return Effect.flatMap(interruptSignal(), (interrupt) =>
      Effect.gen(function* () {
        const procedure = yield* resolveProcedureEffect(core.router, path);
        // v11's sockets answer a missing path and a wrong type alike.
        if (!procedure || procedure['~trpc'].type !== method) {
          return yield* Effect.fail(
            new TrpcError.NotFound({
              message: `No "${method}"-procedure on path "${path}"`,
            }),
          );
        }
        const callInput = yield* Effect.try({
          try: () =>
            params['input'] === undefined
              ? undefined
              : (core.input.deserialize(params['input']) as unknown),
          catch: (cause) =>
            new TrpcError.ParseError({ message: 'Invalid input', cause }),
        });
        const lastEventId =
          typeof params['lastEventId'] === 'string'
            ? params['lastEventId']
            : inputEventId(callInput);
        const ctx = yield* base.makeContext({
          request,
          platform: opts.platform,
          calls: [{ path, type: method }],
          signal: interrupt.signal,
          transport: 'websocket',
          connectionParams: callParams,
        });
        const exit = yield* base.run({
          request,
          procedure,
          path,
          ctx,
          input: callInput,
          signal: interrupt.signal,
          response: createResponseHandle(),
          lastEventId,
        });
        if (Exit.isFailure(exit)) {
          return yield* Effect.fail(normalizeCause(exit.cause));
        }
        if (method !== 'subscription') {
          const data = yield* core.settle(exit.value);
          yield* send({
            ...head,
            result: { type: 'data', data: output.serialize(data) },
          });
          return;
        }
        yield* send({ ...head, result: { type: 'started' } });
        yield* Stream.runForEach(
          // Aborts before the stream's finalizers run: a resolver awaiting its
          // signal returns only after it aborts.
          interrupt.abortOnInterrupt(
            exit.value as Stream.Stream<unknown, AnyTrpcError>,
          ),
          (event) =>
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
        ).pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.failCause(cause)
              : sendError(id, jsonrpc, normalizeCause(cause), path, method),
          ),
          Effect.ensuring(send({ ...head, result: { type: 'stopped' } })),
        );
      }).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : sendError(id, jsonrpc, normalizeCause(cause), path, method),
        ),
        (self) => interrupt.abortOnInterrupt(self),
      ),
    ) as Effect.Effect<void>;
  };

  const receive = (message: unknown): Effect.Effect<void> => {
    if (!isRecord(message)) {
      return sendError(
        null,
        undefined,
        new TrpcError.ParseError({ message: 'Invalid message' }),
      );
    }
    const { id, jsonrpc, method } = message;
    if (method === 'connectionParams') {
      connectionParams = isRecord(message['data'])
        ? message['data']
        : undefined;
      return Effect.void;
    }
    if (typeof id !== 'number' && typeof id !== 'string') {
      return sendError(
        null,
        jsonrpc,
        new TrpcError.ParseError({ message: '`id` is required' }),
      );
    }
    if (method === 'subscription.stop') return FiberMap.remove(calls, id);
    if (typeof method !== 'string' || !METHODS.has(method)) {
      return sendError(
        id,
        jsonrpc,
        new TrpcError.ParseError({
          message: `Unknown method "${String(method)}"`,
        }),
      );
    }
    if (FiberMap.hasUnsafe(calls, id)) {
      return sendError(
        id,
        jsonrpc,
        new TrpcError.BadRequest({ message: `Duplicate id ${id}` }),
      );
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

  /**
   * Refuses a message with more calls than `batch.maxItems`, none of them
   * run, as v11 refuses an HTTP batch over `maxBatchSize`: its error, for
   * each request's id so `wsLink` settles them, or once with id null.
   */
  const tooLarge = (messages: ReadonlyArray<unknown>): Effect.Effect<void> =>
    Effect.suspend(() => {
      const err = new TrpcError.BadRequest({ message: BATCH_TOO_LARGE });
      base.report(err, request, undefined, undefined);
      const error = output.serialize(
        core.errorShape(err, undefined, 'unknown'),
      );
      const requests = messages.filter(
        (m): m is Record<string, unknown> =>
          isRecord(m) &&
          (typeof m['id'] === 'number' || typeof m['id'] === 'string') &&
          typeof m['method'] === 'string' &&
          METHODS.has(m['method']),
      );
      return requests.length === 0
        ? send({ id: null, error })
        : Effect.forEach(
            requests,
            (m) =>
              send({ ...envelope(m['id'] as RequestId, m['jsonrpc']), error }),
            { discard: true },
          );
    });

  return {
    frame: (data) =>
      Effect.suspend(() => {
        if (data === 'PING') return outbox.send('PONG');
        if (data === 'PONG') return Effect.void;
        const parsed = parseSocketMessage(data);
        if (parsed === undefined) {
          return sendError(
            null,
            undefined,
            new TrpcError.ParseError({ message: 'Invalid JSON' }),
          );
        }
        if (Array.isArray(parsed) && parsed.length > core.maxSocketBatch) {
          return tooLarge(parsed);
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
