import { decodeMessage } from '../../internal/frames.ts';
import {
  Cause,
  Channel,
  Data,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  FiberSet,
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
import {
  jsonTransformer,
  type AnyTransformer,
} from '../../transformer/index.ts';
import type { MessagePortLike } from '../../server/sockets/index.ts';
import {
  withTransformer,
  type BuiltinCallOptions,
  type Operation,
  type OperationStream,
  type LinkDecl,
  type TrpcLink,
} from '../link.ts';
import {
  type DeferredDecoder,
  makeDeferredDecoder,
  badResponse,
  serializeInput,
} from './events.ts';

/** One open connection. @internal */
interface SocketConnection {
  /** Sends in order; once the connection is closing, sends nothing. */
  send(message: ClientMessage): void;
  close(): void;
  /** The server's messages; ends or fails when the connection drops. */
  readonly messages: Stream.Stream<unknown, unknown>;
}

/**
 * What a call's inbox receives. A subscription that moves is on two
 * connections at once, so the signals say which one they're about.
 */
type Signal = Data.TaggedEnum<{
  /** For the call sent under `message.id`. */
  Message: { readonly message: CallMessage };
  /** `conn` dropped; the call may be sent again on a new one. */
  Lost: { readonly conn: Connection };
  /**
   * The server asked to reconnect, and the shared connection is the
   * successor: a subscription on a superseded connection subscribes there,
   * and leaves the old one once the successor confirms.
   */
  Handover: {};
  /** From `conn`, or from `close()` and `dispose()` when it's `undefined`. */
  Fail: {
    readonly error: AnyTrpcError;
    readonly conn: Connection | undefined;
  };
}>;
const Signal = /* @__PURE__ */ Data.taggedEnum<Signal>();

const HANDOVER = /* @__PURE__ */ Signal.Handover();

type CallMessage = Exclude<
  ServerMessage,
  | { type: 'pong' }
  | { type: 'init' }
  | { type: 'reconnect'; drainIn: number | null }
>;

/** No connection opened, and `unopened` says why. */
interface Unopened {
  readonly unopened: AnyTrpcError;
}

/**
 * How a call's time on its connections ended. `stale`: the connection was
 * lost or superseded before the call was sent on it.
 */
type Outcome = 'complete' | 'heard' | 'silent' | 'stale' | Unopened;

interface Connection {
  readonly socket: SocketConnection;
  /** The calls sent on this connection, by the id they were sent under. */
  readonly calls: Map<
    number,
    {
      readonly inbox: Queue.Queue<Signal>;
      /** A subscription that moves to the next connection on `reconnect`. */
      readonly moves: boolean;
    }
  >;
  /** Messages received, so a keep-alive check can tell if it heard back. */
  received: number;
  lost: boolean;
  /** Done once `lost` is. */
  readonly closed: Deferred.Deferred<void>;
  /**
   * The server sent `reconnect`: a successor opens, and new calls still
   * come here until it's ready.
   */
  retired: boolean;
  /**
   * Its successor is ready: new calls go there, and this one closes once
   * the calls sent on it settle and its subscriptions have moved.
   */
  superseded: boolean;
  /** Done when the last subscription that moves leaves; `undefined` unless someone waits. */
  moved: Deferred.Deferred<void> | undefined;
  /** The server named another transformer: calls on this connection fail with it. */
  refused?: AnyTrpcError;
}

/** A call sent on one connection. */
interface Leg {
  readonly conn: Connection;
  /** The id it was sent under. */
  readonly id: number;
  /** Holds `conn` open; closing it sends `abort` unless the call is `complete`. */
  readonly scope: Scope.Closeable;
  /** The server ended the call on this leg, or it was sent `abort`. */
  complete: boolean;
  /**
   * Sent with a `lastEventId`: the server resends what came after it, so
   * moving the call here can stop it on the old connection at once.
   */
  readonly resumes: boolean;
  /** Decodes this leg's deferred values; closed with `scope`. */
  readonly decoder: DeferredDecoder;
}

const isLeg = (value: Leg | 'stale' | Unopened): value is Leg =>
  typeof value === 'object' && 'conn' in value;

const markLost = (conn: Connection) => {
  conn.lost = true;
  Deferred.doneUnsafe(conn.closed, Effect.void);
};

const movesLeft = (conn: Connection) => {
  for (const entry of conn.calls.values()) if (entry.moves) return true;
  return false;
};

const notifyMoved = (conn: Connection) => {
  if (conn.moved && !movesLeft(conn))
    Deferred.doneUnsafe(conn.moved, Effect.void);
};

/** Removes call `id` from `conn`, telling a waiting supervisor when no subscription is left to move. */
const leave = (conn: Connection, id: number) => {
  conn.calls.delete(id);
  notifyMoved(conn);
};

interface Call {
  readonly op: Operation;
  /** The request, under the id of the attempt that sends it. */
  readonly request: (id: number) => ClientMessage;
  /**
   * `true` once the call is complete. `decoder` is the leg's, so each
   * connection's deferred values decode apart.
   */
  readonly onMessage: (
    message: CallMessage,
    decoder: DeferredDecoder,
  ) => Effect.Effect<boolean, AnyTrpcError>;
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
   * @default jsonTransformer
   */
  transformer?: AnyTransformer;
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
  /**
   * Ends the link for good: calls in flight and every later call fail with
   * `CLIENT_CLOSED_REQUEST`, and the connection closes. `await using` calls
   * it.
   */
  dispose(): Promise<void>;
}

interface KeepAlive {
  interval: Duration.Duration;
  timeout: Duration.Duration;
}

interface SocketTransport {
  /** The link's name, for errors. */
  name: string;
  /** Opens a connection, which closes with the scope. */
  connect: Effect.Effect<SocketConnection, unknown, Scope.Scope>;
  reconnect:
    | { attempts: number; delay: (attempt: number) => Duration.Input }
    | undefined;
  idleTimeout: Duration.Duration | undefined;
  keepAlive: KeepAlive | undefined;
  /** Ask the server for binary messages. */
  binary?: boolean;
}

/**
 * What socket links fail calls with themselves: a lost connection, a
 * message that doesn't decode, and a stream cut off with it.
 */
type SocketErrors = 'NETWORK_ERROR' | 'BAD_RESPONSE' | 'STREAM_INTERRUPTED';

/** The call option links that reconnect read. */
type ReconnectOption = Pick<BuiltinCallOptions, 'reconnect'>;

const lostError = () =>
  new TrpcError({ code: 'NETWORK_ERROR', message: 'The connection was lost' });

const unopenedError = (cause: unknown) =>
  new TrpcError({
    code: 'NETWORK_ERROR',
    message: 'The connection could not be opened',
    cause,
  });

const closedError = (message: string) =>
  new TrpcError({ code: 'CLIENT_CLOSED_REQUEST', message });

/**
 * `scope` is the link's lifetime: it holds the shared connection, the
 * fibers the link starts outside a call's own (drops, calls whose output
 * streams on), and whatever the transport ties to it. `dispose()` closes it.
 */
function makeSocketLink(
  transport: SocketTransport,
  opts: SocketLinkOptions,
  scope: Scope.Closeable = Scope.makeUnsafe(),
): SocketLink<any> {
  const transformer = opts.transformer ?? jsonTransformer;
  /** Every call's inbox, so `close()` can fail them wherever they are. */
  const live = new Set<Queue.Queue<Signal>>();
  let current: Connection | undefined;
  /** A successor that opened, for `acquire` to take as the shared connection. */
  let prepared:
    | { readonly conn: Connection; readonly scope: Scope.Closeable }
    | undefined;
  /** Bumped by `close()`, which can't reach a connection still opening. */
  let closes = 0;
  /**
   * The last id a call was sent under. Each attempt gets its own, so frames
   * still arriving for one a retry replaced don't reach the retry, though
   * `retryLink` sends it with the same operation.
   */
  let sentIds = 0;
  /** Set by `dispose()`: the scope is closed, and every call fails. */
  let disposed = false;
  const disposedError = () => closedError('The link was disposed');

  const revive = (message: Extract<ServerMessage, { type: 'error' }>) => {
    try {
      return fromWireError(transformer.deserialize(message.body as never));
    } catch (cause) {
      return badResponse('Invalid error message')(cause);
    }
  };

  /** Fails every call on `conn` with `error`. */
  const refuse = (conn: Connection, error: AnyTrpcError) => {
    const signal = Signal.Fail({ error, conn });
    for (const { inbox } of conn.calls.values())
      Queue.offerUnsafe(inbox, signal);
    conn.calls.clear();
  };

  const dispatch = (conn: Connection, raw: unknown): Effect.Effect<void> =>
    Effect.suspend(() => {
      if (typeof raw !== 'object' || raw === null) return Effect.void;
      const message = raw as ServerMessage;
      conn.received++;
      if (message.type === 'pong') return Effect.void;
      if (message.type === 'init') {
        if (message.transformer === transformer.name) return Effect.void;
        const error = new TrpcError({
          code: 'UNSUPPORTED_PROTOCOL',
          tag: 'TransformerMismatch',
          message: `The server uses the '${message.transformer}' transformer, but this ${transport.name} uses '${transformer.name}'. Pass the same transformer to the handler and ${transport.name}.`,
        });
        conn.refused = error;
        refuse(conn, error);
        return Effect.void;
      }
      if (message.type === 'reconnect') {
        return transport.reconnect
          ? retire(conn, transport.reconnect, message.drainIn)
          : Effect.void;
      }
      if (message.id === null) {
        if (message.type !== 'error') return Effect.void;
        refuse(conn, revive(message));
        return Effect.void;
      }
      const entry = conn.calls.get(message.id);
      if (entry) Queue.offerUnsafe(entry.inbox, Signal.Message({ message }));
      return Effect.void;
    });

  /**
   * Invalidates the shared connection if it's still `conn`, so the next
   * call opens a new one. A connection with calls on it closes once they
   * release it.
   */
  const drop = (conn: Connection) =>
    Effect.suspend(() => {
      if (current !== conn) return Effect.void;
      current = undefined;
      return RcRef.invalidate(connection);
    });

  /**
   * Drops `conn` on a fiber of the link's: a connection's own fiber can't
   * close the scope it runs in.
   */
  const forkDrop = (conn: Connection) =>
    Effect.asVoid(Effect.forkIn(drop(conn), scope, { startImmediately: true }));

  const lose = (conn: Connection): Effect.Effect<void> =>
    Effect.suspend(() => {
      if (conn.lost) return Effect.void;
      markLost(conn);
      const signal = Signal.Lost({ conn });
      for (const { inbox } of conn.calls.values())
        Queue.offerUnsafe(inbox, signal);
      conn.calls.clear();
      return forkDrop(conn);
    });

  /** The fibers moving calls off retired connections; `close()` stops them. */
  const supervisors = Effect.runSync(
    Scope.provide(FiberSet.make<void, never>(), scope),
  );

  /**
   * The server's `reconnect`: the server still serves `conn`, so new calls
   * keep going there while a successor opens. At `drainIn` milliseconds,
   * when the server closes it, `conn` is lost if it's still open.
   */
  const retire = (
    conn: Connection,
    policy: NonNullable<SocketTransport['reconnect']>,
    drainIn: number | null,
  ): Effect.Effect<void> =>
    Effect.suspend(() => {
      if (conn.retired) return Effect.void;
      conn.retired = true;
      const deadline =
        typeof drainIn === 'number'
          ? FiberSet.run(
              supervisors,
              lose(conn).pipe(
                Effect.delay(Duration.millis(drainIn)),
                Effect.raceFirst(Deferred.await(conn.closed)),
              ),
            )
          : Effect.void;
      return Effect.asVoid(
        Effect.andThen(
          deadline,
          FiberSet.run(supervisors, supervise(conn, policy)),
        ),
      );
    });

  /**
   * Moves off `old`, which keeps serving until then:
   * 1. Opens a successor, waiting `delay` after each one that fails.
   * 2. Makes it the shared connection, so new calls go there.
   * 3. Hands each subscription on `old` over to it, and waits until all of
   *    them have moved. If the successor drops first, it starts again.
   *
   * It stops when `old` drops: its calls reconnect as after any drop.
   * `old` closes once the calls sent on it release it.
   */
  const supervise = (
    old: Connection,
    policy: NonNullable<SocketTransport['reconnect']>,
  ): Effect.Effect<void> => {
    let failures = 0;
    /** A successor's scope while it opens, until it's installed or closed. */
    let opening: Scope.Closeable | undefined;
    const backoff = Effect.suspend(() =>
      Effect.sleep(policy.delay(++failures)),
    );
    const closeOpening = Effect.suspend(() => {
      const pending = opening;
      opening = undefined;
      return pending ? Scope.close(pending, Exit.void) : Effect.void;
    });
    /** `next` becomes the shared connection, and `old` is superseded. */
    const install = (next: Connection) =>
      Effect.suspend(() => {
        old.superseded = true;
        current = undefined;
        prepared = { conn: next, scope: opening! };
        opening = undefined;
        return RcRef.invalidate(connection).pipe(
          Effect.andThen(Effect.scoped(RcRef.get(connection))),
          Effect.ignore,
        );
      }).pipe(Effect.uninterruptible);
    const successor = Effect.gen(function* () {
      for (;;) {
        opening = yield* Scope.make();
        const opened = yield* Effect.exit(Scope.provide(open, opening));
        if (Exit.isSuccess(opened)) {
          yield* install(opened.value);
          return opened.value;
        }
        yield* closeOpening;
        yield* backoff;
      }
    });
    return Effect.gen(function* () {
      for (;;) {
        const target = yield* successor;
        if (!movesLeft(old)) return;
        const moved = Deferred.makeUnsafe<void>();
        old.moved = moved;
        for (const { inbox, moves } of old.calls.values()) {
          if (moves) Queue.offerUnsafe(inbox, HANDOVER);
        }
        const settled = yield* Effect.raceFirst(
          Effect.as(Deferred.await(moved), true),
          Effect.as(Deferred.await(target.closed), false),
        );
        old.moved = undefined;
        if (settled) return;
        yield* backoff;
      }
    }).pipe(
      Effect.raceFirst(Deferred.await(old.closed)),
      Effect.ensuring(closeOpening),
    );
  };

  /**
   * Pings every `interval`. A connection that answers nothing within
   * `timeout` of a ping is lost.
   */
  const keepAlive = (conn: Connection, timing: KeepAlive) => {
    const answered = (received: number) =>
      Effect.sleep(timing.timeout).pipe(
        Effect.andThen(
          Effect.suspend(() =>
            conn.lost || conn.received !== received
              ? Effect.void
              : Effect.andThen(
                  lose(conn),
                  Effect.sync(() => conn.socket.close()),
                ),
          ),
        ),
      );
    return Effect.gen(function* () {
      while (!conn.lost) {
        yield* Effect.sleep(timing.interval);
        const received = conn.received;
        conn.socket.send({ type: 'ping' });
        yield* Effect.forkChild(answered(received));
      }
    });
  };

  /** Opens a connection, which closes with the scope, and sends `init`. */
  const open = Effect.gen(function* () {
    const epoch = closes;
    const socket = yield* Effect.mapError(transport.connect, unopenedError);
    const conn: Connection = {
      socket,
      calls: new Map(),
      received: 0,
      lost: false,
      closed: Deferred.makeUnsafe(),
      retired: false,
      superseded: false,
      moved: undefined,
    };
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        markLost(conn);
        if (current === conn) current = undefined;
      }),
    );
    const params = yield* Effect.tryPromise({
      try: async () =>
        typeof opts.connectionParams === 'function'
          ? await opts.connectionParams()
          : opts.connectionParams,
      catch: unopenedError,
    });
    if (closes !== epoch) {
      markLost(conn);
      socket.close();
      return conn;
    }
    yield* socket.messages.pipe(
      Stream.runForEach((message) => dispatch(conn, message)),
      Effect.ignore,
      // The messages ended on their own; a released connection interrupts
      // this fiber instead.
      Effect.andThen(lose(conn)),
      Effect.forkScoped,
    );
    socket.send({
      type: 'init',
      version: PROTOCOL_VERSION,
      ...(params ? { connectionParams: params } : {}),
      ...(transport.binary ? { binary: true } : {}),
      transformer: transformer.name,
    });
    if (transport.keepAlive) {
      yield* Effect.forkScoped(keepAlive(conn, transport.keepAlive));
    }
    return conn;
  });

  /** A successor `supervise` opened, or a new connection. */
  const acquire = Effect.gen(function* () {
    const next = prepared;
    prepared = undefined;
    if (next) {
      yield* Effect.addFinalizer(() => Scope.close(next.scope, Exit.void));
    }
    const conn = next ? next.conn : yield* open;
    current = conn;
    return conn;
  });

  /**
   * Shared by every call and released when the last one ends; `idleTimeout`
   * later the connection closes. A lost connection is invalidated, so the
   * next call opens a new one.
   */
  const connection = Effect.runSync(
    RcRef.make({
      acquire,
      idleTimeToLive: transport.idleTimeout ?? Duration.infinity,
    }).pipe(Scope.provide(scope)),
  );

  /**
   * The shared connection, or `Unopened` if none opens. Fails with the
   * error `close()` gave the call while it waited.
   */
  const connected = Effect.fnUntraced(function* (
    inbox: Queue.Queue<Signal>,
  ): Effect.fn.Return<Connection | Unopened, AnyTrpcError, Scope.Scope> {
    const signal = yield* Queue.poll(inbox);
    if (Option.isSome(signal) && Signal.$is('Fail')(signal.value)) {
      return yield* Effect.fail(signal.value.error);
    }
    // Disposing interrupts a connection still opening.
    const conn = yield* Effect.exit(RcRef.get(connection));
    if (disposed) return yield* Effect.fail(disposedError());
    if (Exit.isFailure(conn)) {
      return {
        unopened: Option.getOrElse(
          Cause.findErrorOption(conn.cause),
          lostError,
        ),
      };
    }
    return conn.value;
  });

  /**
   * Runs the call until it's `complete`, or the connection it's on drops
   * and `heard` says whether that one had answered anything, so the next
   * reconnect counts from the first attempt again; or `Unopened`, with the
   * error that kept it from opening.
   *
   * On `Handover`, a subscription subscribes on the successor from the
   * last event it handled, and stays on the old connection, which keeps
   * delivering, until the successor's first message for it (`started`, or
   * any other). Then it's stopped on the old one. The successor resends the
   * events the old one delivered meanwhile, and each is dropped once by its
   * id. A subscription that had no event id to resume from can't be resent
   * what the old one delivered before the successor listened, so the old
   * one's events, which can arrive twice, are delivered until it confirms
   * the stop with `done` or is lost. If the successor drops or fails first,
   * the call stays where it was.
   */
  const attach = Effect.fnUntraced(function* (
    call: Call,
    inbox: Queue.Queue<Signal>,
    moves: boolean,
  ): Effect.fn.Return<Outcome, AnyTrpcError, Scope.Scope> {
    /** One per connection the call holds; closing one ends the call there. */
    const scopes = new Set<Scope.Closeable>();
    yield* Effect.addFinalizer(() =>
      Effect.forEach([...scopes], (s) => Scope.close(s, Exit.void), {
        discard: true,
      }),
    );
    const end = (leg: Leg) => {
      scopes.delete(leg.scope);
      return Scope.close(leg.scope, Exit.void);
    };

    /**
     * Sends the call under a fresh id on the connection `take` gets, which
     * it holds; `stale` if that one is lost or superseded (it's dropped,
     * so the next try opens another).
     */
    const send = Effect.fnUntraced(function* (
      take: Effect.Effect<Connection | Unopened, AnyTrpcError, Scope.Scope>,
    ): Effect.fn.Return<Leg | 'stale' | Unopened, AnyTrpcError> {
      const id = ++sentIds;
      const request = yield* Effect.try({
        try: () => call.request(id),
        catch: (cause) => cause as AnyTrpcError,
      });
      const legScope = yield* Scope.make();
      scopes.add(legScope);
      const release = Effect.suspend(() => {
        scopes.delete(legScope);
        return Scope.close(legScope, Exit.void);
      });
      const conn = yield* Scope.provide(take, legScope).pipe(
        Effect.onError(() => release),
      );
      if ('unopened' in conn) {
        yield* release;
        return conn;
      }
      if (conn.refused) {
        yield* release;
        return yield* Effect.fail(conn.refused);
      }
      const leg: Leg = {
        conn,
        id,
        scope: legScope,
        complete: false,
        resumes:
          request.type === 'request' && request.lastEventId !== undefined,
        decoder: makeDeferredDecoder(transformer),
      };
      yield* Scope.addFinalizer(legScope, leg.decoder.close);
      yield* Scope.addFinalizer(
        legScope,
        Effect.sync(() => {
          if (conn.calls.get(id)?.inbox !== inbox) return;
          leave(conn, id);
          if (!leg.complete) conn.socket.send({ id, type: 'abort' });
        }),
      );
      // Checked as it's sent: nothing is sent on a superseded connection.
      const sent = yield* Effect.sync(() => {
        if (conn.lost || conn.superseded) return false;
        conn.calls.set(id, { inbox, moves });
        conn.socket.send(request);
        return true;
      });
      if (sent) return leg;
      yield* release;
      yield* drop(conn);
      return 'stale';
    });

    const first = yield* send(connected(inbox));
    if (!isLeg(first)) return first;
    let active = first;
    /** The successor's leg, until its first message. */
    let pending: Leg | undefined;
    /**
     * The event ids `active` delivered since `pending` subscribed, which
     * the successor sends again: it resumes from before them.
     */
    let overlap = new Set<string>();
    /** Legs a move stopped that deliver until the server confirms it, by id. */
    const leaving = new Map<CallMessage['id'], Leg>();
    const stopped = (leg: Leg) =>
      Effect.suspend(() => {
        leaving.delete(leg.id);
        return end(leg);
      });
    /** A message from a leg a move left. */
    const fromLeaving = (leg: Leg, message: CallMessage) =>
      message.type === 'done' || message.type === 'error'
        ? Effect.as(stopped(leg), undefined)
        : Effect.as(call.onMessage(message, leg.decoder), undefined);

    const handle = (leg: Leg, message: CallMessage) => {
      const { type } = message;
      leg.complete =
        type === 'done' ||
        type === 'error' ||
        (type === 'result' && !message.deferred);
      if (type === 'event' && message.eventId !== undefined && pending) {
        overlap.add(message.eventId);
      }
      return Effect.map(
        call.onMessage(message, leg.decoder),
        (done): Outcome | undefined => (done ? 'complete' : undefined),
      );
    };
    /**
     * Whether `message` repeats what the old connection delivered. A
     * dropped event's chunks are ignored: the leg's decoder doesn't know
     * its deferred values.
     */
    const resent = (message: CallMessage) => {
      if (message.type !== 'event' || overlap.size === 0) return false;
      if (message.eventId === undefined || !overlap.delete(message.eventId)) {
        overlap.clear();
        return false;
      }
      return true;
    };
    /** The move to `leg` fell through: the call stays on `active`. */
    const fallBack = (leg: Leg) =>
      Effect.suspend(() => {
        pending = undefined;
        overlap.clear();
        return Effect.as(end(leg), undefined);
      });
    /** `leg` answered: the call ends on `active` and continues on `leg`. */
    const promote = (leg: Leg) =>
      Effect.gen(function* () {
        const old = active;
        active = leg;
        pending = undefined;
        if (leg.resumes || old.conn.lost) {
          yield* end(old);
        } else {
          old.complete = true;
          old.conn.socket.send({ id: old.id, type: 'abort' });
          old.conn.calls.set(old.id, { inbox, moves: false });
          notifyMoved(old.conn);
          leaving.set(old.id, old);
        }
      });

    for (;;) {
      const signal = yield* Queue.take(inbox);
      const outcome: Outcome | undefined = yield* Signal.$match(signal, {
        Message: ({ message }) => {
          if (message.id === active.id) {
            // While a move is pending, `active` is the old connection.
            return !pending && resent(message)
              ? Effect.succeed(undefined)
              : handle(active, message);
          }
          const left = leaving.get(message.id);
          if (left) return fromLeaving(left, message);
          const leg = pending;
          if (!leg || message.id !== leg.id) return Effect.succeed(undefined);
          return Effect.andThen(
            promote(leg),
            message.type === 'started' || resent(message)
              ? Effect.succeed(undefined)
              : handle(leg, message),
          );
        },
        Lost: ({ conn }) => {
          const gone = [...leaving.values()].filter((leg) => leg.conn === conn);
          if (gone.length > 0) {
            return Effect.as(
              Effect.forEach(gone, stopped, { discard: true }),
              undefined,
            );
          }
          if (pending && conn === pending.conn) return fallBack(pending);
          if (conn !== active.conn) return Effect.succeed(undefined);
          // The successor already has the subscription, resent from before
          // what the old connection delivered since.
          if (pending) return Effect.as(promote(pending), undefined);
          return Effect.succeed<Outcome>(
            conn.received > 0 ? 'heard' : 'silent',
          );
        },
        Handover: () =>
          Effect.gen(function* () {
            if (!active.conn.superseded) return undefined;
            if (pending) yield* end(pending);
            pending = undefined;
            // Sent from the last event handled, so nothing before is resent.
            overlap = new Set();
            const leg = yield* send(RcRef.get(connection));
            if (isLeg(leg)) pending = leg;
            return undefined;
          }),
        Fail: (failure) => {
          const { conn } = failure;
          if (pending && conn === pending.conn) return fallBack(pending);
          if (conn && conn !== active.conn) return Effect.succeed(undefined);
          active.complete = true;
          return Effect.fail(failure.error);
        },
      });
      if (outcome) return outcome;
    }
  }, Effect.scoped);

  /**
   * Runs a call to completion. A dropped connection fails it with
   * `NETWORK_ERROR`, unless it's a subscription the link reconnects.
   */
  const run = Effect.fnUntraced(function* (
    call: Call,
  ): Effect.fn.Return<void, AnyTrpcError, Scope.Scope> {
    const inbox = yield* Queue.unbounded<Signal>();
    live.add(inbox);
    yield* Effect.addFinalizer(() => Effect.sync(() => live.delete(inbox)));
    const { reconnect } = transport;
    const moves =
      call.op.type === 'subscription' &&
      !!reconnect &&
      call.op.context.reconnect !== false;
    let attempt = 0;
    for (;;) {
      const outcome = yield* attach(call, inbox, moves);
      if (outcome === 'complete') return;
      if (outcome === 'stale') continue;
      if (outcome === 'heard') attempt = 0;
      if (!reconnect || !moves || ++attempt > reconnect.attempts) {
        return yield* Effect.fail(
          typeof outcome === 'object' ? outcome.unopened : lostError(),
        );
      }
      // `close()` can fail the call while it waits.
      const signal = yield* Queue.take(inbox).pipe(
        Effect.timeoutOption(reconnect.delay(attempt)),
      );
      if (Option.isSome(signal) && Signal.$is('Fail')(signal.value)) {
        return yield* Effect.fail(signal.value.error);
      }
    }
  }, Effect.scoped);

  const request = (
    id: number,
    op: Operation,
    lastEventId?: string,
  ): ClientMessage => ({
    id,
    type: 'request',
    method: op.type,
    path: op.path,
    ...(op.input === undefined
      ? {}
      : { input: serializeInput(transformer, op.input) }),
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
        const call: Call = {
          op,
          request: (id) => request(id, op),
          onMessage: (message, decoder) => {
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
                        ? Effect.asVoid(Effect.forkIn(settle, scope))
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
          // Disposing interrupts the fiber, as the link's scope closes.
          Effect.onError((cause) =>
            disposed
              ? Deferred.fail(result, disposedError())
              : Deferred.failCause(result, cause),
          ),
          Effect.forkIn(scope),
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
        const call: Call = {
          op,
          request: (id) => request(id, op, lastEventId),
          onMessage: (message, decoder) => {
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
        };
        return run(call).pipe(
          Effect.matchCause({
            onSuccess: () => Queue.endUnsafe(queue),
            onFailure: (cause) => Queue.failCauseUnsafe(queue, cause),
          }),
          Effect.forkScoped,
        );
      },
    ).pipe(Stream.mapEffect((value) => value));

  const failLive = (error: AnyTrpcError) => {
    const signal = Signal.Fail({ error, conn: undefined });
    for (const inbox of live) Queue.offerUnsafe(inbox, signal);
  };

  const close = () =>
    Effect.runPromise(
      Effect.gen(function* () {
        closes++;
        yield* FiberSet.clear(supervisors);
        failLive(closedError('The link was closed'));
        const conn = current;
        yield* RcRef.invalidate(connection);
        if (conn) {
          markLost(conn);
          conn.socket.close();
        }
      }),
    );

  const dispose = () =>
    Effect.runPromise(
      Effect.suspend(() => {
        if (disposed) return Effect.void;
        disposed = true;
        failLive(disposedError());
        return Scope.close(scope, Exit.void);
      }),
    );

  const link: TrpcLink = ({ op }) =>
    disposed
      ? Stream.fail(disposedError())
      : op.type === 'subscription'
        ? subscription(op)
        : single(op);
  return withTransformer(
    Object.assign(link, { close, dispose, [Symbol.asyncDispose]: dispose }),
    transformer,
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
   *
   * A server that drains (`handler.drain()`, `dispose()`, a stopping
   * `serve()`) sends `reconnect`: new calls stay on the old connection
   * until a new one is open and its `connectionParams` resolved, then go
   * there. Each subscription subscribes there from its last `tracked()`
   * event id and is stopped on the old connection once the new one answers
   * it; the events the new one resends are dropped by id. The old
   * connection closes once the queries and mutations sent on it settle and
   * every subscription has moved. Nothing already sent is sent again. A
   * subscription without tracked ids starts over on the new connection,
   * and may get an event twice while both deliver. One made with
   * `{ reconnect: false }` stays, and fails with `NETWORK_ERROR` when the
   * server closes the old connection.
   */
  reconnect?: {
    /** @default 5 */
    attempts?: number;
    /**
     * Delay before each reconnect: milliseconds, a string like `'2 seconds'`
     * or a `Duration`.
     * @default attempt => Math.min(1000 * 2 ** (attempt - 1), 30_000)
     */
    delay?: (attempt: number) => Duration.Input;
  };
  /**
   * Close the connection after this long without calls. The next call
   * reconnects.
   * @default undefined, stay open until `close()`
   */
  idleTimeout?: Duration.Input | undefined;
  /**
   * Ping every `interval`. A connection that answers nothing within
   * `timeout` of a ping is treated as lost, so it reconnects instead of waiting for
   * a close that a dead network never delivers. The traffic also keeps
   * proxies from dropping a quiet socket. `false` sends no pings.
   * @default { interval: '30 seconds', timeout: '10 seconds' }
   */
  keepAlive?: false | { interval?: Duration.Input; timeout?: Duration.Input };
}

const connectionOptions = (
  opts: ConnectionLinkOptions,
): Omit<SocketTransport, 'connect' | 'name'> => ({
  reconnect: {
    attempts: opts.reconnect?.attempts ?? 5,
    delay:
      opts.reconnect?.delay ??
      ((attempt) => Math.min(1000 * 2 ** (attempt - 1), 30_000)),
  },
  idleTimeout:
    opts.idleTimeout === undefined
      ? undefined
      : Duration.fromInputUnsafe(opts.idleTimeout),
  keepAlive:
    opts.keepAlive === false
      ? undefined
      : {
          interval: Duration.fromInputUnsafe(
            opts.keepAlive?.interval ?? '30 seconds',
          ),
          timeout: Duration.fromInputUnsafe(
            opts.keepAlive?.timeout ?? '10 seconds',
          ),
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
    const write = (chunk: string | Socket.CloseEvent) =>
      typeof chunk === 'string' && opts.writable?.() === false
        ? Effect.void
        : writer.write(chunk);
    yield* Queue.take(outbox).pipe(
      Effect.flatMap(write),
      Effect.forever,
      Effect.ignore,
      Effect.forkScoped,
    );
    // Runs before the writer is interrupted: a moved subscription's
    // `abort`, sent just before its last call releases the connection,
    // still goes out.
    yield* Effect.addFinalizer(() =>
      Queue.clear(outbox).pipe(
        Effect.flatMap((rest) =>
          Effect.forEach(rest, write, { discard: true }),
        ),
        Effect.ignore,
      ),
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
): SocketLink<{
  context: ReconnectOption;
  form: FormOfOptions<TOpts>;
  builtinErrors: SocketErrors;
}>;
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
              // Workers' WebSocket takes only a string.
              try: () => (dialed = new Impl(String(opts.url))),
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
>(
  opts: TOpts,
): SocketLink<{ form: FormOfOptions<TOpts>; builtinErrors: SocketErrors }>;
export function experimental_messagePortLink(
  opts: MessagePortLinkOptions,
): SocketLink<any> {
  const { port } = opts;
  const scope = Scope.makeUnsafe();
  // The listeners are added once, on the first connection, and every
  // connection subscribes to what they hear; `dispose()` removes them.
  const listening = Effect.runSync(
    Effect.cached(
      Effect.gen(function* () {
        const received = yield* PubSub.unbounded<unknown>();
        const closed = yield* Deferred.make<void>();
        const deliver = (message: unknown) =>
          PubSub.publishUnsafe(received, message);
        const onMessage = (event: { data: unknown }) => deliver(event.data);
        const close = () => Deferred.doneUnsafe(closed, Effect.void);
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            if (port.on) {
              port.on('message', deliver);
              port.on('close', close);
            } else {
              port.addEventListener?.('message', onMessage);
              port.addEventListener?.('close', close);
            }
            port.start?.();
          }),
          () =>
            Effect.sync(() => {
              if (port.on) {
                port.off?.('message', deliver);
                port.off?.('close', close);
              } else {
                port.removeEventListener?.('message', onMessage);
                port.removeEventListener?.('close', close);
              }
            }),
        );
        return { received, closed };
      }).pipe(Scope.provide(scope)),
    ),
  );
  return makeSocketLink(
    {
      name: 'experimental_messagePortLink',
      reconnect: undefined,
      idleTimeout: undefined,
      keepAlive: undefined,
      connect: Effect.gen(function* () {
        const heard = yield* listening;
        const messages = yield* PubSub.subscribe(heard.received);
        const closed = yield* Deferred.make<void>();
        return {
          send: (message) => port.postMessage(message),
          close: () => Deferred.doneUnsafe(closed, Effect.void),
          messages: Stream.fromSubscription(messages).pipe(
            Stream.interruptWhen(
              Effect.raceFirst(
                Deferred.await(closed),
                Deferred.await(heard.closed),
              ),
            ),
          ),
        } satisfies SocketConnection;
      }),
    },
    opts,
    scope,
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
 * server run with `experimental_serveSocket()` from `@trpc12/trpc/socket`. Messages are the
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
): SocketLink<{ context: ReconnectOption; builtinErrors: SocketErrors }> {
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
