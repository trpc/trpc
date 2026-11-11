/**
 * The model-based test's invariants, checked once against a real server:
 * fast-check drives subscriptions, mutations, server reconnects, dropped and
 * unresponsive sockets and failing or stalled `connectionParams`.
 */
import { EventEmitter, on } from 'node:events';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { fc, test } from '@fast-check/vitest';
import { initTRPC, tracked } from '@trpc/server';
import type { Deferred } from '@trpc/server/unstable-core-do-not-import';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import type { WebSocket } from 'ws';
import { z } from 'zod';

type ParamsMode = 'ok' | 'fail' | 'stall';

type Action =
  | { type: 'subscribe' }
  | { type: 'unsubscribe'; pick: number }
  | { type: 'push' }
  | { type: 'mutate' }
  | { type: 'serverReconnect' }
  | { type: 'drop'; pick: number }
  | { type: 'pause'; pick: number }
  | { type: 'params'; mode: ParamsMode }
  | { type: 'wait'; ms: number };

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  { weight: 3, arbitrary: fc.constant({ type: 'subscribe' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      type: fc.constant('unsubscribe' as const),
      pick: fc.nat(),
    }),
  },
  { weight: 4, arbitrary: fc.constant({ type: 'push' as const }) },
  { weight: 3, arbitrary: fc.constant({ type: 'mutate' as const }) },
  { weight: 2, arbitrary: fc.constant({ type: 'serverReconnect' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      type: fc.constant('drop' as const),
      pick: fc.nat(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      type: fc.constant('pause' as const),
      pick: fc.nat(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      type: fc.constant('params' as const),
      mode: fc.constantFrom<ParamsMode>('ok', 'fail', 'stall'),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      type: fc.constant('wait' as const),
      ms: fc.integer({ min: 0, max: 30 }),
    }),
  },
);

async function runScenario(actions: Action[]) {
  const t = initTRPC.create();
  const ee = new EventEmitter();
  ee.setMaxListeners(0);
  const events: number[] = [];
  const executions = new Map<number, number>();
  const router = t.router({
    events: t.procedure
      .input(z.object({ lastEventId: z.string().nullish() }).optional())
      .subscription(async function* (opts) {
        let sent = Number(opts.input?.lastEventId ?? 0);
        const pushes = on(ee, 'push', { signal: opts.signal });
        while (true) {
          while (sent < events.length) {
            sent++;
            yield tracked(String(sent), sent);
          }
          await pushes.next();
        }
      }),
    charge: t.procedure.input(z.number()).mutation(({ input }) => {
      executions.set(input, (executions.get(input) ?? 0) + 1);
      return input;
    }),
  });

  let paramsMode: ParamsMode = 'ok';
  const stalled: Deferred<Record<string, string>>[] = [];
  const unhandled: unknown[] = [];
  const onUnhandled = (error: unknown) => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);

  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: {
      lazy: { enabled: false, closeMs: 0 },
      retryDelayMs: () => 5,
      keepAlive: { enabled: true, intervalMs: 40, pongTimeoutMs: 40 },
      connectionParams: () => {
        if (paramsMode === 'fail') throw new Error('token unavailable');
        if (paramsMode === 'stall') {
          const deferred = createDeferred<Record<string, string>>();
          stalled.push(deferred);
          return deferred.promise;
        }
        return {};
      },
    },
  });
  const serverSockets: WebSocket[] = [];
  ctx.wss.on('connection', (ws) => serverSockets.push(ws));

  interface Subscriber {
    readonly data: number[];
    readonly unsubscribe: () => void;
    active: boolean;
    /** What it had when it unsubscribed. */
    received: number[] | null;
  }
  const subscribers: Subscriber[] = [];
  const mutations: { input: number; result: Promise<unknown> }[] = [];
  const liveSockets = () =>
    serverSockets.filter((ws) => ws.readyState === ws.OPEN);

  try {
    for (const action of actions) {
      switch (action.type) {
        case 'subscribe': {
          const data: number[] = [];
          const subscription = ctx.client.events.subscribe(undefined, {
            onData: (envelope) => data.push(envelope.data),
          });
          subscribers.push({
            data,
            unsubscribe: () => subscription.unsubscribe(),
            active: true,
            received: null,
          });
          break;
        }
        case 'unsubscribe': {
          const active = subscribers.filter((sub) => sub.active);
          const sub = active[action.pick % Math.max(active.length, 1)];
          if (sub) {
            sub.active = false;
            sub.unsubscribe();
            sub.received = [...sub.data];
          }
          break;
        }
        case 'push':
          events.push(events.length + 1);
          ee.emit('push');
          break;
        case 'mutate': {
          const input = mutations.length + 1;
          mutations.push({
            input,
            result: ctx.client.charge.mutate(input).then(
              (value) => ({ ok: true, value }),
              (error: unknown) => ({ ok: false, error }),
            ),
          });
          break;
        }
        case 'serverReconnect':
          ctx.wssHandler.broadcastReconnectNotification();
          break;
        case 'drop': {
          const live = liveSockets();
          live[action.pick % Math.max(live.length, 1)]?.terminate();
          break;
        }
        case 'pause': {
          // Unresponsive until the keepAlive gives up on it.
          const live = liveSockets();
          live[action.pick % Math.max(live.length, 1)]?.pause();
          break;
        }
        case 'params':
          paramsMode = action.mode;
          if (action.mode !== 'stall') {
            for (const deferred of stalled.splice(0)) deferred.resolve({});
          }
          break;
        case 'wait':
          await new Promise((resolve) => setTimeout(resolve, action.ms));
          break;
        default:
          action satisfies never;
      }
    }

    // Let it recover, then check what every subscriber and mutation saw.
    paramsMode = 'ok';
    for (const deferred of stalled.splice(0)) deferred.resolve({});
    for (const ws of serverSockets) ws.resume();
    events.push(events.length + 1);
    ee.emit('push');

    const outcomes = await Promise.all(
      mutations.map(({ result }) => result as Promise<{ ok: boolean }>),
    );
    await vi.waitFor(
      () => {
        for (const sub of subscribers.filter((s) => s.active)) {
          expect(sub.data).toEqual(events);
        }
      },
      { timeout: 3_000 },
    );
    for (const sub of subscribers) {
      // Every event once and in order, also after unsubscribing.
      expect(sub.data).toEqual(events.slice(0, sub.data.length));
      // Nothing after unsubscribing.
      if (sub.received) expect(sub.data).toEqual(sub.received);
    }
    // Read after the waits, so a late resend is caught too.
    for (const [index, { input }] of mutations.entries()) {
      const runs = executions.get(input) ?? 0;
      // Never resent: at most once, and exactly once when it succeeded.
      expect(runs).toBeLessThanOrEqual(1);
      if (outcomes[index]!.ok) expect(runs).toBe(1);
    }
  } finally {
    for (const sub of subscribers) sub.unsubscribe();
    for (const ws of serverSockets) ws.resume();
    await ctx.wsClient.close();
    process.off('unhandledRejection', onUnhandled);
  }
  expect(unhandled).toEqual([]);
}

test.prop(
  [fc.array(actionArb, { minLength: 10, maxLength: 25, size: 'max' })],
  { seed: 7925, numRuns: 25, endOnFailure: true },
)(
  'random scenarios against a real server keep the invariants',
  runScenario,
  120_000,
);
