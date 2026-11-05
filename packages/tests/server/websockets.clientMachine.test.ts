import { isDeepStrictEqual } from 'node:util';
import type { MachineModel, ModelStep } from './___machineModel';
import { check, coverage, simulateMachine } from './___machineModel';
import { fc, test } from '@fast-check/vitest';
/**
 * Model-based tests for the wsClient state machines. fast-check generates
 * sequences of what sockets, timers, the server and the user can do; a
 * simulator turns each into the event the interpreter would dispatch, runs
 * `clientTransition`, plays the server's side of the effects, and checks the
 * invariants after every step.
 */
import {
  clientTransition,
  initialClient,
} from '@trpc/client/links/wsLink/wsClient/machine/clientMachine';
import type {
  ClientEffect,
  ClientEvent,
  ClientModel,
  Timer,
} from '@trpc/client/links/wsLink/wsClient/machine/clientModel';
import {
  drainingConnections,
  sendingConnection,
} from '@trpc/client/links/wsLink/wsClient/machine/clientModel';
import type {
  ConnectionEvent,
  ConnectionModel,
  ConnectionState,
} from '@trpc/client/links/wsLink/wsClient/machine/connectionMachine';
import { connectionTransition } from '@trpc/client/links/wsLink/wsClient/machine/connectionMachine';
import type {
  ConnectionId,
  Fence,
  QueryState,
  RequestEvent,
  RequestMethod,
  RequestId,
  RequestModel,
  RequestState,
  RequestTransition,
  SubscriptionRequest,
  SubscriptionState,
  WireId,
} from '@trpc/client/links/wsLink/wsClient/machine/requestMachine';
import {
  moveSubscription,
  requestTransition,
} from '@trpc/client/links/wsLink/wsClient/machine/requestMachine';
import type {
  DiagramEdge,
  TRPCClientIncomingMessage,
  TRPCResponseMessage,
} from '@trpc/server/unstable-core-do-not-import';
import {
  sampleTransitions,
  stateDiagram,
} from '@trpc/server/unstable-core-do-not-import';

// --- the simulated world ----------------------------------------------------

interface ServerCall {
  /** The client's request it was sent for. */
  readonly request: RequestId;
  readonly method: RequestMethod;
  /** Subscriptions: the id of the next event this socket sends. */
  next: number;
  started: boolean;
  stopping: boolean;
  /** The server has handled the stop, so it sends no more events. */
  stopHandled: boolean;
}

interface SimSocket {
  opened: boolean;
  paramsRequested: boolean;
  paramsDone: boolean;
  /** The client still uses it: not disposed by `closeSocket`. */
  io: boolean;
  /** Its events ended: nothing more comes from it. */
  released: boolean;
  /** The server started closing it: nothing more is written. */
  closing: boolean;
  /** Its subscriptions never finish setting up, so it never sends `started`. */
  readonly slowSetup: boolean;
  closed: boolean;
  /** What the server got on this socket and still answers, by wire id. */
  readonly calls: Map<WireId, ServerCall>;
  /** The fences sent on it and not yet answered, oldest first. */
  readonly fences: Fence[];
}

interface UserRequest {
  readonly method: RequestMethod;
  sends: number;
  terminals: number;
  lastData: number;
  /** A visible `started` is expected: first send, or after a loss. */
  startedAllowed: boolean;
  /** Moved to another socket before any `started` reached the user. */
  movedBeforeStarted: boolean;
  /** The connection its last completed move landed on. */
  movedTo: ConnectionId | null;
  /** The connection it was moving to got a reconnect notice mid-move. */
  successorReplaced: ConnectionId | null;
  /**
   * The connection its latest move left, until that's lost or the
   * subscription resumes afresh after losing the socket it was sent on.
   */
  leftFrom: ConnectionId | null;
}

type Step = ModelStep<ClientModel, ClientEvent, ClientEffect>;

/** Paths the random runs must reach, or the invariants prove little. */
const covered = coverage([
  'subscription moved',
  'subscription moved before started',
  'started shown after a move before started',
  'new request sent on a replaced socket',
  'old socket event delivered during a move',
  'replayed event dropped',
  'subscription confirmed on its new socket',
  "move completed by the new socket's started alone",
  'move completed by data before started',
  'old socket event dropped after the move completed',
  'second reconnect notice mid-move',
  'moved on while still leaving a socket',
  'lost handover handed to the socket it replaced',
  'moved on from a new socket replaced mid-move',
  'move undone by a lost successor',
  'old socket lost before the move began',
  'old socket lost during a move',
  'old socket lost after the move completed',
  'new socket lost after the move completed',
  'event after the run delivered after a move',
  "old socket's untracked event delivered after the move completed",
  "old socket's event without an id delivered to a tracked subscription after the move completed",
  "old socket's untracked event delivered after the new one was lost",
  'resent on a socket it is still leaving',
  'old socket ended a subscription that left it',
  'old socket fenced a subscription that left it',
  'fence answered after the subscription stopped leaving',
  'old socket lost while a subscription left it',
  'new socket lost while a subscription left the old one',
  'replacement failure shown once the old socket ends',
  'retired socket frame dropped',
  'batch send failed',
  'backoff continued',
  'close waited for a request in flight',
  'lazy connection went idle',
  'subscription resumed after a loss',
  'silent socket timed out',
  'connection released without a close',
]);

/** The data of a `note`: an event without an id, not counted in `lastData`. */
const note = 'note';
const fakeEvent = {} as Event;
const fakeCloseEvent = { code: 1000 } as CloseEvent;

class Sim {
  readonly sockets = new Map<ConnectionId, SimSocket>();
  readonly timers = new Set<Timer>();
  readonly requests = new Map<number, UserRequest>();
  readonly lifecycleEdges = new Map<string, DiagramEdge>();
  readonly machine: MachineModel<ClientModel, ClientEvent>;
  lastRequestId = 0;
  /** The last request made before the latest `close()`. */
  closedAfter = 0;
  /** The last connection opened before the latest `close()`. */
  closedConnectionsUpTo = 0;
  sendFails = false;
  private readonly slowFirstSocket: boolean;
  /**
   * A resent subscription's events may come before its `started`. A tRPC
   * server always sends `started` first, but the client doesn't rely on it.
   */
  readonly eagerData: boolean;
  /** Subscriptions send events without ids, so they can't be resumed. */
  readonly untracked: boolean;

  constructor(opts: {
    lazy: boolean;
    slowFirstSocket: boolean;
    eagerData: boolean;
    untracked: boolean;
  }) {
    this.slowFirstSocket = opts.slowFirstSocket;
    this.eagerData = opts.eagerData;
    this.untracked = opts.untracked;
    this.machine = simulateMachine({
      machine: {
        initial: initialClient({ lazy: opts.lazy }),
        transition: clientTransition,
      },
      check: (step) => this.check(step),
      play: (effect) => this.play(effect),
    });
  }

  get model() {
    return this.machine.state;
  }

  // The interpreter's `observeWritability`.
  private observeWritability() {
    const connection = sendingConnection(this.model);
    if (connection === null) return;
    if (this.writable(connection)) return;
    this.dispatch({
      type: 'connection',
      connection,
      event: { type: 'socketUnwritable' },
    });
  }

  writable(connection: ConnectionId) {
    const socket = this.sockets.get(connection);
    return (
      !!socket &&
      socket.opened &&
      socket.io &&
      !socket.closing &&
      !socket.closed
    );
  }

  /**
   * The server can still send on it. The client still reads it after ending
   * the connection, until the socket closes.
   */
  hears(connection: ConnectionId) {
    const socket = this.sockets.get(connection);
    return !!socket && socket.opened && !socket.closed && !socket.released;
  }

  request(method: RequestMethod) {
    const id = ++this.lastRequestId;
    this.requests.set(id, {
      method,
      sends: 0,
      terminals: 0,
      lastData: 0,
      startedAllowed: true,
      movedBeforeStarted: false,
      movedTo: null,
      successorReplaced: null,
      leftFrom: null,
    });
    this.observeWritability();
    this.dispatch({ type: 'request', id, method, lastEventId: null });
  }

