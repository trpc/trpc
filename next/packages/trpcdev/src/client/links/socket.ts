import { Cause, Effect, Queue, Stream } from 'effect';
import {
  fromWireError,
  TrpcError,
  type AnyTrpcError,
} from '../../internal/error.ts';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '../../internal/protocol.ts';
import type { MaybePromise } from '../../internal/types.ts';
import {
  defaultSerializer,
  type AnySerializer,
} from '../../serializer/index.ts';
import type { MessagePortLike } from '../../server/socket.ts';
import {
  withSerializer,
  type Operation,
  type OperationStream,
  type TrpcLink,
} from '../link.ts';
import { DeferredDecoder, serializeInput } from './events.ts';

/** One open connection. @internal */
interface SocketConnection {
  send(message: ClientMessage): void;
  close(): void;
  onMessage(listener: (message: unknown) => void): void;
  onClose(listener: () => void): void;
}

interface ActiveCall {
  readonly op: Operation;
  /** Subscriptions are sent again after a reconnect. */
  readonly resumable: boolean;
  request(): ClientMessage;
  onMessage(message: ServerMessage): void;
  /** The connection dropped and this call will be sent again. */
  onReconnect?(): void;
  fail(error: AnyTrpcError): void;
}

/**
 * Options shared by {@link wsLink} and {@link messagePortLink}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface SocketLinkOptions {
  /** Must match the server's. @default defaultSerializer */
  serializer?: AnySerializer;
  /**
   * Sent once per connection, before any call; `createContext` receives
   * them as `info.connectionParams`. Browsers cannot set WebSocket headers,
   * so send auth tokens here.
   */
  connectionParams?:
    | Record<string, unknown>
    | (() => MaybePromise<Record<string, unknown> | undefined>);
}

/**
 * A link that also owns a connection.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface SocketLink extends TrpcLink, AsyncDisposable {
  /**
   * Closes the connection. Calls in flight fail with
   * `CLIENT_CLOSED_REQUEST`; the next call opens a new connection.
   */
  close(): Promise<void>;
}

interface SocketTransport {
  connect(): Promise<SocketConnection>;
  reconnect:
    | { attempts: number; delayMs: (attempt: number) => number }
    | undefined;
  idleMs: number | undefined;
  keepAlive: { intervalMs: number; timeoutMs: number } | undefined;
}

const lostError = () =>
  new TrpcError({
    code: 'NETWORK_ERROR',
    message: 'The connection was lost',
  });

