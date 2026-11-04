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
import type { TRPCClientIncomingMessage } from '@trpc/server/unstable-core-do-not-import';
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
  /** The client still listens to it: not disposed by `closeSocket`. */
  io: boolean;
  /** The server started closing it: nothing more is written. */
  closing: boolean;
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
}

class InvariantError extends Error {}

/** One transition, as the simulator plays it. */
interface Step {
  readonly event: ClientEvent | null;
  readonly effects: readonly ClientEffect[];
  readonly before: ClientModel | null;
  readonly after: ClientModel;
}

/** Paths the random runs must reach, or the invariants prove little. */
const coverageGoals = [
  'subscription moved',
  'replacement failure shown',
  'retired socket frame dropped',
  'batch send failed',
  'backoff continued',
  'close waited for a request in flight',
  'lazy connection went idle',
  'subscription resumed after a loss',
  'silent socket timed out',
] as const;
type CoverageGoal = (typeof coverageGoals)[number];
const covered = new Set<CoverageGoal>();

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new InvariantError(message);
}

const fakeEvent = {} as Event;
const fakeCloseEvent = { code: 1000 } as CloseEvent;

class Sim {
  model: ClientModel;
  readonly sockets = new Map<ConnectionId, SimSocket>();
  readonly timers = new Set<Timer>();
  readonly requests = new Map<number, UserRequest>();
  readonly lifecycleEdges = new Set<string>();
  readonly pending: ClientEvent[] = [];
  lastRequestId = 0;
  /** The last request made before the latest `close()`. */
  closedAfter = 0;
  sendFails = false;

  constructor(lazy: boolean) {
    const initial = initialClient({ lazy });
    this.model = initial.state;
    this.play({
      event: null,
      effects: initial.effects,
      before: null,
      after: initial.state,
    });
  }