  fireTimer(timer: Timer) {
    if (!this.timers.has(timer)) return;
    this.timers.delete(timer);
    if (timer === 'flush') this.observeWritability();
    this.dispatch({ type: 'timer', timer });
  }

  dispatch(event: ClientEvent) {
    this.machine.send(event);
  }

  private check(step: Step) {
    const { event, effects, before, after } = step;
    for (const effect of effects) {
      check(
        effect.type !== 'invariantViolation',
        `invariant violation: ${effect.type === 'invariantViolation' ? effect.message : ''}`,
      );
    }
    if (!before || !event) return;
    const edge = lifecycleEdge(before, event, after);
    if (edge) {
      this.lifecycleEdges.set(`${edge.from}|${edge.to}|${edge.label}`, edge);
    }
    checkStep(this, { ...step, before });
  }

  // --- effects, as the interpreter and the server would play them -------

  private play(effect: ClientEffect) {
    switch (effect.type) {
      case 'openSocket':
        this.sockets.set(effect.connection, {
          opened: false,
          paramsRequested: false,
          paramsDone: false,
          io: true,
          released: false,
          closing: false,
          closed: false,
          slowSetup: this.slowFirstSocket && this.sockets.size === 0,
          calls: new Map(),
          fences: [],
        });
        break;
      case 'resolveParams':
        this.sockets.get(effect.connection)!.paramsRequested = true;
        break;
      case 'closeSocket': {
        const socket = this.sockets.get(effect.connection);
        if (socket) socket.io = false;
        break;
      }
      case 'sendRequests': {
        if (this.sendFails) {
          this.sendFails = false;
          this.dispatch({
            type: 'sendFailed',
            requests: effect.requests.map((request) => request.id),
            cause: new Error('send failed'),
          });
          break;
        }
        const socket = this.sockets.get(effect.connection)!;
        for (const { id, wire, lastEventId } of effect.requests) {
          const request = this.requests.get(id)!;
          request.sends++;
          if (!this.writable(effect.connection)) continue;
          // The server answers `Duplicate id` while it still holds one.
          check(
            !socket.calls.has(wire),
            `request ${id} sent as ${wire} on connection ${effect.connection}, which still holds it`,
          );
          socket.calls.set(wire, {
            request: id,
            method: request.method,
            next: Number(lastEventId ?? 0) + 1,
            started: false,
            stopping: false,
            stopHandled: false,
          });
        }
        break;
      }
      case 'sendStop': {
        const call = this.sockets
          .get(effect.connection)
          ?.calls.get(effect.wire);
        if (call && this.writable(effect.connection)) call.stopping = true;
        break;
      }
      case 'sendFence':
        if (this.writable(effect.connection)) {
          this.sockets.get(effect.connection)!.fences.push(effect.fence);
        }
        break;
      case 'startTimer':
        this.timers.add(effect.timer);
        break;
      case 'startBackoff':
        this.timers.add('backoff');
        break;
      case 'cancelTimer':
        this.timers.delete(effect.timer);
        break;
      case 'next':
      case 'complete':
      case 'fail':
      case 'sendParams':
      case 'onOpen':
      case 'onClose':
      case 'onError':
      case 'emitState':
      case 'closed':
      case 'rethrow':
      case 'invariantViolation':
        break;
      default:
        effect satisfies never;
    }
  }
}

// --- invariants ---------------------------------------------------------------

function liveRequestIds(model: ClientModel) {
  return [...model.requests.keys()];
}

/** The live request a frame with this wire id answers. */
function answeredBy(model: ClientModel, wire: WireId) {
  const id = model.wires.get(wire);
  return id === undefined ? undefined : model.requests.get(id);
}

/** A call the server still runs for `request` on `socket`, the stopping one first. */
function callFor(socket: SimSocket | undefined, request: RequestId) {
  const calls = [...(socket?.calls.values() ?? [])].filter(
    (call) => call.request === request,
  );
  return calls.find((call) => call.stopping) ?? calls[0];
}

/** The connections that may answer a request. */
function servingOf(state: RequestState | undefined): ConnectionId[] {
  switch (state?.kind) {
    case 'sent':
      return [state.connection];
    case 'moving':
      return [...leftOf(state), state.from, state.to];
    case 'leaving':
      return [...leftOf(state), state.to];
    default:
      return leftOf(state);
  }
}

/** The connections a subscription has left and still hears from. */
function leftOf(state: RequestState | undefined): ConnectionId[] {
  return state && 'left' in state
    ? state.left.map((entry) => entry.connection)
    : [];
}

/** Whether `state` is leaving `connection` for `to`. */
function isLeaving(
  state: RequestState | undefined,
  connection: ConnectionId,
  to: ConnectionId,
) {
  return (
    state !== undefined &&
    'left' in state &&
    state.left.some(
      (entry) => entry.connection === connection && entry.to === to,
    )
  );
}

function servedBy(model: ClientModel, connection: ConnectionId) {
  return [...model.requests.values()].filter((request) =>
    servingOf(request.state).includes(connection),
  );
}