function socketLink(
  transport: SocketTransport,
  opts: SocketLinkOptions,
): SocketLink {
  const serializer = opts.serializer ?? defaultSerializer;
  const calls = new Map<number, ActiveCall>();
  let current: SocketConnection | undefined;
  let connecting = false;
  let attempt = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;

  const revive = (message: Extract<ServerMessage, { type: 'error' }>) => {
    try {
      return fromWireError(
        serializer.deserialize(message.body as never),
        message.status,
      );
    } catch (cause) {
      return new TrpcError({
        code: 'PARSE_ERROR',
        message: 'Invalid error message',
        cause,
      });
    }
  };

  function dispatch(raw: unknown) {
    if (typeof raw !== 'object' || raw === null) return;
    const message = raw as ServerMessage;
    attempt = 0;
    clearTimeout(pongTimer);
    if (message.type === 'pong') return;
    if (message.id === null) {
      if (message.type !== 'error') return;
      const err = revive(message);
      for (const call of calls.values()) call.fail(err);
      calls.clear();
      return;
    }
    calls.get(message.id)?.onMessage(message);
  }

  function stopKeepAlive() {
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
  }

  /** A connection that answers nothing within `timeoutMs` of a ping is lost. */
  function startKeepAlive(conn: SocketConnection) {
    const { keepAlive } = transport;
    if (!keepAlive) return;
    stopKeepAlive();
    pingTimer = setInterval(() => {
      conn.send({ type: 'ping' });
      clearTimeout(pongTimer);
      pongTimer = setTimeout(() => {
        if (current !== conn) return;
        lost();
        conn.close();
      }, keepAlive.timeoutMs);
    }, keepAlive.intervalMs);
  }

  function lost() {
    stopKeepAlive();
    current = undefined;
    for (const [id, call] of calls) {
      if (
        call.resumable &&
        transport.reconnect &&
        call.op.context.reconnect !== false
      ) {
        continue;
      }
      calls.delete(id);
      call.fail(lostError());
    }
    if (calls.size === 0) return;
    const reconnect = transport.reconnect!;
    if (++attempt > reconnect.attempts) {
      for (const call of calls.values()) call.fail(lostError());
      calls.clear();
      return;
    }
    for (const call of calls.values()) call.onReconnect?.();
    reconnectTimer = setTimeout(connect, reconnect.delayMs(attempt));
  }

  function connect() {
    if (connecting || current) return;
    connecting = true;
    void (async () => {
      let conn: SocketConnection | undefined;
      try {
        conn = await transport.connect();
        const params =
          typeof opts.connectionParams === 'function'
            ? await opts.connectionParams()
            : opts.connectionParams;
        conn.onMessage(dispatch);
        conn.onClose(() => {
          if (current === conn) lost();
        });
        conn.send({
          type: 'init',
          version: PROTOCOL_VERSION,
          ...(params ? { connectionParams: params } : {}),
        });
      } catch {
        connecting = false;
        conn?.close();
        lost();
        return;
      }
      connecting = false;
      current = conn;
      startKeepAlive(conn);
      for (const call of calls.values()) conn.send(call.request());
      if (calls.size === 0) scheduleIdle();
    })();
  }

  function scheduleIdle() {
    if (transport.idleMs === undefined || calls.size > 0 || !current) return;
    clearTimeout(idleTimer);
    const conn = current;
    idleTimer = setTimeout(() => {
      if (calls.size > 0 || current !== conn) return;
      stopKeepAlive();
      current = undefined;
      conn.close();
    }, transport.idleMs);
  }

  function start(call: ActiveCall) {
    let message: ClientMessage;
    try {
      message = call.request();
    } catch (cause) {
      call.fail(cause as AnyTrpcError);
      return;
    }
    clearTimeout(idleTimer);
    calls.set(call.op.id, call);
    if (current) current.send(message);
    else connect();
  }

  function finish(call: ActiveCall) {
    if (calls.get(call.op.id) === call) calls.delete(call.op.id);
    scheduleIdle();
  }

  function abort(call: ActiveCall) {
    if (calls.get(call.op.id) !== call) return;
    calls.delete(call.op.id);
    current?.send({ id: call.op.id, type: 'abort' });
    scheduleIdle();
  }

  const request = (op: Operation, lastEventId?: string): ClientMessage => ({
    id: op.id,
    type: 'request',
    method: op.type,
    path: op.path,
    ...(op.input === undefined
      ? {}
      : { input: serializeInput(serializer, op.input) }),
    ...(lastEventId === undefined ? {} : { lastEventId }),
  });

  const single = (op: Operation): OperationStream =>
    Stream.fromEffect(
      Effect.callback<unknown, AnyTrpcError>((resume) => {
        const decoder = new DeferredDecoder(serializer);
        const call: ActiveCall = {
          op,
          resumable: false,
          request: () => request(op),
          onMessage(message) {
            switch (message.type) {
              case 'result':
                if (!message.deferred) finish(call);
                decoder
                  .decode(message.body, message.deferred ? 0 : undefined)
                  .then(
                    (value) => resume(Effect.succeed(value)),
                    (cause) =>
                      resume(
                        Effect.fail(
                          new TrpcError({
                            code: 'PARSE_ERROR',
                            message: 'Invalid result',
                            cause,
                          }),
                        ),
                      ),
                  );
                return;
              case 'chunk':
                decoder.chunk(0, message.chunk);
                return;
              case 'done':
                finish(call);
                decoder.close();
                return;
              case 'error':
                finish(call);
                decoder.close();
                resume(Effect.fail(revive(message)));
                return;
            }
          },
          fail(error) {
            decoder.close();
            resume(Effect.fail(error));
          },
        };
        start(call);
        return Effect.sync(() => abort(call));
      }),
    );

  const subscription = (op: Operation): OperationStream =>
    Stream.callback<unknown, AnyTrpcError>((queue) =>
      Effect.gen(function* () {
        let lastEventId = op.lastEventId;
        let decoder = new DeferredDecoder(serializer);
        let chain = Promise.resolve();
        const enqueue = (fn: () => void | Promise<void>) => {
          chain = chain.then(fn).catch((cause: unknown) => {
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(
                new TrpcError({
                  code: 'PARSE_ERROR',
                  message: 'Invalid event',
                  cause,
                }),
              ),
            );
          });
        };
        const call: ActiveCall = {
          op,
          resumable: true,
          request: () => request(op, lastEventId),
          onMessage(message) {
            switch (message.type) {
              case 'event': {
                if (message.eventId !== undefined) {
                  lastEventId = message.eventId;
                }
                const value = decoder.decode(message.body, message.deferred);
                enqueue(async () => {
                  Queue.offerUnsafe(queue, await value);
                });
                return;
              }
              case 'chunk':
                decoder.chunk(message.event ?? 0, message.chunk);
                return;
              case 'chunkEnd':
                decoder.end(message.event);
                return;
              case 'done':
                finish(call);
                enqueue(() => void Queue.endUnsafe(queue));
                return;
              case 'error': {
                finish(call);
                const err = revive(message);
                enqueue(
                  () => void Queue.failCauseUnsafe(queue, Cause.fail(err)),
                );
                return;
              }
            }
          },
          onReconnect() {
            decoder.close();
            decoder = new DeferredDecoder(serializer);
          },
          fail(error) {
            enqueue(() => void Queue.failCauseUnsafe(queue, Cause.fail(error)));
          },
        };
        start(call);
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            abort(call);
            decoder.close();
          }),
        );
      }),
    );

  const close = async () => {
    clearTimeout(idleTimer);
    clearTimeout(reconnectTimer);
    stopKeepAlive();
    const conn = current;
    current = undefined;
    for (const call of calls.values()) {
      call.fail(
        new TrpcError({
          code: 'CLIENT_CLOSED_REQUEST',
          message: 'The link was closed',
        }),
      );
    }
    calls.clear();
    conn?.close();
  };

  const run: TrpcLink = ({ op }) =>
    op.type === 'subscription' ? subscription(op) : single(op);
  return withSerializer(
    Object.assign(run, { close, [Symbol.asyncDispose]: close }),
    serializer,
  );
}

