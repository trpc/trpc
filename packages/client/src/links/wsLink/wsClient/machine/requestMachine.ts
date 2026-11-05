import type { TRPCResponseMessage } from '@trpc/server/unstable-core-do-not-import';
import { exhaustive } from '@trpc/server/unstable-core-do-not-import';

export type ConnectionId = number;
export type RequestId = number;
/** The id a request is sent with, and answered with. */
export type WireId = number;
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
  | {
      kind: 'sent';
      connection: ConnectionId;
      started: boolean;
      replayed: Replayed;
    }
  /**
   * Moving make-before-break: sent on `to`, and still served by `from` until
   * `to` confirms it. Only then is it stopped on `from`.
   */
  | {
      kind: 'moving';
      from: ConnectionId;
      to: ConnectionId;
      started: boolean;
      replayed: Replayed;
    }
  /**
   * Served by `to`, which has confirmed it, and being stopped on `from`.
   * `to` can't resend events without ids that `from` sent before `to`
   * listened, so `from`'s are still delivered until `from` has handled the
   * stop: it answers the `PING` sent after it (the fence), ends the
   * subscription, or is lost. A server that never answers `PING` still ends
   * it or is lost.
   */
  | {
      kind: 'leaving';
      from: ConnectionId;
      to: ConnectionId;
      started: boolean;
      replayed: Replayed;
    }
  | Settled;

/**
 * Event ids an old connection delivered while a subscription moved. The new
 * connection resumes from the `lastEventId` sent with it, so it sends them
 * again; each is dropped once. Kept until a connection serving the
 * subscription alone sends an event that isn't one of them, which ends its
 * replay. Only a tracked subscription has ids to replay, and a queued one
 * starts afresh.
 */
type Replayed = readonly string[];

/**
 * The `PING` sent after a moved subscription's stop on its old connection.
 * Its `PONG` comes after everything that connection sent before handling
 * the stop. `to` tells it from the fence of an earlier move off the same
 * connection.
 */
export interface Fence {
  readonly request: RequestId;
  readonly to: ConnectionId;
}

export type RequestState = QueryState | SubscriptionState;

export interface QueryRequest {
  readonly id: RequestId;
  readonly method: 'query' | 'mutation';
  readonly wire: WireId;
  readonly state: QueryState;
}

export interface SubscriptionRequest {
  readonly id: RequestId;
  readonly method: 'subscription';
  /** The id of the last event delivered, sent when it resumes. */
  readonly lastEventId: string | null;
  readonly wire: WireId;
  /**
   * The newest connection `wire` was sent on, or `null` before it's sent.
   * A server that was sent the stop for it holds `wire` until it has ended
   * that subscription, so it's resent with a fresh one on any connection no
   * newer; see `needsFreshWire`.
   */
  readonly wiredUpTo: ConnectionId | null;
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
  | { type: 'sendFailed'; cause: unknown }
  /** `connection` answered the fence of a move to `to`; see `Fence`. */
  | { type: 'fenced'; connection: ConnectionId; to: ConnectionId };

export type RequestFailure =
  | { kind: 'connectionLost'; cause: unknown }
  | { kind: 'closedBeforeSent' }
  | { kind: 'sendFailed'; cause: unknown };

export type RequestEffect =
  | { type: 'next'; request: RequestId; message: TRPCResponseMessage }
  | { type: 'complete'; request: RequestId }
  | { type: 'fail'; request: RequestId; failure: RequestFailure }
  | {
      type: 'sendStop';
      connection: ConnectionId;
      request: RequestId;
      wire: WireId;
    }
  | { type: 'sendFence'; connection: ConnectionId; fence: Fence }
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
  return {
    type: 'sendStop',
    connection,
    request: request.id,
    wire: request.wire,
  };
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
        case 'fenced':
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
        case 'fenced':
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
    request: { ...request, state: { kind: 'queued', batch: null } },
    effects: [],
  };
}

