import type {
  ClientModel,
  Handover,
} from '@trpc/client/links/wsLink/wsClient/machine/clientModel';
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
  const moving: QueryState = {
    // @ts-expect-error a query is never moving
    kind: 'moving',
    from: 1,
    to: 2,
    started: false,
    replayed: [],
  };
  const leaving: QueryState = {
    // @ts-expect-error nor leaving
    kind: 'leaving',
    from: 1,
    to: 2,
    started: false,
    replayed: [],
  };
  // @ts-expect-error a query has no `started` to show
  const started: QueryState = { kind: 'sent', connection: 1, started: true };
  const resumable: RequestModel = {
    id: 1,
    method: 'query',
    wire: 1,
    // @ts-expect-error nor an event to resume from
    lastEventId: '1',
    state: { kind: 'queued', batch: null },
  };
  const query: QueryRequest = {
    id: 1,
    method: 'mutation',
    wire: 1,
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

test("a replacement error can't outlive its handover", () => {
  expectTypeOf<
    'replacementError' extends keyof ClientModel ? true : false
  >().toEqualTypeOf<false>();
  const replaced: Pick<ClientModel, 'replaced' | 'handover'> = {
    replaced: [1],
    handover: null,
    // @ts-expect-error a replacement error belongs to the handover it would replace
    replacementError: { message: 'WebSocket closed', cause: null },
  };
  const handover: Handover = {
    connection: 2,
    replacementError: { message: 'Initialization error', cause: null },
  };
  expect([replaced, handover]).toHaveLength(2);
});
