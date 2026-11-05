import type {
  ClientEffect,
  ClientModel,
  ClientTransition,
  ConnectingError,
  Handover,
  Lifecycle,
  PublicState,
} from './clientModel';
import { drainingConnections, sendingConnection } from './clientModel';
import type {
  ConnectionEvent,
  ConnectionModel,
  ConnectionNotice,
} from './connectionMachine';
import { connectionTransition, keepsBackingOff } from './connectionMachine';
import type {
  ConnectionId,
  RequestEvent,
  RequestId,
  RequestModel,
  RequestTransition,
} from './requestMachine';
import {
  moveSubscription,
  requestTransition,
  servingConnections,
} from './requestMachine';

/** A connection that ended without the client closing it. */
interface Loss {
  /** The connection before it ended. */
  readonly connection: ConnectionModel;
  readonly event: ConnectionEvent;
  readonly cause: unknown;
  /** The handover, if it ended with it. */
  readonly handover: Handover | null;
}

/**
 * The mutable scratchpad for one transition. Nothing outside a transition
 * sees it: `clientTransition` returns a fresh model and the effects.
 */
export class Step {
  lifecycle: Lifecycle;
  readonly connections: Map<ConnectionId, ConnectionModel>;
  replaced: ConnectionId[];
  handover: Handover | null;
  readonly requests: Map<RequestId, RequestModel>;
  flushScheduled: boolean;
  inactivity: boolean;
  publicState: PublicState;
  closing: Set<RequestId> | null;
  lastConnectionId: ConnectionId;
  readonly lazy: boolean;
  readonly effects: ClientEffect[] = [];

  constructor(model: ClientModel) {
    this.lazy = model.lazy;
    this.lifecycle = model.lifecycle;
    this.connections = new Map(model.connections);
    this.replaced = [...model.replaced];
    this.handover = model.handover;
    this.requests = new Map(model.requests);
    this.flushScheduled = model.flushScheduled;
    this.inactivity = model.inactivity;
    this.publicState = model.publicState;
    this.closing = model.closing && new Set(model.closing);
    this.lastConnectionId = model.lastConnectionId;
  }

  done(): ClientTransition {
    return {
      state: {
        lazy: this.lazy,
        lifecycle: this.lifecycle,
        connections: this.connections,
        replaced: this.replaced,
        handover: this.handover,
        requests: this.requests,
        flushScheduled: this.flushScheduled,
        inactivity: this.inactivity,
        publicState: this.publicState,
        closing: this.closing,
        lastConnectionId: this.lastConnectionId,
      },
      effects: this.effects,
    };
  }

  // --- requests -----------------------------------------------------------

  applyRequest(request: RequestModel, event: RequestEvent) {
    this.applyRequestTransition(request, requestTransition(request, event));
  }