interface Received {
  readonly started: boolean;
  readonly lastEventId: string | null;
  readonly replayed: Replayed;
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
  { started, replayed }: { started: boolean; replayed: Replayed },
  message: TRPCResponseMessage,
): Received | null {
  if (!('result' in message)) return null;
  const result = message.result;
  const unchanged: Received = {
    started,
    lastEventId: request.lastEventId,
    replayed,
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
  if (id !== null && replayed.includes(id)) {
    return {
      ...unchanged,
      replayed: replayed.filter((replayedId) => replayedId !== id),
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
      if (next.kind !== 'sent') {
        return { request: { ...request, state: next }, effects: [] };
      }
      return {
        request: {
          ...request,
          wiredUpTo: newest(request.wiredUpTo, next.connection),
          state: { ...next, started: false, replayed: [] },
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
    case 'fenced':
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
      const received = receive(request, state, event.message);
      if (received) {
        return {
          request: {
            ...request,
            lastEventId: received.lastEventId,
            state: {
              ...state,
              started: received.started,
              replayed: received.delivered === null ? received.replayed : [],
            },
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
    case 'fenced':
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
        // server, is the ack: stop it on the old one. The new one resends
        // events with ids, so the old one's are dropped from now on; it is
        // `leaving` the old one for those without, until that has handled
        // the stop.
        const switched = onSubscriptionSent(
          request,
          {
            kind: 'sent',
            connection: state.to,
            started: state.started,
            replayed: state.replayed,
          },
          event,
        );
        const stopOld = stop(request, state.from);
        const switchedState = switched.request.state;
        if (switchedState.kind === 'sent') {
          const fence: RequestEffect = {
            type: 'sendFence',
            connection: state.from,
            fence: { request: request.id, to: state.to },
          };
          return {
            request: {
              ...switched.request,
              state: {
                kind: 'leaving',
                from: state.from,
                to: state.to,
                started: switchedState.started,
                replayed: switchedState.replayed,
              },
            },
            effects: [stopOld, fence, ...switched.effects],
          };
        }
        return {
          request: switched.request,
          effects: [stopOld, ...switched.effects],
        };
      }
      if (event.connection !== state.from) return illegal(request, event);
      // Until then, the old connection serves it.
      const received = receive(request, state, event.message);
      if (received) {
        return {
          request: {
            ...request,
            lastEventId: received.lastEventId,
            state: {
              ...state,
              started: received.started,
              replayed:
                received.delivered === null
                  ? received.replayed
                  : [...received.replayed, received.delivered],
            },
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
              replayed: state.replayed,
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
              replayed: state.replayed,
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
    case 'fenced':
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
  const onTo: Subscription<'sent'> = {
    kind: 'sent',
    connection: state.to,
    started: state.started,
    replayed: state.replayed,
  };
  const remaining: SubscriptionRequest = { ...request, state: onTo };
  switch (event.type) {
    case 'response': {
      if (event.connection === state.to) {
        const served = onSubscriptionSent(request, onTo, event);
        const servedState = served.request.state;
        if (servedState.kind !== 'sent') return served;
        return {
          request: {
            ...served.request,
            state: {
              ...state,
              started: servedState.started,
              replayed: servedState.replayed,
            },
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
    case 'fenced':
      if (event.connection !== state.from) return illegal(request, event);
      // An earlier move's fence: this one's is still to come.
      if (event.to !== state.to) return { request, effects: [] };
      return { request: remaining, effects: [] };
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
      wiredUpTo: newest(request.wiredUpTo, to),
      state: {
        kind: 'moving',
        from: state.connection,
        to,
        started: state.started,
        replayed: state.replayed,
      },
    },
    effects: [],
  };
}

function newest(wiredUpTo: ConnectionId | null, connection: ConnectionId) {
  return wiredUpTo === null ? connection : Math.max(wiredUpTo, connection);
}

/**
 * Whether a queued subscription needs a fresh `wire` to be sent on
 * `connection`: that connection may still hold its current one. Its server
 * would answer `Duplicate id`, or end the resent subscription with the
 * `stopped` meant for the stopped one.
 */
export function needsFreshWire(
  request: SubscriptionRequest,
  connection: ConnectionId,
) {
  return request.wiredUpTo !== null && connection <= request.wiredUpTo;
}

/** The connections serving `request`. */
export function servingConnections(request: RequestModel): ConnectionId[] {
  const state = request.state;
  switch (state.kind) {
    case 'sent':
      return [state.connection];
    case 'moving':
    case 'leaving':
      return [state.from, state.to];
    case 'queued':
    case 'settled':
      return [];
    default:
      return state satisfies never;
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
  return request.method === 'subscription'
    ? subscriptionTransition(request, event)
    : queryTransition(request, event);
}
