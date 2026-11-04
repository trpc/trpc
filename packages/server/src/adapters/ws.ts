import type { IncomingMessage } from 'http';
import type { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import type {
  AnyRouter,
  CreateContextCallback,
  inferRouterContext,
} from '../@trpc/server';
import {
  callTRPCProcedure,
  getErrorShape,
  getTRPCErrorFromUnknown,
  transformTRPCResponse,
  TRPCError,
} from '../@trpc/server';
import type { TRPCRequestInfo } from '../@trpc/server/http';
import { type BaseHandlerOptions } from '../@trpc/server/http';
import { parseTRPCMessage } from '../@trpc/server/rpc';
// @trpc/server/rpc
import type {
  TRPCClientOutgoingMessage,
  TRPCReconnectNotification,
  TRPCRequestMessage,
  TRPCResponseMessage,
} from '../@trpc/server/rpc';
import { parseConnectionParamsFromUnknown } from '../http';
import { isObservable, observableToAsyncIterable } from '../observable';
// oxlint-disable-next-line no-restricted-imports
import {
  isAbortError,
  isAsyncIterable,
  isObject,
  isTrackedEnvelope,
  makeResource,
  run,
  type MaybePromise,
} from '../unstable-core-do-not-import';
// oxlint-disable-next-line no-restricted-imports
import type { Result } from '../unstable-core-do-not-import';
// oxlint-disable-next-line no-restricted-imports
import { iteratorResource } from '../unstable-core-do-not-import/stream/utils/asyncIterable';
// oxlint-disable-next-line no-restricted-imports
import { timerResource } from '../unstable-core-do-not-import/stream/utils/timerResource';
import { Unpromise } from '../vendor/unpromise';
import { createURL, type NodeHTTPCreateContextFnOptions } from './node-http';
import type { Encoder } from './wsEncoder';
import { jsonEncoder } from './wsEncoder';

/**
 * Importing ws causes a build error
 * @see https://github.com/trpc/trpc/pull/5279
 */
const WEBSOCKET_OPEN = 1; /* ws.WebSocket.OPEN */

const OK: Result<void> = { ok: true, value: undefined };

/** Runs `fn`, with what it throws returned as an error. */
function attempt<TValue>(fn: () => TValue): Result<TValue> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

function settle<TValue>(promise: Promise<TValue>): Promise<Result<TValue>> {
  return promise.then(
    (value): Result<TValue> => ({ ok: true, value }),
    (error: unknown): Result<TValue> => ({ ok: false, error }),
  );
}

/**
 * An `AbortController` that aborts when it's disposed.
 */
function abortControllerResource() {
  const controller = new AbortController();
  // `abort()` builds an AbortError with a stack trace even when the signal is
  // already aborted, which is the common case when a subscription ends.
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };
  return makeResource({ signal: controller.signal, abort }, abort);
}

/**
 * Resolves once `signal` aborts. Disposing it removes the listener.
 */
function abortedResource(signal: AbortSignal) {
  let onAbort!: () => void;
  const promise = new Promise<SubscriptionStep>((resolve) => {
    onAbort = () => resolve(STOPPED);
  });
  signal.addEventListener('abort', onAbort, { once: true });
  return makeResource({ promise }, () => {
    signal.removeEventListener('abort', onAbort);
  });
}

/**
 * Resolves with what happens first on `client`: a message, the connection
 * closing, or `ms` passing. Disposing it removes the listeners and the timer.
 */
async function nextActivity(
  client: WsWebSocket,
  ms: number,
): Promise<'message' | 'close' | 'timeout'> {
  using timer = timerResource(ms);
  let onMessage!: () => void;
  let onClose!: () => void;
  const activity = new Promise<'message' | 'close'>((resolve) => {
    onMessage = () => resolve('message');
    onClose = () => resolve('close');
  });
  client.once('message', onMessage);
  client.once('close', onClose);
  using _listeners = makeResource({}, () => {
    client.off('message', onMessage);
    client.off('close', onClose);
  });
  return await Promise.race([
    activity,
    timer.start().then(() => 'timeout' as const),
  ]);
}

/** A subscription's claim on its id. Disposing it frees the id. */
type SubscriptionRegistration = Disposable & {
  signal: AbortSignal;
  abort: () => void;
};

/**
 * The subscriptions a connection is serving, by id. Disposing it stops them
 * all.
 */
