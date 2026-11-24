import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { suppressLogs } from '@trpc/server/__tests__/suppressLogs';
import { createTRPCClient, localLink } from '@trpc/client';
import { initTRPC, tracked } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';

const since = new Date('2026-11-24T00:00:00.000Z');

/**
 * A subscription whose input is not a plain object (a `Date` here) used to be
 * spread when a reconnect merged `lastEventId` into its input. The `Date`
 * became `{ lastEventId }`, so the resubscribe failed input validation with
 * `BAD_REQUEST` and could not resume.
 * @see https://github.com/trpc/trpc/pull/8036
 */
function makeApp(
  subscribeInputs: unknown[],
  sse: { client: { reconnectAfterInactivityMs: number } } | undefined,
) {
  const t = initTRPC.create({ transformer: superjson, sse });
  return t.router({
    events: t.procedure.input(z.date()).subscription(async function* (opts) {
      subscribeInputs.push(opts.input);
      yield tracked('1', 'first');
      await new Promise((resolve) =>
        opts.signal?.addEventListener('abort', resolve),
      );
    }),
  });
}

test('wsLink: a subscription with a Date input resumes after a reconnect', async () => {
  const subscribeInputs: unknown[] = [];
  const router = makeApp(subscribeInputs, undefined);
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: {
      lazy: { enabled: false, closeMs: 0 },
      retryDelayMs: () => 10,
    },
  });
  const onData = vi.fn();
  const onError = vi.fn();
  const sub = ctx.client.events.subscribe(since, { onData, onError });
  await vi.waitFor(() => {
    expect(onData).toHaveBeenCalledTimes(1);
  });

  ctx.destroyConnections();
  await vi.waitFor(() => {
    expect(subscribeInputs.length + onError.mock.calls.length).toBeGreaterThan(
      1,
    );
  });
  expect(onError).not.toHaveBeenCalled();
  expect(subscribeInputs).toEqual([since, since]);
  sub.unsubscribe();
});

test('httpSubscriptionLink: a subscription with a Date input resumes after an inactivity reconnect', async () => {
  const subscribeInputs: unknown[] = [];
  const router = makeApp(subscribeInputs, {
    client: { reconnectAfterInactivityMs: 100 },
  });
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'httpSubscriptionLink',
  });
  const onData = vi.fn();
  const onError = vi.fn();
  const sub = ctx.client.events.subscribe(since, { onData, onError });
  await vi.waitFor(() => {
    expect(subscribeInputs.length + onError.mock.calls.length).toBeGreaterThan(
      1,
    );
  });
  expect(onError).not.toHaveBeenCalled();
  expect(subscribeInputs).toEqual([since, since]);
  sub.unsubscribe();
});

test('httpSubscriptionLink: a subscription with a Date input resumes after an EventSource reconnect', async () => {
  const subscribeInputs: unknown[] = [];
  const router = makeApp(subscribeInputs, undefined);
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'httpSubscriptionLink',
  });
  const onData = vi.fn();
  const onError = vi.fn();
  const sub = ctx.client.events.subscribe(since, { onData, onError });
  await vi.waitFor(() => {
    expect(onData).toHaveBeenCalledTimes(1);
  });

  const release = suppressLogs();
  try {
    ctx.destroyConnections();
    await vi.waitFor(
      () => {
        expect(
          subscribeInputs.length + onError.mock.calls.length,
        ).toBeGreaterThan(1);
      },
      { timeout: 3_000 },
    );
  } finally {
    release();
  }
  expect(onError).not.toHaveBeenCalled();
  expect(subscribeInputs).toEqual([since, since]);
  sub.unsubscribe();
});

test('localLink: a subscription with a Date input resumes after a retryable error', async () => {
  const t = initTRPC.create();
  const receivedInputs: unknown[] = [];
  const appRouter = t.router({
    events: t.procedure.input(z.date()).subscription(async function* (opts) {
      receivedInputs.push(opts.input);
      for (let i = 0; i < 3; i++) {
        yield tracked(String(i), `event ${i}`);
        if (i === 0 && receivedInputs.length === 1) {
          // force one reconnect
          throw new Error('Threw on event 0');
        }
      }
    }),
  });
  const client = createTRPCClient<typeof appRouter>({
    links: [localLink({ router: appRouter, createContext: async () => ({}) })],
  });
  const outcome = await new Promise<{ data: string[]; error: unknown }>(
    (resolve) => {
      const data: string[] = [];
      client.events.subscribe(since, {
        onData: (value) => {
          data.push(value.data);
        },
        onComplete: () => resolve({ data, error: undefined }),
        onError: (error) => resolve({ data, error }),
      });
    },
  );
  expect(outcome.error).toBeUndefined();
  expect(receivedInputs).toEqual([since, since]);
  expect(outcome.data).toEqual(['event 0', 'event 0', 'event 1', 'event 2']);
});