/**
 * Options for {@link wsLink}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface WebSocketLinkOptions extends SocketLinkOptions {
  /** The endpoint, e.g. `ws://localhost:3000/trpc`. */
  url: string | URL;
  /** A `WebSocket` implementation. @default globalThis.WebSocket */
  WebSocket?: new (url: string | URL) => WebSocket;
  /**
   * Reconnects after a dropped connection. Subscriptions resume from their
   * last `tracked()` event id; queries and mutations in flight fail with
   * `NETWORK_ERROR`.
   */
  reconnect?: {
    /** @default 5 */
    attempts?: number;
    /** @default attempt => Math.min(1000 * 2 ** (attempt - 1), 30_000) */
    delayMs?: (attempt: number) => number;
  };
  /**
   * Close the connection after this long without calls. The next call
   * reconnects.
   * @default undefined, stay open until `close()`
   */
  idleMs?: number;
  /**
   * Ping every `intervalMs`. A connection that answers nothing within
   * `timeoutMs` is treated as lost, so it reconnects instead of waiting for
   * a close that a dead network never delivers. The traffic also keeps
   * proxies from dropping a quiet socket. `false` sends no pings.
   * @default { intervalMs: 30_000, timeoutMs: 10_000 }
   */
  keepAlive?: false | { intervalMs?: number; timeoutMs?: number };
}

