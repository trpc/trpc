import {
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Queue,
  RcRef,
  Scope,
  Stream,
} from 'effect';
import { Socket } from 'effect/socket';
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
import { decodeLines, encodeLine } from '../../internal/lines.ts';
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
import { makeDeferredDecoder, parseError, serializeInput } from './events.ts';

/** One open connection. @internal */
interface SocketConnection {
  send(message: ClientMessage): void;
  close(): void;
  onMessage(listener: (message: unknown) => void): void;
  onClose(listener: () => void): void;
}

/** What a call's inbox receives. */
type Signal =
  | { readonly _tag: 'message'; readonly message: CallMessage }
  /** The connection dropped; the call may be sent again on a new one. */
  | { readonly _tag: 'lost' }
  | { readonly _tag: 'fail'; readonly error: AnyTrpcError };

type CallMessage = Exclude<ServerMessage, { type: 'pong' }>;

const LOST: Signal = { _tag: 'lost' };

interface Connection {
  readonly socket: SocketConnection;
  /** Inboxes of the calls sent on this connection, by call id. */
  readonly calls: Map<number, Queue.Queue<Signal>>;
  /** Messages received, so a keep-alive check can tell if it heard back. */
  received: number;
  lost: boolean;
}

interface Call {
  readonly op: Operation;
  /** Subscriptions are sent again after a reconnect. */
  readonly resumable: boolean;
  readonly request: () => ClientMessage;
  /** `true` once the call is complete. */
  readonly onMessage: (
    message: CallMessage,
  ) => Effect.Effect<boolean, AnyTrpcError>;
  /** The connection dropped and the call will be sent again. */
  readonly onReconnect?: Effect.Effect<void>;
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

function makeSocketLink(
  transport: SocketTransport,
  opts: SocketLinkOptions,
): SocketLink {
  const serializer = opts.serializer ?? defaultSerializer;
  /** Every call's inbox, so `close()` can fail them wherever they are. */
  const live = new Set<Queue.Queue<Signal>>();
  let current: Connection | undefined;

  const revive = (message: Extract<ServerMessage, { type: 'error' }>) => {
    try {
      return fromWireError(
        serializer.deserialize(message.body as never),
        message.status,
      );
    } catch (cause) {
      return parseError('Invalid error message')(cause);
    }
  };

  function dispatch(conn: Connection, raw: unknown) {
    if (typeof raw !== 'object' || raw === null) return;
    const message = raw as ServerMessage;
    conn.received++;
    if (message.type === 'pong') return;
    if (message.id === null) {
      if (message.type !== 'error') return;
      const signal: Signal = { _tag: 'fail', error: revive(message) };
      for (const inbox of conn.calls.values()) Queue.offerUnsafe(inbox, signal);
      conn.calls.clear();
      return;
    }
    const inbox = conn.calls.get(message.id);
    if (inbox) Queue.offerUnsafe(inbox, { _tag: 'message', message });
  }

  function lose(conn: Connection) {
    if (conn.lost) return;
    conn.lost = true;
    for (const inbox of conn.calls.values()) Queue.offerUnsafe(inbox, LOST);
    conn.calls.clear();
    Effect.runFork(RcRef.invalidate(connection));
  }

  /** A connection that answers nothing within `timeoutMs` of a ping is lost. */
  const keepAlive = (
    conn: Connection,
    { intervalMs, timeoutMs }: { intervalMs: number; timeoutMs: number },
  ) =>
    Effect.gen(function* () {
      for (;;) {
        yield* Effect.sleep(intervalMs);
        const received = conn.received;
        conn.socket.send({ type: 'ping' });
        yield* Effect.sleep(timeoutMs);
        if (conn.received === received) {
          lose(conn);
          conn.socket.close();
          return;
        }
      }
    });

  const acquire = Effect.gen(function* () {
    const socket = yield* Effect.tryPromise({
      try: () => transport.connect(),
      catch: lostError,
    });
    const conn: Connection = {
      socket,
      calls: new Map(),
      received: 0,
      lost: false,
    };
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        conn.lost = true;
        if (current === conn) current = undefined;
        socket.close();
      }),
    );
    const params = yield* Effect.tryPromise({
      try: async () =>
        typeof opts.connectionParams === 'function'
          ? await opts.connectionParams()
          : opts.connectionParams,
      catch: lostError,
    });
    socket.onMessage((message) => dispatch(conn, message));
    socket.onClose(() => lose(conn));
    socket.send({
      type: 'init',
      version: PROTOCOL_VERSION,
      ...(params ? { connectionParams: params } : {}),
    });
    if (transport.keepAlive) {
      yield* Effect.forkScoped(keepAlive(conn, transport.keepAlive));
    }
    current = conn;
    return conn;
  });

  /**
   * Shared by every call and released when the last one ends; `idleMs`
   * later the connection closes. A lost connection is invalidated, so the
   * next call opens a new one.
   */
  const connection = Effect.runSync(
    RcRef.make({
      acquire,
      idleTimeToLive: transport.idleMs ?? Duration.infinity,
    }).pipe(Scope.provide(Scope.makeUnsafe())),
  );

  /** A connection that isn't lost, or `undefined` if none opens. */
  const connected: Effect.Effect<Connection | undefined, never, Scope.Scope> =
    Effect.gen(function* () {
      for (;;) {
        const conn = yield* Effect.option(RcRef.get(connection));
        if (conn._tag === 'None') return undefined;
        if (!conn.value.lost) return conn.value;
        yield* RcRef.invalidate(connection);
      }
    });

  /**
   * Sends the call on one connection. `complete`, or the connection dropped
   * and `heard` says whether it had answered anything, so the next
   * reconnect counts from the first attempt again.
   */
  const attach = (
    call: Call,
    inbox: Queue.Queue<Signal>,
  ): Effect.Effect<'complete' | 'heard' | 'silent', AnyTrpcError> =>
    Effect.gen(function* () {
      const request = yield* Effect.try({
        try: call.request,
        catch: (cause) => cause as AnyTrpcError,
      });
      const conn = yield* connected;
      if (!conn) return 'silent';
      const { id } = call.op;
      let complete = false;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          if (conn.calls.get(id) !== inbox) return;
          conn.calls.delete(id);
          if (!complete) conn.socket.send({ id, type: 'abort' });
        }),
      );
      conn.calls.set(id, inbox);
      conn.socket.send(request);
      for (;;) {
        const signal = yield* Queue.take(inbox);
        switch (signal._tag) {
          case 'lost':
            return conn.received > 0 ? 'heard' : 'silent';
          case 'fail':
            complete = true;
            return yield* Effect.fail(signal.error);
          case 'message': {
            const { type } = signal.message;
            complete =
              type === 'done' ||
              type === 'error' ||
              (type === 'result' && !signal.message.deferred);
            if (yield* call.onMessage(signal.message)) return 'complete';
          }
        }
      }
    }).pipe(Effect.scoped);

  /**
   * Runs a call to completion. A dropped connection fails it with
   * `NETWORK_ERROR`, unless it's a subscription the link reconnects.
   */
  const run = (call: Call): Effect.Effect<void, AnyTrpcError> =>
    Effect.gen(function* () {
      const inbox = yield* Queue.unbounded<Signal>();
      live.add(inbox);
      yield* Effect.addFinalizer(() => Effect.sync(() => live.delete(inbox)));
      const { reconnect } = transport;
      let attempt = 0;
      for (;;) {
        const outcome = yield* attach(call, inbox);
        if (outcome === 'complete') return;
        if (outcome === 'heard') attempt = 0;
        if (
          !call.resumable ||
          !reconnect ||
          call.op.context.reconnect === false ||
          ++attempt > reconnect.attempts
        ) {
          return yield* Effect.fail(lostError());
        }
        if (call.onReconnect) yield* call.onReconnect;
        // `close()` can fail the call while it waits.
        const signal = yield* Queue.take(inbox).pipe(
          Effect.timeoutOption(reconnect.delayMs(attempt)),
        );
        if (signal._tag === 'Some' && signal.value._tag === 'fail') {
          return yield* Effect.fail(signal.value.error);
        }
      }
    }).pipe(Effect.scoped);

  const request = (op: Operation, lastEventId?: string): ClientMessage => ({
    id: op.id,
    type: 'request',
    method: op.type,
    path: op.path,
    ...(op.input === undefined
      ? {}
      : { input: serializeInput(serializer, op.input) }),
    ...(lastEventId === undefined ? {} : { lastEventId }),
    ...(op.trace === undefined ? {} : { trace: { ...op.trace } }),
  });

  /**
   * The call runs on its own fiber, which outlives the returned value when
   * the result has deferred parts still streaming in.
   */
  const single = (op: Operation): OperationStream =>
    Stream.fromEffect(
      Effect.gen(function* () {
        const result = yield* Deferred.make<unknown, AnyTrpcError>();
        const decoder = makeDeferredDecoder(serializer);
        const call: Call = {
          op,
          resumable: false,
          request: () => request(op),
          onMessage: (message) => {
            switch (message.type) {
              case 'result':
                return decoder
                  .decode(message.body, message.deferred ? 0 : undefined)
                  .pipe(
                    Effect.flatMap((value) => {
                      const settle = value.pipe(
                        Effect.mapError(parseError('Invalid result')),
                        Effect.exit,
                        Effect.flatMap((exit) => Deferred.done(result, exit)),
                      );
                      return message.deferred
                        ? Effect.asVoid(Effect.forkDetach(settle))
                        : settle;
                    }),
                    Effect.as(!message.deferred),
                  );
              case 'chunk':
                return Effect.as(decoder.chunk(0, message.chunk), false);
              case 'error':
                return Effect.fail(revive(message));
              case 'done':
                return Effect.succeed(true);
              default:
                return Effect.succeed(false);
            }
          },
        };
        const fiber = yield* run(call).pipe(
          Effect.onError((cause) => Deferred.failCause(result, cause)),
          Effect.ensuring(decoder.close),
          Effect.forkDetach,
        );
        return yield* Deferred.await(result).pipe(
          Effect.onInterrupt(() => Fiber.interrupt(fiber)),
        );
      }),
    );

  const subscription = (op: Operation): OperationStream =>
    Stream.callback<Effect.Effect<unknown, AnyTrpcError>, AnyTrpcError>(
      (queue) => {
        let lastEventId = op.lastEventId;
        let decoder = makeDeferredDecoder(serializer);
        const call: Call = {
          op,
          resumable: true,
          request: () => request(op, lastEventId),
          onMessage: (message) => {
            switch (message.type) {
              case 'event':
                if (message.eventId !== undefined)
                  lastEventId = message.eventId;
                return decoder.decode(message.body, message.deferred).pipe(
                  Effect.map((value) => {
                    Queue.offerUnsafe(
                      queue,
                      Effect.mapError(value, parseError('Invalid event')),
                    );
                    return false;
                  }),
                );
              case 'chunk':
                return Effect.as(
                  decoder.chunk(message.event ?? 0, message.chunk),
                  false,
                );
              case 'chunkEnd':
                return Effect.as(decoder.end(message.event), false);
              case 'error':
                return Effect.fail(revive(message));
              case 'done':
                return Effect.succeed(true);
              default:
                return Effect.succeed(false);
            }
          },
          onReconnect: Effect.suspend(() => {
            const stale = decoder;
            decoder = makeDeferredDecoder(serializer);
            return stale.close;
          }),
        };
        return run(call).pipe(
          Effect.matchCause({
            onSuccess: () => Queue.endUnsafe(queue),
            onFailure: (cause) => Queue.failCauseUnsafe(queue, cause),
          }),
          Effect.ensuring(Effect.suspend(() => decoder.close)),
          Effect.forkScoped,
        );
      },
    ).pipe(Stream.mapEffect((value) => value));

  const close = () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const signal: Signal = {
          _tag: 'fail',
          error: new TrpcError({
            code: 'CLIENT_CLOSED_REQUEST',
            message: 'The link was closed',
          }),
        };
        for (const inbox of live) Queue.offerUnsafe(inbox, signal);
        const conn = current;
        yield* RcRef.invalidate(connection);
        if (conn) {
          conn.lost = true;
          conn.socket.close();
        }
      }),
    );

  const link: TrpcLink = ({ op }) =>
    op.type === 'subscription' ? subscription(op) : single(op);
  return withSerializer(
    Object.assign(link, { close, [Symbol.asyncDispose]: close }),
    serializer,
  );
}

