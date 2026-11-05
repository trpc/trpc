import type { TRPCResponseMessage } from '@trpc/server/unstable-core-do-not-import';
import { exhaustive } from '@trpc/server/unstable-core-do-not-import';

export type ConnectionId = number;
export type RequestId = number;
export type RequestMethod = 'query' | 'mutation' | 'subscription';

/**
 * Waiting to be sent: in the next batch on `batch`, which serves new
 * requests, or on the next connection that does when `batch` is `null`.
 */
interface Queued {
  kind: 'queued';
  batch: ConnectionId | null;
}

interface Settled {
  kind: 'settled';
}

/**
 * Where a query or mutation is. It's sent once, and only the connection it
 * was sent on can answer it.
 */
export type QueryState =
  | Queued
  /** Sent on `connection`. */
  | { kind: 'sent'; connection: ConnectionId }
  | Settled;

/**
 * Where a subscription is. Only the connections it was sent on can answer
 * it, so frames from a connection it has left never reach it. `started`: the
 * subscriber has seen `started` since the subscription last (re)started,
 * which a queued one hasn't. A move keeps it, so the new connection's
 * `started` is dropped only if the old one's was shown; a lost connection
 * clears it, so `started` shows again.
 */
export type SubscriptionState =
  | Queued
  /** Sent on `connection`. */
  | { kind: 'sent'; connection: ConnectionId; started: boolean }
  /**
   * Moving make-before-break: sent on `to`, and still served by `from` until
   * `to` confirms it. Only then is it stopped on `from`.
   */
  | {
      kind: 'moving';
      from: ConnectionId;
      to: ConnectionId;
      started: boolean;
    }
  /**
   * An untracked subscription that `to` has confirmed, being stopped on
   * `from`. `to` can't resend what `from` sent before `to` listened, so
   * `from`'s untracked events are still delivered until it ends the
   * subscription or is lost.
   */
  | {
      kind: 'leaving';
      from: ConnectionId;
      to: ConnectionId;
      started: boolean;
    }
  | Settled;

export type RequestState = QueryState | SubscriptionState;

export interface QueryRequest {
  readonly id: RequestId;
  readonly method: 'query' | 'mutation';
  readonly state: QueryState;
}

export interface SubscriptionRequest {
  readonly id: RequestId;
  readonly method: 'subscription';
  /** The id of the last event delivered, sent when it resumes. */
  readonly lastEventId: string | null;
  /**
   * Event ids an old connection delivered while the subscription moved.
   * The new connection resumes from the `lastEventId` sent with it, so it
   * sends them again; each is dropped once. Kept until a connection serving
   * the subscription alone sends an event that isn't one of them, which ends
   * its replay.
   */
  readonly replayed: readonly string[];
  readonly state: SubscriptionState;
}

export type RequestModel = QueryRequest | SubscriptionRequest;

/** What happens to any request. Only a subscription moves; see `moveSubscription`. */
export type RequestEvent =
  | { type: 'batch'; connection: ConnectionId }
  /** The connection it was batched for no longer serves new requests. */
  | { type: 'unbatch' }
  | { type: 'send'; connection: ConnectionId }
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

export interface RequestTransition<
  TRequest extends RequestModel = RequestModel,
> {
  readonly request: TRequest;
  readonly effects: readonly RequestEffect[];
}