function checkStep(sim: Sim, step: Step & { before: ClientModel }) {
  const { event, effects, before, after } = step;
  const frameFrom =
    event?.type === 'frame' ? event.connection : (null as ConnectionId | null);
  if (
    event?.type === 'frame' &&
    typeof event.message.id === 'number' &&
    'result' in event.message &&
    event.message.result.type === 'data'
  ) {
    // Sent before the old socket read its stop: the new one has it.
    const state = answeredBy(before, event.message.id)?.state;
    const call = sim.sockets.get(event.connection)?.calls.get(event.message.id);
    if (
      state?.kind === 'sent' &&
      state.connection !== event.connection &&
      call?.stopping
    ) {
      covered.add('old socket event dropped after the move completed');
    }
  }
  if (
    event?.type === 'frame' &&
    'method' in event.message &&
    event.message.method === 'reconnect' &&
    drainingConnections(after).includes(event.connection) &&
    !drainingConnections(before).includes(event.connection)
  ) {
    for (const [id, request] of before.requests) {
      if (
        request.state.kind === 'moving' &&
        request.state.to === event.connection
      ) {
        sim.requests.get(id)!.successorReplaced = event.connection;
        covered.add('second reconnect notice mid-move');
      }
    }
  }
  const lost =
    event?.type === 'connection' &&
    isLive(before.connections.get(event.connection)) &&
    !isLive(after.connections.get(event.connection))
      ? event.connection
      : null;
  if (
    lost !== null &&
    before.handover?.connection === lost &&
    after.handover !== null &&
    before.replaced.includes(after.handover.connection)
  ) {
    covered.add('lost handover handed to the socket it replaced');
  }
  if (event?.type === 'frame' && typeof event.message.id === 'number') {
    const state = answeredBy(before, event.message.id)?.state;
    if (!servingOf(state).includes(event.connection)) {
      if (
        before.connections.get(event.connection)?.state.phase === 'draining'
      ) {
        covered.add('retired socket frame dropped');
      }
    }
  }
  if (event?.type === 'fenced') {
    // The fence ends only the leaving it was sent for.
    const id = event.fence.request;
    const previous = before.requests.get(id);
    const awaited = isLeaving(
      previous?.state,
      event.connection,
      event.fence.to,
    );
    if (awaited) {
      check(
        !isLeaving(
          after.requests.get(id)?.state,
          event.connection,
          event.fence.to,
        ),
        `subscription ${id} still leaving connection ${event.connection} after its fence`,
      );
    } else {
      check(
        isDeepStrictEqual(after.requests.get(id), previous),
        `a stale fence changed subscription ${id}`,
      );
      if (previous)
        covered.add('fence answered after the subscription stopped leaving');
    }
  }
  if (event?.type === 'sendFailed') covered.add('batch send failed');
  if (
    event?.type === 'connection' &&
    event.event.type === 'released' &&
    before.connections.has(event.connection)
  ) {
    covered.add('connection released without a close');
  }
  if (
    event?.type === 'connection' &&
    event.event.type === 'pongTimeout' &&
    before.lifecycle.kind === 'open' &&
    before.lifecycle.connection === event.connection
  ) {
    // A socket that never heard from the server carries on with the
    // backoff, like a rejected one; any frame proves the server is there.
    const lost = before.connections.get(event.connection)!;
    const state = lost.state;
    check(state.phase === 'ready', 'current connection not ready');
    const backoff = effects.find((effect) => effect.type === 'startBackoff');
    if (backoff?.type === 'startBackoff') {
      const continues = state.rejected || !state.answered;
      check(
        backoff.retryIndex === (continues ? (lost.retryIndex ?? 0) + 1 : 0),
        `backoff at ${backoff.retryIndex} after a pong timeout`,
      );
      if (!state.answered) covered.add('silent socket timed out');
    }
  }
  if (event?.type === 'close' && (after.closing?.size ?? 0) > 0) {
    covered.add('close waited for a request in flight');
  }
  if (
    before.lazy &&
    before.lifecycle.kind === 'open' &&
    after.lifecycle.kind === 'idle' &&
    event?.type === 'connection'
  ) {
    covered.add('lazy connection went idle');
  }

  for (const effect of effects) {
    switch (effect.type) {
      case 'sendRequests': {
        // Requests go on the ready connection, or while there is none, on
        // the one it replaces, which still serves until then.
        const connection = after.connections.get(effect.connection);
        check(
          effect.connection === sendingConnection(after),
          `sent on connection ${effect.connection}, which takes no new requests`,
        );
        if (connection?.state.phase === 'draining') {
          covered.add('new request sent on a replaced socket');
        } else {
          check(
            connection?.state.phase === 'ready',
            `sent on connection ${effect.connection} in phase ${connection?.state.phase}`,
          );
        }
        for (const { id } of effect.requests) {
          const request = sim.requests.get(id)!;
          // I3: a query or mutation is sent at most once.
          check(
            request.method === 'subscription' || request.sends === 0,
            `${request.method} ${id} sent twice`,
          );
          // Subscriptions move only to a ready connection.
          const previous = before.requests.get(id)?.state.kind;
          if (previous === 'sent' || previous === 'moving') {
            check(
              connection?.state.phase === 'ready',
              `subscription ${id} moved to connection ${effect.connection} in phase ${connection?.state.phase}`,
            );
          }
        }
        break;
      }
      case 'next': {
        const request = sim.requests.get(effect.request)!;
        check(
          request.terminals === 0,
          `next after the end of ${effect.request}`,
        );
        // I1/I2: only the sockets a request was sent on can answer it, so
        // a retired socket's late frames never reach a moved subscription.
        const state = before.requests.get(effect.request)?.state;
        check(
          frameFrom !== null && servingOf(state).includes(frameFrom),
          `request ${effect.request} answered by connection ${frameFrom}, not its own`,
        );
        if (state?.kind === 'moving' && frameFrom === state.from) {
          covered.add('old socket event delivered during a move');
        }
        const result =
          'result' in effect.message ? effect.message.result : null;
        if (result?.type === 'started') {
          // D1: a moved subscription's handover is invisible.
          check(request.startedAllowed, `second started for ${effect.request}`);
          request.startedAllowed = false;
          if (request.movedBeforeStarted) {
            covered.add('started shown after a move before started');
          }
        }
        if (result?.type === 'data' && request.method === 'subscription') {
          // A socket it left may still send what its earlier run had,
          // after the subscription was lost and queued to start again.
          const fromEarlierRun =
            state !== undefined &&
            'left' in state &&
            state.left.some(
              (entry) =>
                entry.connection === frameFrom &&
                entry.wire === effect.message.id,
            );
          check(
            !request.startedAllowed || fromEarlierRun,
            `subscription ${effect.request} got data before started`,
          );
          if (result.id === undefined) {
            // Untracked: counted, since duplicates are allowed.
            if (result.data !== note) request.lastData++;
            break;
          }
          // Every event exactly once, in order.
          const id = Number(result.id);
          check(
            id === request.lastData + 1,
            `subscription ${effect.request} got event ${id} after ${request.lastData}`,
          );
          request.lastData = id;
        }
        break;
      }
      case 'complete':
      case 'fail': {
        const request = sim.requests.get(effect.request)!;
        request.terminals++;
        check(request.terminals === 1, `request ${effect.request} ended twice`);
        break;
      }
      case 'sendStop': {
        // D6: break after make. A subscription leaves its old connection
        // only once the new one has answered it, unless it ended. One
        // moving on to a newer connection is stopped on the one it was
        // moving to, while its old connection still serves it.
        const state = before.requests.get(effect.request)?.state;
        const next = after.requests.get(effect.request)?.state;
        if (
          state?.kind === 'moving' &&
          next?.kind === 'moving' &&
          next.to !== state.to
        ) {
          check(
            effect.connection === state.to && next.from === state.from,
            `subscription ${effect.request} stopped on connection ${effect.connection} while moving on from connection ${state.to}`,
          );
        } else if (
          after.requests.has(effect.request) &&
          state?.kind === 'moving'
        ) {
          check(
            effect.connection === state.from && frameFrom === state.to,
            `subscription ${effect.request} stopped on connection ${effect.connection} before connection ${state.to} answered`,
          );
        } else {
          check(
            !after.requests.has(effect.request),
            `subscription ${effect.request} stopped without moving or ending`,
          );
        }
        break;
      }
      case 'sendFence': {
        // The fence follows the stop it fences, on the connection being left.
        const id = effect.fence.request;
        check(
          effects
            .slice(0, effects.indexOf(effect))
            .some(
              (earlier) =>
                earlier.type === 'sendStop' &&
                earlier.request === id &&
                earlier.connection === effect.connection,
            ),
          `fence for ${id} on connection ${effect.connection} before its stop`,
        );
        check(
          isLeaving(
            after.requests.get(id)?.state,
            effect.connection,
            effect.fence.to,
          ),
          `fence for ${id} on connection ${effect.connection} without leaving it`,
        );
        break;
      }
      case 'closeSocket': {
        // I12: make before break.
        const previous = before.connections.get(effect.connection);
        if (previous?.state.phase === 'draining') {
          check(
            servedBy(after, effect.connection).length === 0,
            `draining connection ${effect.connection} closed while serving requests`,
          );
        }
        break;
      }
      case 'startBackoff':
        check(after.lifecycle.kind === 'backoff', 'backoff outside backoff');
        if (before.lifecycle.kind === 'open' && effect.retryIndex > 0) {
          covered.add('backoff continued');
        }
        break;
      case 'emitState':
        if (effect.state.state === 'connecting') {
          // D5: no `connecting` while a handover is serving. A failed
          // replacement shows once the handover ends.
          check(
            after.handover === null,
            `connecting shown while connection ${after.handover?.connection} serves`,
          );
          if (before.handover?.replacementError) {
            check(
              effect.state.error === before.handover.replacementError,
              'the last replacement error is not the one shown',
            );
            covered.add('replacement failure shown once the old socket ends');
          }
        }
        break;
      case 'closed': {
        // I14: `close()` ends everything that came before it. A request
        // made since opens the client again.
        check(
          [...after.requests.keys()].every((id) => id > sim.closedAfter),
          'closed with live requests',
        );
        check(
          drainingConnections(after).every(
            (id) => id > sim.closedConnectionsUpTo,
          ),
          'closed with draining connections from before close()',
        );
        if (sim.lastRequestId === sim.closedAfter) {
          check(after.lifecycle.kind === 'idle', 'closed but not idle');
        }
        break;
      }
      default:
        break;
    }
  }

  if (
    event?.type === 'frame' &&
    typeof event.message.id === 'number' &&
    'result' in event.message &&
    event.message.result.type === 'data' &&
    event.message.result.id === undefined
  ) {
    // Untracked: no event is lost from the socket serving the subscription,
    // or from the one it moved away from, while that one is up and its
    // server still runs it.
    const wire = event.message.id;
    const request = answeredBy(before, wire);
    const state = request?.state;
    const left =
      request !== undefined &&
      sim.requests.get(request.id)?.leftFrom === event.connection &&
      !!sim.sockets.get(event.connection)?.calls.has(wire);
    if (
      state !== undefined &&
      (left || servingOf(state).includes(event.connection))
    ) {
      check(
        effects.some((effect) => effect.type === 'next'),
        `untracked event for ${request?.id} from connection ${event.connection} dropped`,
      );
      if (leftOf(state).includes(event.connection)) {
        covered.add(
          "old socket's untracked event delivered after the move completed",
        );
        if (state.kind === 'queued') {
          covered.add(
            "old socket's untracked event delivered after the new one was lost",
          );
        }
        if (
          request?.method === 'subscription' &&
          request.lastEventId !== null
        ) {
          covered.add(
            "old socket's event without an id delivered to a tracked subscription after the move completed",
          );
        }
      }
    }
  }

  if (event?.type === 'frame' && typeof event.message.id === 'number') {
    const previous = answeredBy(before, event.message.id);
    const message = event.message;
    const eventId =
      'result' in message && message.result.type === 'data'
        ? message.result.id
        : undefined;
    if (
      previous &&
      servingOf(previous.state).includes(event.connection) &&
      eventId !== undefined &&
      'replayed' in previous.state &&
      previous.state.replayed.includes(eventId) &&
      !effects.some((effect) => effect.type === 'next')
    ) {
      covered.add('replayed event dropped');
    }
  }

  for (const [id, request] of after.requests) {
    const previous = before.requests.get(id)?.state;
    const state = request.state;
    const user = sim.requests.get(id)!;
    if (request.method === 'subscription') {
      // D1: `started` shows once per (re)start, so a move's `started` is
      // dropped only if the old connection's was shown.
      if (
        state.kind === 'queued' &&
        (previous?.kind === 'sent' ||
          previous?.kind === 'moving' ||
          previous?.kind === 'leaving')
      ) {
        // A subscription that lost its socket shows `started` again.
        user.startedAllowed = true;
        if (user.lastData > 0) covered.add('subscription resumed after a loss');
      }
      // A queued one hasn't been started.
      const started = 'started' in state && state.started;
      check(
        state.kind === 'settled' || started === !user.startedAllowed,
        `subscription ${id} has started ${started}, but the user ${user.startedAllowed ? "hasn't" : 'has'} seen it`,
      );
    }
    if (lost !== null && previous?.kind === 'sent' && state.kind === 'queued') {
      if (drainingConnections(before).includes(lost)) {
        covered.add('old socket lost before the move began');
      }
      if (user.movedTo === lost) {
        covered.add('new socket lost after the move completed');
      }
    }
    if (
      lost !== null &&
      state.kind === 'sent' &&
      state.connection !== lost &&
      callFor(sim.sockets.get(lost), id)?.stopping
    ) {
      covered.add('old socket lost after the move completed');
    }
    if (state.kind === 'moving' || state.kind === 'leaving') {
      for (const entry of state.left) {
        if (isLeaving(previous, entry.connection, entry.to)) continue;
        // Leaving is bounded: the fence goes with the stop.
        check(
          effects.some(
            (effect) =>
              effect.type === 'sendFence' &&
              effect.connection === entry.connection &&
              effect.fence.request === id &&
              effect.fence.to === entry.to,
          ),
          `subscription ${id} leaving connection ${entry.connection} without a fence`,
        );
      }
    }
    if (previous?.kind === 'leaving' && state.kind === 'moving') {
      covered.add('moved on while still leaving a socket');
    }
    if (
      previous?.kind === 'queued' &&
      state.kind === 'leaving' &&
      leftOf(state).includes(state.to)
    ) {
      covered.add('resent on a socket it is still leaving');
    }
    if (previous?.kind === 'leaving' && state.kind !== 'leaving') {
      if (
        state.kind === 'sent' &&
        lost !== null &&
        leftOf(previous).includes(lost)
      ) {
        covered.add('old socket lost while a subscription left it');
      } else if (state.kind === 'sent' && event?.type === 'fenced') {
        covered.add('old socket fenced a subscription that left it');
      } else if (state.kind === 'sent') {
        covered.add('old socket ended a subscription that left it');
      } else if (lost === previous.to) {
        covered.add('new socket lost while a subscription left the old one');
      }
    }
    if (
      (state.kind === 'queued' && previous?.kind === 'sent') ||
      user.leftFrom === lost
    ) {
      user.leftFrom = null;
    }
    if (previous?.kind === 'sent' && state.kind === 'moving') {
      user.leftFrom = previous.connection;
      if (user.successorReplaced === previous.connection) {
        covered.add('moved on from a new socket replaced mid-move');
      }
      covered.add('subscription moved');
      if (user.startedAllowed) {
        covered.add('subscription moved before started');
        user.movedBeforeStarted = true;
      }
    }
    if (
      previous?.kind === 'moving' &&
      state.kind === 'moving' &&
      previous.to !== state.to
    ) {
      covered.add('moved on from a new socket replaced mid-move');
    }
    if (previous?.kind === 'moving' && state.kind !== 'moving') {
      if (state.kind === 'sent' && state.connection === previous.from) {
        covered.add('move undone by a lost successor');
      } else if (frameFrom === previous.to) {
        covered.add('subscription confirmed on its new socket');
        user.movedTo = previous.to;
        if (
          event?.type === 'frame' &&
          'result' in event.message &&
          event.message.result.type === 'data'
        ) {
          covered.add('move completed by data before started');
        }
        if (
          event?.type === 'frame' &&
          'result' in event.message &&
          event.message.result.type === 'started'
        ) {
          // D6: the ack is enough, with no event from the new socket.
          check(
            effects.some(
              (effect) =>
                effect.type === 'sendStop' &&
                effect.connection === previous.from,
            ),
            `request ${id} switched on started without stopping the old socket`,
          );
          covered.add("move completed by the new socket's started alone");
        }
      } else if (state.kind === 'sent' && state.connection === previous.to) {
        covered.add('old socket lost during a move');
      }
    }
  }
  if (event?.type === 'request') {
    // A request made while a connection takes new requests waits for its
    // batch, which a flush sends.
    const connection = sendingConnection(after);
    if (connection !== null) {
      const state = after.requests.get(event.id)?.state;
      check(
        state?.kind === 'queued' &&
          state.batch === connection &&
          after.flushScheduled,
        `request ${event.id} not batched for connection ${connection}`,
      );
    }
  }
  if (event?.type === 'timer' && event.timer === 'flush') {
    // I15: a flush sends every queued request when a connection takes them.
    check(
      sendingConnection(after) === null ||
        [...after.requests.values()].every(
          (request) => request.state.kind !== 'queued',
        ),
      'requests left queued after a flush',
    );
  }
  checkModel(after);
}