/**
 * Sends every call over one WebSocket (10). The connection opens on the
 * first call. Outputs with deferred values stream, like over HTTP.
 *
 * @example
 * ```ts
 * const ws = wsLink({
 *   url: 'ws://localhost:3000/trpc',
 *   connectionParams: async () => ({ token: await getToken() }),
 * });
 * createTrpcClient<AppRouter>({
 *   links: [splitLink({ condition: (op) => op.type === 'subscription', true: ws, false: httpLink({ url }) })],
 * });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function wsLink(opts: WebSocketLinkOptions): SocketLink {
  const Impl = opts.WebSocket ?? globalThis.WebSocket;
  return socketLink(
    {
      reconnect: {
        attempts: opts.reconnect?.attempts ?? 5,
        delayMs:
          opts.reconnect?.delayMs ??
          ((attempt) => Math.min(1000 * 2 ** (attempt - 1), 30_000)),
      },
      idleMs: opts.idleMs,
      keepAlive:
        opts.keepAlive === false
          ? undefined
          : {
              intervalMs: opts.keepAlive?.intervalMs ?? 30_000,
              timeoutMs: opts.keepAlive?.timeoutMs ?? 10_000,
            },
      connect: () =>
        new Promise((resolve, reject) => {
          const ws = new Impl(opts.url);
          let open = false;
          ws.addEventListener(
            'open',
            () => {
              open = true;
              resolve({
                send: (message) => {
                  if (ws.readyState === 1) ws.send(JSON.stringify(message));
                },
                close: () => ws.close(1000),
                onMessage: (listener) =>
                  ws.addEventListener('message', (event) => {
                    if (typeof event.data !== 'string') return;
                    let parsed: unknown;
                    try {
                      parsed = JSON.parse(event.data);
                    } catch {
                      return;
                    }
                    listener(parsed);
                  }),
                onClose: (listener) => ws.addEventListener('close', listener),
              });
            },
            { once: true },
          );
          ws.addEventListener(
            'close',
            () => {
              if (!open) reject(new Error('The WebSocket did not open'));
            },
            { once: true },
          );
        }),
    },
    opts,
  );
}

/**
 * Options for {@link messagePortLink}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface MessagePortLinkOptions extends SocketLinkOptions {
  /** A `MessagePort`, `Worker`, `worker_threads` port, or window-like object. */
  port: MessagePortLike;
}

/**
 * Sends calls over a `MessagePort` (Electron, workers, iframes), to a
 * server that called `handler.messagePort(port)` on the other end.
 * Messages are structured-cloned objects in the same format as WebSocket
 * messages. Closing the port is up to you.
 *
 * @example
 * ```ts
 * const worker = new Worker(new URL('./server.ts', import.meta.url), { type: 'module' });
 * createTrpcClient<AppRouter>({ links: [messagePortLink({ port: worker })] });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function messagePortLink(opts: MessagePortLinkOptions): SocketLink {
  const { port } = opts;
  const listeners: ((message: unknown) => void)[] = [];
  const closeListeners: (() => void)[] = [];
  let attached = false;
  const connection: SocketConnection = {
    send: (message) => port.postMessage(message),
    close: () => {
      for (const listener of closeListeners.splice(0)) listener();
    },
    onMessage: (listener) => {
      listeners.push(listener);
      if (attached) return;
      attached = true;
      const deliver = (message: unknown) => {
        for (const l of listeners) l(message);
      };
      if (port.on) port.on('message', deliver);
      else {
        port.addEventListener?.('message', (event: { data: unknown }) =>
          deliver(event.data),
        );
      }
      port.start?.();
      const closed = () => {
        for (const l of closeListeners.splice(0)) l();
      };
      if (port.on) port.on('close', closed);
      else port.addEventListener?.('close', closed);
    },
    onClose: (listener) => closeListeners.push(listener),
  };
  return socketLink(
    {
      reconnect: undefined,
      idleMs: undefined,
      keepAlive: undefined,
      connect: async () => {
        listeners.length = 0;
        return connection;
      },
    },
    opts,
  );
}
