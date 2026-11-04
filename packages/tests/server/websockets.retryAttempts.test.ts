// @vitest-environment node
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { retryLink, wsLink } from '@trpc/client';
import { initTRPC, tracked, TRPCError } from '@trpc/server';
import type {
  TRPCClientOutgoingMessage,
  TRPCResponseMessage,
} from '@trpc/server/rpc';
import { isObject } from '@trpc/server/unstable-core-do-not-import';
import type { RawData } from 'ws';
import { z } from 'zod';

function text(data: RawData) {
  return (
    Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data)
  ).toString('utf8');
}

function isResponseMessage(value: unknown): value is TRPCResponseMessage {
  return (
    isObject(value) && 'id' in value && ('result' in value || 'error' in value)
  );
}

function factory() {
  const subscriptionCalls = vi.fn<(lastEventId: number | undefined) => void>();

  const t = initTRPC.create();
  const appRouter = t.router({
    ping: t.procedure.query(() => 'pong'),
    onEvent: t.procedure
      .input(z.object({ lastEventId: z.coerce.number().optional() }).optional())
      .subscription(async function* (opts) {
        const lastEventId = opts.input?.lastEventId;
        subscriptionCalls(lastEventId);
        if (lastEventId === undefined) {
          yield tracked('1', 1);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }
        yield tracked(String(lastEventId + 1), lastEventId + 1);
        await new Promise((resolve) =>
          opts.signal?.addEventListener('abort', resolve),
        );
      }),
  });

  const ctx = testServerAndClientResource(appRouter, {
    wsClient: { lazy: { enabled: false, closeMs: 0 } },
    client: ({ wsClient }) => ({
      links: [
        retryLink({
          retry: (opts) => opts.attempts < 3,
          retryDelayMs: () => 1,
        }),
        wsLink({ client: wsClient }),
      ],
    }),
  });

  /**
   * Once the server has sent an error, its later frames are held back until
   * it receives the client's next `subscription` request, then sent in order.
   * This stands in for the failed attempt's trailing `stopped` arriving in a
   * later packet, after the client has already sent the retry.
   */
  const sent: TRPCResponseMessage[] = [];
  const subscribeRequests: TRPCClientOutgoingMessage[] = [];
  ctx.wss.on('connection', (socket) => {
    const send = socket.send.bind(socket);
    const held: string[] = [];
    let holding = false;
    vi.spyOn(socket, 'send').mockImplementation((data: unknown) => {
      assert(typeof data === 'string', 'expected a text frame');
      const message: unknown = JSON.parse(data);
      assert(isResponseMessage(message), 'not a tRPC response message');
      sent.push(message);
      if (holding) {
        held.push(data);
        return;
      }
      if ('error' in message) {
        holding = true;
      }
      send(data);
    });
    // Registered after the adapter's listener, so the adapter has already
    // handled the request when the held frames go out.
    socket.on('message', (data) => {
      const messages = [JSON.parse(text(data)) as TRPCClientOutgoingMessage]
        .flat()
        .filter((message) => message.method === 'subscription');
      subscribeRequests.push(...messages);
      if (holding && messages.length > 0) {
        holding = false;
        for (const frame of held.splice(0)) {
          send(frame);
        }
      }
    });
  });

  return Object.assign(ctx, { subscriptionCalls, sent, subscribeRequests });
}

test('a late stopped frame for the failed attempt does not end the retried subscription', async () => {
  await using ctx = factory();

  const onData = vi.fn<(value: number) => void>();
  const onError = vi.fn();
  const onComplete = vi.fn();

  const sub = ctx.client.onEvent.subscribe(undefined, {
    onData: (envelope) => onData(envelope.data),
    onError,
    onComplete,
  });

  // The retry resumes from lastEventId 1, and the server yields 2.
  await vi.waitFor(() => {
    expect(ctx.subscriptionCalls.mock.calls).toEqual([[undefined], [1]]);
    expect(ctx.sent).toContainEqual(
      expect.objectContaining({
        result: { type: 'data', id: '2', data: { id: '2', data: 2 } },
      }),
    );
  });
  // The server answers on the same socket in order, so once this resolves the
  // client has handled the failed attempt's `stopped` and the retry's data.
  expect(await ctx.client.ping.query()).toBe('pong');

  expect(ctx.subscribeRequests).toHaveLength(2);
  expect(onComplete).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  expect(onData.mock.calls).toEqual([[1], [2]]);

  sub.unsubscribe();
});