/** Structural invariants of a model at rest. */
function checkModel(model: ClientModel) {
  const { lifecycle } = model;
  const current =
    lifecycle.kind === 'connecting' || lifecycle.kind === 'open'
      ? lifecycle.connection
      : null;
  for (const [id, connection] of model.connections) {
    const phase = connection.state.phase;
    if (phase === 'connecting' || phase === 'handshaking') {
      check(
        lifecycle.kind === 'connecting' && current === id,
        `connection ${id} is ${phase} but not the one connecting`,
      );
    }
    if (phase === 'ready') {
      check(
        lifecycle.kind === 'open' && current === id,
        `connection ${id} is ready but not current`,
      );
    }
    check(
      (phase === 'draining') === drainingConnections(model).includes(id),
      `connection ${id} draining mismatch`,
    );
    // I16: a replaced connection closes once it takes no new requests and
    // nothing is left on it.
    if (phase === 'draining' && id !== sendingConnection(model)) {
      check(
        servedBy(model, id).length > 0,
        `drained connection ${id} left open`,
      );
    }
  }
  if (current !== null) {
    check(model.connections.has(current), 'current connection missing');
  }
  if (model.handover !== null) {
    check(
      drainingConnections(model).at(-1) === model.handover.connection,
      `handover ${model.handover.connection} isn't the newest draining connection`,
    );
  }
  for (const id of liveRequestIds(model)) {
    const state = model.requests.get(id)!.state;
    // I4: every request is queued or owned by a live connection.
    if (state.kind === 'sent') {
      const phase = model.connections.get(state.connection)?.state.phase;
      check(
        phase === 'ready' || phase === 'draining',
        `request ${id} sent on connection ${state.connection} in phase ${phase}`,
      );
    } else if (state.kind === 'moving' || state.kind === 'leaving') {
      const from = [
        ...leftOf(state),
        ...(state.kind === 'moving' ? [state.from] : []),
      ].map((connection) => model.connections.get(connection)?.state.phase);
      const to = model.connections.get(state.to)?.state.phase;
      check(
        from.every((phase) => phase === 'draining') &&
          (to === 'ready' || to === 'draining'),
        `request ${id} moving from ${from.join(', ')} connections to a ${to} one`,
      );
    } else if (state.kind === 'queued' && state.batch !== null) {
      check(
        state.batch === sendingConnection(model),
        `request ${id} batched for a connection that takes no new requests`,
      );
    }
    check(state.kind !== 'settled', `settled request ${id} kept`);
  }
  if (model.publicState.state === 'pending') {
    check(
      lifecycle.kind === 'open' || drainingConnections(model).length > 0,
      'pending without a connection serving requests',
    );
  }
}