function illegal<TRequest extends RequestModel>(
  request: TRequest,
  event: { type: string },
): RequestTransition<TRequest> {
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

function settled<TRequest extends RequestModel>(
  request: TRequest,
  effects: RequestEffect[],
): RequestTransition<TRequest> {
  return { request: { ...request, state: { kind: 'settled' } }, effects };
}

function stop(request: RequestModel, connection: ConnectionId): RequestEffect {
  return { type: 'sendStop', connection, request: request.id };
}

function complete(request: RequestModel): RequestEffect {
  return { type: 'complete', request: request.id };
}

function fail(request: RequestModel, failure: RequestFailure): RequestEffect {
  return { type: 'fail', request: request.id, failure };
}

/**
 * Where `batch`, `unbatch` or `send` takes a queued request, or `null` when
 * it's batched for another connection.
 */
function rebatch(
  state: Queued,
  event: Extract<RequestEvent, { type: 'batch' | 'unbatch' | 'send' }>,
): Queued | { kind: 'sent'; connection: ConnectionId } | null {
  switch (event.type) {
    case 'batch':
      if (state.batch !== null && state.batch !== event.connection) {
        return null;
      }
      return { ...state, batch: event.connection };
    case 'unbatch':
      return { ...state, batch: null };
    case 'send':
      if (state.batch !== null && state.batch !== event.connection) {
        return null;
      }
      return { kind: 'sent', connection: event.connection };
    default:
      return exhaustive(event, null);
  }
}

// --- queries and mutations ---------------------------------------------------

function queryTransition(
  request: QueryRequest,
  event: RequestEvent,
): RequestTransition<QueryRequest> {
  const state = request.state;
  switch (state.kind) {
    case 'queued':
      switch (event.type) {
        case 'batch':
        case 'unbatch':
        case 'send': {
          const next = rebatch(state, event);
          if (!next) return illegal(request, event);
          return { request: { ...request, state: next }, effects: [] };
        }
        case 'connectionLost':
          return settled(request, [
            fail(request, { kind: 'connectionLost', cause: event.cause }),
          ]);
        case 'unsubscribe':
          return settled(request, [complete(request)]);
        case 'clientClose':
          return settled(request, [
            fail(request, { kind: 'closedBeforeSent' }),
          ]);
        case 'response':
        case 'sendFailed':
          return illegal(request, event);
        default:
          return exhaustive(event, illegal(request, event));
      }
    case 'sent':
      switch (event.type) {
        case 'connectionLost':
          if (event.connection !== state.connection) {
            return illegal(request, event);
          }
          return settled(request, [
            fail(request, { kind: 'connectionLost', cause: event.cause }),
          ]);
        case 'response':
          if (event.connection !== state.connection) {
            return illegal(request, event);
          }
          return settled(request, [
            { type: 'next', request: request.id, message: event.message },
            complete(request),
          ]);
        case 'unsubscribe':
          return settled(request, [complete(request)]);
        case 'clientClose':
          // It finishes before the client closes.
          return { request, effects: [] };
        case 'sendFailed':
          return settled(request, [
            fail(request, { kind: 'sendFailed', cause: event.cause }),
          ]);
        case 'batch':
        case 'unbatch':
        case 'send':
          return illegal(request, event);
        default:
          return exhaustive(event, illegal(request, event));
      }
    case 'settled':
      return illegal(request, event);
    default:
      return exhaustive(state, illegal(request, event));
  }
}

// --- subscriptions -----------------------------------------------------------

type Subscription<TKind extends SubscriptionState['kind']> = Extract<
  SubscriptionState,
  { kind: TKind }
>;

type SubscriptionTransition = RequestTransition<SubscriptionRequest>;

/** A subscription whose connection is gone resumes on the next one. */
function resume(request: SubscriptionRequest): SubscriptionTransition {
  return {
    request: {
      ...request,
      replayed: [],
      state: { kind: 'queued', batch: null },
    },
    effects: [],
  };
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
  request: SubscriptionRequest,
  started: boolean,
  message: TRPCResponseMessage,
): Received | null {
  if (!('result' in message)) return null;
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

function onSubscriptionQueued(
  request: SubscriptionRequest,
  state: Subscription<'queued'>,
  event: RequestEvent,
): SubscriptionTransition {
  switch (event.type) {
    case 'batch':
    case 'unbatch':
    case 'send': {
      const next = rebatch(state, event);
      if (!next) return illegal(request, event);
      return {
        request: {
          ...request,
          state: next.kind === 'sent' ? { ...next, started: false } : next,
        },
        effects: [],
      };
    }
    case 'connectionLost':
      return resume(request);
    case 'unsubscribe':
    case 'clientClose':
      return settled(request, [complete(request)]);
    case 'response':
    case 'sendFailed':
      return illegal(request, event);
    default:
      return exhaustive(event, illegal(request, event));
  }
}

function onSubscriptionSent(
  request: SubscriptionRequest,
  state: Subscription<'sent'>,
  event: RequestEvent,
): SubscriptionTransition {
  switch (event.type) {
    case 'connectionLost':
      if (event.connection !== state.connection) {
        return illegal(request, event);
      }
      return resume(request);
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
      return settled(request, [
        { type: 'next', request: request.id, message: event.message },
        complete(request),
      ]);
    }
    case 'unsubscribe':
      return settled(request, [
        stop(request, state.connection),
        complete(request),
      ]);
    case 'clientClose':
      return settled(request, [complete(request)]);
    case 'sendFailed':
      return settled(request, [
        fail(request, { kind: 'sendFailed', cause: event.cause }),
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
  request: SubscriptionRequest,
  state: Subscription<'moving'>,
  event: RequestEvent,
): SubscriptionTransition {
  switch (event.type) {
    case 'response': {
      if (event.connection === state.to) {
        // The new connection's first frame for it, `started` from a tRPC
        // server, is the ack: stop it on the old one. The new one resends a
        // tracked subscription's events, so the old one's are dropped from
        // now on; an untracked one is `leaving` until the old one stops.
        const switched = onSubscriptionSent(
          request,
          { kind: 'sent', connection: state.to, started: state.started },
          event,
        );
        const effects = [stop(request, state.from), ...switched.effects];
        const switchedState = switched.request.state;
        if (
          switchedState.kind === 'sent' &&
          switched.request.lastEventId === null
        ) {
          return {
            request: {
              ...switched.request,
              state: {
                kind: 'leaving',
                from: state.from,
                to: state.to,
                started: switchedState.started,
              },
            },
            effects,
          };
        }
        return { request: switched.request, effects };
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
      return settled(request, [
        stop(request, state.to),
        { type: 'next', request: request.id, message: event.message },
        complete(request),
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
      return settled(request, [
        stop(request, state.from),
        stop(request, state.to),
        complete(request),
      ]);
    case 'clientClose':
      return settled(request, [complete(request)]);
    case 'sendFailed':
      return settled(request, [
        stop(request, state.from),
        fail(request, { kind: 'sendFailed', cause: event.cause }),
      ]);
    case 'batch':
    case 'unbatch':
    case 'send':
      return illegal(request, event);
    default:
      return exhaustive(event, illegal(request, event));
  }
}

function onLeaving(
  request: SubscriptionRequest,
  state: Subscription<'leaving'>,
  event: RequestEvent,
): SubscriptionTransition {
  const remaining: SubscriptionRequest = {
    ...request,
    state: { kind: 'sent', connection: state.to, started: state.started },
  };
  switch (event.type) {
    case 'response': {
      if (event.connection === state.to) {
        const served = onSubscriptionSent(
          request,
          { kind: 'sent', connection: state.to, started: state.started },
          event,
        );
        const servedState = served.request.state;
        if (servedState.kind !== 'sent') return served;
        return {
          request: {
            ...served.request,
            state: { ...state, started: servedState.started },
          },
          effects: served.effects,
        };
      }
      if (event.connection !== state.from) return illegal(request, event);
      const message = event.message;
      if (!('result' in message) || message.result.type === 'stopped') {
        // It has stopped it.
        return { request: remaining, effects: [] };
      }
      // A tracked event is `to`'s to send, and `started` has been handled.
      if (message.result.type !== 'data' || message.result.id !== undefined) {
        return { request, effects: [] };
      }
      return {
        request,
        effects: [{ type: 'next', request: request.id, message }],
      };
    }
    case 'connectionLost':
      if (event.connection === state.from) {
        return { request: remaining, effects: [] };
      }
      if (event.connection === state.to) return resume(request);
      return illegal(request, event);
    case 'unsubscribe':
      return settled(request, [stop(request, state.to), complete(request)]);
    case 'clientClose':
      return settled(request, [complete(request)]);
    case 'sendFailed':
      return settled(request, [
        fail(request, { kind: 'sendFailed', cause: event.cause }),
      ]);
    case 'batch':
    case 'unbatch':
    case 'send':
      return illegal(request, event);
    default:
      return exhaustive(event, illegal(request, event));
  }
}

function subscriptionTransition(
  request: SubscriptionRequest,
  event: RequestEvent,
): SubscriptionTransition {
  const state = request.state;
  switch (state.kind) {
    case 'queued':
      return onSubscriptionQueued(request, state, event);
    case 'sent':
      return onSubscriptionSent(request, state, event);
    case 'moving':
      return onMoving(request, state, event);
    case 'leaving':
      return onLeaving(request, state, event);
    case 'settled':
      return illegal(request, event);
    default:
      return exhaustive(state, illegal(request, event));
  }
}

/**
 * A subscription on a replaced connection is sent on `to` as well. Only one
 * that is `sent` on another connection moves.
 */
export function moveSubscription(
  request: SubscriptionRequest,
  to: ConnectionId,
): SubscriptionTransition {
  const state = request.state;
  const event = { type: 'move' };
  if (state.kind !== 'sent' || state.connection === to) {
    return illegal(request, event);
  }
  return {
    request: {
      ...request,
      state: {
        kind: 'moving',
        from: state.connection,
        to,
        started: state.started,
      },
    },
    effects: [],
  };
}

/**
 * The request state machine: one pure step. Effects are returned as data;
 * the client runs them.
 */
export function requestTransition(
  request: RequestModel,
  event: RequestEvent,
): RequestTransition {
  return request.method === 'subscription'
    ? subscriptionTransition(request, event)
    : queryTransition(request, event);
}
