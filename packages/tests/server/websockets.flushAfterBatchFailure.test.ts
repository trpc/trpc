import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import type WebSocket from 'ws';

function createRouter() {
  const t = initTRPC.create();
  return t.router({
    greeting: t.procedure.query(() => 'hello'),
  });
}

describe('queries sent right after a batch fails because its socket closed', () => {
  test('a query waits for the new socket to open', async () => {
    const opened: number[] = [];
    await using ctx = testServerAndClientResource(createRouter(), {
      clientLink: 'wsLink',
      wsClient: {
        lazy: { enabled: true, closeMs: 0 },
        retryDelayMs: () => 0,
        onOpen() {
          opened.push(ctx.wsClient.connection!.id);
          if (opened.length === 1) {
            (ctx.wsClient.connection!.ws as unknown as WebSocket).terminate();
          }
        },
      },
    });

    const results = await Promise.allSettled([
      ctx.client.greeting.query(),
      ctx.client.greeting.query(),
    ]);
    expect(results).toMatchObject([
      { status: 'rejected', reason: { name: 'TRPCClientError' } },
      { status: 'rejected', reason: { name: 'TRPCClientError' } },
    ]);

    expect(await ctx.client.greeting.query()).toBe('hello');
    expect(opened).toHaveLength(2);
  });

  test('several queries sent together all complete', async () => {
    let terminated = false;
    await using ctx = testServerAndClientResource(createRouter(), {
      clientLink: 'wsLink',
      wsClient: {
        lazy: { enabled: true, closeMs: 0 },
        retryDelayMs: () => 0,
        onOpen() {
          if (terminated) return;
          terminated = true;
          (ctx.wsClient.connection!.ws as unknown as WebSocket).terminate();
        },
      },
    });

    await Promise.allSettled([
      ctx.client.greeting.query(),
      ctx.client.greeting.query(),
    ]);

    expect(
      await Promise.all([
        ctx.client.greeting.query(),
        ctx.client.greeting.query(),
        ctx.client.greeting.query(),
      ]),
    ).toEqual(['hello', 'hello', 'hello']);
  });
});
