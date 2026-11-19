import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { WebSocketClientOptions } from '@trpc/client';
import { retryLink, wsLink } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';

/**
 * When `createContext` throws, the ws adapter accepts the socket, sends an
 * `id: null` error and closes it. The client used to treat the accepted socket
 * as a working connection, so every reconnect started over at attempt 0 and
 * the client hammered the server in a tight loop.
 * @see https://github.com/trpc/trpc/issues/4774
 */
const t = initTRPC.create();
const router = t.router({
  greeting: t.procedure.query(() => 'hello'),
});

function setup(opts: { createContext: () => object; retry: boolean }) {
  const retryDelayMs = vi.fn<
    NonNullable<WebSocketClientOptions['retryDelayMs']>
  >(() => 10);

  const ctx = testServerAndClientResource(router, {
    wssServer: {
      createContext: opts.createContext,
    },
    wsClient: {
      lazy: {
        enabled: false,
        closeMs: 0,
      },
      retryDelayMs,
    },
    client(clientOpts) {
      return {
        links: [
          ...(opts.retry
            ? [retryLink({ retry: ({ attempts }) => attempts < 1_000 })]
            : []),
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

test('backs off while createContext keeps failing', async () => {
  const createContext = vi.fn((): object => {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  });
  await using ctx = setup({ createContext, retry: false });

  await vi.waitFor(() => {
    expect(createContext.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  expect(ctx.attemptIndexes().slice(0, 3)).toEqual([1, 2, 3]);
});

test('reconnects straight away once a connection has been accepted', async () => {
  let failuresLeft = 2;
  const createContext = vi.fn((): object => {
    if (failuresLeft > 0) {
      failuresLeft--;
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return {};
  });
  await using ctx = setup({ createContext, retry: false });

  await vi.waitFor(() => {
    expect(createContext).toHaveBeenCalledTimes(3);
  });
  expect(await ctx.client.greeting.query()).toBe('hello');
  expect(ctx.attemptIndexes()).toEqual([1, 2]);

  // drop the healthy connection from the server side
  for (const client of ctx.wss.clients) {
    client.close();
  }

  await vi.waitFor(() => {
    expect(createContext).toHaveBeenCalledTimes(4);
  });
  expect(ctx.attemptIndexes()).toEqual([1, 2, 0]);
});

test('a malformed frame on a working connection is not a rejection', async () => {
  const createContext = vi.fn((): object => ({}));
  await using ctx = setup({ createContext, retry: false });

  const ws = await vi.waitFor(() => {
    const connection = ctx.wsClient.connection;
    if (connection?.state !== 'open') throw new Error('not open yet');
    return connection.ws;
  });

  const received: unknown[] = [];
  ws.addEventListener('message', ({ data }) => {
    received.push(JSON.parse(String(data)));
  });

  // the server answers a malformed frame with an `id: null` PARSE_ERROR and
  // keeps the socket open
  ws.send('not json');
  expect(await ctx.client.greeting.query()).toBe('hello');
  expect(received).toEqual([
    expect.objectContaining({
      id: null,
      error: expect.objectContaining({
        data: expect.objectContaining({ code: 'PARSE_ERROR' }),
      }),
    }),
    expect.objectContaining({ result: { type: 'data', data: 'hello' } }),
  ]);
  expect(createContext).toHaveBeenCalledTimes(1);

  // drop the connection from the server side
  for (const client of ctx.wss.clients) {
    client.close();
  }

  await vi.waitFor(() => {
    expect(createContext).toHaveBeenCalledTimes(2);
  });
  expect(ctx.attemptIndexes()).toEqual([0]);
});

test('a query retried by retryLink waits for the backoff', async () => {
  const createContext = vi.fn((): object => {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  });
  await using ctx = setup({ createContext, retry: true });
  // cancel the query before the client closes, so `retryLink` doesn't send
  // it again during teardown
  const abortController = new AbortController();
  await using _abort = makeAsyncResource({}, async () => {
    abortController.abort();
  });

  const connectingErrors: unknown[] = [];
  const subscription = ctx.wsClient.connectionState.subscribe({
    next(state) {
      // the first state is the initial `connecting`, which has no error
      if (state.state === 'connecting' && state.error) {
        connectingErrors.push(state.error.message);
      }
    },
  });
  await using _unsubscribe = makeAsyncResource({}, async () => {
    subscription.unsubscribe();
  });

  // each rejection fails the query and `retryLink` sends it again at once,
  // which used to open a new socket at attempt 0 and skip the backoff
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
  // the retry doesn't add `connecting` states of its own: these are the
  // ones the close handler and the reconnect loop publish without it
  for (const message of connectingErrors) {
    expect(['WebSocket closed', 'Initialization error']).toContain(message);
  }
});

test('a request sent while the client is reconnecting waits for the backoff', async () => {
  const createContext = vi.fn((): object => {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  });
  await using ctx = setup({ createContext, retry: false });
  const abortController = new AbortController();

  // a subscriber that sends a request whenever the client starts reconnecting
  let depth = 0;
  let maxDepth = 0;
  let sent = 0;
  const subscription = ctx.wsClient.connectionState.subscribe({
    next(state) {
      if (state.state !== 'connecting' || sent >= 50) return;
      sent++;
      depth++;
      maxDepth = Math.max(maxDepth, depth);
      ctx.client.greeting
        .query(undefined, { signal: abortController.signal })
        .catch(() => null);
      depth--;
    },
  });
  await using _cleanup = makeAsyncResource({}, async () => {
    subscription.unsubscribe();
    abortController.abort();
  });

  await vi.waitFor(() => {
    expect(createContext.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
  // the request doesn't re-enter the reconnect
  expect(maxDepth).toBe(1);
  // every connection after the first one waited for the backoff
  expect(createContext.mock.calls.length).toBeLessThanOrEqual(
    ctx.retryDelayMs.mock.calls.length + 1,
  );
});
