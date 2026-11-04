import type { TRPCClientIncomingMessage } from '@trpc/server/unstable-core-do-not-import';
import type {
  ConnectionEffect,
  ConnectionEvent,
  ConnectionModel,
  ConnectionNotice,
} from './connectionMachine';
import { connectionTransition, keepsBackingOff } from './connectionMachine';
import type {
  ConnectionId,
  RequestEffect,
  RequestEvent,
  RequestId,
  RequestMethod,
  RequestModel,
} from './requestMachine';
import { requestTransition } from './requestMachine';

/**
 * The client's lifecycle. Exactly one connection is current at a time; the
 * connections it replaced are in `draining`.
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
 * A replacement that fails this many times in a row while the old connection
 * still serves requests is shown as `connecting` with the last error.
 */
export const VISIBLE_REPLACEMENT_FAILURES = 3;

export interface ClientModel {
  readonly lazy: boolean;
  readonly lifecycle: Lifecycle;
  /** Every connection whose socket may still report something. */
  readonly connections: ReadonlyMap<ConnectionId, ConnectionModel>;
  /** Connections replaced at the server's request, oldest first. */
  readonly draining: readonly ConnectionId[];
  /** Every live request. Settled requests are removed. */
  readonly requests: ReadonlyMap<RequestId, RequestModel>;
  readonly flushScheduled: boolean;
  /** Lazy mode: the inactivity timer is running. */
  readonly inactivity: boolean;
  readonly publicState: PublicState;
  /** Set by `close()`: the queries and mutations it waits for. */
  readonly closing: ReadonlySet<RequestId> | null;
  /** Failed replacement attempts in a row while connections drain. */
  readonly failedReplacements: number;
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
 * The mutable scratchpad for one transition. Nothing outside a transition
 * sees it: `clientTransition` returns a fresh model and the effects.
 */
class Step {
  lifecycle: Lifecycle;
  readonly connections: Map<ConnectionId, ConnectionModel>;
  draining: ConnectionId[];
  readonly requests: Map<RequestId, RequestModel>;
  flushScheduled: boolean;
  inactivity: boolean;
  publicState: PublicState;
  closing: Set<RequestId> | null;
  failedReplacements: number;
  lastConnectionId: ConnectionId;
  readonly lazy: boolean;
  readonly effects: ClientEffect[] = [];

  constructor(model: ClientModel) {
    this.lazy = model.lazy;
    this.lifecycle = model.lifecycle;
    this.connections = new Map(model.connections);
    this.draining = [...model.draining];
    this.requests = new Map(model.requests);
    this.flushScheduled = model.flushScheduled;
    this.inactivity = model.inactivity;
    this.publicState = model.publicState;
    this.closing = model.closing && new Set(model.closing);
    this.failedReplacements = model.failedReplacements;
    this.lastConnectionId = model.lastConnectionId;
  }

  done(): ClientTransition {
    return {
      state: {
        lazy: this.lazy,
        lifecycle: this.lifecycle,
        connections: this.connections,
        draining: this.draining,
        requests: this.requests,
        flushScheduled: this.flushScheduled,
        inactivity: this.inactivity,
        publicState: this.publicState,
        closing: this.closing,
        failedReplacements: this.failedReplacements,
        lastConnectionId: this.lastConnectionId,
      },
      effects: this.effects,
    };
  }

  // --- requests -----------------------------------------------------------

  applyRequest(request: RequestModel, event: RequestEvent) {
    const result = requestTransition(request, event);
    if (result.request.state.kind === 'settled') {
      this.requests.delete(request.id);
      if (this.closing?.delete(request.id)) this.finishCloseIfDone();
    } else {
      this.requests.set(request.id, result.request);
    }
    this.effects.push(...result.effects);
  }

  sentOn(connection: ConnectionId) {
    return [...this.requests.values()].filter(
      (request) =>
        request.state.kind === 'sent' &&
        request.state.connection === connection,
    );
  }

  queued() {
    return [...this.requests.values()].filter(
      (request) => request.state.kind === 'queued',
    );
  }

