import type { Encoder } from '@trpc/server/unstable-core-do-not-import';
import type { ConnectionId } from './requestMachine';

/** What the client's encoder produces. */
export type EncodedMessage = ReturnType<Encoder['encode']>;

/**
 * A connection's phase. It moves forward only:
 * `connecting` → `handshaking` → `ready` → `draining` → `closed`, and any
 * phase can go straight to `closed`.
 */
export type ConnectionState =
  /** Resolving the URL, creating the WebSocket, waiting for `open`. */
  | { phase: 'connecting' }
  /**
   * The socket is open; resolving and sending `connectionParams`. Without
   * them, the server runs `createContext` as the socket opens, so it can
   * already reject the connection here.
   */
  | ({ phase: 'handshaking' } & Hearing)
  /** Requests are sent here. */
  | ({ phase: 'ready' } & Hearing)
  /**
   * Retired at the server's request: nothing new is sent here, the requests
   * sent here finish here, and the server's connection-level frames (an
   * `id: null` error, another `reconnect`) no longer count.
   */
  | { phase: 'draining' }
  /**
   * Ended. Only the user's `onClose` and `onError` still hear from its socket;
   * `closeReported` is set once `onClose` has been called.
   */
  | { phase: 'closed'; closeReported: boolean };

/** What a live socket has heard from the server. */
export interface Hearing {
  /**
   * Set by an `id: null` error, e.g. because `createContext` threw, and
   * cleared by any result.
   * @see https://github.com/trpc/trpc/issues/4774
   */
  readonly rejected: boolean;
  /** Any frame arrived, a `PONG` included. */
  readonly answered: boolean;
}

export interface ConnectionModel {
  readonly id: ConnectionId;
  /**
   * The `retryDelayMs` attempt index it was opened after, or `null` for an
   * open that isn't a retry.
   */
  readonly retryIndex: number | null;
  readonly state: ConnectionState;
}

export type ConnectionEvent =
  | { type: 'socketOpened' }
  /** `connectionParams` are encoded, or there are none (`data` is `null`). */
  | { type: 'paramsResolved'; data: EncodedMessage | null }
  /** Resolving the URL or `connectionParams` failed, or the socket couldn't be created. */
  | { type: 'openFailed'; cause: unknown }
  | { type: 'socketClosed'; event: CloseEvent }
  | { type: 'socketError'; event: Event }
  /** The socket is closing, e.g. the server sent a close frame. */
  | { type: 'socketUnwritable' }
  | { type: 'pongTimeout' }
  /** `error` wraps `cause`, the decode error, for the requests that fail. */
  | { type: 'badFrame'; error: Error; cause: unknown }
  /** Stop taking new requests: the server asked to reconnect. */
  | { type: 'drain' }
  /** The client ends the connection. */
  | { type: 'close' }
  /** Any frame arrived. */
  | { type: 'received' }
  | { type: 'result' }
  | { type: 'rejection' };

export type ConnectionEffect =
  | { type: 'openSocket'; connection: ConnectionId }
  | { type: 'resolveParams'; connection: ConnectionId }
  | {
      type: 'sendParams';
      connection: ConnectionId;
      data: EncodedMessage;
    }
  | { type: 'closeSocket'; connection: ConnectionId }
  | { type: 'rethrow'; error: unknown }
  | { type: 'invariantViolation'; message: string };

/** The user's callbacks for a socket, called once the client is done. */
export type ConnectionNotice =
  | { type: 'onOpen' }
  | { type: 'onClose'; event: CloseEvent | { code: number } | undefined }
  | { type: 'onError'; event: Event };

export interface ConnectionTransition {
  readonly connection: ConnectionModel;
  readonly effects: readonly ConnectionEffect[];
  readonly notices: readonly ConnectionNotice[];
}

function illegal(
  connection: ConnectionModel,
  event: ConnectionEvent,
): ConnectionTransition {
  return {
    connection,
    effects: [
      {
        type: 'invariantViolation',
        message: `connection ${connection.id} (${connection.state.phase}) can't handle ${event.type}`,
      },
    ],
    notices: [],
  };
}

function next(
  connection: ConnectionModel,
  state: ConnectionState,
  effects: ConnectionEffect[],
  notices: ConnectionNotice[],
): ConnectionTransition {
  return { connection: { ...connection, state }, effects, notices };
}

/**
 * How a live connection ends on a socket event. A pong timeout or a bad
 * frame doesn't wait for the closing handshake: `onClose` is called at once.
 */
