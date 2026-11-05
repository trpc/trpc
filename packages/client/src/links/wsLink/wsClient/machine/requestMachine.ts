import type { TRPCResponseMessage } from '@trpc/server/unstable-core-do-not-import';
import { exhaustive } from '@trpc/server/unstable-core-do-not-import';

export type ConnectionId = number;
export type RequestId = number;
export type RequestMethod = 'query' | 'mutation' | 'subscription';

/**
 * Where a request is. Only the connections a request was sent on can answer
 * it, so frames from a connection it has left never reach it. `started`: the
 * subscriber has seen `started` since the subscription last (re)started. A
 * move keeps it, so the new connection's `started` is dropped only if the old
 * one's was shown; a lost connection clears it, so `started` shows again.
 */
export type RequestState =
  /**
   * Waiting to be sent: in the next batch on `batch`, which serves new
   * requests, or on the next connection that does when `batch` is `null`.
   */
  | { kind: 'queued'; batch: ConnectionId | null; started: boolean }
  /** Sent on `connection`. */
  | { kind: 'sent'; connection: ConnectionId; started: boolean }
  /**
   * A subscription moving make-before-break: sent on `to`, and still served
   * by `from` until `to` confirms it. Only then is it stopped on `from`.
   */
  | {
      kind: 'moving';
      from: ConnectionId;
      to: ConnectionId;
      started: boolean;
    }
  | { kind: 'settled' };

export interface RequestModel {
  readonly id: RequestId;
  readonly method: RequestMethod;
  /** The id of the last event delivered, sent when a subscription resumes. */
  readonly lastEventId: string | null;
  /**
   * Event ids an old connection delivered while the subscription moved.
   * The new connection resumes from the `lastEventId` sent with it, so it
   * sends them again; each is dropped once. Kept until a connection serving
   * the subscription alone sends an event that isn't one of them, which ends
   * its replay.
   */
  readonly replayed: readonly string[];
  readonly state: RequestState;
}

export type RequestEvent =
  | { type: 'batch'; connection: ConnectionId }
  /** The connection it was batched for no longer serves new requests. */
  | { type: 'unbatch' }
  | { type: 'send'; connection: ConnectionId }
  /** A subscription on a replaced connection is sent on `to` as well. */
  | { type: 'move'; to: ConnectionId }
  | { type: 'connectionLost'; connection: ConnectionId; cause: unknown }
  | {
      type: 'response';
      connection: ConnectionId;
      message: TRPCResponseMessage;
    }
  | { type: 'unsubscribe' }
  | { type: 'clientClose' }
  | { type: 'sendFailed'; cause: unknown };

export type RequestFailure =
  | { kind: 'connectionLost'; cause: unknown }
  | { kind: 'closedBeforeSent' }
  | { kind: 'sendFailed'; cause: unknown };

export type RequestEffect =
  | { type: 'next'; request: RequestId; message: TRPCResponseMessage }
  | { type: 'complete'; request: RequestId }
  | { type: 'fail'; request: RequestId; failure: RequestFailure }
  | { type: 'sendStop'; connection: ConnectionId; request: RequestId }
  | { type: 'invariantViolation'; message: string };

export interface RequestTransition {
  readonly request: RequestModel;
  readonly effects: readonly RequestEffect[];
}

function illegal(
  request: RequestModel,
  event: RequestEvent,
): RequestTransition {
  return {
    request,
    effects: [
      {
        type: 'invariantViolation',
        message: `request ${request.id} (${request.method}, ${request.state.kind}) can't handle ${event.type}`,
      },
    ],
  };
}

function settle(
  request: RequestModel,
  effects: RequestEffect[],
): RequestTransition {
  return { request: { ...request, state: { kind: 'settled' } }, effects };
}

function stop(request: RequestModel, connection: ConnectionId): RequestEffect {
  return { type: 'sendStop', connection, request: request.id };
}

/** A subscription whose connection is gone resumes on the next one. */
function resume(request: RequestModel): RequestTransition {
  return {
    request: {
      ...request,
      replayed: [],
      state: { kind: 'queued', batch: null, started: false },
    },
    effects: [],
  };
}

