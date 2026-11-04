import {
  createTrpcClient,
  retryLink,
  routerType,
  wsLink,
} from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { expect, test } from 'vite-plus/test';

// `retryLink` sends a retry with the operation it was given, so with the
// same id as the attempt it replaces.

const t = initTrpc();

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

test('retryLink over wsLink retries a query and a subscription that failed (trpc/trpc#7889)', async () => {
  const calls = { query: 0, subscription: 0 };
  const router = t.router({
    flaky: t.procedure.query(() => {
      if (++calls.query === 1) throw new Error('flaky');
      return 'ok';
    }),
    onEvent: t.procedure.subscription(async function* () {
      if (++calls.subscription === 1) {
        yield 1;
        throw new Error('flaky');
      }
      yield 2;
    }),
  });
  await using server = await createTestServer({ router });
  await using link = wsLink({ url: server.wsUrl, keepAlive: false });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      retryLink({ retry: (opts) => opts.attempt < 3, delay: () => 0 }),
      link,
    ],
  });
  expect(await client.flaky.query()).toBe('ok');
  expect(await collect(client.onEvent.subscribe())).toEqual([1, 2]);
  expect(calls).toEqual({ query: 2, subscription: 2 });
});
