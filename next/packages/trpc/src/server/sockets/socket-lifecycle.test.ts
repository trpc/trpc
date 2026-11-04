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

function defer<T>() {
  const settle: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>((resolve) => {
    settle.resolve = resolve;
  });
  return { promise, resolve: (value: T) => settle.resolve?.(value) };
}

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

test('an aborted subscription disposes the iterable its procedure returns late', async () => {
  const admission = defer<void>();
  const entered = defer<AbortSignal>();
  const next = vi.fn<() => Promise<IteratorResult<number>>>(async () => ({
    done: true,
    value: undefined,
  }));
  const returned = vi.fn<() => Promise<IteratorReturnResult<undefined>>>(
    async () => ({ done: true, value: undefined }),
  );
  const router = t.router({
    pending: t.procedure.subscription(
      async (opts): Promise<AsyncIterable<number>> => {
        entered.resolve(opts.signal);
        await admission.promise;
        return { [Symbol.asyncIterator]: () => ({ next, return: returned }) };
      },
    ),
  });
  await using ctx = await setup(router);
  const controller = new AbortController();
  const events: number[] = [];
  const iterating = (async () => {
    for await (const event of ctx.client.pending.subscribe(undefined, {
      signal: controller.signal,
    })) {
      events.push(event);
    }
  })();
  const signal = await entered.promise;
  controller.abort();
  await iterating;
  expect(events).toEqual([]);
  await vi.waitFor(() => expect(signal.aborted).toBe(true));
  admission.resolve();
  await vi.waitFor(() => expect(returned).toHaveBeenCalledOnce());
  expect(next).not.toHaveBeenCalled();
});

test('a query aborted before its resolver rejects reports nothing', async () => {
  const admission = defer<void>();
  const entered = defer<AbortSignal>();
  const settled = defer<void>();
  const router = t.router({
    slow: t.procedure.query(async (opts) => {
      entered.resolve(opts.signal);
      await admission.promise;
      settled.resolve();
      throw new Error('late query failure');
    }),
  });
  await using ctx = await setup(router);
  const controller = new AbortController();
  const query = ctx.client.slow
    .query(undefined, { signal: controller.signal })
    .catch((error: unknown) => error);
  const signal = await entered.promise;
  controller.abort();
  expect(await query).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  await vi.waitFor(() => expect(signal.aborted).toBe(true));
  admission.resolve();
  await settled.promise;
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(ctx.onError).not.toHaveBeenCalled();
});

test('a failed iteration aborts the signal, so a cleanup waiting for it ends', async () => {
  const cleaned = vi.fn<() => void>();
  const router = t.router({
    failing: t.procedure.subscription((opts) => ({
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<number>> => {
          throw new Error('next failed');
        },
        return: async (): Promise<IteratorReturnResult<undefined>> => {
          await onAbort(opts.signal);
          cleaned();
          return { done: true, value: undefined };
        },
      }),
    })),
  });
  await using ctx = await setup(router);
  await expect(async () => {
    for await (const _ of ctx.client.failing.subscribe());
  }).rejects.toMatchObject({ message: 'next failed' });
  await vi.waitFor(() => expect(cleaned).toHaveBeenCalledOnce());
});