function subscriptionsResource() {
  const active = new Map<number | string, { abort: () => void }>();
  return makeResource(
    {
      stop: (id: number | string) => active.get(id)?.abort(),
      /**
       * Claims `id` for a subscription until the returned resource is
       * disposed. An id that's already claimed is refused, so a running
       * subscription can't be replaced and lose its way to be stopped.
       */
      register(
        id: number | string,
      ): Result<SubscriptionRegistration, TRPCError> {
        if (active.has(id)) {
          return {
            ok: false,
            error: new TRPCError({
              message: `Duplicate id ${id}`,
              code: 'BAD_REQUEST',
            }),
          };
        }
        const controller = abortControllerResource();
        // A new object, so disposing the registration doesn't abort it.
        const subscription = {
          signal: controller.signal,
          abort: controller.abort,
        };
        active.set(id, subscription);
        return {
          ok: true,
          value: makeResource(subscription, () => {
            if (active.get(id) === subscription) {
              active.delete(id);
            }
          }),
        };
      },
    },
    () => {
      for (const subscription of active.values()) {
        subscription.abort();
      }
      active.clear();
    },
  );
}

/**
 * A procedure that gives up because its subscription was cancelled rejects
 * with an `AbortError`, which is wrapped as an INTERNAL_SERVER_ERROR.
 */
function isCancelledSetup(error: TRPCError, signal: AbortSignal) {
  return (
    signal.aborted &&
    error.code === 'INTERNAL_SERVER_ERROR' &&
    isAbortError(error.cause)
  );
}

/**
 * `iterator.next()` for a subscription loop that races it against the
 * subscription's `signal`, as the loop's next step.
 *
 * Once the subscription is stopped, the loop doesn't wait for this call, so a
 * rejection after the stop, such as a teardown that throws, goes to
 * `onErrorAfterStop`. An `AbortError` is how a stopped subscription is
 * expected to end, and isn't reported.
 */
async function nextUnlessStopped(
  iterator: AsyncIterator<unknown>,
  signal: AbortSignal,
  onErrorAfterStop: (error: TRPCError) => void,
): Promise<SubscriptionStep> {
  try {
    const next = await iterator.next();
    return next.done ? COMPLETED : { kind: 'data', value: next.value };
  } catch (cause) {
    const error = getTRPCErrorFromUnknown(cause);
    if (!signal.aborted) {
      return { kind: 'failed', error };
    }
    if (!isAbortError(error.cause)) {
      onErrorAfterStop(error);
    }
    return STOPPED;
  }
}

/**
 * What `createContext` gets in the WebSocket adapter: the upgrade request
 * as `req`, the socket as `res`, and `info`. It's called once per
 * connection.
 * @see https://trpc.io/docs/server/websockets#creating-a-websocket-server
 * @public
 */
export type CreateWSSContextFnOptions = NodeHTTPCreateContextFnOptions<
  IncomingMessage,
  WsWebSocket
>;

/**
 * The `createContext` function the WebSocket adapter takes.
 * @public
 */
export type CreateWSSContextFn<TRouter extends AnyRouter> = (
  opts: CreateWSSContextFnOptions,
) => MaybePromise<inferRouterContext<TRouter>>;

/** The options of `getWSConnectionHandler`. */
export type WSConnectionHandlerOptions<TRouter extends AnyRouter> =
  BaseHandlerOptions<TRouter, IncomingMessage> &
    CreateContextCallback<
      inferRouterContext<TRouter>,
      CreateWSSContextFn<TRouter>
    >;

/**
 * The options of `applyWSSHandler`.
 * @see https://trpc.io/docs/server/websockets#creating-a-websocket-server
 */
export type WSSHandlerOptions<TRouter extends AnyRouter> =
  WSConnectionHandlerOptions<TRouter> & {
    /** The `ws` server to serve the router on. */
    wss: WebSocketServer;
    /** Only connections whose URL starts with this are served. */
    prefix?: string;
    /**
     * Sends pings to each client and closes connections that stop
     * answering.
     */
    keepAlive?: {
      /**
       * Whether to send pings.
       * @default false
       */
      enabled: boolean;
      /**
       * How long a connection can be quiet before a ping, in milliseconds.
       * @default 30_000
       */
      pingMs?: number;
      /**
       * How long to wait for a pong before closing the connection, in
       * milliseconds.
       * @default 5_000
       */
      pongWaitMs?: number;
    };
    /**
     * Stops answering clients' pings. Meant for tests.
     * @default false
     */
    dangerouslyDisablePong?: boolean;
    /**
     * Encodes and decodes messages, for formats other than JSON.
     * Experimental: it may change in any release.
     * @default jsonEncoder
     */
    experimental_encoder?: Encoder;
  };