  queuedFor(connection: ConnectionId) {
    return this.queued().filter(
      (request) =>
        request.state.kind === 'queued' && request.state.batch === connection,
    );
  }

  // --- connections --------------------------------------------------------

  isCurrent(connection: ConnectionId) {
    const lifecycle = this.lifecycle;
    return (
      (lifecycle.kind === 'connecting' || lifecycle.kind === 'open') &&
      lifecycle.connection === connection
    );
  }

  /**
   * Runs one connection event and returns the connection's state before it,
   * or `null` for a connection the client no longer tracks.
   */
  applyConnection(
    connection: ConnectionId,
    event: ConnectionEvent,
  ): { before: ConnectionModel; notices: readonly ConnectionNotice[] } | null {
    const before = this.connections.get(connection);
    if (!before) return null;
    const result = connectionTransition(before, event);
    const after = result.connection;
    if (after.state.phase === 'closed' && after.state.closeReported) {
      this.connections.delete(connection);
    } else {
      this.connections.set(connection, after);
    }
    this.effects.push(...result.effects);
    return { before, notices: result.notices };
  }

  /** Ends a connection on the client's decision; that isn't a loss. */
  closeConnection(connection: ConnectionId) {
    const applied = this.applyConnection(connection, { type: 'close' });
    if (applied) this.effects.push(...applied.notices);
  }

  connect(retryIndex: number | null) {
    const id = ++this.lastConnectionId;
    this.connections.set(id, {
      id,
      retryIndex,
      state: { phase: 'connecting' },
    });
    this.lifecycle = { kind: 'connecting', connection: id };
    this.effects.push({ type: 'openSocket', connection: id });
  }

  scheduleReconnect(retryIndex: number) {
    this.lifecycle = { kind: 'backoff', retryIndex };
    this.effects.push({ type: 'startBackoff', retryIndex });
  }

  /**
   * Closes a replaced connection once nothing is in flight on it and its
   * replacement is ready, or the client is closing.
   */
  closeIfDrained(connection: ConnectionId) {
    if (this.connections.get(connection)?.state.phase !== 'draining') return;
    if (this.lifecycle.kind !== 'open' && this.lifecycle.kind !== 'idle') {
      return;
    }
    if (this.sentOn(connection).length > 0) return;
    this.draining = this.draining.filter((id) => id !== connection);
    this.closeConnection(connection);
  }

  // --- state and timers ---------------------------------------------------

  setState(state: PublicState) {
    this.publicState = state;
    this.effects.push({ type: 'emitState', state });
  }

  setConnecting(error: ConnectingError | null) {
    this.setState({ state: 'connecting', error });
  }

  resetInactivity() {
    if (this.inactivity) {
      this.effects.push({ type: 'startTimer', timer: 'inactivity' });
    }
  }

  stopInactivity() {
    if (this.inactivity) {
      this.inactivity = false;
      this.effects.push({ type: 'cancelTimer', timer: 'inactivity' });
    }
  }

  stopFlush() {
    if (this.flushScheduled) {
      this.flushScheduled = false;
      this.effects.push({ type: 'cancelTimer', timer: 'flush' });
    }
  }

  // --- sending ------------------------------------------------------------

  /**
   * Sends the queued requests as one batch: on the next tick when a
   * connection is ready, so requests made together go together, or as soon
   * as the next connection is ready.
   */
  scheduleFlush() {
    const lifecycle = this.lifecycle;
    if (lifecycle.kind === 'idle') {
      if (this.queued().length === 0) return;
      if (this.publicState.state === 'idle') this.setConnecting(null);
      this.connect(null);
      return;
    }
    if (lifecycle.kind !== 'open') return;
    this.batchFor(lifecycle.connection);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    this.effects.push({ type: 'startTimer', timer: 'flush' });
  }

  batchFor(connection: ConnectionId) {
    for (const request of this.queued()) {
      if (request.state.kind === 'queued' && request.state.batch === null) {
        this.applyRequest(request, { type: 'batch', connection });
      }
    }
  }

