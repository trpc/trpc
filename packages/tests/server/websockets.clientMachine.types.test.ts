import type {
  QueryRequest,
  QueryState,
  RequestModel,
  SubscriptionState,
} from '@trpc/client/links/wsLink/wsClient/machine/requestMachine';
import { moveSubscription } from '@trpc/client/links/wsLink/wsClient/machine/requestMachine';

/**
 * States the machines can't reach are states their types can't build. Each
 * `@ts-expect-error` fails the typecheck if its state becomes buildable.
 */
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

test('only a subscription that is sent or moving has events to replay', () => {
  const queued: SubscriptionState = {
    kind: 'queued',
    batch: null,
    // @ts-expect-error a queued subscription starts afresh
    replayed: ['1'],
  };
  const leaving: SubscriptionState = {
    kind: 'leaving',
    from: 1,
    to: 2,
    started: true,
    // @ts-expect-error a leaving subscription is untracked
    replayed: ['1'],
  };
  expect([queued, leaving]).toHaveLength(2);
});
