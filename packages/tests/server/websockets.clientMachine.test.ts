import type { MachineModel, ModelStep } from './___machineModel';
import { check, coverage, simulateMachine } from './___machineModel';
/**
 * Model-based tests for the wsClient state machines. fast-check generates
 * sequences of what sockets, timers, the server and the user can do; a
 * simulator turns each into the event the interpreter would dispatch, runs
 * `clientTransition`, plays the server's side of the effects, and checks the
 * invariants after every step.
 */
import type {
  ClientEffect,
  ClientEvent,
  ClientModel,
  Timer,
} from '@trpc/client/links/wsLink/wsClient/machine/clientMachine';
import {
  clientTransition,
  initialClient,
  sendingConnection,
  VISIBLE_REPLACEMENT_FAILURES,
} from '@trpc/client/links/wsLink/wsClient/machine/clientMachine';
import type {
  ConnectionEvent,
  ConnectionModel,
  ConnectionState,
} from '@trpc/client/links/wsLink/wsClient/machine/connectionMachine';
import { connectionTransition } from '@trpc/client/links/wsLink/wsClient/machine/connectionMachine';
import type {
  ConnectionId,
  RequestEvent,
  RequestMethod,
  RequestModel,
  RequestState,
} from '@trpc/client/links/wsLink/wsClient/machine/requestMachine';
import { requestTransition } from '@trpc/client/links/wsLink/wsClient/machine/requestMachine';
import type {
  DiagramEdge,
  TRPCClientIncomingMessage,
  TRPCResponseMessage,
} from '@trpc/server/unstable-core-do-not-import';
import {
  sampleTransitions,
  stateDiagram,
} from '@trpc/server/unstable-core-do-not-import';
import fc from 'fast-check';

// --- the simulated world ----------------------------------------------------

interface ServerCall {
  readonly method: RequestMethod;
  /** Subscriptions: the id of the next event this socket sends. */
  next: number;
  started: boolean;
  stopping: boolean;
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
  /** What the server got on this socket and still answers. */
  readonly calls: Map<number, ServerCall>;
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
  'move undone by a lost successor',
  'old socket lost during a move',
  'replacement failure shown',
  'retired socket frame dropped',
  'batch send failed',
  'backoff continued',
  'close waited for a request in flight',
  'lazy connection went idle',
  'subscription resumed after a loss',
  'silent socket timed out',
  'connection released without a close',
]);

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

  constructor(opts: { lazy: boolean; slowFirstSocket: boolean }) {
    this.slowFirstSocket = opts.slowFirstSocket;
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
        for (const { id, lastEventId } of effect.requests) {
          const request = this.requests.get(id)!;
          request.sends++;
          if (!this.writable(effect.connection)) continue;
          socket.calls.set(id, {
            method: request.method,
            next: Number(lastEventId ?? 0) + 1,
            started: false,
            stopping: false,
          });
        }
        break;
      }
      case 'sendStop': {
        const call = this.sockets
          .get(effect.connection)
          ?.calls.get(effect.request);
        if (call && this.writable(effect.connection)) call.stopping = true;
        break;
      }
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

