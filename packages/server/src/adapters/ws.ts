import type { IncomingMessage } from 'http';
import { on } from 'node:events';
import type { RawData, WebSocketServer, WebSocket as WsWebSocket } from 'ws';
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
import type { BaseHandlerOptions } from '../@trpc/server/http';
import { parseTRPCMessage, TRPC_ERROR_CODES_BY_KEY } from '../@trpc/server/rpc';
// @trpc/server/rpc
import type {
  TRPCClientOutgoingMessage,
  TRPCErrorShape,
  TRPCReconnectNotification,
  TRPCRequestMessage,
  TRPCResponseMessage,
} from '../@trpc/server/rpc';
import { parseConnectionParamsFromUnknown } from '../http';
import { isObservable, observableToAsyncIterable } from '../observable';
// oxlint-disable-next-line no-restricted-imports
import {
  createDeferred,
  createResourceMap,
  disposeNow,
  exhaustive,
  isAbortError,
  isAsyncIterable,
  isObject,
  isPromise,
  isTrackedEnvelope,
  makeAsyncResource,
  makeResource,
  run,
} from '../unstable-core-do-not-import';
// oxlint-disable-next-line no-restricted-imports
import type {
  CombinedDataTransformer,
  MaybePromise,
  Result,
} from '../unstable-core-do-not-import';
// oxlint-disable-next-line no-restricted-imports
import { iteratorResource } from '../unstable-core-do-not-import/stream/utils/asyncIterable';
import { Unpromise } from '../vendor/unpromise';
import { createURL } from './node-http';
import type { NodeHTTPCreateContextFnOptions } from './node-http';
import { keepAliveResource } from './ws-machines/keepAlive';
import type {
  SubscriptionEvent,
  SubscriptionReply,
} from './ws-machines/subscription';
import { subscriptionMachine } from './ws-machines/subscription';
import type { Encoder } from './wsEncoder';
import { jsonEncoder } from './wsEncoder';

/*
 * Keeping values collectable: while an async function awaits, V8 keeps
 * alive a `const` that the previous iteration of a loop declared in its
 * body, the last value of a `for await` loop, and the last value delegated
 * with `yield*`. A frame can be as big as `maxPayload` (100 MiB by default)
 * and a subscription's values can be anything, so the loops that await the
 * next one keep the current one in a `let` declared outside the loop, and
 * clear it once they're done with it. `websockets.memory.test.ts` guards
 * this.
 */

/**
 * Importing ws causes a build error
 * @see https://github.com/trpc/trpc/pull/5279
 */
const WEBSOCKET_OPEN = 1; /* ws.WebSocket.OPEN */

const DEFAULT_PING_MS = 30_000;
const DEFAULT_PONG_WAIT_MS = 5_000;

