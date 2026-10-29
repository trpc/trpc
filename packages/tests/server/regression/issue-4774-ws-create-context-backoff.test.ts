import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { WebSocketClientOptions } from '@trpc/client';
import { wsLink } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';

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

function setup(opts: { createContext: () => object }) {
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
        links: [wsLink({ client: clientOpts.wsClient })],
      };
    },
  });

  return Object.assign(ctx, {
    retryDelayMs,
    attemptIndexes: () => retryDelayMs.mock.calls.map((call) => call[0]),
  });
}

test('backs off while createContext keeps failing', async () => {
  const createContext = vi.fn((): object => {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  });
  await using ctx = setup({ createContext });

  await vi.waitFor(() => {
    expect(createContext.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
  await ctx.wsClient.close();

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
  await using ctx = setup({ createContext });

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

  await ctx.wsClient.close();
});
