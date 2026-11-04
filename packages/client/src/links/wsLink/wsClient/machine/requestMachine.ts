import type { TRPCResponseMessage } from '@trpc/server/unstable-core-do-not-import';
import { exhaustive } from '@trpc/server/unstable-core-do-not-import';

export type ConnectionId = number;
export type RequestId = number;
export type RequestMethod = 'query' | 'mutation' | 'subscription';

/**
 * Where a request is. Only the connection a request was sent on can answer
 * it, so frames from a connection it has left never reach it.
 */
export type RequestState =
  /**
   * Waiting to be sent: in the next batch on `batch`, which was ready when
   * the request was made or became ready while it waited, or on the next
   * ready connection when `batch` is `null`.
   */
  | { kind: 'queued'; batch: ConnectionId | null; hideStarted: boolean }
  /**
   * Sent on `connection`. `hideStarted` is set when a subscription moved
   * there without being lost, so its second `started` is dropped.
   */
  | { kind: 'sent'; connection: ConnectionId; hideStarted: boolean }
  | { kind: 'settled' };

export interface RequestModel {
  readonly id: RequestId;
  readonly method: RequestMethod;
  /** The id of the last event delivered, sent when a subscription resumes. */
  readonly lastEventId: string | null;
  readonly state: RequestState;
}

export type RequestEvent =
  | { type: 'batch'; connection: ConnectionId }
  /** The connection it was batched for was replaced before the batch went out. */
  | { type: 'unbatch' }
  | { type: 'send'; connection: ConnectionId }
  /** A subscription moves off a replaced connection that is draining. */
  | { type: 'move' }
  | { type: 'connectionLost'; cause: unknown }
  | { type: 'response'; message: TRPCResponseMessage }
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
            hideStarted: state.hideStarted,
          },
        },
        effects: [],
      };
    case 'connectionLost':
      if (isSubscription) {
        return {
          request: {
            ...request,
            state: { kind: 'queued', batch: null, hideStarted: false },
          },
          effects: [],
        };
      }
      return settle(request, [
        {
          type: 'fail',
          request: request.id,
          failure: { kind: 'connectionLost', cause: event.cause },
        },
      ]);
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

function onSent(
  request: RequestModel,
  state: Extract<RequestState, { kind: 'sent' }>,
  event: RequestEvent,
): RequestTransition {
  const isSubscription = request.method === 'subscription';
  switch (event.type) {
    case 'move':
      if (!isSubscription) return illegal(request, event);
      return {
        request: {
          ...request,
          state: { kind: 'queued', batch: null, hideStarted: true },
        },
        effects: [
          {
            type: 'sendStop',
            connection: state.connection,
            request: request.id,
          },
        ],
      };
    case 'connectionLost':
      if (isSubscription) {
        return {
          request: {
            ...request,
            state: { kind: 'queued', batch: null, hideStarted: false },
          },
          effects: [],
        };
      }
      return settle(request, [
        {
          type: 'fail',
          request: request.id,
          failure: { kind: 'connectionLost', cause: event.cause },
        },
      ]);
    case 'response': {
      const { message } = event;
      if ('result' in message && isSubscription) {
        const result = message.result;
        if (result.type === 'started' && state.hideStarted) {
          return {
            request: { ...request, state: { ...state, hideStarted: false } },
            effects: [],
          };
        }
        if (result.type !== 'stopped') {
          const lastEventId =
            result.type === 'data' && result.id !== undefined
              ? result.id
              : request.lastEventId;
          return {
            request: { ...request, lastEventId },
            effects: [{ type: 'next', request: request.id, message }],
          };
        }
      }
      return settle(request, [
        { type: 'next', request: request.id, message },
        { type: 'complete', request: request.id },
      ]);
    }
    case 'unsubscribe':
      return settle(
        request,
        isSubscription
          ? [
              {
                type: 'sendStop',
                connection: state.connection,
                request: request.id,
              },
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
    case 'settled':
      return illegal(request, event);
    default:
      return exhaustive(state, illegal(request, event));
  }
}
