import type {
  ConnectionId,
  QueryRequest,
  QueryState,
  RequestEvent,
  RequestMethod,
  RequestModel,
  RequestState,
  SubscriptionRequest,
  SubscriptionState,
} from '@trpc/client/links/wsLink/wsClient/machine/requestMachine';
import {
  moveSubscription,
  requestTransition,
  servingConnections,
} from '@trpc/client/links/wsLink/wsClient/machine/requestMachine';

/**
 * The request machine on its own. `websockets.clientMachine.test.ts` runs it
 * inside the client machine against random event sequences.
 */

test('a subscription moved on before its new connection replayed drops the replay', () => {
  let request: SubscriptionRequest = {
    id: 1,
    method: 'subscription',
    lastEventId: '1',
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

test('a request is served by the connections it was sent on', () => {
  const unsent = [
    { kind: 'queued', batch: null },
    { kind: 'settled' },
  ] as const satisfies readonly RequestState[];
  const methods = [
    'query',
    'mutation',
    'subscription',
  ] as const satisfies readonly RequestMethod[];
  for (const method of methods) {
    for (const state of unsent) {
      const request: RequestModel =
        method === 'subscription'
          ? { id: 1, method, lastEventId: null, state }
          : { id: 1, method, state };
      expect(servingConnections(request)).toEqual([]);
    }
  }
  const subscription = (state: SubscriptionState): RequestModel => ({
    id: 1,
    method: 'subscription',
    lastEventId: null,
    state,
  });
  expect(
    servingConnections({
      id: 1,
      method: 'query',
      state: { kind: 'sent', connection: 1 },
    }),
  ).toEqual([1]);
  expect(
    servingConnections(
      subscription({
        kind: 'moving',
        from: 1,
        to: 2,
        started: true,
        replayed: [],
      }),
    ),
  ).toEqual([1, 2]);
  expect(
    servingConnections(
      subscription({
        kind: 'leaving',
        from: 1,
        to: 2,
        started: true,
        replayed: [],
      }),
    ),
  ).toEqual([1, 2]);
});

// States the machine can't reach are states its types can't build. Each
// `@ts-expect-error` fails the typecheck if its state becomes buildable.

test("a query or mutation can't move, show started or resume", () => {
  // @ts-expect-error a query is never moving
  const moving: QueryState = { kind: 'moving', from: 1, to: 2 };
  // @ts-expect-error nor leaving
  const leaving: QueryState = { kind: 'leaving', from: 1, to: 2 };
  // @ts-expect-error a query has no `started` to show
  const started: QueryState = { kind: 'sent', connection: 1, started: true };
  const resumable: RequestModel = {
    id: 1,
    method: 'query',
    // @ts-expect-error nor an event to resume from
    lastEventId: '1',
    state: { kind: 'queued', batch: null },
  };
  const query: QueryRequest = {
    id: 1,
    method: 'mutation',
    state: { kind: 'sent', connection: 1 },
  };
  // @ts-expect-error only a subscription moves
  moveSubscription(query, 2);
  expect([moving, leaving, started, resumable]).toHaveLength(4);
});

test("a queued subscription hasn't been started", () => {
  const queued: SubscriptionState = {
    kind: 'queued',
    batch: null,
    // @ts-expect-error `started` is cleared whenever it queues
    started: true,
  };
  expect(queued.kind).toBe('queued');
});

test('a queued subscription has no events to replay', () => {
  const queued: SubscriptionState = {
    kind: 'queued',
    batch: null,
    // @ts-expect-error a queued subscription starts afresh
    replayed: ['1'],
  };
  expect(queued.kind).toBe('queued');
});