type Frame = string | Uint8Array;

/** A query, mutation or subscription call from the client. */
type ProcedureRequest = Pick<TRPCRequestMessage, 'jsonrpc'> & {
  id: number | string;
  type: TRPCRequestMessage['method'];
  path: string;
  input: unknown;
  batchIndex: number;
};

/**
 * The responses to one request. Each `yield` evaluates to whether the
 * response could be encoded and sent.
 */
type Replies = AsyncGenerator<TRPCResponseMessage, void, Result<void>>;

/** What an error is reported with: the request, if it's tied to one. */
type ErrorOrigin = {
  type: ProcedureRequest['type'] | 'unknown';
  path: string | undefined;
  input: unknown;
};

/** How a started subscription ended. */
type SubscriptionEnd =
  | { kind: 'completed' }
  | { kind: 'stopped' }
  | { kind: 'failed'; error: TRPCError };

/** What a started subscription does next: send a value, or end. */
type SubscriptionStep = SubscriptionEnd | { kind: 'data'; value: unknown };

const COMPLETED: SubscriptionEnd = { kind: 'completed' };
const STOPPED: SubscriptionEnd = { kind: 'stopped' };

function failed(cause: unknown): SubscriptionEnd {
  return { kind: 'failed', error: getTRPCErrorFromUnknown(cause) };
}

function dataResult(value: unknown) {
  if (isTrackedEnvelope(value)) {
    const [id, data] = value;
    return { type: 'data', data: { id, data }, id } as const;
  }
  return { type: 'data', data: value } as const;
}

/** What errors about a frame or the connection are reported with. */
const unknownRequest: ErrorOrigin = {
  type: 'unknown',
  path: undefined,
  input: undefined,
};

/**
 * Returns a `ws` connection listener that serves a router. `applyWSSHandler`
 * uses it; call it to attach tRPC to your own WebSocket server.
 */