  // The interpreter's `observeWritability`.
  private observeWritability() {
    const lifecycle = this.model.lifecycle;
    if (lifecycle.kind !== 'open') return;
    if (this.writable(lifecycle.connection)) return;
    this.dispatch({
      type: 'connection',
      connection: lifecycle.connection,
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

  /** The server can still send on it, and the client still listens. */
  hears(connection: ConnectionId) {
    const socket = this.sockets.get(connection);
    return !!socket && socket.opened && socket.io && !socket.closed;
  }

  request(method: RequestMethod) {
    const id = ++this.lastRequestId;
    this.requests.set(id, {
      method,
      sends: 0,
      terminals: 0,
      lastData: 0,
      startedAllowed: true,
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
    this.pending.push(event);
    if (this.pending.length > 1) return;
    while (this.pending.length > 0) {
      const next = this.pending[0]!;
      const before = this.model;
      const result = clientTransition(before, next);
      this.model = result.state;
      const edge = lifecycleEdge(before, next, result.state);
      if (edge) this.lifecycleEdges.add(edge);
      this.play({
        event: next,
        effects: result.effects,
        before,
        after: result.state,
      });
      this.pending.shift();
    }
  }

  // --- effects, as the interpreter and the server would play them -------

  private play(step: Step) {
    const { effects, before } = step;
    for (const effect of effects) {
      check(
        effect.type !== 'invariantViolation',
        `invariant violation: ${effect.type === 'invariantViolation' ? effect.message : ''}`,
      );
    }
    if (before) checkStep(this, { ...step, before });

    for (const effect of effects) {
      switch (effect.type) {
        case 'openSocket':
          this.sockets.set(effect.connection, {
            opened: false,
            paramsRequested: false,
            paramsDone: false,
            io: true,
            closing: false,
            closed: false,
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
}

// --- invariants ---------------------------------------------------------------

function liveRequestIds(model: ClientModel) {
  return [...model.requests.keys()];
}

function sentOn(model: ClientModel, connection: ConnectionId) {
  return [...model.requests.values()].filter(
    (request) =>
      request.state.kind === 'sent' && request.state.connection === connection,
  );
}

function checkStep(sim: Sim, step: Step & { before: ClientModel }) {
  const { event, effects, before, after } = step;
  const frameFrom =
    event?.type === 'frame' ? event.connection : (null as ConnectionId | null);
  if (event?.type === 'frame' && typeof event.message.id === 'number') {
    const state = before.requests.get(event.message.id)?.state;
    if (state?.kind !== 'sent' || state.connection !== event.connection) {
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
        // Subscriptions move only to a ready socket, and requests go only
        // on the current one.
        const connection = after.connections.get(effect.connection);
        check(
          connection?.state.phase === 'ready',
          `sent on connection ${effect.connection} in phase ${connection?.state.phase}`,
        );
        check(
          after.lifecycle.kind === 'open' &&
            after.lifecycle.connection === effect.connection,
          'sent on a connection that is not current',
        );
        for (const { id } of effect.requests) {
          const request = sim.requests.get(id)!;
          // I3: a query or mutation is sent at most once.
          check(
            request.method === 'subscription' || request.sends === 0,
            `${request.method} ${id} sent twice`,
          );
        }
        break;
      }
      case 'next': {
        const request = sim.requests.get(effect.request)!;
        check(
          request.terminals === 0,
          `next after the end of ${effect.request}`,
        );
        // I1/I2: only the socket a request was sent on can answer it, so a
        // retired socket's late frames never reach a moved subscription.
        const state = before.requests.get(effect.request)?.state;
        check(
          frameFrom !== null &&
            state?.kind === 'sent' &&
            state.connection === frameFrom,
          `request ${effect.request} answered by connection ${frameFrom}, not its own`,
        );
        const result =
          'result' in effect.message ? effect.message.result : null;
        if (result?.type === 'started') {
          // D1: a moved subscription's handover is invisible.
          check(request.startedAllowed, `second started for ${effect.request}`);
          request.startedAllowed = false;
        }
        if (result?.type === 'data' && request.method === 'subscription') {
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
      case 'closeSocket': {
        // I12: make before break.
        const previous = before.connections.get(effect.connection);
        if (previous?.state.phase === 'draining') {
          check(
            sentOn(after, effect.connection).length === 0,
            `draining connection ${effect.connection} closed with requests in flight`,
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
        if (
          effect.state.state === 'connecting' &&
          after.draining.length > 0 &&
          before.lifecycle.kind !== 'open'
        ) {
          // D5: replacing a connection stays invisible until it fails 3
          // times in a row. Losing a replacement that was ready is not
          // hidden.
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
        check(after.draining.length === 0, 'closed with draining connections');
        if (sim.lastRequestId === sim.closedAfter) {
          check(after.lifecycle.kind === 'idle', 'closed but not idle');
        }
        break;
      }
      default:
        break;
    }
  }

  for (const [id, request] of after.requests) {
    const previous = before.requests.get(id);
    if (previous?.state.kind !== 'sent' || request.state.kind === 'settled') {
      continue;
    }
    if (request.state.kind === 'sent') {
      // A move is sent on the new connection in the same step.
      if (request.state.connection !== previous.state.connection) {
        check(
          request.state.hideStarted,
          `request ${id} moved without hiding started`,
        );
        covered.add('subscription moved');
      }
      continue;
    }
    if (request.state.hideStarted) {
      covered.add('subscription moved');
    } else {
      // A subscription that lost its socket shows `started` again.
      sim.requests.get(id)!.startedAllowed = true;
      if (sim.requests.get(id)!.lastData > 0) {
        covered.add('subscription resumed after a loss');
      }
    }
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
  for (const id of liveRequestIds(model)) {
    const state = model.requests.get(id)!.state;
    // I4: every request is queued or owned by a live connection.
    if (state.kind === 'sent') {
      const phase = model.connections.get(state.connection)?.state.phase;
      check(
        phase === 'ready' || phase === 'draining',
        `request ${id} sent on connection ${state.connection} in phase ${phase}`,
      );
    } else if (state.kind === 'queued' && state.batch !== null) {
      check(
        lifecycle.kind === 'open' && lifecycle.connection === state.batch,
        `request ${id} batched for a connection that isn't current`,
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
) {
  if (
    before.lifecycle.kind === after.lifecycle.kind &&
    connectionOf(before) === connectionOf(after)
  ) {
    return null;
  }
  return `${before.lifecycle.kind} --> ${after.lifecycle.kind} : ${eventLabel(event)}`;
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
  | 'stray';

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
  const listening = socket.io && !socket.closed;
  const calls = [...socket.calls.entries()];
  switch (action) {
    case 'open':
      if (!listening || socket.opened) return;
      socket.opened = true;
      event({ type: 'socketOpened' });
      return;
    case 'params':
    case 'paramsFail':
      if (!listening || !socket.paramsRequested || socket.paramsDone) return;
      socket.paramsDone = true;
      event(
        action === 'params'
          ? { type: 'paramsResolved', data: callIndex % 2 ? '{}' : null }
          : { type: 'openFailed', cause: new Error('params') },
      );
      return;
    case 'openFail':
      if (!listening || socket.opened) return;
      socket.closed = true;
      event({ type: 'openFailed', cause: new Error('url') });
      return;
    case 'serverClose':
      if (socket.opened) socket.closing = true;
      return;
    case 'closed':
      if (socket.closed) return;
      socket.closed = true;
      event({ type: 'socketClosed', event: fakeCloseEvent });
      return;
    case 'error':
      if (socket.closed) return;
      event({ type: 'socketError', event: fakeEvent });
      return;
    case 'pongTimeout':
      if (!listening || !socket.opened) return;
      event({ type: 'pongTimeout' });
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
      if (socket.calls.has(id)) return;
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
}

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  lazy: fc.boolean(),
  actions: fc.array(actionArb, { maxLength: 150, size: 'max' }),
});

function runScenario({ lazy, actions }: Scenario) {
  const sim = new Sim(lazy);
  for (const action of actions) run(sim, action);
  // Let everything settle: the server answers and ends every socket, and
  // the client closes.
  sim.closedAfter = sim.lastRequestId;
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
    if (socket.closed) continue;
    socket.closed = true;
    sim.dispatch({
      type: 'connection',
      connection,
      event: { type: 'socketClosed', event: fakeCloseEvent },
    });
  }
  for (const [id, request] of sim.requests) {
    check(request.terminals === 1, `request ${id} never ended`);
  }
  check(sim.model.connections.size === 0, 'connections left after close');
  return sim;
}

const SEED = 7925;

test('random event sequences keep every invariant', () => {
  covered.clear();
  fc.assert(
    fc.property(scenarioArb, (scenario) => {
      runScenario(scenario);
    }),
    { seed: SEED, numRuns: 2_000 },
  );
  expect(coverageGoals.filter((goal) => !covered.has(goal))).toEqual([]);
});

test('random event sequences keep every invariant, unseeded', () => {
  fc.assert(
    fc.property(scenarioArb, (scenario) => {
      runScenario(scenario);
    }),
    { numRuns: 2_000 },
  );
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
];

function connectionLabel(state: ConnectionState) {
  return state.phase === 'closed' && state.closeReported
    ? 'closeReported'
    : state.phase;
}

function connectionDiagram() {
  const edges = new Map<string, string[]>();
  for (const state of connectionSamples) {
    const model: ConnectionModel = { id: 1, retryIndex: null, state };
    for (const event of connectionEvents) {
      const result = connectionTransition(model, event);
      if (
        result.effects.some((effect) => effect.type === 'invariantViolation')
      ) {
        continue;
      }
      const from = connectionLabel(state);
      const to = connectionLabel(result.connection.state);
      const key = `${from} --> ${to}`;
      edges.set(key, [...(edges.get(key) ?? []), event.type]);
    }
  }
  return [
    'stateDiagram-v2',
    '  [*] --> connecting',
    ...[...edges].map(([edge, events]) => `  ${edge} : ${events.join(', ')}`),
    '  closeReported --> [*]',
  ].join('\n');
}

const requestSamples: RequestState[] = [
  { kind: 'queued', batch: null, hideStarted: false },
  { kind: 'sent', connection: 1, hideStarted: false },
  { kind: 'settled' },
];

const requestEvents: { label: string; event: RequestEvent }[] = [
  { label: 'batch', event: { type: 'batch', connection: 1 } },
  { label: 'unbatch', event: { type: 'unbatch' } },
  { label: 'send', event: { type: 'send', connection: 1 } },
  { label: 'move', event: { type: 'move' } },
  { label: 'connectionLost', event: { type: 'connectionLost', cause: null } },
  {
    label: 'started',
    event: {
      type: 'response',
      message: { id: 1, result: { type: 'started' } },
    },
  },
  {
    label: 'data',
    event: {
      type: 'response',
      message: { id: 1, result: { type: 'data', data: 1 } },
    },
  },
  {
    label: 'stopped',
    event: {
      type: 'response',
      message: { id: 1, result: { type: 'stopped' } },
    },
  },
  {
    label: 'error',
    event: {
      type: 'response',
      message: {
        id: 1,
        error: {
          message: '',
          code: -32603,
          data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
        },
      } as never,
    },
  },
  { label: 'unsubscribe', event: { type: 'unsubscribe' } },
  { label: 'clientClose', event: { type: 'clientClose' } },
  { label: 'sendFailed', event: { type: 'sendFailed', cause: null } },
];

function requestDiagram(method: RequestMethod) {
  const edges = new Map<string, string[]>();
  for (const state of requestSamples) {
    const request: RequestModel = { id: 1, method, lastEventId: null, state };
    for (const { label, event } of requestEvents) {
      const result = requestTransition(request, event);
      if (
        result.effects.some((effect) => effect.type === 'invariantViolation')
      ) {
        continue;
      }
      const key = `${state.kind} --> ${result.request.state.kind}`;
      edges.set(key, [...(edges.get(key) ?? []), label]);
    }
  }
  return [
    'stateDiagram-v2',
    '  [*] --> queued',
    ...[...edges].map(([edge, events]) => `  ${edge} : ${events.join(', ')}`),
    '  settled --> [*]',
  ].join('\n');
}

function clientDiagram() {
  const edges = new Map<string, Set<string>>();
  fc.assert(
    fc.property(scenarioArb, (scenario) => {
      for (const edge of runScenario(scenario).lifecycleEdges) {
        const [transition, label] = edge.split(' : ') as [string, string];
        edges.set(transition, (edges.get(transition) ?? new Set()).add(label));
      }
    }),
    { seed: SEED, numRuns: 2_000 },
  );
  return [
    'stateDiagram-v2',
    '  [*] --> idle : lazy',
    '  [*] --> connecting',
    ...[...edges]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([edge, labels]) => `  ${edge} : ${[...labels].sort().join(', ')}`),
  ].join('\n');
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