function end(
  connection: ConnectionModel,
  event: ConnectionEvent,
): ConnectionTransition | null {
  const close: ConnectionEffect = {
    type: 'closeSocket',
    connection: connection.id,
  };
  switch (event.type) {
    case 'socketClosed':
      return next(
        connection,
        { phase: 'closed', closeReported: true },
        [],
        [{ type: 'onClose', event: event.event }],
      );
    case 'socketError':
      return next(
        connection,
        { phase: 'closed', closeReported: false },
        [close],
        [{ type: 'onError', event: event.event }],
      );
    case 'pongTimeout':
      return next(
        connection,
        { phase: 'closed', closeReported: true },
        [close],
        // What `close` reports once the closing handshake times out.
        [{ type: 'onClose', event: { code: 1006 } }],
      );
    case 'badFrame':
      return next(
        connection,
        { phase: 'closed', closeReported: true },
        [close, { type: 'rethrow', error: event.cause }],
        [{ type: 'onClose', event: undefined }],
      );
    case 'openFailed':
    case 'socketUnwritable':
    case 'close':
      return next(
        connection,
        { phase: 'closed', closeReported: false },
        [close],
        [],
      );
    default:
      return null;
  }
}

/**
 * Whether the reconnect after `event` ends `connection` carries on with the
 * backoff instead of starting over at attempt 0: the server rejected the
 * connection, or a pong timed out before the server ever answered.
 */
export function keepsBackingOff(
  connection: ConnectionModel,
  event: ConnectionEvent,
): boolean {
  const state = connection.state;
  if (state.phase !== 'handshaking' && state.phase !== 'ready') return false;
  return state.rejected || (event.type === 'pongTimeout' && !state.answered);
}

/**
 * The connection state machine: one pure step.
 */
export function connectionTransition(
  connection: ConnectionModel,
  event: ConnectionEvent,
): ConnectionTransition {
  const state = connection.state;
  switch (state.phase) {
    case 'connecting':
      switch (event.type) {
        case 'socketOpened':
          return next(
            connection,
            { phase: 'handshaking', rejected: false, answered: false },
            [{ type: 'resolveParams', connection: connection.id }],
            [{ type: 'onOpen' }],
          );
        case 'openFailed':
        case 'socketClosed':
        case 'socketError':
        case 'close':
          return end(connection, event) ?? illegal(connection, event);
        case 'paramsResolved':
        case 'socketUnwritable':
        case 'pongTimeout':
        case 'badFrame':
        case 'drain':
        case 'received':
        case 'result':
        case 'rejection':
          return illegal(connection, event);
        default:
          return event satisfies never;
      }
    case 'handshaking':
      switch (event.type) {
        case 'paramsResolved':
          return next(
            connection,
            { ...state, phase: 'ready' },
            event.data === null
              ? []
              : [
                  {
                    type: 'sendParams',
                    connection: connection.id,
                    data: event.data,
                  },
                ],
            [],
          );
        case 'openFailed':
        case 'socketClosed':
        case 'socketError':
        case 'pongTimeout':
        case 'badFrame':
        case 'close':
          return end(connection, event) ?? illegal(connection, event);
        case 'received':
          return next(connection, { ...state, answered: true }, [], []);
        case 'rejection':
          return next(connection, { ...state, rejected: true }, [], []);
        case 'socketOpened':
        case 'socketUnwritable':
        case 'drain':
        case 'result':
          return illegal(connection, event);
        default:
          return event satisfies never;
      }
    case 'ready':
    case 'draining':
      switch (event.type) {
        case 'drain':
          if (state.phase === 'draining') return illegal(connection, event);
          return next(connection, { phase: 'draining' }, [], []);
        case 'received':
          if (state.phase === 'draining')
            return next(connection, state, [], []);
          return next(connection, { ...state, answered: true }, [], []);
        case 'result':
        case 'rejection':
          if (state.phase === 'draining') return illegal(connection, event);
          return next(
            connection,
            { ...state, rejected: event.type === 'rejection' },
            [],
            [],
          );
        case 'socketClosed':
        case 'socketError':
        case 'socketUnwritable':
        case 'pongTimeout':
        case 'badFrame':
        case 'close':
          return end(connection, event) ?? illegal(connection, event);
        case 'socketOpened':
        case 'paramsResolved':
        case 'openFailed':
          return illegal(connection, event);
        default:
          return event satisfies never;
      }
    case 'closed':
      switch (event.type) {
        case 'socketClosed':
          if (state.closeReported) return next(connection, state, [], []);
          return next(
            connection,
            { phase: 'closed', closeReported: true },
            [],
            [{ type: 'onClose', event: event.event }],
          );
        case 'socketError':
          if (state.closeReported) return next(connection, state, [], []);
          return next(
            connection,
            state,
            [],
            [{ type: 'onError', event: event.event }],
          );
        // A socket the client ended may still open, resolve its
        // `connectionParams` or time out; none of it matters any more.
        case 'socketOpened':
        case 'paramsResolved':
        case 'openFailed':
        case 'socketUnwritable':
        case 'pongTimeout':
        case 'badFrame':
        case 'received':
        case 'close':
          return next(connection, state, [], []);
        case 'drain':
        case 'result':
        case 'rejection':
          return illegal(connection, event);
        default:
          return event satisfies never;
      }
    default:
      return state satisfies never;
  }
}