function connectionOf(model: ClientModel) {
  const { lifecycle } = model;
  return lifecycle.kind === 'connecting' || lifecycle.kind === 'open'
    ? lifecycle.connection
    : null;
}

function eventLabel(event: ClientEvent) {
  switch (event.type) {
    case 'connection':
      return event.event.type;
    case 'frame':
      return 'method' in event.message ? 'reconnect' : 'frame';
    case 'timer':
      return `${event.timer} timer`;
    default:
      return event.type;
  }
}

/** A lifecycle change: to another kind, or to another connection. */
function lifecycleEdge(
  before: ClientModel,
  event: ClientEvent,
  after: ClientModel,
): DiagramEdge | null {
  if (
    before.lifecycle.kind === after.lifecycle.kind &&
    connectionOf(before) === connectionOf(after)
  ) {
    return null;
  }
  return {
    from: before.lifecycle.kind,
    to: after.lifecycle.kind,
    label: eventLabel(event),
  };
}

// --- actions --------------------------------------------------------------------

type SocketAction =
  | 'open'
  | 'params'
  | 'paramsFail'
  | 'openFail'
  | 'serverClose'
  | 'closed'
  | 'error'
  | 'pongTimeout'
  | 'badFrame'
  | 'heartbeat'
  | 'pong'
  | 'reconnect'
  | 'rejection'
  | 'answer'
  | 'answerError'
  | 'started'
  | 'data'
  | 'note'
  | 'stopped'
  | 'stray'
  | 'released';

type Action =
  | { type: 'request'; method: RequestMethod }
  | { type: 'unsubscribe'; pick: number }
  | { type: 'close' }
  | { type: 'timer'; timer: Timer }
  | { type: 'sendFails' }
  | { type: 'socket'; pick: number; action: SocketAction; call: number };

const socketActionWeights: Record<SocketAction, number> = {
  open: 6,
  params: 6,
  paramsFail: 1,
  openFail: 1,
  serverClose: 1,
  closed: 2,
  error: 1,
  pongTimeout: 1,
  badFrame: 1,
  heartbeat: 1,
  pong: 2,
  reconnect: 2,
  rejection: 1,
  answer: 4,
  answerError: 1,
  started: 4,
  data: 6,
  note: 2,
  stopped: 2,
  stray: 1,
  released: 2,
};

const socketActionArb = fc.oneof(
  ...Object.entries(socketActionWeights).map(([action, weight]) => ({
    weight,
    arbitrary: fc.constant(action as SocketAction),
  })),
);

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      type: fc.constant('request' as const),
      method: fc.constantFrom<RequestMethod>(
        'query',
        'mutation',
        'subscription',
      ),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      type: fc.constant('unsubscribe' as const),
      pick: fc.nat(),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ type: 'close' as const }) },
  {
    weight: 6,
    arbitrary: fc.record({
      type: fc.constant('timer' as const),
      timer: fc.constantFrom<Timer>('flush', 'flush', 'backoff', 'inactivity'),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ type: 'sendFails' as const }) },
  {
    weight: 30,
    arbitrary: fc.record({
      type: fc.constant('socket' as const),
      // Counted from the newest socket, which most events concern.
      pick: fc.oneof(
        { weight: 6, arbitrary: fc.constant(0) },
        { weight: 3, arbitrary: fc.constant(1) },
        { weight: 1, arbitrary: fc.nat(5) },
      ),
      action: socketActionArb,
      call: fc.nat(),
    }),
  },
);

function pick<T>(items: readonly T[], index: number): T | undefined {
  return items.length === 0 ? undefined : items[index % items.length];
}

function frame(sim: Sim, connection: ConnectionId, message: unknown) {
  sim.dispatch({
    type: 'frame',
    connection,
    message: message as TRPCClientIncomingMessage,
  });
}

function runSocketAction(
  sim: Sim,
  [connection, socket]: [ConnectionId, SimSocket],
  { action, call: callIndex }: Extract<Action, { type: 'socket' }>,
) {
  const event = (connectionEvent: ConnectionEvent) =>
    sim.dispatch({ type: 'connection', connection, event: connectionEvent });
  // Ending a connection doesn't silence its socket: what it already
  // reported, and what it reports until it closes, still arrives.
  const live = !socket.closed && !socket.released;
  const calls = [...socket.calls.entries()];
  switch (action) {
    case 'open':
      if (!live || socket.opened) return;
      socket.opened = true;
      event({ type: 'socketOpened' });
      return;
    case 'params':
    case 'paramsFail':
      // `connectionParams` resolve on their own, even after the socket.
      if (!socket.paramsRequested || socket.paramsDone) return;
      socket.paramsDone = true;
      event(
        action === 'params'
          ? { type: 'paramsResolved', data: callIndex % 2 ? '{}' : null }
          : { type: 'openFailed', cause: new Error('params') },
      );
      return;
    case 'openFail':
      if (!live || socket.opened) return;
      socket.closed = true;
      event({ type: 'openFailed', cause: new Error('url') });
      return;
    case 'serverClose':
      if (socket.opened) socket.closing = true;
      return;
    case 'closed':
      if (!live) return;
      socket.closed = true;
      event({ type: 'socketClosed', event: fakeCloseEvent });
      return;
    case 'error':
      if (!live) return;
      event({ type: 'socketError', event: fakeEvent });
      return;
    case 'pongTimeout':
      if (!live || !socket.opened) return;
      event({ type: 'pongTimeout' });
      return;
    case 'released':
      // After its `close`, or when the client ended the connection before
      // there was a socket to close.
      if (socket.released) return;
      if (!socket.closed && (socket.io || socket.opened)) return;
      socket.released = true;
      event({ type: 'released' });
      return;
    case 'badFrame':
      if (!sim.hears(connection)) return;
      event({ type: 'badFrame', error: new Error('bad'), cause: null });
      return;
    case 'heartbeat':
      if (!sim.hears(connection)) return;
      sim.dispatch({ type: 'heartbeat', connection });
      return;
    case 'pong':
      answerFence(sim, connection, socket);
      return;
    case 'reconnect':
      if (!sim.hears(connection)) return;
      frame(sim, connection, { id: null, method: 'reconnect' });
      return;
    case 'rejection':
      if (!sim.hears(connection)) return;
      frame(sim, connection, {
        id: null,
        error: { message: 'no', code: -32001, data: {} },
      });
      return;
    case 'stray':
      if (!sim.hears(connection)) return;
      // A frame for a request this socket doesn't own, or never saw.
      const id = (callIndex % (sim.model.lastWireId + 2)) + 1;
      const state = answeredBy(sim.model, id)?.state;
      if (socket.calls.has(id)) return;
      if (servingOf(state).includes(connection)) return;
      frame(sim, connection, {
        id,
        result: { type: 'data', id: '1', data: 'stray' },
      });
      return;
    case 'answer':
    case 'answerError':
    case 'started':
    case 'data':
    case 'note':
    case 'stopped': {
      if (!sim.hears(connection)) return;
      const entry = pick(calls, callIndex);
      if (!entry) return;
      const [id, call] = entry;
      const isSubscription = call.method === 'subscription';
      if (action === 'answerError') {
        socket.calls.delete(id);
        frame(sim, connection, {
          id,
          error: { message: 'oops', code: -32603, data: {} },
        });
        return;
      }
      if (!isSubscription) {
        if (action !== 'answer') return;
        socket.calls.delete(id);
        frame(sim, connection, { id, result: { type: 'data', data: 'ok' } });
        return;
      }
      if (action === 'stopped') {
        if (!call.stopping) return;
        socket.calls.delete(id);
        frame(sim, connection, { id, result: { type: 'stopped' } });
        return;
      }
      if (action === 'note') {
        // An event without an id, which a tracked subscription can send too.
        if (!call.started || call.stopHandled) return;
        frame(sim, connection, { id, result: { type: 'data', data: note } });
        return;
      }
      const eager =
        action === 'data' &&
        sim.eagerData &&
        !sim.requests.get(call.request)!.startedAllowed;
      if (!call.started && !eager) {
        if (socket.slowSetup) return;
        call.started = true;
        frame(sim, connection, { id, result: { type: 'started' } });
        return;
      }
      if (action !== 'data' || call.stopHandled) return;
      sendEvent(sim, { connection, id, call });
      return;
    }
    default:
      action satisfies never;
  }
}