/**
 * Reconnect, idle and keep-alive options of {@link wsLink} and
 * {@link socketLink}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface ConnectionLinkOptions {
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
   * Ping after `intervalMs` of each check. A connection that answers nothing within
   * `timeoutMs` is treated as lost, so it reconnects instead of waiting for
   * a close that a dead network never delivers. The traffic also keeps
   * proxies from dropping a quiet socket. `false` sends no pings.
   * @default { intervalMs: 30_000, timeoutMs: 10_000 }
   */
  keepAlive?: false | { intervalMs?: number; timeoutMs?: number };
}

const connectionOptions = (
  opts: ConnectionLinkOptions,
): Omit<SocketTransport, 'connect'> => ({
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
});

/**
 * Options for {@link wsLink}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface WebSocketLinkOptions
  extends SocketLinkOptions, ConnectionLinkOptions {
  /** The endpoint, e.g. `ws://localhost:3000/trpc`. */
  url: string | URL;
  /** A `WebSocket` implementation. @default globalThis.WebSocket */
  WebSocket?: new (url: string | URL) => WebSocket;
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
  return makeSocketLink(
    {
      ...connectionOptions(opts),
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
  return makeSocketLink(
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

/**
 * Options for {@link socketLink}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface RawSocketLinkOptions
  extends SocketLinkOptions, ConnectionLinkOptions {
  /**
   * Opens a connection: an Effect `Socket`, like
   * `NodeSocket.makeNet({ host, port })` from `@effect/platform-node`. It
   * runs again for each reconnect.
   */
  socket: Effect.Effect<Socket.Socket, unknown>;
}

/**
 * Sends every call over a raw socket (TCP, TLS, a Unix socket), to a
 * server run with `serveSocket()` from `trpcdev/socket`. Messages are the
 * WebSocket ones, one JSON value per line; reconnects, keep-alive pings
 * and resumed subscriptions work as on {@link wsLink}.
 *
 * @example
 * ```ts
 * import { NodeSocket } from '@effect/platform-node';
 *
 * createTrpcClient<AppRouter>({
 *   links: [socketLink({ socket: NodeSocket.makeNet({ host: 'localhost', port: 4000 }) })],
 * });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function socketLink(opts: RawSocketLinkOptions): SocketLink {
  const connect = Effect.gen(function* () {
    const scope = yield* Scope.make();
    const socket = yield* opts.socket;
    const writer = yield* Scope.provide(socket.writer, scope);
    const outbox = yield* Queue.unbounded<string | Socket.CloseEvent>();
    const listeners: Array<(message: unknown) => void> = [];
    const closers: Array<() => void> = [];
    yield* Effect.gen(function* () {
      for (;;) {
        const chunk = yield* Queue.take(outbox);
        yield* writer.write(chunk);
        if (Socket.isCloseEvent(chunk)) return;
      }
    }).pipe(Effect.ignore, Effect.forkIn(scope));
    yield* decodeLines(Socket.toStream(socket)).pipe(
      Stream.runForEach((line) =>
        Effect.sync(() => {
          let message: unknown;
          try {
            message = JSON.parse(line);
          } catch {
            return;
          }
          for (const listener of listeners) listener(message);
        }),
      ),
      Effect.ignore,
      Effect.ensuring(
        Effect.sync(() => {
          for (const close of closers.splice(0)) close();
        }),
      ),
      Effect.andThen(Scope.close(scope, Exit.void)),
      Effect.forkIn(scope),
    );
    return {
      send: (message) => {
        Queue.offerUnsafe(outbox, encodeLine(message));
      },
      close: () => {
        Queue.offerUnsafe(outbox, new Socket.CloseEvent(1000));
      },
      onMessage: (listener) => listeners.push(listener),
      onClose: (listener) => closers.push(listener),
    } satisfies SocketConnection;
  });
  return makeSocketLink(
    {
      ...connectionOptions(opts),
      connect: () => Effect.runPromise(connect),
    },
    opts,
  );
}
