import type { TRPCClientIncomingMessage } from '@trpc/server/unstable-core-do-not-import';
import type {
  ConnectionEffect,
  ConnectionEvent,
  ConnectionModel,
  ConnectionNotice,
} from './connectionMachine';
import type {
  ConnectionId,
  RequestEffect,
  RequestId,
  RequestMethod,
  RequestModel,
} from './requestMachine';

/**
 * The client's lifecycle. Exactly one connection is current at a time; the
 * connections it replaced are draining: see `drainingConnections`.
 */
export type Lifecycle =
  /** No connection, and none is wanted: lazy and unused, or after `close()`. */
  | { kind: 'idle' }
  /** Waiting `retryDelayMs(retryIndex)` before opening the next connection. */
  | { kind: 'backoff'; retryIndex: number }
  /** `connection` is opening. Requests queue until it's ready. */
  | { kind: 'connecting'; connection: ConnectionId }
  /** `connection` is ready, and requests are sent on it. */
  | { kind: 'open'; connection: ConnectionId };

/** Why the client is (re)connecting, shown as `connectionState.error`. */
export interface ConnectingError {
  readonly message: 'WebSocket closed' | 'Initialization error';
  readonly cause: unknown;
}

export type PublicState =
  | { state: 'idle' }
  | { state: 'connecting'; error: ConnectingError | null }
  | { state: 'pending' };

/**
 * The newest connection the server asked to replace. It takes new requests
 * whenever no connection is ready, until it's closed or lost.
 */
export interface Handover {
  readonly connection: ConnectionId;
  /**
   * Why the latest attempt to replace it failed. Shown only once it ends,
   * since until then it serves every request.
   */
  readonly replacementError: ConnectingError | null;
}

export interface ClientModel {
  readonly lazy: boolean;
  readonly lifecycle: Lifecycle;
  /** Every connection whose socket may still report something. */
  readonly connections: ReadonlyMap<ConnectionId, ConnectionModel>;
  /**
   * Draining connections older than the handover, oldest first: replaced
   * at the server's request, or by `close()`.
   */
  readonly replaced: readonly ConnectionId[];
  readonly handover: Handover | null;
  /** Every live request. Settled requests are removed. */
  readonly requests: ReadonlyMap<RequestId, RequestModel>;
  readonly flushScheduled: boolean;
  /** Lazy mode: the inactivity timer is running. */
  readonly inactivity: boolean;
  readonly publicState: PublicState;
  /** Set by `close()`: the queries and mutations it waits for. */
  readonly closing: ReadonlySet<RequestId> | null;
  readonly lastConnectionId: ConnectionId;
}

export type Timer = 'flush' | 'backoff' | 'inactivity';

export type ClientEvent =
  | {
      type: 'request';
      id: RequestId;
      method: RequestMethod;
      lastEventId: string | null;
    }
  | { type: 'unsubscribe'; id: RequestId }
  /** A keepAlive `PING` or `PONG` arrived. */
  | { type: 'heartbeat'; connection: ConnectionId }
  | { type: 'close' }
  | { type: 'timer'; timer: Timer }
  | { type: 'connection'; connection: ConnectionId; event: ConnectionEvent }
  | {
      type: 'frame';
      connection: ConnectionId;
      message: TRPCClientIncomingMessage;
    }
  | { type: 'sendFailed'; requests: readonly RequestId[]; cause: unknown };

export type ClientEffect =
  | Exclude<ConnectionEffect, { type: 'invariantViolation' }>
  | Exclude<RequestEffect, { type: 'invariantViolation' }>
  | ConnectionNotice
  | {
      type: 'sendRequests';
      connection: ConnectionId;
      requests: readonly { id: RequestId; lastEventId: string | null }[];
    }
  | { type: 'startTimer'; timer: 'flush' | 'inactivity' }
  /** Wait `retryDelayMs(retryIndex)`, then fire the `backoff` timer. */
  | { type: 'startBackoff'; retryIndex: number }
  | { type: 'cancelTimer'; timer: Timer }
  | { type: 'emitState'; state: PublicState }
  /** `close()` is done. */
  | { type: 'closed' }
  | { type: 'invariantViolation'; message: string };

export interface ClientTransition {
  readonly state: ClientModel;
  readonly effects: readonly ClientEffect[];
}

/**
 * The connection new requests go on: the ready one, or while there is none,
 * the one the server asked to replace, which still serves until then.
 */
export function sendingConnection(
  model: Pick<ClientModel, 'lifecycle' | 'handover'>,
): ConnectionId | null {
  const { lifecycle } = model;
  if (lifecycle.kind === 'open') return lifecycle.connection;
  if (lifecycle.kind === 'idle') return null;
  return model.handover?.connection ?? null;
}

/** The connections the client replaced that still serve, oldest first. */
export function drainingConnections(
  model: Pick<ClientModel, 'replaced' | 'handover'>,
): ConnectionId[] {
  return model.handover
    ? [...model.replaced, model.handover.connection]
    : [...model.replaced];
}