export function getWSConnectionHandler<TRouter extends AnyRouter>(
  opts: WSSHandlerOptions<TRouter>,
) {
  const { createContext, router } = opts;
  const { transformer } = router._def._config;
  const encoder = opts.experimental_encoder ?? jsonEncoder;

  return (client: WsWebSocket, req: IncomingMessage) => {
    void serveConnection(client, req);
  };

  /**
   * Serves one connection until it closes. Closing it stops its
   * subscriptions and aborts the `signal` its context got.
   */
  async function serveConnection(client: WsWebSocket, req: IncomingMessage) {
    type Context = inferRouterContext<TRouter>;
    type ContextResult = Result<Context, TRPCError>;

    using connection = abortControllerResource();
    using subscriptions = subscriptionsResource();

    /** The connection's context, once `createContext` has resolved. */
    let ctx: Context | undefined = undefined;

    if (opts.keepAlive?.enabled) {
      const { pingMs, pongWaitMs } = opts.keepAlive;
      handleKeepAlive(client, pingMs, pongWaitMs);
    }

    function respond(untransformedJSON: TRPCResponseMessage) {
      client.send(
        encoder.encode(
          transformTRPCResponse(router._def._config, untransformedJSON),
        ),
      );
    }

    function trySend(response: TRPCResponseMessage) {
      return attempt(() => respond(response));
    }

    /**
     * Reports `cause` to `onError`. Errors are reported from listeners and
     * from promises nothing awaits, where a throw would crash the process,
     * so an `onError` that throws is ignored.
     */
    function reportError(request: ErrorOrigin, cause: unknown) {
      const error = getTRPCErrorFromUnknown(cause);
      attempt(() =>
        opts.onError?.({
          error,
          path: request.path,
          type: request.type,
          ctx,
          req,
          input: request.input,
        }),
      );
      return error;
    }

    /**
     * Sends a response that nothing can retry, reporting it if it can't be
     * built or sent.
     */
    function sendOrReport(
      request: ErrorOrigin,
      response: () => TRPCResponseMessage,
    ) {
      const sent = attempt(() => respond(response()));
      if (!sent.ok) {
        reportError(request, sent.error);
      }
    }

    /** Reports `cause` to `onError`, and returns the response it gets. */
    function errorResponse(
      request: ErrorOrigin & Pick<TRPCRequestMessage, 'id' | 'jsonrpc'>,
      cause: unknown,
    ): TRPCResponseMessage {
      const error = reportError(request, cause);
      return {
        id: request.id,
        jsonrpc: request.jsonrpc,
        error: getErrorShape({
          config: router._def._config,
          error,
          type: request.type,
          path: request.path,
          input: request.input,
          ctx,
        }),
      };
    }

    function connectionErrorShape(error: TRPCError) {
      return getErrorShape({
        config: router._def._config,
        error,
        type: 'unknown',
        path: undefined,
        input: undefined,
        ctx,
      });
    }

    /** The response to a frame the connection can't tie to a request. */
    function connectionErrorResponse(error: TRPCError): TRPCResponseMessage {
      return { id: null, error: connectionErrorShape(error) };
    }

    async function createConnectionContext(
      getConnectionParams: () => TRPCRequestInfo['connectionParams'],
    ): Promise<ContextResult> {
      const created = await settle(
        run(async () =>
          createContext?.({
            req,
            res: client,
            info: {
              connectionParams: getConnectionParams(),
              calls: [],
              isBatchCall: false,
              accept: null,
              type: 'unknown',
              signal: connection.signal,
              url: null,
            },
          }),
        ),
      );
      if (created.ok) {
        ctx = created.value;
        return { ok: true, value: created.value };
      }
      const error = reportError(unknownRequest, created.error);
      sendOrReport(unknownRequest, () => connectionErrorResponse(error));

      // close in next tick
      (globalThis.setImmediate ?? globalThis.setTimeout)(() => {
        client.close();
      });
      return { ok: false, error };
    }

    /** The connection params in the first frame of the connection. */
    function connectionParamsIn(frame: Frame) {
      return () => {
        const msg = attempt(() => encoder.decode(frame));
        if (!msg.ok || !isObject(msg.value)) {
          throw new TRPCError({
            code: 'PARSE_ERROR',
            message: `Malformed TRPCConnectionParamsMessage`,
            cause: msg.ok ? new Error('Message was not an object') : msg.error,
          });
        }
        return parseConnectionParamsFromUnknown(msg.value['data']);
      };
    }

    /**
     * The requests in a frame, or, if it's rejected as a whole, the
     * responses that say why.
     */
    function decodeRequests(
      frame: Frame,
    ): Result<TRPCClientOutgoingMessage[], TRPCResponseMessage[]> {
      const decoded = attempt(() => encoder.decode(frame));
      if (
        decoded.ok &&
        Array.isArray(decoded.value) &&
        typeof opts.maxBatchSize === 'number' &&
        decoded.value.length > opts.maxBatchSize
      ) {
        return { ok: false, error: oversizedBatchResponses(decoded.value) };
      }
      const parsed = decoded.ok
        ? attempt(() =>
            (Array.isArray(decoded.value)
              ? (decoded.value as unknown[])
              : [decoded.value]
            ).map((raw) => parseTRPCMessage(raw, transformer)),
          )
        : decoded;
      if (!parsed.ok) {
        const error = new TRPCError({
          code: 'PARSE_ERROR',
          cause: parsed.error,
        });
        return { ok: false, error: [connectionErrorResponse(error)] };
      }
      return parsed;
    }

    /**
     * Checked before parsing so that no input is deserialized. Every request
     * in the batch gets the error, as a batched HTTP call does, so that
     * clients do not wait for a response forever.
     */
    function oversizedBatchResponses(batch: unknown[]): TRPCResponseMessage[] {
      const error = reportError(
        unknownRequest,
        new TRPCError({
          code: 'BAD_REQUEST',
          message: `Batch call exceeds maximum size`,
        }),
      );
      const errorShape = connectionErrorShape(error);
      const responses = batch.flatMap((raw): TRPCResponseMessage[] =>
        isObject(raw) &&
        raw['method'] !== 'subscription.stop' &&
        (typeof raw['id'] === 'number' || typeof raw['id'] === 'string')
          ? [
              {
                id: raw['id'],
                jsonrpc: raw['jsonrpc'] === '2.0' ? '2.0' : undefined,
                error: errorShape,
              },
            ]
          : [],
      );
      return responses.length > 0
        ? responses
        : [{ id: null, error: errorShape }];
    }

    /**
     * The frames the client sends, fed in one at a time by the `message`
     * listener. When the client sends connection params, the context is
     * created from the first frame; otherwise it's created right away. Every
     * other frame is a request or a batch of them.
     */
    function* receiveFrames(): Generator<void, never, Frame> {
      const getConnectionParams =
        createURL(req).searchParams.get('connectionParams') === '1'
          ? connectionParamsIn(yield)
          : () => null;
      const context = createConnectionContext(getConnectionParams);

      while (true) {
        const frame: Frame = yield;
        // A throw would end this generator, and the connection would
        // ignore every frame after it.
        const received = attempt(() => receiveFrame(frame, context));
        if (!received.ok) {
          reportError(unknownRequest, received.error);
        }
      }
    }

    function receiveFrame(frame: Frame, context: Promise<ContextResult>) {
      const requests = decodeRequests(frame);
      if (!requests.ok) {
        for (const response of requests.error) {
          sendOrReport(unknownRequest, () => response);
        }
        return;
      }
      for (const [batchIndex, msg] of requests.value.entries()) {
        receiveRequest(msg, batchIndex, context);
      }
    }

    /**
     * Handles a request as soon as it's received: a stop or a duplicate id
     * takes effect right away, and a subscription is registered before any
     * `await`, so that a stop or a disconnect during its setup cancels it.
     */
    function receiveRequest(
      msg: TRPCClientOutgoingMessage,
      batchIndex: number,
      context: Promise<ContextResult>,
    ) {
      const { id, jsonrpc } = msg;

      if (id === null) {
        const error = new TRPCError({
          code: 'PARSE_ERROR',
          message: '`id` is required',
        });
        sendOrReport(unknownRequest, () =>
          errorResponse({ ...unknownRequest, id, jsonrpc }, error),
        );
        return;
      }
      if (msg.method === 'subscription.stop') {
        subscriptions.stop(id);
        return;
      }
      const { path, lastEventId } = msg.params;
      let { input } = msg.params;
      if (lastEventId !== undefined) {
        if (isObject(input)) {
          input = {
            ...input,
            lastEventId: lastEventId,
          };
        } else {
          input ??= {
            lastEventId: lastEventId,
          };
        }
      }
      const request: ProcedureRequest = {
        id,
        jsonrpc,
        type: msg.method,
        path,
        input,
        batchIndex,
      };

      if (request.type !== 'subscription') {
        void sendAll(request, procedureResponses(request, context));
        return;
      }
      const registration = subscriptions.register(id);
      if (!registration.ok) {
        sendOrReport(request, () => errorResponse(request, registration.error));
        return;
      }
      void sendAll(
        request,
        subscriptionResponses(request, registration.value, context),
      );
    }

    /**
     * Sends the responses to a request, telling it whether each went out.
     * Nothing awaits it, so it never rejects: if building a response throws,
     * that's reported to `onError`.
     */
    async function sendAll(request: ProcedureRequest, replies: Replies) {
      // Not declared in the loop, and cleared after each response, so that a
      // response can be garbage collected while the next one is awaited.
      let next: Result<IteratorResult<TRPCResponseMessage, void>> | null;
      let sent = OK;
      while (true) {
        next = await settle(replies.next(sent));
        if (!next.ok) {
          reportError(request, next.error);
          return;
        }
        if (next.value.done) {
          return;
        }
        sent = trySend(next.value.value);
        next = null;
      }
    }

    /**
     * Yields a request's last response. Nothing can be done if it can't be
     * sent, so that's reported to `onError`.
     */
    async function* lastResponse(
      request: ProcedureRequest,
      response: TRPCResponseMessage,
    ): Replies {
      const sent = yield response;
      if (!sent.ok) {
        reportError(request, sent.error);
      }
    }

    function callProcedure(
      request: ProcedureRequest,
      created: Context,
      signal: AbortSignal,
    ): Promise<Result<unknown>> {
      return settle(
        callTRPCProcedure({
          router,
          path: request.path,
          getRawInput: async () => request.input,
          ctx: created,
          type: request.type,
          signal,
          batchIndex: request.batchIndex,
        }),
      );
    }

    /** The response to a query or a mutation. */
    async function* procedureResponses(
      request: ProcedureRequest,
      context: Promise<ContextResult>,
    ): Replies {
      const created = await context;
      // A query's or a mutation's signal is never aborted.
      const result = created.ok
        ? await callProcedure(
            request,
            created.value,
            new AbortController().signal,
          )
        : created;
      if (!result.ok) {
        yield* lastResponse(request, errorResponse(request, result.error));
        return;
      }
      if (isAsyncIterable(result.value) || isObservable(result.value)) {
        const error = new TRPCError({
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: `Cannot return an async iterable or observable from a ${request.type} procedure with WebSockets`,
        });
        yield* lastResponse(request, errorResponse(request, error));
        return;
      }
      const sent = yield {
        id: request.id,
        jsonrpc: request.jsonrpc,
        result: {
          type: 'data',
          data: result.value,
        },
      };
      if (!sent.ok) {
        yield* lastResponse(request, errorResponse(request, sent.error));
      }
    }

    /** The procedure's iterable, or why there isn't one. */
    async function subscriptionSource(
      request: ProcedureRequest,
      context: Promise<ContextResult>,
      signal: AbortSignal,
    ): Promise<Result<AsyncIterable<unknown>, TRPCError> | 'stopped'> {
      const created = await context;
      if (created.ok && signal.aborted) {
        return 'stopped';
      }
      const result = created.ok
        ? await callProcedure(request, created.value, signal)
        : created;
      if (!result.ok) {
        const error = getTRPCErrorFromUnknown(result.error);
        return isCancelledSetup(error, signal)
          ? 'stopped'
          : { ok: false, error };
      }
      if (isObservable(result.value)) {
        return {
          ok: true,
          value: observableToAsyncIterable(result.value, signal),
        };
      }
      if (isAsyncIterable(result.value)) {
        return { ok: true, value: result.value };
      }
      return {
        ok: false,
        error: new TRPCError({
          message: `Subscription ${request.path} did not return an observable or a AsyncGenerator`,
          code: 'INTERNAL_SERVER_ERROR',
        }),
      };
    }

    /**
     * A subscription's responses: `started`, its data, and how it ended.
     *
     * It owns the id until its last response, which is sent only after its
     * iterator's disposal has settled, so the client can reuse the id right
     * away. A failed iterator cleanup goes to `onError` only: the client
     * still gets `stopped`, so a subscription that completed or was stopped
     * doesn't turn into a failed one.
     */
    async function* subscriptionResponses(
      request: ProcedureRequest,
      registration: SubscriptionRegistration,
      context: Promise<ContextResult>,
    ): Replies {
      using subscription = registration;
      const { id, jsonrpc } = request;
      const stopped: TRPCResponseMessage = {
        id,
        jsonrpc,
        result: { type: 'stopped' },
      };

      const source = await subscriptionSource(
        request,
        context,
        subscription.signal,
      );
      if (source === 'stopped') {
        yield* lastResponse(request, stopped);
        return;
      }
      if (!source.ok) {
        yield* lastResponse(request, errorResponse(request, source.error));
        return;
      }
      if (subscription.signal.aborted) {
        // stopped while the procedure ran: dispose the iterator without
        // consuming it
        const cleanup = await settle(
          run(async () => {
            await using _iterator = iteratorResource(source.value);
          }),
        );
        if (!cleanup.ok) {
          reportError(request, cleanup.error);
        }
        yield* lastResponse(request, stopped);
        return;
      }

      let sent = yield { id, jsonrpc, result: { type: 'started' } };
      const opened = attempt(() => iteratorResource(source.value));
      let end: SubscriptionEnd = opened.ok ? STOPPED : failed(opened.error);
      let cleanup = OK;
      if (opened.ok) {
        try {
          await using iterator = opened.value;
          // Disposed before the iterator, so cleanup that waits for
          // cancellation is woken when iteration ends other than by `done`.
          using _abortUnlessCompleted = makeResource({}, () => {
            if (end.kind !== 'completed') {
              subscription.abort();
            }
          });
          using aborted = abortedResource(subscription.signal);
          const nextStep = () =>
            Unpromise.race([
              nextUnlessStopped(iterator, subscription.signal, (error) =>
                reportError(request, error),
              ),
              aborted.promise,
            ]);

          // Not declared in the loop, and cleared after each value, so that
          // a value can be garbage collected while the next one is awaited.
          // Delegating with `yield*` would also keep it.
          let step: SubscriptionStep | null = sent.ok
            ? await nextStep()
            : failed(sent.error);
          while (step.kind === 'data') {
            sent = yield { id, jsonrpc, result: dataResult(step.value) };
            step = null;
            step = sent.ok ? await nextStep() : failed(sent.error);
          }
          end = step;
        } catch (cause) {
          // only the iterator's disposal throws
          cleanup = { ok: false, error: cause };
        }
      }
      if (end.kind !== 'completed' || !cleanup.ok) {
        subscription.abort();
      }

      if (end.kind === 'failed') {
        yield* lastResponse(request, errorResponse(request, end.error));
      }
      if (!cleanup.ok) {
        reportError(request, cleanup.error);
      }
      yield* lastResponse(request, stopped);
    }

    const frames = receiveFrames();
    // runs until the first frame is needed, creating the context unless it
    // waits for connection params
    frames.next();

    client.on('message', (rawData, isBinary) => {
      // Handle PING/PONG as text regardless of encoder
      if (!isBinary) {
        // oxlint-disable-next-line typescript/no-base-to-string
        const msgStr = rawData.toString();
        if (msgStr === 'PONG') {
          return;
        }
        if (msgStr === 'PING') {
          if (!opts.dangerouslyDisablePong) {
            client.send('PONG');
          }
          return;
        }
      }

      // Convert rawData to a format our encoder accepts
      // ws gives us Buffer for both text and binary frames
      if (!Buffer.isBuffer(rawData)) {
        sendOrReport(unknownRequest, () =>
          connectionErrorResponse(
            new TRPCError({
              code: 'UNPROCESSABLE_CONTENT',
              message: 'Unexpected WebSocket message format',
            }),
          ),
        );
        return;
      }
      frames.next(isBinary ? rawData : rawData.toString('utf8'));
    });

    // WebSocket errors should be handled, as otherwise unhandled exceptions will crash Node.js.
    // This line was introduced after the following error brought down production systems:
    // "RangeError: Invalid WebSocket frame: RSV2 and RSV3 must be clear"
    // Here is the relevant discussion: https://github.com/websockets/ws/issues/1354#issuecomment-774616962
    client.on('error', (cause) => {
      reportError(unknownRequest, cause);
    });

    await new Promise<void>((resolve) => {
      client.once('close', () => resolve());
    });
  }
}