/**
 * The server answers the oldest `PING`, after handling everything that came
 * before it: the fence's stop included.
 */
function answerFence(
  sim: Sim,
  connection: ConnectionId,
  socket: SimSocket,
): boolean {
  if (!sim.hears(connection)) return false;
  const fence = socket.fences.shift();
  if (!fence) return false;
  const call = callFor(socket, fence.request);
  if (call) call.stopHandled = true;
  sim.dispatch({ type: 'fenced', connection, fence });
  return true;
}

function run(sim: Sim, action: Action) {
  switch (action.type) {
    case 'request':
      sim.request(action.method);
      return;
    case 'unsubscribe': {
      const id = pick([...sim.model.requests.keys()], action.pick);
      if (id !== undefined) sim.dispatch({ type: 'unsubscribe', id });
      return;
    }
    case 'close':
      sim.closedAfter = sim.lastRequestId;
      sim.closedConnectionsUpTo = sim.model.lastConnectionId;
      sim.dispatch({ type: 'close' });
      return;
    case 'timer':
      sim.fireTimer(action.timer);
      return;
    case 'sendFails':
      sim.sendFails = true;
      return;
    case 'socket': {
      const sockets = [...sim.sockets.entries()];
      const entry = sockets[sockets.length - 1 - action.pick];
      if (!entry) return;
      runSocketAction(sim, entry, action);
      return;
    }
    default:
      action satisfies never;
  }
}

interface Scenario {
  lazy: boolean;
  actions: Action[];
  /** The first socket never starts a subscription, so moves beat `started`. */
  slowFirstSocket: boolean;
  /** A scripted start, so random runs reach each point of a move. */
  start: keyof typeof starts;
  eagerData: boolean;
  untracked: boolean;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  lazy: fc.boolean(),
  actions: fc.array(actionArb, { maxLength: 150, size: 'max' }),
  slowFirstSocket: fc.boolean(),
  start: fc.constantFrom('none', 'moving', 'busyOldSocket', 'secondNotice'),
  eagerData: fc.boolean(),
  untracked: fc.boolean(),
});

/** Random runs seldom get a new socket ready before the old one goes. */
function newest(action: SocketAction): Action {
  return { type: 'socket', pick: 0, action, call: 0 };
}
function previous(action: SocketAction): Action {
  return { type: 'socket', pick: 1, action, call: 0 };
}
const subscribed: Action[] = [
  { type: 'request', method: 'subscription' },
  newest('open'),
  newest('params'),
  newest('started'),
  newest('data'),
];
const replaced: Action[] = [
  newest('reconnect'),
  { type: 'timer', timer: 'backoff' },
  newest('open'),
  newest('params'),
];
const starts = {
  none: [],
  /** A subscription moving from A to B. */
  moving: [...subscribed, ...replaced],
  /**
   * A query in flight keeps A open after the move, and A delivers two events
   * during it, which B replays.
   */
  busyOldSocket: [
    ...subscribed,
    { type: 'request', method: 'query' },
    { type: 'timer', timer: 'flush' },
    ...replaced,
    previous('data'),
    previous('data'),
  ],
  /** B gets a reconnect notice mid-move, and C is ready. */
  secondNotice: [...subscribed, ...replaced, ...replaced],
} satisfies Record<string, Action[]>;

function runScenario({
  lazy,
  slowFirstSocket,
  start,
  eagerData,
  untracked,
  actions,
}: Scenario) {
  const sim = new Sim({ lazy, slowFirstSocket, eagerData, untracked });
  for (const action of [...starts[start], ...actions]) {
    run(sim, action);
  }
  probeEveryLiveSubscription(sim);
  answerEveryFence(sim);
  // Let everything settle: the server answers and ends every socket, and
  // the client closes.
  sim.closedAfter = sim.lastRequestId;
  sim.closedConnectionsUpTo = sim.model.lastConnectionId;
  sim.dispatch({ type: 'close' });
  for (const [connection, socket] of sim.sockets) {
    for (const [id, call] of socket.calls) {
      if (!sim.hears(connection)) break;
      if (call.method !== 'subscription') {
        frame(sim, connection, { id, result: { type: 'data', data: 'ok' } });
      }
    }
  }
  for (const [connection, socket] of sim.sockets) {
    if (!socket.closed && !socket.released) {
      socket.closed = true;
      sim.dispatch({
        type: 'connection',
        connection,
        event: { type: 'socketClosed', event: fakeCloseEvent },
      });
    }
    if (!socket.released) {
      socket.released = true;
      sim.dispatch({
        type: 'connection',
        connection,
        event: { type: 'released' },
      });
    }
  }
  for (const [id, request] of sim.requests) {
    check(request.terminals === 1, `request ${id} never ended`);
  }
  check(sim.model.connections.size === 0, 'connections left after close');
  return sim;
}

/**
 * None lost: the socket serving each live subscription sends on until the
 * subscriber gets an event, which the per-step check requires to be the one
 * after the last it got. Replays of what it already got are dropped first.
 */
function probeEveryLiveSubscription(sim: Sim) {
  for (const id of [...sim.model.requests.keys()]) {
    const user = sim.requests.get(id)!;
    if (user.method !== 'subscription') continue;
    const wire = sim.model.requests.get(id)!.wire;
    const before = user.lastData;
    let probed = false;
    // Each frame can move it on, so the serving socket is looked up again.
    for (let i = 0; i < 400 && user.lastData === before; i++) {
      const state = sim.model.requests.get(id)?.state;
      if (
        state?.kind !== 'sent' &&
        state?.kind !== 'moving' &&
        state?.kind !== 'leaving'
      ) {
        break;
      }
      // A moving one is served by its old socket until the new one answers.
      const connection = servingOf(state)
        .reverse()
        .find((serving) => canSend(sim, serving, wire));
      if (connection === undefined) break;
      const call = sim.sockets.get(connection)!.calls.get(wire)!;
      probed = true;
      if (!call.started) {
        call.started = true;
        frame(sim, connection, { id: wire, result: { type: 'started' } });
        continue;
      }
      sendEvent(sim, { connection, id: wire, call });
    }
    if (!probed || user.terminals > 0) continue;
    check(
      user.lastData === before + 1,
      `subscription ${id} never got event ${before + 1}`,
    );
    if (user.movedTo !== null) {
      covered.add('event after the run delivered after a move');
    }
  }
}

