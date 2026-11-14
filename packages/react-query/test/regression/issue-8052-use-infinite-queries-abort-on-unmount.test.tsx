import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import React, { Suspense } from 'react';
import { z } from 'zod';

const t = initTRPC.create();
const appRouter = t.router({
  list: t.procedure
    .input(z.object({ cursor: z.number().nullish() }))
    .query((opts) => opts.input),
});

type AppRouter = typeof appRouter;
type Proxy = ReturnType<typeof createTRPCReact<AppRouter>>;

function createRecordingClient(proxy: Proxy) {
  const signals: (AbortSignal | null | undefined)[] = [];
  const client = proxy.createClient({
    links: [
      () =>
        ({ op }) => {
          signals.push(op.signal);
          return observable(() => () => {});
        },
    ],
  });
  return { client, signals };
}

function renderInfiniteQuery(proxy: Proxy, component: React.ReactNode) {
  const { client, signals } = createRecordingClient(proxy);
  const queryClient = createQueryClient();

  const utils = render(
    <proxy.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>{component}</Suspense>
      </QueryClientProvider>
    </proxy.Provider>,
  );

  return { signals, unmount: utils.unmount };
}

test('useInfiniteQuery aborts on unmount when createTRPCReact sets abortOnUnmount', async () => {
  const proxy = createTRPCReact<AppRouter>({ abortOnUnmount: true });

  function Component() {
    proxy.list.useInfiniteQuery({}, { getNextPageParam: () => null });
    return null;
  }

  const { signals, unmount } = renderInfiniteQuery(proxy, <Component />);

  await vi.waitFor(() => {
    expect(signals).toHaveLength(1);
  });

  unmount();

  await vi.waitFor(() => {
    expect(signals[0]?.aborted).toBe(true);
  });
});

test('usePrefetchInfiniteQuery forwards a signal when createTRPCReact sets abortOnUnmount', async () => {
  const proxy = createTRPCReact<AppRouter>({ abortOnUnmount: true });

  function Component() {
    proxy.list.usePrefetchInfiniteQuery(
      {},
      { pages: 1, getNextPageParam: () => null },
    );
    return null;
  }

  const { signals } = renderInfiniteQuery(proxy, <Component />);

  await vi.waitFor(() => {
    expect(signals).toHaveLength(1);
  });
  expect(signals[0]).toBeInstanceOf(AbortSignal);
});

test('per-query trpc.abortOnUnmount: false overrides createTRPCReact abortOnUnmount: true', async () => {
  const proxy = createTRPCReact<AppRouter>({ abortOnUnmount: true });

  function Component() {
    proxy.list.useInfiniteQuery(
      {},
      {
        getNextPageParam: () => null,
        trpc: { abortOnUnmount: false },
      },
    );
    return null;
  }

  const { signals, unmount } = renderInfiniteQuery(proxy, <Component />);

  await vi.waitFor(() => {
    expect(signals).toHaveLength(1);
  });

  unmount();

  expect(signals[0]).toBeNull();
});

test('useSuspenseInfiniteQuery forwards a signal when createTRPCReact sets abortOnUnmount', async () => {
  const proxy = createTRPCReact<AppRouter>({ abortOnUnmount: true });

  function Component() {
    proxy.list.useSuspenseInfiniteQuery({}, { getNextPageParam: () => null });
    return null;
  }

  const { signals } = renderInfiniteQuery(proxy, <Component />);

  await vi.waitFor(() => {
    expect(signals).toHaveLength(1);
  });
  expect(signals[0]).toBeInstanceOf(AbortSignal);
});
