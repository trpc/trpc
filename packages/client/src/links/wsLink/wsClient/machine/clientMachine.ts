import type { TRPCClientIncomingMessage } from '@trpc/server/unstable-core-do-not-import';
import type { ClientEvent, ClientModel, ClientTransition } from './clientModel';
import { Step } from './clientStep';
import type { ConnectionEvent } from './connectionMachine';
import type { ConnectionId, Fence } from './requestMachine';
import { servingConnections } from './requestMachine';

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
    case 'released':
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
  const handover = step.onLost(connection, cause);
  step.effects.push(...notices);
  step.afterLost({ connection: before, event, cause, handover });
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
    typeof message.id === 'number' ? step.answeredBy(message.id) : undefined;
  if (!request) return;
  const serving = servingConnections(request);
  if (!serving.includes(connection)) return;
  step.applyRequest(request, { type: 'response', connection, message });
  step.moveStragglers();
  for (const previous of serving) step.closeIfDrained(previous);
}

/**
 * A fence for a subscription that has since stopped leaving `connection`,
 * because it ended there, or was lost or unsubscribed, is dropped.
 */
function onFenced(step: Step, connection: ConnectionId, fence: Fence) {
  if (!onReceived(step, connection)) return;
  const request = step.requests.get(fence.request);
  if (request?.state.kind !== 'leaving') return;
  if (request.state.from !== connection) return;
  const serving = servingConnections(request);
  step.applyRequest(request, { type: 'fenced', connection, to: fence.to });
  step.moveStragglers();
  for (const previous of serving) step.closeIfDrained(previous);
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
      step.addRequest(event.id, event.method, event.lastEventId);
      step.resetInactivity();
      if (step.lifecycle.kind === 'backoff' && step.handover === null) {
        // A new request doesn't wait out the backoff, unless a replaced
        // connection still takes requests meanwhile.
        step.effects.push({ type: 'cancelTimer', timer: 'backoff' });
        step.connect(step.lifecycle.retryIndex);
      }
      step.scheduleFlush();
      break;
    }
    case 'unsubscribe': {
      const request = step.requests.get(event.id);
      if (!request) break;
      step.applyRequest(request, { type: 'unsubscribe' });
      for (const previous of servingConnections(request)) {
        step.closeIfDrained(previous);
      }
      break;
    }
    case 'close':
      step.close();
      break;
    case 'timer':
      switch (event.timer) {
        case 'flush':
          step.flushScheduled = false;
          step.flush([]);
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
    case 'fenced':
      onFenced(step, event.connection, event.fence);
      break;
    case 'sendFailed':
      for (const id of event.requests) {
        const request = step.requests.get(id);
        if (
          request?.state.kind === 'sent' ||
          request?.state.kind === 'moving' ||
          request?.state.kind === 'leaving'
        ) {
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
    replaced: [],
    handover: null,
    requests: new Map(),
    wires: new Map(),
    lastWireId: 0,
    flushScheduled: false,
    inactivity: false,
    publicState: opts.lazy
      ? { state: 'idle' }
      : { state: 'connecting', error: null },
    closing: null,
    lastConnectionId: 0,
  });
  if (!opts.lazy) step.connect(null);
  return step.done();
}