function logInternalError(cause: unknown) {
  // oxlint-disable-next-line no-console
  console.error('[@trpc/server/adapters/ws]', getTRPCErrorFromUnknown(cause));
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

/** What `ws` emits a `message` event with. */
type Message = [data: RawData, isBinary: boolean];

/** A message with requests in it, as the encoder takes it. */
type Frame = string | Uint8Array;

/** A query, mutation or subscription call from the client. */
type ProcedureRequest = Pick<TRPCRequestMessage, 'jsonrpc'> & {
  id: number | string;
  type: TRPCRequestMessage['method'];
  path: string;
  input: unknown;
  batchIndex: number;
};

/** Whether a reply could be encoded and sent. */
type SendResult = Result<void>;

/**
 * The replies to one request, as a generator that `sendReplies` drives:
 * each `yield` sends a reply and evaluates to its `SendResult`. As with any
 * generator, the value passed to the first `next()` is ignored. The driver
 * never calls `return()` or `throw()`, so a generator always runs to its
 * end, and its `using` declarations and `finally` blocks always run.
 */
type Replies = AsyncGenerator<TRPCResponseMessage, void, SendResult>;

/** What `onError` is told about the request an error is tied to. */
type OnErrorRequest = {
  type: ProcedureRequest['type'] | 'unknown';
  path: string | undefined;
  input: unknown;
};

/** For errors about a frame or the connection rather than a request. */
const noRequest: OnErrorRequest = {
  type: 'unknown',
  path: undefined,
  input: undefined,
};

const OK: SendResult = { ok: true, value: undefined };

/**
 * What the client gets when its error can't be formatted or sent. It says
 * nothing about the error, which is what `errorFormatter` would have hidden.
 */
const fallbackErrorShape: TRPCErrorShape = {
  code: TRPC_ERROR_CODES_BY_KEY.INTERNAL_SERVER_ERROR,
  message: 'Internal server error',
  data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
};

/**
 * Queries and mutations aren't cancelled, not even when their connection
 * closes, so the `signal` they get never aborts.
 */
const neverAborted = new AbortController().signal;

/** How a subscription's setup ended: with its iterable, or without. */
type SubscriptionStart =
  | { kind: 'started'; iterable: AsyncIterable<unknown> }
  | { kind: 'stopped' }
  | { kind: 'failed'; error: TRPCError };

/** How a started subscription ended. */
type SubscriptionEnd =
  | { kind: 'completed' }
  | { kind: 'stopped' }
  | { kind: 'failed'; error: TRPCError };

/** What a started subscription does next: send a value, or end. */
type SubscriptionStep = SubscriptionEnd | { kind: 'data'; value: unknown };

const COMPLETED = { kind: 'completed' } as const;
const STOPPED = { kind: 'stopped' } as const;

function failed(cause: unknown) {
  return { kind: 'failed', error: getTRPCErrorFromUnknown(cause) } as const;
}

/** Runs `fn`, with what it throws returned as an error. */
function attempt<TValue>(fn: () => TValue): Result<TValue> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Waits for `promise`, with a rejection returned as an error. */
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
 * Resolves once `signal` has aborted, even if it already has. Disposing it
 * removes the listener.
 */
function abortPromiseResource(signal: AbortSignal) {
  const aborted = createDeferred();
  const onAbort = () => aborted.resolve();
  if (signal.aborted) {
    onAbort();
  } else {
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return makeResource({ promise: aborted.promise }, () => {
    signal.removeEventListener('abort', onAbort);
  });
}

/**
 * The messages `client` receives, in order, until it closes. Disposing it
 * stops listening.
 */
function messagesResource(client: WsWebSocket) {
  const closing = abortControllerResource();
  const closed = createDeferred();
  const onClose = () => {
    closing.abort();
    closed.resolve();
  };
  client.once('close', onClose);
  // Ended with a signal rather than `on()`'s `close` option, which Node 18
  // ignores, so it never completes: it rejects once the signal aborts. `on()`
  // types the values as `any[]`, as it can't know the event's arguments.
  const messages = on(client, 'message', {
    signal: closing.signal,
  }) as unknown as AsyncIterator<Message, never>;
  return makeResource(
    {
      /** Resolves once the connection has closed. */
      closed: closed.promise,
      /**
       * The next message, or `null` once the connection has closed. A
       * socket error ends the messages too, and is reported by the
       * connection's `error` listener.
       */
      async nextMessage(): Promise<Message | null> {
        const next = await settle(messages.next());
        return next.ok ? next.value.value : null;
      },
    },
    () => {
      client.off('close', onClose);
      closing.abort();
    },
  );
}

/** What's in a message. */
type MessageContent =
  | { kind: 'frame'; frame: Frame }
  | { kind: 'ping' }
  | { kind: 'pong' }
  | { kind: 'unsupported' };

function messageContent(message: Message): MessageContent {
  const [data, isBinary] = message;
  if (!isBinary) {
    // pings and pongs are text, whatever the encoder
    // oxlint-disable-next-line typescript/no-base-to-string
    const text = data.toString();
    if (text === 'PONG') {
      return { kind: 'pong' };
    }
    if (text === 'PING') {
      return { kind: 'ping' };
    }
  }
  // ws gives a Buffer for text and binary frames, unless the socket's
  // `binaryType` was changed
  if (!Buffer.isBuffer(data)) {
    return { kind: 'unsupported' };
  }
  return { kind: 'frame', frame: isBinary ? data : data.toString('utf8') };
}

/** What a frame holds: requests, or why it's rejected as a whole. */
type DecodedFrame =
  | { kind: 'requests'; requests: TRPCClientOutgoingMessage[] }
  | { kind: 'oversized'; batch: unknown[] }
  | { kind: 'malformed'; error: TRPCError };

/**
 * Decodes a frame: a request or a batch of them. An oversized batch is
 * rejected before it's parsed, so that no input is deserialized.
 */
function decodeFrame(
  frame: Frame,
  decoding: {
    encoder: Encoder;
    transformer: CombinedDataTransformer;
    maxBatchSize: number | undefined;
  },
): DecodedFrame {
  const decoded = attempt(() => decoding.encoder.decode(frame));
  if (!decoded.ok) {
    return malformedFrame(decoded.error);
  }
  const value = decoded.value;
  const isBatch = Array.isArray(value);
  const raws: unknown[] = isBatch ? value : [value];
  if (
    isBatch &&
    decoding.maxBatchSize !== undefined &&
    raws.length > decoding.maxBatchSize
  ) {
    return { kind: 'oversized', batch: raws };
  }
  const parsed = attempt(() =>
    raws.map((raw) => parseTRPCMessage(raw, decoding.transformer)),
  );
  if (!parsed.ok) {
    return malformedFrame(parsed.error);
  }
  return { kind: 'requests', requests: parsed.value };
}

function malformedFrame(cause: unknown): DecodedFrame {
  return {
    kind: 'malformed',
    error: new TRPCError({ code: 'PARSE_ERROR', cause }),
  };
}

/**
 * The requests in a rejected batch that a reply can be sent to: those with
 * an id, other than stops.
 */
function requestsToReplyTo(batch: unknown[]) {
  return batch.flatMap((raw) =>
    isObject(raw) &&
    raw['method'] !== 'subscription.stop' &&
    (typeof raw['id'] === 'number' || typeof raw['id'] === 'string')
      ? [
          {
            id: raw['id'],
            jsonrpc: raw['jsonrpc'] === '2.0' ? ('2.0' as const) : undefined,
          },
        ]
      : [],
  );
}

/** The connection params a client sends as its first frame. */
function parseConnectionParams(frame: Frame, encoder: Encoder) {
  const msg = attempt(() => encoder.decode(frame));
  if (!msg.ok || !isObject(msg.value)) {
    throw new TRPCError({
      code: 'PARSE_ERROR',
      message: `Malformed TRPCConnectionParamsMessage`,
      cause: msg.ok ? new Error('Message was not an object') : msg.error,
    });
  }
  return parseConnectionParamsFromUnknown(msg.value['data']);
}

/** A subscription's input, with the `lastEventId` it resumes from. */
function inputWithLastEventId(params: TRPCRequestMessage['params']) {
  if (params.lastEventId === undefined) {
    return params.input;
  }
  if (isObject(params.input)) {
    return { ...params.input, lastEventId: params.lastEventId };
  }
  return params.input ?? { lastEventId: params.lastEventId };
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
  // disposing an entry aborts its subscription
  const active = createResourceMap<
    number | string,
    Disposable & { abort: () => void }
  >();
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
        // Not `controller` itself: `makeResource` adds its disposal to the
        // object it's given, so disposing the registration would also run
        // the controller's disposal, which aborts.
        const subscription = {
          signal: controller.signal,
          abort: controller.abort,
        };
        const entry = makeResource(
          { abort: controller.abort },
          controller.abort,
        );
        active.set(id, entry);
        return {
          ok: true,
          // a subscription that ended by itself isn't aborted
          value: makeResource(subscription, () => active.release(id, entry)),
        };
      },
    },
    () => disposeNow(active),
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
 * `iterator.next()` for a subscription loop, as the loop's next step. A
 * stopped subscription's iterator isn't asked for more.
 *
 * The loop races this against the subscription's `signal`, so once the
 * subscription is stopped, it doesn't wait for this call: a rejection after
 * the stop, such as a teardown that throws, goes to `onErrorAfterStop`. An
 * `AbortError` is how a stopped subscription is expected to end, and isn't
 * reported.
 */
async function nextUnlessStopped(
  iterator: AsyncIterator<unknown>,
  signal: AbortSignal,
  onErrorAfterStop: (error: TRPCError) => void,
): Promise<SubscriptionStep> {
  if (signal.aborted) {
    return STOPPED;
  }
  try {
    const next = await iterator.next();
    // a value that arrives with the stop, such as one yielded because of
    // it, would be sent after the stop, and after a PONG sent with it
    if (signal.aborted) {
      return STOPPED;
    }
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

/** `value`, which a machine's effect needs, or a throw for the bug. */
function present<TValue>(value: TValue | null, what: string): TValue {
  if (value === null) {
    throw new Error(`The ${what} is missing`);
  }
  return value;
}

function dataResult(value: unknown) {
  if (isTrackedEnvelope(value)) {
    const [id, data] = value;
    return { type: 'data', data: { id, data }, id } as const;
  }
  return { type: 'data', data: value } as const;
}

/**
 * Returns a `ws` connection listener that serves a router. `applyWSSHandler`
 * uses it; call it to attach tRPC to your own WebSocket server.
 */
export function getWSConnectionHandler<TRouter extends AnyRouter>(
  opts: WSSHandlerOptions<TRouter>,
) {
  const config = opts.router._def._config;
  const encoder = opts.experimental_encoder ?? jsonEncoder;
  const frameDecoding = {
    encoder,
    transformer: config.transformer,
    maxBatchSize: opts.maxBatchSize,
  };

  return (client: WsWebSocket, req: IncomingMessage) => {
    void serveConnection(client, req);
  };

  /**
   * Serves one connection until it closes. Closing it stops its
   * subscriptions and aborts the `signal` its context got.
   *
   * User code (`createContext`, procedures, `onError`, `errorFormatter`, the
   * transformer and the encoder) may throw. Only `callOnError`, `errorShape`,
   * `trySend`, `sendOrReport`, `receiveFrame` and `sendReplies` catch;
   * everything else passes errors on as values.
   */
  async function serveConnection(client: WsWebSocket, req: IncomingMessage) {
    type Context = inferRouterContext<TRouter>;
    type ContextResult = Result<Context, TRPCError>;

    // Disposed in reverse: the messages stop first, then the subscriptions
    // are stopped, and then the context's `signal` aborts.
    using connection = abortControllerResource();
    using subscriptions = subscriptionsResource();
    // Listens before anything is awaited, so that no message is missed.
    using messages = messagesResource(client);

    /** The connection's context, once `createContext` has resolved. */
    let ctx: Context | undefined = undefined;

    await using _keepAlive = opts.keepAlive?.enabled
      ? keepAliveResource(client, {
          pingMs: opts.keepAlive.pingMs ?? DEFAULT_PING_MS,
          pongWaitMs: opts.keepAlive.pongWaitMs ?? DEFAULT_PONG_WAIT_MS,
          onError: (cause) => reportInternalError(noRequest, cause),
        })
      : null;

    // WebSocket errors should be handled, as otherwise unhandled exceptions will crash Node.js.
    // This line was introduced after the following error brought down production systems:
    // "RangeError: Invalid WebSocket frame: RSV2 and RSV3 must be clear"
    // Here is the relevant discussion: https://github.com/websockets/ws/issues/1354#issuecomment-774616962
    client.on('error', (cause) => {
      reportError(noRequest, cause);
    });

    // `null` while the context waits for the connection params, which the
    // client sends as its first frame.
    let context: Promise<ContextResult> | null =
      createURL(req).searchParams.get('connectionParams') === '1'
        ? null
        : createConnectionContext(null);
    let frame: Frame | null; // see "Keeping values collectable"
    while (true) {
      frame = await nextFrame();
      if (frame === null) {
        break;
      }
      if (context === null) {
        context = createConnectionContext(frame);
      } else {
        receiveFrame(frame, context);
      }
      frame = null;
    }
    // a socket error ends the messages before the connection closes
    await messages.closed;

    // Sending and reporting

    function send(response: TRPCResponseMessage) {
      client.send(encoder.encode(transformTRPCResponse(config, response)));
    }

    function trySend(response: TRPCResponseMessage): SendResult {
      return attempt(() => send(response));
    }

    /**
     * Sends a reply that nothing can retry, reporting it if it can't be
     * built or sent. One that can't be sent is replaced by the fallback
     * error, so that a client still learns it was rejected.
     */
    function sendOrReport(
      request: OnErrorRequest,
      reply: () => TRPCResponseMessage,
    ) {
      const built = attempt(reply);
      if (!built.ok) {
        reportInternalError(request, built.error);
        return;
      }
      const sent = trySend(built.value);
      if (!sent.ok) {
        reportInternalError(request, sent.error);
        // a failure here is the one just reported
        trySend({
          id: built.value.id,
          jsonrpc: built.value.jsonrpc,
          error: fallbackErrorShape,
        });
      }
    }

    /**
     * Calls `onError`. Errors are reported from listeners and from promises
     * nothing awaits, where a throw or a rejection would crash the process,
     * so an `onError` that fails calls `onFailure` instead.
     */
    function callOnError(
      request: OnErrorRequest,
      error: TRPCError,
      onFailure: () => void,
    ) {
      const called = attempt((): unknown =>
        opts.onError?.({
          error,
          path: request.path,
          type: request.type,
          ctx,
          req,
          input: request.input,
        }),
      );
      if (!called.ok) {
        onFailure();
      } else if (isPromise(called.value)) {
        called.value.catch(onFailure);
      }
    }

    /** Reports `cause` to `onError`, ignoring an `onError` that fails. */
    function reportError(request: OnErrorRequest, cause: unknown) {
      const error = getTRPCErrorFromUnknown(cause);
      callOnError(request, error, () => {
        // ignored, see callOnError
      });
      return error;
    }

    /**
     * Reports a failure of the adapter's own error handling, such as an
     * `errorFormatter` that throws or a reply that can't be sent. It's logged
     * when `onError` is missing or fails, so it's never dropped silently.
     */
    function reportInternalError(request: OnErrorRequest, cause: unknown) {
      const error = getTRPCErrorFromUnknown(cause);
      const log = () => logInternalError(error);
      if (opts.onError) {
        callOnError(request, error, log);
      } else {
        log();
      }
    }

    /**
     * The error's shape for the client, or the fallback when
     * `errorFormatter` throws, so that the client still gets an error.
     */
    function errorShape(
      request: OnErrorRequest,
      error: TRPCError,
    ): TRPCErrorShape {
      const shape = attempt((): TRPCErrorShape =>
        getErrorShape({
          config,
          error,
          type: request.type,
          path: request.path,
          input: request.input,
          ctx,
        }),
      );
      if (shape.ok) {
        return shape.value;
      }
      reportInternalError(request, shape.error);
      return fallbackErrorShape;
    }

    /** Reports `cause` to `onError`, and returns the reply that says why. */
    function reportedErrorReply(
      request: OnErrorRequest & Pick<TRPCRequestMessage, 'id' | 'jsonrpc'>,
      cause: unknown,
    ): TRPCResponseMessage {
      const error = reportError(request, cause);
      return {
        id: request.id,
        jsonrpc: request.jsonrpc,
        error: errorShape(request, error),
      };
    }

    function connectionErrorShape(error: TRPCError) {
      return errorShape(noRequest, error);
    }

    /** The reply to a frame the connection can't tie to a request. */
    function connectionErrorReply(error: TRPCError): TRPCResponseMessage {
      return { id: null, error: connectionErrorShape(error) };
    }

    // The context

    /**
     * Creates the connection's context, with the connection params in
     * `paramsFrame` when the client sends them. If that fails, the client
     * is told why and the connection is closed.
     */
    async function createConnectionContext(
      paramsFrame: Frame | null,
    ): Promise<ContextResult> {
      const created = await settle(
        run(async () =>
          opts.createContext?.({
            req,
            res: client,
            info: {
              connectionParams:
                paramsFrame === null
                  ? null
                  : parseConnectionParams(paramsFrame, encoder),
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
      const error = reportError(noRequest, created.error);
      sendOrReport(noRequest, () => connectionErrorReply(error));

      // close in next tick
      (globalThis.setImmediate ?? globalThis.setTimeout)(() => {
        client.close();
      });
      return { ok: false, error };
    }

    // Frames

    /**
     * The next frame with requests in it, or `null` once the connection has
     * closed. Pings are answered along the way.
     */
    async function nextFrame(): Promise<Frame | null> {
      let message: Message | null; // see "Keeping values collectable"
      while (true) {
        message = await messages.nextMessage();
        if (message === null) {
          return null;
        }
        const content = messageContent(message);
        message = null;
        switch (content.kind) {
          case 'frame':
            return content.frame;
          case 'ping':
            if (!opts.dangerouslyDisablePong) {
              client.send('PONG');
            }
            break;
          case 'pong':
            // keepAlive listens for any message itself
            break;
          case 'unsupported':
            sendOrReport(noRequest, () =>
              connectionErrorReply(
                new TRPCError({
                  code: 'UNPROCESSABLE_CONTENT',
                  message: 'Unexpected WebSocket message format',
                }),
              ),
            );
            break;
        }
      }
    }

    /**
     * Handles a frame: a request or a batch of them. What it throws is
     * reported, so that it doesn't end the loop that reads frames.
     */
    function receiveFrame(frame: Frame, context: Promise<ContextResult>) {
      const received = attempt(() => {
        const decoded = decodeFrame(frame, frameDecoding);
        switch (decoded.kind) {
          case 'malformed':
            sendOrReport(noRequest, () => connectionErrorReply(decoded.error));
            return;
          case 'oversized':
            rejectOversizedBatch(decoded.batch);
            return;
          case 'requests':
            for (const [batchIndex, msg] of decoded.requests.entries()) {
              receiveRequest(msg, batchIndex, context);
            }
            return;
        }
      });
      if (!received.ok) {
        reportInternalError(noRequest, received.error);
      }
    }

    /**
     * Every request in the batch gets the error, as in a batched HTTP call,
     * so that no client waits for a reply forever.
     */
    function rejectOversizedBatch(batch: unknown[]) {
      const error = reportError(
        noRequest,
        new TRPCError({
          code: 'BAD_REQUEST',
          message: `Batch call exceeds maximum size`,
        }),
      );
      const shape = connectionErrorShape(error);
      const requests = requestsToReplyTo(batch);
      if (requests.length === 0) {
        sendOrReport(noRequest, () => ({ id: null, error: shape }));
      }
      for (const request of requests) {
        sendOrReport(noRequest, () => ({ ...request, error: shape }));
      }
    }

    // Requests

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
      if (msg.id === null) {
        const error = new TRPCError({
          code: 'PARSE_ERROR',
          message: '`id` is required',
        });
        sendOrReport(noRequest, () =>
          reportedErrorReply(
            { ...noRequest, id: msg.id, jsonrpc: msg.jsonrpc },
            error,
          ),
        );
        return;
      }
      if (msg.method === 'subscription.stop') {
        subscriptions.stop(msg.id);
        return;
      }
      const request: ProcedureRequest = {
        id: msg.id,
        jsonrpc: msg.jsonrpc,
        type: msg.method,
        path: msg.params.path,
        input: inputWithLastEventId(msg.params),
        batchIndex,
      };

      if (request.type !== 'subscription') {
        void sendReplies(request, procedureReplies(request, context));
        return;
      }
      const registration = subscriptions.register(request.id);
      if (!registration.ok) {
        sendOrReport(request, () =>
          reportedErrorReply(request, registration.error),
        );
        return;
      }
      void sendReplies(
        request,
        subscriptionReplies(request, registration.value, context),
      );
    }

    /**
     * Sends a request's replies, telling the generator whether each went
     * out. Nothing awaits it, so it never rejects: a reply that throws while
     * it's built is reported to `onError`.
     */
    async function sendReplies(request: ProcedureRequest, replies: Replies) {
      // see "Keeping values collectable"
      let next: Result<IteratorResult<TRPCResponseMessage, void>> | null;
      let sent = OK;
      while (true) {
        next = await settle(replies.next(sent));
        if (!next.ok) {
          reportInternalError(request, next.error);
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
     * Yields a request's final reply. Nothing can be done if it can't be
     * sent, so that's reported.
     */
    async function* finalReply(
      request: ProcedureRequest,
      reply: TRPCResponseMessage,
    ): Replies {
      const sent = yield reply;
      if (!sent.ok) {
        reportInternalError(request, sent.error);
      }
    }

    /**
     * Yields the error reply that ends a request. If it can't be sent, the
     * client gets the fallback error instead, so that it isn't left waiting.
     */
    async function* finalErrorReply(
      request: ProcedureRequest,
      cause: unknown,
    ): Replies {
      const sent = yield reportedErrorReply(request, cause);
      if (!sent.ok) {
        reportInternalError(request, sent.error);
        yield* finalReply(request, {
          id: request.id,
          jsonrpc: request.jsonrpc,
          error: fallbackErrorShape,
        });
      }
    }

    function callProcedure(
      request: ProcedureRequest,
      created: Context,
      signal: AbortSignal,
    ): Promise<Result<unknown>> {
      return settle(
        callTRPCProcedure({
          router: opts.router,
          path: request.path,
          getRawInput: async () => request.input,
          ctx: created,
          type: request.type,
          signal,
          batchIndex: request.batchIndex,
        }),
      );
    }

    // Queries and mutations

    /** The reply to a query or a mutation. */
    async function* procedureReplies(
      request: ProcedureRequest,
      context: Promise<ContextResult>,
    ): Replies {
      const created = await context;
      const result = created.ok
        ? await callProcedure(request, created.value, neverAborted)
        : created;
      if (!result.ok) {
        yield* finalErrorReply(request, result.error);
        return;
      }
      if (isAsyncIterable(result.value) || isObservable(result.value)) {
        const error = new TRPCError({
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: `Cannot return an async iterable or observable from a ${request.type} procedure with WebSockets`,
        });
        yield* finalErrorReply(request, error);
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
        yield* finalErrorReply(request, sent.error);
      }
    }

    // Subscriptions

    /**
     * Calls a subscription's procedure for its iterable. One that arrives
     * after a stop is disposed without being consumed.
     */
    async function startSubscription(
      request: ProcedureRequest,
      context: Promise<ContextResult>,
      signal: AbortSignal,
    ): Promise<SubscriptionStart> {
      const created = await context;
      if (created.ok && signal.aborted) {
        return STOPPED;
      }
      const result = created.ok
        ? await callProcedure(request, created.value, signal)
        : created;
      if (!result.ok) {
        const error = getTRPCErrorFromUnknown(result.error);
        return isCancelledSetup(error, signal)
          ? STOPPED
          : { kind: 'failed', error };
      }
      const iterable = isObservable(result.value)
        ? observableToAsyncIterable(result.value, signal)
        : isAsyncIterable(result.value)
          ? result.value
          : null;
      if (iterable === null) {
        return failed(
          new TRPCError({
            message: `Subscription ${request.path} did not return an observable or a AsyncGenerator`,
            code: 'INTERNAL_SERVER_ERROR',
          }),
        );
      }
      if (signal.aborted) {
        const cleanup = await settle(
          run(async () => {
            await using _iterator = iteratorResource(iterable);
          }),
        );
        if (!cleanup.ok) {
          reportError(request, cleanup.error);
        }
        return STOPPED;
      }
      return { kind: 'started', iterable };
    }

    /**
     * A subscription's replies: `started`, its data, and how it ended, as
     * `subscriptionMachine` says. This plays the machine's effects, and
     * turns the outcome of each one it waits for into the next event.
     *
     * It owns the id until its last reply, which is sent only after its
     * iterator's disposal has settled, so the client can reuse the id right
     * away.
     */
    async function* subscriptionReplies(
      request: ProcedureRequest,
      registration: SubscriptionRegistration,
      context: Promise<ContextResult>,
    ): Replies {
      using subscription = registration;
      using aborted = abortPromiseResource(subscription.signal);
      const stop = aborted.promise.then(() => STOPPED);

      let iterable: AsyncIterable<unknown> | null = null;
      let iterator: AsyncIterator<unknown> | null = null;
      let disposeIterator: AsyncDisposable | null = null;
      // see "Keeping values collectable"
      let value: unknown = null;
      let step: SubscriptionStep | null = null;

      // `Unpromise.race` rather than `Promise.race`: `stop` lives as long
      // as the subscription, and `Promise.race` would add a reaction to it
      // for every value.
      const nextStep = (it: AsyncIterator<unknown>) =>
        Unpromise.race([
          nextUnlessStopped(it, subscription.signal, (error) =>
            reportError(request, error),
          ),
          stop,
        ]);

      const reply = (sent: SubscriptionReply): TRPCResponseMessage => {
        const { id, jsonrpc } = request;
        switch (sent.kind) {
          case 'started':
            return { id, jsonrpc, result: { type: 'started' } };
          case 'value':
            return { id, jsonrpc, result: dataResult(value) };
          case 'error':
            return { id, jsonrpc, error: errorShape(request, sent.error) };
          case 'fallback':
            return { id, jsonrpc, error: fallbackErrorShape };
          case 'stopped':
            return { id, jsonrpc, result: { type: 'stopped' } };
        }
      };

      // the machine closes every iterator it opens; this is for a bug
      await using _unclosed = makeAsyncResource({}, async () => {
        if (disposeIterator !== null) {
          await using _iterator = disposeIterator;
        }
      });

      let next = subscriptionMachine.initial;
      while (true) {
        let event: SubscriptionEvent | null = null;
        for (const effect of next.effects) {
          switch (effect.type) {
            case 'setUp': {
              const start = await startSubscription(
                request,
                context,
                subscription.signal,
              );
              if (start.kind === 'started') {
                iterable = start.iterable;
                event = { type: 'setUp' };
              } else {
                event =
                  start.kind === 'stopped'
                    ? { type: 'setUpCancelled' }
                    : { type: 'setUpFailed', error: start.error };
              }
              break;
            }
            case 'send': {
              const sent = yield reply(effect.reply);
              value = null;
              event = sent.ok
                ? { type: 'sent' }
                : {
                    type: 'sendFailed',
                    error: getTRPCErrorFromUnknown(sent.error),
                  };
              break;
            }
            case 'open': {
              const source = iterable;
              iterable = null;
              const opened = attempt(() =>
                iteratorResource(present(source, 'iterable')),
              );
              if (opened.ok) {
                iterator = opened.value;
                disposeIterator = opened.value;
                event = { type: 'opened' };
              } else {
                event = {
                  type: 'openFailed',
                  error: getTRPCErrorFromUnknown(opened.error),
                };
              }
              break;
            }
            case 'next':
              step = await nextStep(present(iterator, 'iterator'));
              if (step.kind === 'data') {
                value = step.value;
                event = { type: 'value' };
              } else {
                event =
                  step.kind === 'failed'
                    ? { type: 'nextFailed', error: step.error }
                    : { type: step.kind };
              }
              step = null;
              break;
            case 'close': {
              const resource = present(disposeIterator, 'iterator');
              iterator = null;
              disposeIterator = null;
              const cleanup = await settle(
                run(async () => {
                  await using _iterator = resource;
                }),
              );
              event = cleanup.ok
                ? { type: 'closed' }
                : {
                    type: 'closeFailed',
                    error: getTRPCErrorFromUnknown(cleanup.error),
                  };
              break;
            }
            case 'abort':
              subscription.abort();
              break;
            case 'report':
              if (effect.internal) {
                reportInternalError(request, effect.error);
              } else {
                reportError(request, effect.error);
              }
              break;
            case 'invariantViolation':
              reportInternalError(
                request,
                new TRPCError({
                  code: 'INTERNAL_SERVER_ERROR',
                  message: effect.message,
                }),
              );
              break;
            default:
              exhaustive(effect, undefined);
          }
        }
        if (event === null) {
          return;
        }
        next = subscriptionMachine.transition(next.state, event);
      }
    }
  }
}

/**
 * Pings a client after `pingMs` of quiet, and closes the connection if no
 * message comes within `pongWaitMs`. It stops once the connection closes.
 */
export function handleKeepAlive(
  client: WsWebSocket,
  pingMs = DEFAULT_PING_MS,
  pongWaitMs = DEFAULT_PONG_WAIT_MS,
) {
  const keepAlive = keepAliveResource(client, {
    pingMs,
    pongWaitMs,
    onError: logInternalError,
  });
  client.once('close', () => {
    void run(async () => {
      await using _keepAlive = keepAlive;
    });
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
