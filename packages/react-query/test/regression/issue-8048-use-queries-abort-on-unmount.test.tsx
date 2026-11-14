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
  greeting: t.procedure.input(z.string()).query((opts) => opts.input),
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

function renderQueries(
  proxy: Proxy,
  queries: Parameters<Proxy['useQueries']>[0],
  providerAbortOnUnmount?: boolean,
) {
  const { client, signals } = createRecordingClient(proxy);
  const queryClient = createQueryClient();

  function Component() {
    proxy.useQueries(queries);
    return null;
  }

  const utils = render(
    <proxy.Provider
      client={client}
      queryClient={queryClient}
      abortOnUnmount={providerAbortOnUnmount}
    >
      <QueryClientProvider client={queryClient}>
        <Component />
      </QueryClientProvider>
    </proxy.Provider>,
  );

  return { signals, unmount: utils.unmount };
}

test('useQueries aborts requests on unmount when abortOnUnmount is set', async () => {
  const { signals, unmount } = renderQueries(
    createTRPCReact<AppRouter>({ abortOnUnmount: true }),
    (t) => [t.greeting('a'), t.greeting('b')],
  );

  await vi.waitFor(() => {
    expect(signals).toHaveLength(2);
  });

  unmount();

  await vi.waitFor(() => {
    expect(signals.map((signal) => signal?.aborted)).toEqual([true, true]);
  });
});

test('useQueries passes no signal when abortOnUnmount is not set', async () => {
  const { signals, unmount } = renderQueries(
    createTRPCReact<AppRouter>(),
    (t) => [t.greeting('a')],
  );

  await vi.waitFor(() => {
    expect(signals).toHaveLength(1);
  });

  unmount();

  expect(signals[0]).toBeUndefined();
});

test('per-query trpc.abortOnUnmount overrides the client default', async () => {
  const { signals, unmount } = renderQueries(
    createTRPCReact<AppRouter>(),
    (t) => [t.greeting('a', { trpc: { abortOnUnmount: true } })],
  );

  await vi.waitFor(() => {
    expect(signals).toHaveLength(1);
  });

  unmount();

  await vi.waitFor(() => {
    expect(signals.map((signal) => signal?.aborted)).toEqual([true]);
  });
});

test('per-query trpc.abortOnUnmount: false overrides the client config', async () => {
  const { signals, unmount } = renderQueries(
    createTRPCReact<AppRouter>({ abortOnUnmount: true }),
    (t) => [t.greeting('a', { trpc: { abortOnUnmount: false } })],
  );

  await vi.waitFor(() => {
    expect(signals).toHaveLength(1);
  });

  unmount();

  expect(signals[0]).toBeUndefined();
});

test('useQueries aborts requests on unmount when the provider enables abortOnUnmount', async () => {
  const { signals, unmount } = renderQueries(
    createTRPCReact<AppRouter>(),
    (t) => [t.greeting('a')],
    true,
  );

  await vi.waitFor(() => {
    expect(signals).toHaveLength(1);
  });

  unmount();

  await vi.waitFor(() => {
    expect(signals.map((signal) => signal?.aborted)).toEqual([true]);
  });
});

test('useSuspenseQueries forwards the abort signal', async () => {
  const proxy = createTRPCReact<AppRouter>({ abortOnUnmount: true });
  const { client, signals } = createRecordingClient(proxy);
  const queryClient = createQueryClient();

  function Component() {
    proxy.useSuspenseQueries((t) => [t.greeting('a')]);
    return null;
  }

  const utils = render(
    <proxy.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <Component />
        </Suspense>
      </QueryClientProvider>
    </proxy.Provider>,
  );

  await vi.waitFor(() => {
    expect(signals).toHaveLength(1);
  });

  expect(signals[0]).toBeInstanceOf(AbortSignal);
  expect(signals[0]?.aborted).toBe(false);

  utils.unmount();
});