/**
 * Pings a client after `pingMs` of quiet, and closes the connection if no
 * message comes within `pongWaitMs`.
 */
export function handleKeepAlive(
  client: WsWebSocket,
  pingMs = 30_000,
  pongWaitMs = 5_000,
) {
  void run(async () => {
    while (true) {
      const quiet = await nextActivity(client, pingMs);
      if (quiet === 'close') {
        return;
      }
      if (quiet === 'message') {
        continue;
      }
      // `send` throws only while a socket is connecting, which a server's
      // socket never is, so this loop never rejects.
      client.send('PING');
      const answer = await nextActivity(client, pongWaitMs);
      if (answer === 'close') {
        return;
      }
      if (answer === 'timeout') {
        client.terminate();
        return;
      }
    }
  });
}

/**
 * Serves a router on a `ws` WebSocket server. Returns
 * `broadcastReconnectNotification()`, which tells every client to
 * reconnect, for example before a deploy.
 * @example
 * ```ts
 * const wss = new WebSocketServer({ port: 3001 });
 * const handler = applyWSSHandler({ wss, router: appRouter, createContext });
 * process.on('SIGTERM', () => {
 *   handler.broadcastReconnectNotification();
 *   wss.close();
 * });
 * ```
 * @see https://trpc.io/docs/server/websockets#creating-a-websocket-server
 */
export function applyWSSHandler<TRouter extends AnyRouter>(
  opts: WSSHandlerOptions<TRouter>,
) {
  const encoder = opts.experimental_encoder ?? jsonEncoder;
  const onConnection = getWSConnectionHandler(opts);
  opts.wss.on('connection', (client, req) => {
    if (opts.prefix && !req.url?.startsWith(opts.prefix)) {
      return;
    }

    onConnection(client, req);
  });

  return {
    broadcastReconnectNotification: () => {
      const response: TRPCReconnectNotification = {
        id: null,
        method: 'reconnect',
      };
      const data = encoder.encode(response);
      for (const client of opts.wss.clients) {
        if (client.readyState === WEBSOCKET_OPEN) {
          client.send(data);
        }
      }
    },
  };
}

export type { Encoder } from './wsEncoder';
export { jsonEncoder } from './wsEncoder';
