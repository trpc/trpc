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
  /** The input schema of the subscription and whether it is sent as `superjson`. */
  input: { schema: z.ZodType; superjson: boolean } = {
    schema: z.date(),
    superjson: true,
  },
) {
  const t = initTRPC.create({
    transformer: input.superjson ? superjson : undefined,
    sse,
  });
  return t.router({
    events: t.procedure
      .input(input.schema)
      .subscription(async function* (opts) {
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

test('wsLink: a plain object input is still merged with `lastEventId` when resuming', async () => {
  const subscribeInputs: unknown[] = [];
  const router = makeApp(subscribeInputs, undefined, {
    schema: z.object({ a: z.number(), lastEventId: z.string().optional() }),
    superjson: true,
  });
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: {
      lazy: { enabled: false, closeMs: 0 },
      retryDelayMs: () => 10,
    },
  });
  const onData = vi.fn();
  const onError = vi.fn();
  const sub = ctx.client.events.subscribe({ a: 1 }, { onData, onError });
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
  expect(subscribeInputs).toEqual([{ a: 1 }, { a: 1, lastEventId: '1' }]);
  sub.unsubscribe();
});

/**
 * `isPlainObject` used to throw on an own `constructor: null` key, so the
 * resubscribe failed before the procedure ran and the subscription got no
 * response.
 */
test('wsLink: a subscription with a null own `constructor` input resumes after a reconnect', async () => {
  const input = { constructor: null };
  const subscribeInputs: unknown[] = [];
  // `superjson` refuses an own `constructor` key, so send the input without it
  const router = makeApp(subscribeInputs, undefined, {
    schema: z.record(z.string(), z.null()),
    superjson: false,
  });
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: {
      lazy: { enabled: false, closeMs: 0 },
      retryDelayMs: () => 10,
    },
  });
  const onData = vi.fn();
  const onError = vi.fn();
  const sub = ctx.client.events.subscribe(input, { onData, onError });
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
  // restarted with the same input instead of being merged with `lastEventId`
  expect(subscribeInputs).toEqual([input, input]);
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

test('localLink: a subscription with a null own `constructor` input resumes after a retryable error', async () => {
  const input = { constructor: null };
  const t = initTRPC.create();
  const receivedInputs: unknown[] = [];
  const appRouter = t.router({
    events: t.procedure
      .input(z.record(z.string(), z.null()))
      .subscription(async function* (opts) {
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
      client.events.subscribe(input, {
        onData: (value) => {
          data.push(value.data);
        },
        onComplete: () => resolve({ data, error: undefined }),
        onError: (error) => resolve({ data, error }),
      });
    },
  );
  expect(outcome.error).toBeUndefined();
  // restarted with the same input instead of being merged with `lastEventId`
  expect(receivedInputs).toEqual([input, input]);
  expect(outcome.data).toEqual(['event 0', 'event 0', 'event 1', 'event 2']);
});