  applyRequestTransition(request: RequestModel, result: RequestTransition) {
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

  /** Requests `connection` serves: sent on it, or moving or leaving to or from it. */
  servedBy(connection: ConnectionId) {
    return [...this.requests.values()].filter((request) =>
      servingConnections(request).includes(connection),
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
   * Closes a replaced connection once its replacement is ready, or the
   * client is closing, and nothing is left on it: every request sent on it
   * has finished, and every subscription that moved has been confirmed on
   * the new connection.
   */
  closeIfDrained(connection: ConnectionId) {
    if (this.connections.get(connection)?.state.phase !== 'draining') return;
    if (this.lifecycle.kind !== 'open' && this.lifecycle.kind !== 'idle') {
      return;
    }
    if (this.servedBy(connection).length > 0) return;
    this.forget(connection);
    this.closeConnection(connection);
  }

  /**
   * A replaced connection no longer serves anything. Returns the handover
   * if it was that connection.
   */
  forget(connection: ConnectionId): Handover | null {
    this.replaced = this.replaced.filter((id) => id !== connection);
    const handover = this.handover;
    if (handover?.connection !== connection) return null;
    this.handover = null;
    return handover;
  }

  /** The handover serves on, but its replacement's last failure is past. */
  clearReplacementError() {
    if (this.handover) {
      this.handover = { ...this.handover, replacementError: null };
    }
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
   * connection serves new requests, so requests made together go together,
   * or as soon as the next connection is ready.
   */
  scheduleFlush() {
    if (this.lifecycle.kind === 'idle') {
      if (this.queued().length === 0) return;
      if (this.publicState.state === 'idle') this.setConnecting(null);
      this.connect(null);
      return;
    }
    const connection = sendingConnection(this);
    if (connection === null) return;
    this.batchFor(connection);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    this.effects.push({ type: 'startTimer', timer: 'flush' });
  }

  batchFor(connection: ConnectionId) {
    for (const request of this.queued()) {
      if (request.state.kind !== 'queued') continue;
      if (request.state.batch !== null && request.state.batch !== connection) {
        // Batched for a replaced connection that no longer takes requests.
        this.applyRequest(request, { type: 'unbatch' });
      }
      this.applyRequest(this.requests.get(request.id) ?? request, {
        type: 'batch',
        connection,
      });
    }
  }

  /**
   * Sends the queued requests, and the subscriptions in `moved` that just
   * started moving to this connection, as one batch.
   */
  flush(moved: readonly RequestId[]) {
    this.stopFlush();
    const connection = sendingConnection(this);
    if (connection === null) return;
    const queued = this.queued();
    for (const request of queued) {
      this.applyRequest(request, { type: 'send', connection });
    }
    const requests = [
      ...moved.flatMap((id) => this.requests.get(id) ?? []),
      ...queued,
    ];
    if (requests.length === 0) return;
    this.effects.push({
      type: 'sendRequests',
      connection,
      requests: requests.map((request) => ({
        id: request.id,
        lastEventId:
          request.method === 'subscription' ? request.lastEventId : null,
      })),
    });
  }

  /**
   * Starts moving the subscriptions on connections the ready one replaced:
   * each is sent on the ready one too, and stays on its old connection until
   * the ready one confirms it. Returns the ones to send.
   */
  startMoves(): RequestId[] {
    const lifecycle = this.lifecycle;
    if (lifecycle.kind !== 'open') return [];
    const moved: RequestId[] = [];
    for (const previous of drainingConnections(this)) {
      for (const request of this.sentOn(previous)) {
        if (request.method !== 'subscription') continue;
        this.applyRequestTransition(
          request,
          moveSubscription(request, lifecycle.connection),
        );
        moved.push(request.id);
      }
    }
    return moved;
  }

  /**
   * A subscription can land on a replaced connection after the moves began:
   * the connection it was moving to was replaced too, or the one it was
   * moving from was lost. It moves on at once.
   */
  moveStragglers() {
    const moved = this.startMoves();
    if (moved.length > 0) this.flush(moved);
  }

  // --- lifecycle steps ----------------------------------------------------

  onReady(connection: ConnectionId) {
    if (!this.isCurrent(connection)) {
      this.closeConnection(connection);
      return;
    }
    this.lifecycle = { kind: 'open', connection };
    this.clearReplacementError();
    if (this.lazy) {
      this.inactivity = true;
      this.effects.push({ type: 'startTimer', timer: 'inactivity' });
    }
    if (this.publicState.state !== 'pending') {
      this.setState({ state: 'pending' });
    }

    // Subscriptions are sent here before they leave the connections this one
    // replaced, which serve them until this one confirms each.
    const moved = this.startMoves();
    this.batchFor(connection);
    this.flush(moved);
    for (const previous of drainingConnections(this)) {
      this.closeIfDrained(previous);
    }
  }

  /**
   * The server asked the current connection to reconnect. A ready one keeps
   * serving while a new one opens: what's in flight on it finishes there, and
   * new requests go on it until the new one is ready.
   */
  retire(connection: ConnectionId, before: ConnectionModel) {
    if (before.state.phase === 'ready') {
      // Invisible to subscribers: the state stays `pending` while the old
      // connection serves.
      this.applyConnection(connection, { type: 'drain' });
      if (this.handover) this.replaced.push(this.handover.connection);
      this.handover = { connection, replacementError: null };
    } else {
      this.closeConnection(connection);
      for (const request of this.queuedFor(connection)) {
        this.applyRequest(request, { type: 'unbatch' });
      }
      this.clearReplacementError();
    }
    this.scheduleReconnect(nextRetryIndex(before, { type: 'drain' }));
  }

  /**
   * Settles the requests of a connection that is gone. Queries and mutations
   * sent on it fail, since they may have run, and so do those waiting for its
   * next batch, unless it was standing in for its replacement: those wait
   * for the replacement. Subscriptions are queued to resume on the next
   * connection; one moving away carries on on the other connection. Returns
   * the handover if it was that connection.
   */
  onLost(connection: ConnectionId, cause: unknown): Handover | null {
    const handover = this.forget(connection);
    for (const request of this.queuedFor(connection)) {
      this.applyRequest(
        request,
        handover
          ? { type: 'unbatch' }
          : { type: 'connectionLost', connection, cause },
      );
    }
    for (const request of this.servedBy(connection)) {
      this.applyRequest(request, { type: 'connectionLost', connection, cause });
    }
    return handover;
  }

  /** Decides what follows a loss, once the user's callbacks have run. */
  afterLost({ connection: lost, event, cause, handover }: Loss) {
    const lifecycle = this.lifecycle;
    if (!this.isCurrent(lost.id)) {
      // A replaced connection: its subscriptions go on the current one, if
      // it's ready, or wait for the next.
      if (
        (lifecycle.kind === 'backoff' || lifecycle.kind === 'connecting') &&
        this.handover === null
      ) {
        this.setConnecting(
          handover?.replacementError ?? { message: 'WebSocket closed', cause },
        );
      }
      this.moveStragglers();
      this.scheduleFlush();
      return;
    }

    const opening = lifecycle.kind === 'connecting';
    const retryIndex = opening
      ? lost.retryIndex === null
        ? 0
        : lost.retryIndex + 1
      : nextRetryIndex(lost, event);
    if (this.handover !== null) {
      // The connection it replaced still serves every request, so this stays
      // `pending` until that one ends too.
      this.handover = {
        ...this.handover,
        replacementError: {
          message: opening ? 'Initialization error' : 'WebSocket closed',
          cause,
        },
      };
      this.scheduleReconnect(retryIndex);
      this.scheduleFlush();
      return;
    }

    if (opening) {
      this.setConnecting({ message: 'Initialization error', cause });
      this.scheduleReconnect(retryIndex);
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
    if (this.handover) this.replaced.push(this.handover.connection);
    this.handover = null;
    if (lifecycle.kind === 'backoff') {
      this.effects.push({ type: 'cancelTimer', timer: 'backoff' });
    } else if (lifecycle.kind === 'connecting') {
      this.closeConnection(lifecycle.connection);
    } else if (lifecycle.kind === 'open') {
      this.applyConnection(lifecycle.connection, { type: 'drain' });
      this.replaced.push(lifecycle.connection);
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
    // `close()` cleared the handover, so any now was opened since, for
    // requests made after it.
    for (const connection of [...this.replaced]) {
      if (this.servedBy(connection).length > 0) continue;
      this.forget(connection);
      this.closeConnection(connection);
    }
    if (this.lifecycle.kind === 'idle') {
      this.setState({ state: 'idle' });
    } else if (
      this.lifecycle.kind !== 'open' &&
      drainingConnections(this).length === 0 &&
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