/**
 * No subscription is left leaving a socket that answered its fence. One whose
 * fence couldn't be sent waits for the socket to end it or go.
 */
function answerEveryFence(sim: Sim) {
  for (const [connection, socket] of sim.sockets) {
    while (answerFence(sim, connection, socket));
  }
  for (const [id, request] of sim.model.requests) {
    for (const connection of leftOf(request.state)) {
      check(
        !sim.writable(connection),
        `subscription ${id} still leaving connection ${connection} after its fence`,
      );
    }
  }
}

function sendEvent(
  sim: Sim,
  opts: { connection: ConnectionId; id: number; call: ServerCall },
) {
  const eventId = opts.call.next++;
  frame(sim, opts.connection, {
    id: opts.id,
    result: sim.untracked
      ? { type: 'data', data: eventId }
      : { type: 'data', id: String(eventId), data: eventId },
  });
}

function canSend(sim: Sim, connection: ConnectionId, wire: WireId) {
  const socket = sim.sockets.get(connection);
  const call = socket?.calls.get(wire);
  return (
    !!socket &&
    !!call &&
    !call.stopping &&
    !socket.slowSetup &&
    !socket.closing &&
    sim.hears(connection)
  );
}

function isLive(connection: ConnectionModel | undefined) {
  return connection !== undefined && connection.state.phase !== 'closed';
}

const SEED = 7925;

describe('reaching every coverage goal', () => {
  beforeAll(() => covered.reset());
  test.prop([scenarioArb], {
    seed: SEED,
    numRuns: 4_000,
    reporter: covered.report,
  })('random event sequences keep every invariant', (scenario) => {
    runScenario(scenario);
  });
});

test.prop([scenarioArb], { numRuns: 2_000 })(
  'random event sequences keep every invariant, unseeded',
  (scenario) => {
    runScenario(scenario);
  },
);

test('close() finishing leaves a replaced connection opened since serving', () => {
  // The second socket has nothing in flight when close() finishes, but it
  // takes new requests until its replacement is ready.
  expect(() =>
    runScenario({
      lazy: false,
      slowFirstSocket: false,
      start: 'none',
      eagerData: false,
      untracked: false,
      actions: [
        { type: 'request', method: 'query' },
        { type: 'socket', pick: 0, action: 'open', call: 0 },
        { type: 'socket', pick: 0, action: 'params', call: 0 },
        { type: 'close' },
        { type: 'sendFails' },
        { type: 'request', method: 'query' },
        { type: 'socket', pick: 0, action: 'open', call: 0 },
        { type: 'socket', pick: 0, action: 'params', call: 0 },
        { type: 'socket', pick: 0, action: 'reconnect', call: 0 },
        { type: 'request', method: 'query' },
        { type: 'socket', pick: 1, action: 'answer', call: 0 },
      ],
    }),
  ).not.toThrow();
});

test('a subscription moved on before its new connection replayed drops the replay', () => {
  let request: SubscriptionRequest = {
    id: 1,
    method: 'subscription',
    lastEventId: '1',
    wire: 1,
    wiredUpTo: 1,
    state: { kind: 'sent', connection: 1, started: true, replayed: [] },
  };
  const next: unknown[] = [];
  function apply(event: RequestEvent | { type: 'move'; to: ConnectionId }) {
    const result =
      event.type === 'move'
        ? moveSubscription(request, event.to)
        : requestTransition(request, event);
    assert(result.request.method === 'subscription');
    request = result.request;
    for (const effect of result.effects) {
      if (effect.type === 'next' && 'result' in effect.message) {
        next.push(effect.message.result);
      }
      expect(effect.type).not.toBe('invariantViolation');
    }
  }
  const data = (connection: ConnectionId, id: string): RequestEvent => ({
    type: 'response',
    connection,
    message: { id: 1, result: { type: 'data', id, data: Number(id) } },
  });

  apply({ type: 'move', to: 2 });
  apply(data(1, '2'));
  apply({
    type: 'response',
    connection: 2,
    message: { id: 1, result: { type: 'started' } },
  });
  // Connection 1 has handled the stop; connection 2 resumes from event 1,
  // and is replaced before it resends 2.
  apply({ type: 'fenced', connection: 1, to: 2 });
  apply({ type: 'move', to: 3 });
  apply(data(2, '2'));
  apply(data(2, '3'));
  expect(next).toEqual([
    { type: 'data', id: '2', data: 2 },
    { type: 'data', id: '3', data: 3 },
  ]);
});

test('a subscription moving to a connection that a newer one replaces moves there instead, and is stopped on it', () => {
  let request: SubscriptionRequest = {
    id: 1,
    method: 'subscription',
    lastEventId: '1',
    wire: 1,
    wiredUpTo: 1,
    state: { kind: 'sent', connection: 1, started: true, replayed: [] },
  };
  const next: unknown[] = [];
  const stops: ConnectionId[] = [];
  function apply(event: RequestEvent | { type: 'move'; to: ConnectionId }) {
    const result =
      event.type === 'move'
        ? moveSubscription(request, event.to)
        : requestTransition(request, event);
    assert(result.request.method === 'subscription');
    request = result.request;
    for (const effect of result.effects) {
      if (effect.type === 'next' && 'result' in effect.message) {
        next.push(effect.message.result);
      }
      if (effect.type === 'sendStop') stops.push(effect.connection);
      expect(effect.type).not.toBe('invariantViolation');
    }
  }
  const data = (connection: ConnectionId, id: string): RequestEvent => ({
    type: 'response',
    connection,
    message: { id: 1, result: { type: 'data', id, data: Number(id) } },
  });

  apply({ type: 'move', to: 2 });
  apply(data(1, '2'));
  apply({ type: 'move', to: 3 });
  expect(stops).toEqual([2]);
  expect(request.wiredUpTo).toBe(3);
  expect(request.state).toMatchObject({ kind: 'moving', from: 1, to: 3 });
  // Connection 1 serves it until connection 3 confirms it.
  apply(data(1, '3'));
  apply({
    type: 'response',
    connection: 3,
    message: { id: 1, result: { type: 'started' } },
  });
  expect(stops).toEqual([2, 1]);
  apply(data(3, '2'));
  apply(data(3, '3'));
  apply(data(3, '4'));
  expect(next).toEqual([
    { type: 'data', id: '2', data: 2 },
    { type: 'data', id: '3', data: 3 },
    { type: 'data', id: '4', data: 4 },
  ]);
});

test('a move drops replayed events by id, whatever the ids look like', () => {
  // Event ids are opaque: these neither increase nor parse as numbers.
  let request: SubscriptionRequest = {
    id: 1,
    method: 'subscription',
    lastEventId: 'kx',
    wire: 1,
    wiredUpTo: 1,
    state: { kind: 'sent', connection: 1, started: true, replayed: [] },
  };
  const next: unknown[] = [];
  function apply(event: RequestEvent | { type: 'move'; to: ConnectionId }) {
    const result =
      event.type === 'move'
        ? moveSubscription(request, event.to)
        : requestTransition(request, event);
    assert(result.request.method === 'subscription');
    request = result.request;
    for (const effect of result.effects) {
      if (effect.type === 'next' && 'result' in effect.message) {
        next.push(effect.message.result);
      }
      expect(effect.type).not.toBe('invariantViolation');
    }
  }
  const data = (connection: ConnectionId, id: string): RequestEvent => ({
    type: 'response',
    connection,
    message: { id: 1, result: { type: 'data', id, data: id } },
  });

  apply({ type: 'move', to: 2 });
  apply(data(1, 'zz-9'));
  apply(data(1, 'a10'));
  apply({
    type: 'response',
    connection: 2,
    message: { id: 1, result: { type: 'started' } },
  });
  apply(data(2, 'zz-9'));
  apply(data(2, 'a10'));
  apply(data(2, '07'));
  expect(next).toEqual([
    { type: 'data', id: 'zz-9', data: 'zz-9' },
    { type: 'data', id: 'a10', data: 'a10' },
    { type: 'data', id: '07', data: '07' },
  ]);
  expect(request.lastEventId).toBe('07');
});

