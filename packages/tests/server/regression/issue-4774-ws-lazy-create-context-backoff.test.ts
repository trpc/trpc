import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { WebSocketClientOptions } from '@trpc/client';
import { retryLink, wsLink } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';

/**
 * In lazy mode nothing reconnects after the server rejects a connection
 * (`createContext` throws): the next request opens the next socket. When
 * `retryLink` sent the failed query again, that request used to connect at
 * once, skipping the backoff, so the client opened sockets in a tight loop.
 * @see https://github.com/trpc/trpc/issues/4774
 */
const t = initTRPC.create();
const router = t.router({
  greeting: t.procedure.query(() => 'hello'),
});

function setup(opts: { createContext: () => object; delayMs: number }) {
  const retryDelayMs = vi.fn<
    NonNullable<WebSocketClientOptions['retryDelayMs']>
  >((attemptIndex) => (attemptIndex === 0 ? 0 : opts.delayMs));

  const ctx = testServerAndClientResource(router, {
    wssServer: {
      createContext: opts.createContext,
    },
    wsClient: {
      lazy: {
        enabled: true,
        closeMs: 0,
      },
      retryDelayMs,
    },
    client(clientOpts) {
      return {
        links: [
          retryLink({
            retry: ({ op, attempts }) =>
              op.context['retry'] !== false && attempts < 1_000,
          }),
          wsLink({ client: clientOpts.wsClient }),
        ],
      };
    },
  });

  // close the client before the server is disposed, also when a test fails
  return makeAsyncResource(
    Object.assign(ctx, {
      retryDelayMs,
      attemptIndexes: () => retryDelayMs.mock.calls.map((call) => call[0]),
    }),
    () => ctx.wsClient.close(),
  );
}

test('a query retried by retryLink waits for the backoff in lazy mode', async () => {
  const createContext = vi.fn((): object => {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  });
  await using ctx = setup({ createContext, delayMs: 10 });
  // cancel the query before the client closes, so `retryLink` doesn't send
  // it again during teardown
  const abortController = new AbortController();
  await using _abort = makeAsyncResource({}, async () => {
    abortController.abort();
  });

  ctx.client.greeting
    .query(undefined, { signal: abortController.signal })
    .catch(() => null);

  await vi.waitFor(() => {
    expect(createContext.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
  // every connection after the first one waited for the backoff
  expect(createContext.mock.calls.length).toBeLessThanOrEqual(
    ctx.retryDelayMs.mock.calls.length + 1,
  );
  expect(ctx.attemptIndexes().slice(0, 3)).toEqual([1, 2, 3]);
});

test('a request made once the lazy client is idle again does not wait for an old backoff', async () => {
  let isRejecting = true;
  const createContext = vi.fn((): object => {
    if (isRejecting) throw new TRPCError({ code: 'UNAUTHORIZED' });
    return {};
  });
  await using ctx = setup({ createContext, delayMs: 1_000 });

  await expect(
    ctx.client.greeting.query(undefined, { context: { retry: false } }),
  ).rejects.toThrow();
  // the client closes the idle connection
  await vi.waitFor(() => {
    expect(ctx.wsClient.connectionState.get().state).toBe('idle');
  });

  isRejecting = false;
  const states: string[] = [];
  const subscription = ctx.wsClient.connectionState.subscribe({
    next(state) {
      states.push(state.state);
    },
  });
  await using _unsubscribe = makeAsyncResource({}, async () => {
    subscription.unsubscribe();
  });

  expect(await ctx.client.greeting.query()).toBe('hello');
  // the rejection before the client went idle doesn't delay it
  expect(ctx.retryDelayMs).not.toHaveBeenCalled();
  expect(states).toEqual(['idle', 'connecting', 'pending']);
});

test('a request made once the lazy client is idle again does not join a reconnect from before', async () => {
  let isRejecting = true;
  const createContext = vi.fn((): object => {
    if (isRejecting) throw new TRPCError({ code: 'UNAUTHORIZED' });
    return {};
  });
  await using ctx = setup({ createContext, delayMs: 1_000 });

  const abortController = new AbortController();
  ctx.client.greeting
    .query(undefined, { signal: abortController.signal })
    .catch(() => null);
  // the retried query waits for the backoff
  await vi.waitFor(() => {
    expect(ctx.retryDelayMs).toHaveBeenCalled();
  });
  // cancelling it leaves nothing in flight, so the client closes
  abortController.abort();
  await vi.waitFor(() => {
    expect(ctx.wsClient.connectionState.get().state).toBe('idle');
  });

  isRejecting = false;
  const start = Date.now();
  expect(await ctx.client.greeting.query()).toBe('hello');
  expect(Date.now() - start).toBeLessThan(500);
  expect(ctx.retryDelayMs).toHaveBeenCalledTimes(1);
});
