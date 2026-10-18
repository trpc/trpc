import { decodeMessage } from '../../internal/frames.ts';
import {
  Channel,
  Data,
  Deferred,
  Duration,
  Effect,
  Fiber,
  Option,
  PubSub,
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
import type { FormOfOptions, MaybePromise } from '../../internal/types.ts';
import { jsonSerializer, type AnySerializer } from '../../serializer/index.ts';
import type { MessagePortLike } from '../../server/sockets/index.ts';
import {
  withSerializer,
  type Operation,
  type OperationStream,
  type LinkDecl,
  type TrpcLink,
} from '../link.ts';
import { makeDeferredDecoder, badResponse, serializeInput } from './events.ts';

/** One open connection. @internal */
interface SocketConnection {
  /** Sends in order; once the connection is closing, sends nothing. */
  send(message: ClientMessage): void;
  close(): void;
  /** The server's messages; ends or fails when the connection drops. */
  readonly messages: Stream.Stream<unknown, unknown>;
}

/** What a call's inbox receives. */
type Signal = Data.TaggedEnum<{
  Message: { readonly message: CallMessage };
  /** The connection dropped; the call may be sent again on a new one. */
  Lost: {};
  Fail: { readonly error: AnyTrpcError };
}>;
const Signal = Data.taggedEnum<Signal>();

type CallMessage = Exclude<ServerMessage, { type: 'pong' } | { type: 'init' }>;

const LOST = Signal.Lost();

/** How a call's time on one connection ended. */
type Outcome = 'complete' | 'heard' | 'silent';

interface Connection {
  readonly socket: SocketConnection;
  /** Inboxes of the calls sent on this connection, by call id. */
  readonly calls: Map<number, Queue.Queue<Signal>>;
  /** Messages received, so a keep-alive check can tell if it heard back. */
  received: number;
  lost: boolean;
  /** The server named another serializer: calls on this connection fail with it. */
  refused?: AnyTrpcError;
}

interface Call {
  readonly op: Operation;
  readonly request: () => ClientMessage;
  /** `true` once the call is complete. */
  readonly onMessage: (
    message: CallMessage,
  ) => Effect.Effect<boolean, AnyTrpcError>;
  /** Subscriptions only: they are sent again after a reconnect, and this runs first. */
  readonly onReconnect?: Effect.Effect<void>;
}

/**
 * Options shared by {@link wsLink} and {@link experimental_messagePortLink}.
 * @since 0.1.0
 * @stability stable
 */
export interface SocketLinkOptions {
  /**
   * Must match the server's; on another one, calls fail with
   * `UNSUPPORTED_PROTOCOL`. Client types follow it.
   * @default jsonSerializer
   */
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
 * @since 0.1.0
 * @stability stable
 */
export interface SocketLink<TDecl extends LinkDecl = {}>
  extends TrpcLink<TDecl>, AsyncDisposable {
  /**
   * Closes the connection. Calls in flight fail with
   * `CLIENT_CLOSED_REQUEST`; the next call opens a new connection.
   */
  close(): Promise<void>;
}

interface SocketTransport {
  /** The link's name, for errors. */
  name: string;
  /** Opens a connection, which closes with the scope. */
  connect: Effect.Effect<SocketConnection, unknown, Scope.Scope>;
  reconnect:
    | { attempts: number; delayMs: (attempt: number) => number }
    | undefined;
  idleMs: number | undefined;
  keepAlive: { intervalMs: number; timeoutMs: number } | undefined;
  /** Ask the server for binary messages. */
  binary?: boolean;
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
  const serializer = opts.serializer ?? jsonSerializer;
  /** Every call's inbox, so `close()` can fail them wherever they are. */
  const live = new Set<Queue.Queue<Signal>>();
  let current: Connection | undefined;
  /** Bumped by `close()`, which can't reach a connection still opening. */
  let closes = 0;

  const revive = (message: Extract<ServerMessage, { type: 'error' }>) => {
    try {
      return fromWireError(serializer.deserialize(message.body as never));
    } catch (cause) {
      return badResponse('Invalid error message')(cause);
    }
  };

  function dispatch(conn: Connection, raw: unknown) {
    if (typeof raw !== 'object' || raw === null) return;
    const message = raw as ServerMessage;
    conn.received++;
    if (message.type === 'pong') return;
    if (message.type === 'init') {
      if (message.serializer === serializer.name) return;
      const error = new TrpcError({
        code: 'UNSUPPORTED_PROTOCOL',
        message: `The server uses the '${message.serializer}' serializer, but this ${transport.name} uses '${serializer.name}'. Pass the same serializer to the handler and ${transport.name}.`,
      });
      conn.refused = error;
      for (const inbox of conn.calls.values())
        Queue.offerUnsafe(inbox, Signal.Fail({ error }));
      conn.calls.clear();
      return;
    }
    if (message.id === null) {
      if (message.type !== 'error') return;
      const signal = Signal.Fail({ error: revive(message) });
      for (const inbox of conn.calls.values()) Queue.offerUnsafe(inbox, signal);
      conn.calls.clear();
      return;
    }
    const inbox = conn.calls.get(message.id);
    if (inbox) Queue.offerUnsafe(inbox, Signal.Message({ message }));
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
    timing: { intervalMs: number; timeoutMs: number },
  ) =>
    Effect.gen(function* () {
      for (;;) {
        yield* Effect.sleep(timing.intervalMs);
        const received = conn.received;
        conn.socket.send({ type: 'ping' });
        yield* Effect.sleep(timing.timeoutMs);
        if (conn.received === received) {
          lose(conn);
          conn.socket.close();
          return;
        }
      }
    });

  const acquire = Effect.gen(function* () {
    const epoch = closes;
    const socket = yield* Effect.mapError(transport.connect, lostError);
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
      }),
    );
    const params = yield* Effect.tryPromise({
      try: async () =>
        typeof opts.connectionParams === 'function'
          ? await opts.connectionParams()
          : opts.connectionParams,
      catch: lostError,
    });
    if (closes !== epoch) {
      conn.lost = true;
      socket.close();
      return conn;
    }
    yield* socket.messages.pipe(
      Stream.runForEach((message) =>
        Effect.sync(() => dispatch(conn, message)),
      ),
      Effect.ignore,
      // The messages ended on their own; a released connection interrupts
      // this fiber instead.
      Effect.andThen(Effect.sync(() => lose(conn))),
      Effect.forkScoped,
    );
    socket.send({
      type: 'init',
      version: PROTOCOL_VERSION,
      ...(params ? { connectionParams: params } : {}),
      ...(transport.binary ? { binary: true } : {}),
      serializer: serializer.name,
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

  /**
   * A connection that isn't lost, or `undefined` if none opens. Fails with
   * the error `close()` gave the call while it waited.
   */
  const connected = (
    inbox: Queue.Queue<Signal>,
  ): Effect.Effect<Connection | undefined, AnyTrpcError, Scope.Scope> =>
    Effect.gen(function* () {
      for (;;) {
        const signal = yield* Queue.poll(inbox);
        if (Option.isSome(signal) && Signal.$is('Fail')(signal.value)) {
          return yield* Effect.fail(signal.value.error);
        }
        const conn = yield* Effect.option(RcRef.get(connection));
        if (Option.isNone(conn)) return undefined;
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
  ): Effect.Effect<Outcome, AnyTrpcError> =>
    Effect.gen(function* () {
      const request = yield* Effect.try({
        try: call.request,
        catch: (cause) => cause as AnyTrpcError,
      });
      const conn = yield* connected(inbox);
      if (!conn) return 'silent';
      if (conn.refused) return yield* Effect.fail(conn.refused);
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
        const outcome = yield* Signal.$match(signal, {
          Lost: () =>
            Effect.succeed<Outcome>(conn.received > 0 ? 'heard' : 'silent'),
          Fail: (fail) => {
            complete = true;
            return Effect.fail(fail.error);
          },
          Message: ({ message }) => {
            const { type } = message;
            complete =
              type === 'done' ||
              type === 'error' ||
              (type === 'result' && !message.deferred);
            return Effect.map(
              call.onMessage(message),
              (done): Outcome | undefined => (done ? 'complete' : undefined),
            );
          },
        });
        if (outcome) return outcome;
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
          !call.onReconnect ||
          !reconnect ||
          call.op.context.reconnect === false ||
          ++attempt > reconnect.attempts
        ) {
          return yield* Effect.fail(lostError());
        }
        yield* call.onReconnect;
        // `close()` can fail the call while it waits.
        const signal = yield* Queue.take(inbox).pipe(
          Effect.timeoutOption(reconnect.delayMs(attempt)),
        );
        if (Option.isSome(signal) && Signal.$is('Fail')(signal.value)) {
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
          request: () => request(op),
          onMessage: (message) => {
            switch (message.type) {
              case 'result':
                return decoder
                  .decode(message.body, message.deferred ? 0 : undefined)
                  .pipe(
                    Effect.flatMap((value) => {
                      const settle = value.pipe(
                        Effect.mapError(badResponse('Invalid result')),
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
                      Effect.mapError(value, badResponse('Invalid event')),
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
        const signal = Signal.Fail({
          error: new TrpcError({
            code: 'CLIENT_CLOSED_REQUEST',
            message: 'The link was closed',
          }),
        });
        closes++;
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
 * {@link experimental_socketLink}.
 * @since 0.1.0
 * @stability stable
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
  idleMs?: number | undefined;
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
): Omit<SocketTransport, 'connect' | 'name'> => ({
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
 * A connection over an Effect `Socket`: sends go to its writer in order
 * through one queue, and `messages` reads it. A message whose turn comes
 * when `writable()` is false is dropped.
 */
const socketConnection = (
  socket: Socket.Socket,
  opts: {
    encode: (message: ClientMessage) => string;
    messages: Stream.Stream<unknown, unknown>;
    writable?: () => boolean;
  },
): Effect.Effect<SocketConnection, never, Scope.Scope> =>
  Effect.gen(function* () {
    const writer = yield* socket.writer;
    const outbox = yield* Queue.unbounded<string | Socket.CloseEvent>();
    yield* Queue.take(outbox).pipe(
      Effect.flatMap((chunk) =>
        typeof chunk === 'string' && opts.writable?.() === false
          ? Effect.void
          : writer.write(chunk),
      ),
      Effect.forever,
      Effect.ignore,
      Effect.forkScoped,
    );
    return {
      send: (message) => {
        Queue.offerUnsafe(outbox, opts.encode(message));
      },
      close: () => {
        Queue.offerUnsafe(outbox, new Socket.CloseEvent(1000));
      },
      messages: opts.messages,
    };
  });

/** A socket's frames as they arrive; fails when it closes. */
const frames = (
  reader: Socket.Reader,
): Stream.Stream<string | Uint8Array, Socket.SocketError> =>
  Stream.fromChannel(Channel.fromTransform(() => Effect.succeed(reader.pull)));

/** A WebSocket message: JSON text, or a binary frame. */
const decodeFrame = (frame: string | Uint8Array): unknown => {
  if (typeof frame !== 'string') return decodeMessage(frame);
  try {
    return JSON.parse(frame);
  } catch {
    return undefined;
  }
};

/**
 * Options for {@link wsLink}.
 * @since 0.1.0
 * @stability stable
 */
export interface WebSocketLinkOptions
  extends SocketLinkOptions, ConnectionLinkOptions {
  /** The endpoint, e.g. `ws://localhost:3000/trpc`. */
  url: string | URL;
  /** A `WebSocket` implementation. @default globalThis.WebSocket */
  WebSocket?: new (url: string | URL) => WebSocket;
  /**
   * Ask for file bytes in outputs as binary messages instead of base64
   * text. Other messages stay text; servers that don't know binary
   * messages keep sending text.
   * @default false
   */
  binary?: boolean;
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
 * createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [splitLink({ condition: (op) => op.type === 'subscription', true: ws, false: httpLink({ url }) })],
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function wsLink<TOpts extends WebSocketLinkOptions>(
  opts: TOpts,
): SocketLink<{ form: FormOfOptions<TOpts> }>;
export function wsLink(opts: WebSocketLinkOptions): SocketLink<any> {
  const Impl = opts.WebSocket ?? globalThis.WebSocket;
  return makeSocketLink(
    {
      name: 'wsLink',
      ...connectionOptions(opts),
      binary: opts.binary === true,
      connect: Effect.gen(function* () {
        let dialed: WebSocket | undefined;
        const socket = yield* Socket.fromWebSocket(
          Effect.acquireRelease(
            Effect.try({
              try: () => (dialed = new Impl(opts.url)),
              catch: (cause) =>
                new Socket.SocketError({
                  reason: new Socket.SocketOpenError({
                    kind: 'Unknown',
                    cause,
                  }),
                }),
            }),
            (ws) => Effect.sync(() => ws.close(1000)),
          ),
          // A socket that doesn't open gets a close event; wait for it.
          { openTimeout: Duration.infinity },
        );
        // Dials the socket and waits for it to open; the scope closes it.
        const reader = yield* socket.reader;
        return yield* socketConnection(socket, {
          encode: (message) => JSON.stringify(message),
          messages: Stream.map(frames(reader), decodeFrame),
          // A closing socket may throw on `send` (Deno's does).
          writable: () => dialed?.readyState === 1,
        });
      }),
    },
    opts,
  );
}

/**
 * Options for {@link experimental_messagePortLink}.
 * @since 0.1.0
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
 * createTrpcClient({ router: routerType<AppRouter>(), links: [experimental_messagePortLink({ port: worker })] });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_messagePortLink<
  TOpts extends MessagePortLinkOptions,
>(opts: TOpts): SocketLink<{ form: FormOfOptions<TOpts> }>;
export function experimental_messagePortLink(
  opts: MessagePortLinkOptions,
): SocketLink<any> {
  const { port } = opts;
  // A port can't drop its listeners, so they're added once, on the first
  // connection, and every connection subscribes to what they hear.
  const received = Effect.runSync(PubSub.unbounded<unknown>());
  const portClosed = Deferred.makeUnsafe<void>();
  const listen = () => {
    const deliver = (message: unknown) =>
      PubSub.publishUnsafe(received, message);
    const closed = () => Deferred.doneUnsafe(portClosed, Effect.void);
    if (port.on) {
      port.on('message', deliver);
      port.on('close', closed);
    } else {
      port.addEventListener?.('message', (event: { data: unknown }) =>
        deliver(event.data),
      );
      port.addEventListener?.('close', closed);
    }
    port.start?.();
  };
  let listening = false;
  return makeSocketLink(
    {
      name: 'experimental_messagePortLink',
      reconnect: undefined,
      idleMs: undefined,
      keepAlive: undefined,
      connect: Effect.gen(function* () {
        const messages = yield* PubSub.subscribe(received);
        if (!listening) {
          listening = true;
          listen();
        }
        const closed = yield* Deferred.make<void>();
        return {
          send: (message) => port.postMessage(message),
          close: () => Deferred.doneUnsafe(closed, Effect.void),
          messages: Stream.fromSubscription(messages).pipe(
            Stream.interruptWhen(
              Effect.raceFirst(
                Deferred.await(closed),
                Deferred.await(portClosed),
              ),
            ),
          ),
        } satisfies SocketConnection;
      }),
    },
    opts,
  );
}

/**
 * Options for {@link experimental_socketLink}.
 * @since 0.1.0
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
 * server run with `serveSocket()` from `@trpc12/trpc/socket`. Messages are the
 * WebSocket ones, one JSON value per line; reconnects, keep-alive pings
 * and resumed subscriptions work as on {@link wsLink}.
 *
 * @example
 * ```ts
 * import { NodeSocket } from '@effect/platform-node';
 *
 * createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [experimental_socketLink({ socket: NodeSocket.makeNet({ host: 'localhost', port: 4000 }) })],
 * });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_socketLink(
  opts: RawSocketLinkOptions,
): SocketLink {
  const connect = Effect.gen(function* () {
    const socket = yield* opts.socket;
    return yield* socketConnection(socket, {
      encode: encodeLine,
      messages: decodeLines(Socket.toStream(socket)).pipe(
        Stream.map((line): unknown => {
          try {
            return JSON.parse(line);
          } catch {
            return undefined;
          }
        }),
      ),
    });
  });
  return makeSocketLink(
    {
      name: 'experimental_socketLink',
      ...connectionOptions(opts),
      connect,
    },
    opts,
  );
}