  flush() {
    this.stopFlush();
    if (this.lifecycle.kind !== 'open') return;
    const connection = this.lifecycle.connection;
    const queued = this.queued();
    if (queued.length === 0) return;
    for (const request of queued) {
      this.applyRequest(request, { type: 'send', connection });
    }
    this.effects.push({
      type: 'sendRequests',
      connection,
      requests: queued.map((request) => ({
        id: request.id,
        lastEventId: request.lastEventId,
      })),
    });
  }

  // --- lifecycle steps ----------------------------------------------------

  onReady(connection: ConnectionId) {
    if (!this.isCurrent(connection)) {
      this.closeConnection(connection);
      return;
    }
    this.lifecycle = { kind: 'open', connection };
    this.failedReplacements = 0;
    if (this.lazy) {
      this.inactivity = true;
      this.effects.push({ type: 'startTimer', timer: 'inactivity' });
    }
    if (this.publicState.state !== 'pending') {
      this.setState({ state: 'pending' });
    }

    // Subscriptions move off the connections this one replaced only now, so
    // they're never without a connection that can deliver their events.
    for (const previous of this.draining) {
      for (const request of this.sentOn(previous)) {
        if (request.method === 'subscription') {
          this.applyRequest(request, { type: 'move' });
        }
      }
    }
    for (const previous of [...this.draining]) {
      this.closeIfDrained(previous);
    }

    this.batchFor(connection);
    this.flush();
  }

  /**
   * The server asked the current connection to reconnect. A ready one drains
   * while a new one opens: nothing in flight on it fails or is sent again.
   */
  retire(connection: ConnectionId, before: ConnectionModel) {
    if (before.state.phase === 'ready') {
      // Invisible to subscribers: the state stays `pending` while the old
      // connection serves its requests.
      this.applyConnection(connection, { type: 'drain' });
      this.draining.push(connection);
    } else {
      this.closeConnection(connection);
    }
    for (const request of this.queuedFor(connection)) {
      this.applyRequest(request, { type: 'unbatch' });
    }
    this.failedReplacements = 0;
    this.scheduleReconnect(nextRetryIndex(before, { type: 'drain' }));
  }

  /**
   * Settles the requests of a connection that is gone. Queries and mutations
   * sent on it fail, since they may have run, and so do those waiting for its
   * next batch. Subscriptions are queued to resume on the next connection.
   */
  onLost(connection: ConnectionId, cause: unknown) {
    this.draining = this.draining.filter((id) => id !== connection);
    for (const request of [
      ...this.sentOn(connection),
      ...this.queuedFor(connection),
    ]) {
      this.applyRequest(request, { type: 'connectionLost', cause });
    }
  }

  /** Decides what follows a loss, once the user's callbacks have run. */
  afterLost(lost: ConnectionModel, event: ConnectionEvent, cause: unknown) {
    const lifecycle = this.lifecycle;
    if (!this.isCurrent(lost.id)) {
      // A draining connection: its subscriptions go on the current one, if
      // it's ready, or wait for the next.
      if (
        (lifecycle.kind === 'backoff' || lifecycle.kind === 'connecting') &&
        this.draining.length === 0
      ) {
        this.setConnecting({ message: 'WebSocket closed', cause });
      }
      this.scheduleFlush();
      return;
    }

    if (lifecycle.kind === 'connecting') {
      if (this.draining.length === 0) {
        this.setConnecting({ message: 'Initialization error', cause });
      } else if (++this.failedReplacements >= VISIBLE_REPLACEMENT_FAILURES) {
        this.setConnecting({ message: 'Initialization error', cause });
      }
      this.scheduleReconnect(
        lost.retryIndex === null ? 0 : lost.retryIndex + 1,
      );
      return;
    }

    if (this.lazy && this.requests.size === 0) {
      this.lifecycle = { kind: 'idle' };
      this.stopInactivity();
      this.setState({ state: 'idle' });
      return;
    }

    this.setConnecting({ message: 'WebSocket closed', cause });
    this.scheduleReconnect(nextRetryIndex(lost, event));
  }