/** The connections that may answer a request. */
function servingOf(state: RequestState | undefined): ConnectionId[] {
  switch (state?.kind) {
    case 'sent':
      return [state.connection];
    case 'moving':
      return [state.from, state.to];
    default:
      return [];
  }
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
  if (event?.type === 'frame' && typeof event.message.id === 'number') {
    const state = before.requests.get(event.message.id)?.state;
    if (!servingOf(state).includes(event.connection)) {
      if (
        before.connections.get(event.connection)?.state.phase === 'draining'
      ) {
        covered.add('retired socket frame dropped');
      }
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
          check(
            !request.startedAllowed,
            `subscription ${effect.request} got data before started`,
          );
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
        // only once the new one has answered it, unless it ended.
        const state = before.requests.get(effect.request)?.state;
        if (after.requests.has(effect.request) && state?.kind === 'moving') {
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
        if (effect.state.state === 'connecting' && after.handover !== null) {
          // D5: replacing a connection stays invisible until it fails 3
          // times in a row.
          check(
            after.failedReplacements >= VISIBLE_REPLACEMENT_FAILURES,
            `connecting shown after ${after.failedReplacements} failed replacements`,
          );
          covered.add('replacement failure shown');
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
          after.draining.every((id) => id > sim.closedConnectionsUpTo),
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

  if (event?.type === 'frame' && typeof event.message.id === 'number') {
    const previous = before.requests.get(event.message.id);
    const message = event.message;
    const eventId =
      'result' in message && message.result.type === 'data'
        ? message.result.id
        : undefined;
    if (
      previous &&
      servingOf(previous.state).includes(event.connection) &&
      eventId !== undefined &&
      previous.replayed.includes(eventId) &&
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
        (previous?.kind === 'sent' || previous?.kind === 'moving')
      ) {
        // A subscription that lost its socket shows `started` again.
        user.startedAllowed = true;
        if (user.lastData > 0) covered.add('subscription resumed after a loss');
      }
      check(
        state.kind === 'settled' || state.started === !user.startedAllowed,
        `subscription ${id} has started ${'started' in state && state.started}, but the user ${user.startedAllowed ? "hasn't" : 'has'} seen it`,
      );
    }
    if (previous?.kind === 'sent' && state.kind === 'moving') {
      covered.add('subscription moved');
      if (user.startedAllowed) {
        covered.add('subscription moved before started');
        user.movedBeforeStarted = true;
      }
    }
    if (previous?.kind === 'moving' && state.kind !== 'moving') {
      if (state.kind === 'sent' && state.connection === previous.from) {
        covered.add('move undone by a lost successor');
      } else if (frameFrom === previous.to) {
        covered.add('subscription confirmed on its new socket');
      } else if (state.kind === 'sent' && state.connection === previous.to) {
        covered.add('old socket lost during a move');
      }
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
      (phase === 'draining') === model.draining.includes(id),
      `connection ${id} draining mismatch`,
    );
  }
  if (current !== null) {
    check(model.connections.has(current), 'current connection missing');
  }
  if (model.handover !== null) {
    check(
      model.draining.at(-1) === model.handover,
      `handover ${model.handover} isn't the newest draining connection`,
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
    } else if (state.kind === 'moving') {
      const from = model.connections.get(state.from)?.state.phase;
      const to = model.connections.get(state.to)?.state.phase;
      check(
        from === 'draining' && (to === 'ready' || to === 'draining'),
        `request ${id} moving from a ${from} connection to a ${to} one`,
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
      lifecycle.kind === 'open' || model.draining.length > 0,
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
  | 'reconnect'
  | 'rejection'
  | 'answer'
  | 'answerError'
  | 'started'
  | 'data'
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
  reconnect: 2,
  rejection: 1,
  answer: 4,
  answerError: 1,
  started: 4,
  data: 6,
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
      const id = (callIndex % (sim.lastRequestId + 2)) + 1;
      const state = sim.model.requests.get(id)?.state;
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
      if (!call.started) {
        if (socket.slowSetup) return;
        call.started = true;
        frame(sim, connection, { id, result: { type: 'started' } });
        return;
      }
      if (action !== 'data') return;
      const eventId = call.next++;
      frame(sim, connection, {
        id,
        result: { type: 'data', id: String(eventId), data: eventId },
      });
      return;
    }
    default:
      action satisfies never;
  }
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
  /** Start with a subscription moving to a new socket. */
  moving: boolean;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  lazy: fc.boolean(),
  actions: fc.array(actionArb, { maxLength: 150, size: 'max' }),
  slowFirstSocket: fc.boolean(),
  moving: fc.boolean(),
});

/** Random runs seldom get a new socket ready before the old one goes. */
function newest(action: SocketAction): Action {
  return { type: 'socket', pick: 0, action, call: 0 };
}
const startMove: Action[] = [
  { type: 'request', method: 'subscription' },
  newest('open'),
  newest('params'),
  newest('started'),
  newest('data'),
  newest('reconnect'),
  { type: 'timer', timer: 'backoff' },
  newest('open'),
  newest('params'),
];

function runScenario({ lazy, slowFirstSocket, moving, actions }: Scenario) {
  const sim = new Sim({ lazy, slowFirstSocket });
  for (const action of moving ? [...startMove, ...actions] : actions) {
    run(sim, action);
  }
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

const SEED = 7925;

test('random event sequences keep every invariant', () => {
  covered.reset();
  fc.assert(
    fc.property(scenarioArb, (scenario) => {
      runScenario(scenario);
    }),
    { seed: SEED, numRuns: 4_000 },
  );
  expect(covered.missing()).toEqual([]);
});

test('random event sequences keep every invariant, unseeded', () => {
  fc.assert(
    fc.property(scenarioArb, (scenario) => {
      runScenario(scenario);
    }),
    { numRuns: 2_000 },
  );
});

test('a subscription moved on before its new connection replayed drops the replay', () => {
  let request: RequestModel = {
    id: 1,
    method: 'subscription',
    lastEventId: '1',
    replayed: [],
    state: { kind: 'sent', connection: 1, started: true },
  };
  const next: unknown[] = [];
  function apply(event: RequestEvent) {
    const result = requestTransition(request, event);
    request = result.request;
    for (const effect of result.effects) {
      if (effect.type === 'next') next.push(effect.message.result);
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
  // Connection 2 resumes from event 1, and is replaced before it resends 2.
  apply({ type: 'move', to: 3 });
  apply(data(2, '2'));
  apply(data(2, '3'));
  expect(next).toEqual([
    { type: 'data', id: '2', data: 2 },
    { type: 'data', id: '3', data: 3 },
  ]);
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
  { kind: 'queued', batch: null, started: false },
  { kind: 'sent', connection: 1, started: false },
  { kind: 'moving', from: 1, to: 2, started: false },
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

const requestEvents: { label: string; event: RequestEvent }[] = [
  { label: 'batch', event: { type: 'batch', connection: 1 } },
  { label: 'unbatch', event: { type: 'unbatch' } },
  { label: 'send', event: { type: 'send', connection: 1 } },
  { label: 'move', event: { type: 'move', to: 2 } },
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
  { label: 'unsubscribe', event: { type: 'unsubscribe' } },
  { label: 'clientClose', event: { type: 'clientClose' } },
  { label: 'sendFailed', event: { type: 'sendFailed', cause: null } },
];

function requestDiagram(method: RequestMethod) {
  return stateDiagram({
    initial: [{ to: 'queued', label: null }],
    edges: sampleTransitions({
      // Only subscriptions move.
      states: requestSamples.filter(
        (state) => method === 'subscription' || state.kind !== 'moving',
      ),
      events: requestEvents,
      next(state, { event }) {
        // Only a moving subscription hears from its new connection.
        if (
          state.kind !== 'moving' &&
          'connection' in event &&
          event.connection === 2
        ) {
          return null;
        }
        const result = requestTransition(
          { id: 1, method, lastEventId: null, replayed: [], state },
          event,
        );
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