// --- the diagrams in the PR are generated from the transition functions ----

const connectionSamples: ConnectionState[] = [
  { phase: 'connecting' },
  { phase: 'handshaking', rejected: false, answered: false },
  { phase: 'ready', rejected: false, answered: false },
  { phase: 'draining' },
  { phase: 'closed', closeReported: false },
  { phase: 'closed', closeReported: true },
];

const connectionEvents: ConnectionEvent[] = [
  { type: 'socketOpened' },
  { type: 'paramsResolved', data: null },
  { type: 'openFailed', cause: null },
  { type: 'socketClosed', event: fakeCloseEvent },
  { type: 'socketError', event: fakeEvent },
  { type: 'socketUnwritable' },
  { type: 'pongTimeout' },
  { type: 'badFrame', error: new Error('bad'), cause: null },
  { type: 'drain' },
  { type: 'close' },
  { type: 'received' },
  { type: 'result' },
  { type: 'rejection' },
  { type: 'released' },
];

function connectionLabel(state: ConnectionState) {
  return state.phase === 'closed' && state.closeReported
    ? 'closeReported'
    : state.phase;
}

function connectionDiagram() {
  return stateDiagram({
    initial: [{ to: 'connecting', label: null }],
    edges: sampleTransitions({
      states: connectionSamples,
      events: connectionEvents,
      next(state, event) {
        const result = connectionTransition(
          { id: 1, retryIndex: null, state },
          event,
        );
        return result.effects.some(
          (effect) => effect.type === 'invariantViolation',
        )
          ? null
          : result.connection.state;
      },
      stateName: connectionLabel,
      eventName: (event) => event.type,
    }),
    final: ['closeReported'],
    sort: false,
  });
}

/** Sent on connection 1; a move goes to connection 2. */
const requestSamples: RequestState[] = [
  { kind: 'queued', batch: null },
  { kind: 'queued', batch: null, left: [] },
  { kind: 'queued', batch: null, left: [{ connection: 1, to: 2, wire: 1 }] },
  { kind: 'sent', connection: 1, started: false, replayed: [] },
  { kind: 'moving', from: 1, to: 2, left: [], started: false, replayed: [] },
  {
    kind: 'leaving',
    to: 2,
    left: [{ connection: 1, to: 2, wire: 1 }],
    started: false,
    replayed: [],
  },
  { kind: 'settled' },
];

const responses: { label: string; message: TRPCResponseMessage }[] = [
  { label: 'started', message: { id: 1, result: { type: 'started' } } },
  { label: 'data', message: { id: 1, result: { type: 'data', data: 1 } } },
  { label: 'stopped', message: { id: 1, result: { type: 'stopped' } } },
  {
    label: 'error',
    message: {
      id: 1,
      error: {
        message: '',
        code: -32603,
        data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
      },
    } as never,
  },
];

const requestEvents: {
  label: string;
  event: RequestEvent | { type: 'move'; to: ConnectionId };
}[] = [
  { label: 'batch', event: { type: 'batch', connection: 1 } },
  { label: 'unbatch', event: { type: 'unbatch' } },
  { label: 'send', event: { type: 'send', connection: 1 } },
  { label: 'move', event: { type: 'move', to: 2 } },
  { label: 'move to a newer one', event: { type: 'move', to: 3 } },
  {
    label: 'connectionLost',
    event: { type: 'connectionLost', connection: 1, cause: null },
  },
  {
    label: 'connectionLost on new',
    event: { type: 'connectionLost', connection: 2, cause: null },
  },
  ...responses.flatMap(({ label, message }) => [
    { label, event: { type: 'response', connection: 1, message } } as const,
    {
      label: `${label} on new`,
      event: { type: 'response', connection: 2, message },
    } as const,
  ]),
  { label: 'fenced', event: { type: 'fenced', connection: 1, to: 2 } },
  {
    label: "an earlier move's fence",
    event: { type: 'fenced', connection: 1, to: 3 },
  },
  { label: 'unsubscribe', event: { type: 'unsubscribe' } },
  { label: 'clientClose', event: { type: 'clientClose' } },
  { label: 'sendFailed', event: { type: 'sendFailed', cause: null } },
];

function requestDiagram(method: RequestMethod) {
  return stateDiagram({
    initial: [{ to: 'queued', label: null }],
    edges: sampleTransitions({
      // Only subscriptions move, or leave connections.
      states: requestSamples.filter((state) =>
        method === 'subscription'
          ? state.kind !== 'queued' || 'left' in state
          : !('left' in state),
      ),
      // A tracked subscription has delivered an event, so it has an id to
      // resume from.
      events: [
        ...requestEvents.map((sample) => ({ ...sample, lastEventId: null })),
        ...requestEvents
          .filter(
            ({ label }) =>
              label === 'started on new' || label === 'data on new',
          )
          .map((sample) => ({
            ...sample,
            label: `${sample.label} (tracked)`,
            lastEventId: '1',
          })),
      ],
      next(state, { event, lastEventId }) {
        // Only a moving or leaving subscription hears from its new connection.
        if (
          state.kind !== 'moving' &&
          state.kind !== 'leaving' &&
          'connection' in event &&
          event.connection === 2
        ) {
          return null;
        }
        const request: RequestModel =
          method === 'subscription'
            ? {
                id: 1,
                method,
                lastEventId,
                wire: 1,
                wiredUpTo: 1,
                state: state as SubscriptionState,
              }
            : { id: 1, method, wire: 1, state: state as QueryState };
        let result: RequestTransition;
        if (event.type === 'move') {
          if (request.method !== 'subscription') return null;
          result = moveSubscription(request, event.to);
        } else {
          result = requestTransition(request, event);
        }
        return result.effects.some(
          (effect) => effect.type === 'invariantViolation',
        )
          ? null
          : result.request.state;
      },
      stateName: (state) => state.kind,
      eventName: ({ label }) => label,
    }),
    final: ['settled'],
    sort: false,
  });
}

function clientDiagram() {
  const edges: DiagramEdge[] = [];
  fc.assert(
    fc.property(scenarioArb, (scenario) => {
      edges.push(...runScenario(scenario).lifecycleEdges.values());
    }),
    { seed: SEED, numRuns: 4_000 },
  );
  return stateDiagram({
    initial: [
      { to: 'idle', label: 'lazy' },
      { to: 'connecting', label: null },
    ],
    edges,
    final: [],
    sort: true,
  });
}

test('the state diagrams match the transition functions', async () => {
  const markdown = [
    '<!-- Generated by websockets.clientMachine.test.ts; update with `pnpm vitest run packages/tests/server/websockets.clientMachine.test.ts -u`. -->',
    '',
    '## Client lifecycle',
    '',
    'Every lifecycle change the model-based test reaches.',
    '',
    '```mermaid',
    clientDiagram(),
    '```',
    '',
    '## Connection',
    '',
    '```mermaid',
    connectionDiagram(),
    '```',
    '',
    '## Request: query and mutation',
    '',
    '```mermaid',
    requestDiagram('query'),
    '```',
    '',
    '## Request: subscription',
    '',
    '```mermaid',
    requestDiagram('subscription'),
    '```',
    '',
  ].join('\n');
  await expect(markdown).toMatchFileSnapshot(
    './websockets.clientMachine.diagrams.md',
  );
  expect(requestDiagram('mutation')).toBe(requestDiagram('query'));
});