function lose(
  request: RequestModel,
  event: Extract<RequestEvent, { type: 'connectionLost' }>,
): RequestTransition {
  if (request.method === 'subscription') return resume(request);
  return settle(request, [
    {
      type: 'fail',
      request: request.id,
      failure: { kind: 'connectionLost', cause: event.cause },
    },
  ]);
}

function onQueued(
  request: RequestModel,
  state: Extract<RequestState, { kind: 'queued' }>,
  event: RequestEvent,
): RequestTransition {
  const isSubscription = request.method === 'subscription';
  switch (event.type) {
    case 'batch':
      if (state.batch !== null && state.batch !== event.connection) {
        return illegal(request, event);
      }
      return {
        request: { ...request, state: { ...state, batch: event.connection } },
        effects: [],
      };
    case 'unbatch':
      return {
        request: { ...request, state: { ...state, batch: null } },
        effects: [],
      };
    case 'send':
      if (state.batch !== null && state.batch !== event.connection) {
        return illegal(request, event);
      }
      return {
        request: {
          ...request,
          state: {
            kind: 'sent',
            connection: event.connection,
            started: state.started,
          },
        },
        effects: [],
      };
    case 'connectionLost':
      return lose(request, event);
    case 'unsubscribe':
      return settle(request, [{ type: 'complete', request: request.id }]);
    case 'clientClose':
      return settle(
        request,
        isSubscription
          ? [{ type: 'complete', request: request.id }]
          : [
              {
                type: 'fail',
                request: request.id,
                failure: { kind: 'closedBeforeSent' },
              },
            ],
      );
    case 'move':
    case 'response':
    case 'sendFailed':
      return illegal(request, event);
    default:
      return exhaustive(event, illegal(request, event));
  }
}

interface Received {
  readonly started: boolean;
  readonly lastEventId: string | null;
  readonly replayed: readonly string[];
  /** The id of the event delivered, if it has one. */
  readonly delivered: string | null;
  readonly effects: RequestEffect[];
}

/**
 * What a subscription makes of a `started` or an event from a connection
 * serving it, or `null` when the message ends it.
 */
function receive(
  request: RequestModel,
  started: boolean,
  message: TRPCResponseMessage,
): Received | null {
  if (!('result' in message) || request.method !== 'subscription') return null;
  const result = message.result;
  const unchanged: Received = {
    started,
    lastEventId: request.lastEventId,
    replayed: request.replayed,
    delivered: null,
    effects: [],
  };
  if (result.type === 'started') {
    if (started) return unchanged;
    return {
      ...unchanged,
      started: true,
      effects: [{ type: 'next', request: request.id, message }],
    };
  }
  if (result.type === 'stopped') return null;
  const id = result.type === 'data' ? (result.id ?? null) : null;
  if (id !== null && request.replayed.includes(id)) {
    return {
      ...unchanged,
      replayed: request.replayed.filter((replayed) => replayed !== id),
    };
  }
  return {
    ...unchanged,
    lastEventId: id ?? request.lastEventId,
    delivered: id,
    effects: [{ type: 'next', request: request.id, message }],
  };
}