  close() {
    this.stopInactivity();
    this.stopFlush();
    const lifecycle = this.lifecycle;
    this.lifecycle = { kind: 'idle' };
    this.failedReplacements = 0;
    if (lifecycle.kind === 'backoff') {
      this.effects.push({ type: 'cancelTimer', timer: 'backoff' });
    } else if (lifecycle.kind === 'connecting') {
      this.closeConnection(lifecycle.connection);
    } else if (lifecycle.kind === 'open') {
      this.applyConnection(lifecycle.connection, { type: 'drain' });
      this.draining.push(lifecycle.connection);
    }

    const closing = this.closing ?? new Set<RequestId>();
    this.closing = closing;
    for (const request of [...this.requests.values()]) {
      this.applyRequest(request, { type: 'clientClose' });
      if (this.requests.has(request.id)) closing.add(request.id);
    }
    this.finishCloseIfDone();
  }

  finishCloseIfDone() {
    if (!this.closing || this.closing.size > 0) return;
    this.closing = null;
    for (const connection of [...this.draining]) {
      if (this.sentOn(connection).length > 0) continue;
      this.draining = this.draining.filter((id) => id !== connection);
      this.closeConnection(connection);
    }
    if (this.lifecycle.kind === 'idle') {
      this.setState({ state: 'idle' });
    } else if (
      this.lifecycle.kind !== 'open' &&
      this.draining.length === 0 &&
      this.publicState.state === 'pending'
    ) {
      // A request made while closing opens a new connection, and the old
      // one no longer serves anything.
      this.setConnecting(null);
    }
    this.effects.push({ type: 'closed' });
  }
}

/** The `retryDelayMs` attempt index after `event` ends a ready `connection`. */
function nextRetryIndex(connection: ConnectionModel, event: ConnectionEvent) {
  return keepsBackingOff(connection, event)
    ? (connection.retryIndex ?? 0) + 1
    : 0;
}

/** Why a socket event ended a connection, for the requests that fail. */
function causeOf(event: ConnectionEvent): unknown {
  switch (event.type) {
    case 'openFailed':
      return event.cause;
    case 'socketClosed':
    case 'socketError':
      return event.event;
    case 'badFrame':
      return event.error;
    case 'socketUnwritable':
    case 'pongTimeout':
      return undefined;
    case 'socketOpened':
    case 'paramsResolved':
    case 'drain':
    case 'close':
    case 'received':
    case 'result':
    case 'rejection':
      return undefined;
    default:
      return event satisfies never;
  }
}

function onConnectionEvent(
  step: Step,
  connection: ConnectionId,
  event: ConnectionEvent,
) {
  const applied = step.applyConnection(connection, event);
  if (!applied) return;
  const { before, notices } = applied;
  const after = step.connections.get(connection)?.state.phase ?? 'closed';

  if (before.state.phase === 'handshaking' && after === 'ready') {
    step.effects.push(...notices);
    step.onReady(connection);
    return;
  }
  if (before.state.phase === 'closed' || after !== 'closed') {
    step.effects.push(...notices);
    return;
  }

  // The connection was lost: settle its requests, tell the user, then decide
  // what follows.
  const cause = causeOf(event);
  step.onLost(connection, cause);
  step.effects.push(...notices);
  step.afterLost(before, event, cause);
}

/** Any frame proves the server is there, and keeps a lazy connection in use. */
function onReceived(step: Step, connection: ConnectionId) {
  const phase = step.connections.get(connection)?.state.phase;
  if (phase !== 'handshaking' && phase !== 'ready' && phase !== 'draining') {
    return false;
  }
  step.resetInactivity();
  step.applyConnection(connection, { type: 'received' });
  return true;
}

function onFrame(
  step: Step,
  connection: ConnectionId,
  message: TRPCClientIncomingMessage,
) {
  if (!onReceived(step, connection)) return;
  const model = step.connections.get(connection);
  const phase = model?.state.phase;
  if (!model) return;

  // A retired connection only answers the requests sent on it: the server's
  // connection-level frames there no longer concern the client.
  const retired = phase === 'draining';
  if ('method' in message) {
    if (
      message.method === 'reconnect' &&
      !retired &&
      step.isCurrent(connection)
    ) {
      step.retire(connection, model);
    }
    return;
  }
  if (message.id === null) {
    if ('error' in message && !retired) {
      step.applyConnection(connection, { type: 'rejection' });
    }
    return;
  }
  // Nothing has been sent on a handshaking connection to answer.
  if (phase === 'handshaking') return;
  if ('result' in message && !retired) {
    // The server only sends results once `createContext` has succeeded, so
    // an earlier `id: null` error on this socket was not a rejection.
    step.applyConnection(connection, { type: 'result' });
  }

  const request =
    typeof message.id === 'number' ? step.requests.get(message.id) : undefined;
  if (
    request?.state.kind !== 'sent' ||
    request.state.connection !== connection
  ) {
    return;
  }
  step.applyRequest(request, { type: 'response', message });
  if (!step.requests.has(request.id)) step.closeIfDrained(connection);
}

/**
 * The client state machine: one pure step. It drives the connection and
 * request machines and returns every side effect as data, in the order the
 * client runs them.
 */
export function clientTransition(
  model: ClientModel,
  event: ClientEvent,
): ClientTransition {
  const step = new Step(model);
  switch (event.type) {
    case 'request': {
      step.requests.set(event.id, {
        id: event.id,
        method: event.method,
        lastEventId: event.lastEventId,
        state: { kind: 'queued', batch: null, hideStarted: false },
      });
      step.resetInactivity();
      if (step.lifecycle.kind === 'backoff') {
        // A new request doesn't wait out the backoff.
        step.effects.push({ type: 'cancelTimer', timer: 'backoff' });
        step.connect(step.lifecycle.retryIndex);
      }
      step.scheduleFlush();
      break;
    }
    case 'unsubscribe': {
      const request = step.requests.get(event.id);
      if (!request) break;
      const sentOn =
        request.state.kind === 'sent' ? request.state.connection : null;
      step.applyRequest(request, { type: 'unsubscribe' });
      if (sentOn !== null) step.closeIfDrained(sentOn);
      break;
    }
    case 'close':
      step.close();
      break;
    case 'timer':
      switch (event.timer) {
        case 'flush':
          step.flushScheduled = false;
          step.flush();
          break;
        case 'backoff':
          if (step.lifecycle.kind === 'backoff') {
            step.connect(step.lifecycle.retryIndex);
          }
          break;
        case 'inactivity':
          if (!step.inactivity) break;
          if (step.requests.size > 0) {
            step.resetInactivity();
          } else {
            step.close();
          }
          break;
        default:
          event.timer satisfies never;
      }
      break;
    case 'connection':
      onConnectionEvent(step, event.connection, event.event);
      break;
    case 'frame':
      onFrame(step, event.connection, event.message);
      break;
    case 'heartbeat':
      onReceived(step, event.connection);
      break;
    case 'sendFailed':
      for (const id of event.requests) {
        const request = step.requests.get(id);
        if (request?.state.kind === 'sent') {
          step.applyRequest(request, {
            type: 'sendFailed',
            cause: event.cause,
          });
        }
      }
      break;
    default:
      event satisfies never;
  }
  return step.done();
}

/** The client before anything happened. A client that isn't lazy connects at once. */
export function initialClient(opts: { lazy: boolean }): ClientTransition {
  const step = new Step({
    lazy: opts.lazy,
    lifecycle: { kind: 'idle' },
    connections: new Map(),
    draining: [],
    requests: new Map(),
    flushScheduled: false,
    inactivity: false,
    publicState: opts.lazy
      ? { state: 'idle' }
      : { state: 'connecting', error: null },
    closing: null,
    failedReplacements: 0,
    lastConnectionId: 0,
  });
  if (!opts.lazy) step.connect(null);
  return step.done();
}
