import { createTrpcClient, routerType, wsLink } from '@trpc12/trpc/client';
import {
  initTrpc,
  type AnyRouter,
  type OnErrorOpts,
} from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { expect, test, vi } from 'vite-plus/test';

// A subscription after the client aborts it, or the socket closes: what its
// procedure does late still reaches `onError` (trpc/trpc#7888).

const t = initTrpc<{ ctx: object }>();

const onAbort = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', () => resolve(), { once: true });
  });

async function setup<TRouter extends AnyRouter>(router: TRouter) {
  const onError = vi.fn<(opts: OnErrorOpts) => void>();
  const server = await createTestServer<AnyRouter>({ router, onError });
  const link = wsLink({ url: server.wsUrl });
  const client = createTrpcClient({
    router: routerType<TRouter>(),
    links: [link],
  });
  return {
    server,
    link,
    client,
    onError,
    reported: () =>
      onError.mock.calls.map(([opts]) => [opts.path, opts.error.message]),
    [Symbol.asyncDispose]: async () => {
      await link.close();
      await server.close();
    },
  };
}

const cleanupRouter = t.router({
  cleanup: t.procedure.subscription(async function* (opts) {
    yield 1;
    await onAbort(opts.signal);
    throw new Error('generator cleanup');
  }),
});

test('what a generator throws after its subscription is aborted goes to onError', async () => {
  await using ctx = await setup(cleanupRouter);
  for await (const value of ctx.client.cleanup.subscribe()) {
    expect(value).toBe(1);
    break;
  }
  await vi.waitFor(() =>
    expect(ctx.reported()).toEqual([['cleanup', 'generator cleanup']]),
  );
});

test('what a generator throws after its socket closes goes to onError', async () => {
  await using ctx = await setup(cleanupRouter);
  const seen: number[] = [];
  const done = (async () => {
    for await (const value of ctx.client.cleanup.subscribe()) seen.push(value);
  })().catch(() => 'closed');
  await vi.waitFor(() => expect(seen).toEqual([1]));
  await ctx.link.close();
  expect(await done).toBe('closed');
  await vi.waitFor(() =>
    expect(ctx.reported()).toEqual([['cleanup', 'generator cleanup']]),
  );
});

test('a cleanup that rejects after an abort goes to onError', async () => {
  const router = t.router({
    active: t.procedure.subscription(() => ({
      [Symbol.asyncIterator]: () => {
        let sent = false;
        return {
          next: async (): Promise<IteratorResult<number>> => {
            if (sent) return new Promise(() => {});
            sent = true;
            return { done: false, value: 1 };
          },
          return: async (): Promise<IteratorReturnResult<undefined>> => {
            throw new Error('cleanup failed');
          },
        };
      },
    })),
  });
  await using ctx = await setup(router);
  for await (const value of ctx.client.active.subscribe()) {
    expect(value).toBe(1);
    break;
  }
  await vi.waitFor(() =>
    expect(ctx.reported()).toEqual([['active', 'cleanup failed']]),
  );
});