function onSent(
  request: RequestModel,
  state: Extract<RequestState, { kind: 'sent' }>,
  event: RequestEvent,
): RequestTransition {
  const isSubscription = request.method === 'subscription';
  switch (event.type) {
    case 'move':
      if (!isSubscription || event.to === state.connection) {
        return illegal(request, event);
      }
      return {
        request: {
          ...request,
          state: {
            kind: 'moving',
            from: state.connection,
            to: event.to,
            started: state.started,
          },
        },
        effects: [],
      };
    case 'connectionLost':
      if (event.connection !== state.connection) {
        return illegal(request, event);
      }
      return lose(request, event);
    case 'response': {
      if (event.connection !== state.connection) {
        return illegal(request, event);
      }
      const received = receive(request, state.started, event.message);
      if (received) {
        return {
          request: {
            ...request,
            lastEventId: received.lastEventId,
            replayed: received.delivered === null ? received.replayed : [],
            state: { ...state, started: received.started },
          },
          effects: received.effects,
        };
      }
      return settle(request, [
        { type: 'next', request: request.id, message: event.message },
        { type: 'complete', request: request.id },
      ]);
    }
    case 'unsubscribe':
      return settle(
        request,
        isSubscription
          ? [
              stop(request, state.connection),
              { type: 'complete', request: request.id },
            ]
          : [{ type: 'complete', request: request.id }],
      );
    case 'clientClose':
      // A query or mutation in flight finishes before the client closes.
      if (!isSubscription) return { request, effects: [] };
      return settle(request, [{ type: 'complete', request: request.id }]);
    case 'sendFailed':
      return settle(request, [
        {
          type: 'fail',
          request: request.id,
          failure: { kind: 'sendFailed', cause: event.cause },
        },
      ]);
    case 'batch':
    case 'unbatch':
    case 'send':
      return illegal(request, event);
    default:
      return exhaustive(event, illegal(request, event));
  }
}

function onMoving(
  request: RequestModel,
  state: Extract<RequestState, { kind: 'moving' }>,
  event: RequestEvent,
): RequestTransition {
  switch (event.type) {
    case 'response': {
      if (event.connection === state.to) {
        // The new connection has it: stop it on the old one, whose frames
        // for it are dropped from now on.
        const switched = onSent(
          {
            ...request,
            state: {
              kind: 'sent',
              connection: state.to,
              started: state.started,
            },
          },
          { kind: 'sent', connection: state.to, started: state.started },
          event,
        );
        return {
          request: switched.request,
          effects: [stop(request, state.from), ...switched.effects],
        };
      }
      if (event.connection !== state.from) return illegal(request, event);
      // Until then, the old connection serves it.
      const received = receive(request, state.started, event.message);
      if (received) {
        return {
          request: {
            ...request,
            lastEventId: received.lastEventId,
            replayed:
              received.delivered === null
                ? received.replayed
                : [...received.replayed, received.delivered],
            state: { ...state, started: received.started },
          },
          effects: received.effects,
        };
      }
      return settle(request, [
        stop(request, state.to),
        { type: 'next', request: request.id, message: event.message },
        { type: 'complete', request: request.id },
      ]);
    }
    case 'connectionLost':
      if (event.connection === state.to) {
        // Moved nowhere: the old connection still serves it.
        return {
          request: {
            ...request,
            state: {
              kind: 'sent',
              connection: state.from,
              started: state.started,
            },
          },
          effects: [],
        };
      }
      if (event.connection === state.from) {
        // Already sent on the new connection, which resends what the old
        // one delivered since.
        return {
          request: {
            ...request,
            state: {
              kind: 'sent',
              connection: state.to,
              started: state.started,
            },
          },
          effects: [],
        };
      }
      return illegal(request, event);
    case 'unsubscribe':
      return settle(request, [
        stop(request, state.from),
        stop(request, state.to),
        { type: 'complete', request: request.id },
      ]);
    case 'clientClose':
      return settle(request, [{ type: 'complete', request: request.id }]);
    case 'sendFailed':
      return settle(request, [
        stop(request, state.from),
        {
          type: 'fail',
          request: request.id,
          failure: { kind: 'sendFailed', cause: event.cause },
        },
      ]);
    case 'batch':
    case 'unbatch':
    case 'send':
    case 'move':
      return illegal(request, event);
    default:
      return exhaustive(event, illegal(request, event));
  }
}

/**
 * The request state machine: one pure step. Effects are returned as data;
 * the client runs them.
 */
export function requestTransition(
  request: RequestModel,
  event: RequestEvent,
): RequestTransition {
  const state = request.state;
  switch (state.kind) {
    case 'queued':
      return onQueued(request, state, event);
    case 'sent':
      return onSent(request, state, event);
    case 'moving':
      return onMoving(request, state, event);
    case 'settled':
      return illegal(request, event);
    default:
      return exhaustive(state, illegal(request, event));
  }
}
