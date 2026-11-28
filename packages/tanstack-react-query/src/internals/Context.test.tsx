import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import '@testing-library/jest-dom/vitest';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { render } from '@testing-library/react';
import {
  createTRPCClient,
  httpBatchLink,
  retryLink,
  routerType,
} from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import * as React from 'react';
import { expect, expectTypeOf, test, vi } from 'vitest';
import { createTRPCContext } from './Context';

function factory() {
  const calls = { query: vi.fn(), mutation: vi.fn() };
  const t = initTRPC.create();
  const appRouter = t.router({
    flakyQuery: t.procedure.query(() => {
      calls.query();
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    }),
    byId: t.procedure
      .input((value) => value as { id: string })
      .query((opts) => opts.input),
    flakyMutation: t.procedure.mutation(() => {
      calls.mutation();
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    }),
  });
  return { appRouter, calls };
}
type AppRouter = ReturnType<typeof factory>['appRouter'];

const makeClient = (url: string) =>
  createTRPCClient({
    router: routerType<AppRouter>(),
    links: [
      retryLink({ retry: (opts) => opts.attempts < 3 }),
      httpBatchLink({ url }),
    ],
  });

test('createTRPCContext takes the client to type `trpc.context`', async () => {
  const { appRouter, calls } = factory();
  await using ctx = testServerAndClientResource(appRouter);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const trpcClient = makeClient(ctx.httpUrl);
  const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext({
    client: makeClient,
  });

  function MyComponent() {
    const trpc = useTRPC();
    expectTypeOf(useTRPCClient()).toEqualTypeOf<typeof trpcClient>();
    const query = useQuery(
      trpc.flakyQuery.queryOptions(undefined, {
        trpc: { context: { retry: () => false } },
      }),
    );
    void (() => {
      trpc.flakyQuery.queryOptions(undefined, {
        // @ts-expect-error -- `retry` takes a function
        trpc: { context: { retry: 1 } },
      });
    });
    return <div>{query.status}</div>;
  }

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <MyComponent />
      </TRPCProvider>
    </QueryClientProvider>,
  );
  await vi.waitFor(() => expect(utils.container).toHaveTextContent('error'));
  expect(calls.query).toHaveBeenCalledTimes(1);

  // the client works as well as the function that creates it
  const byClient = createTRPCContext({ client: trpcClient });
  expectTypeOf(byClient.useTRPCClient).returns.toEqualTypeOf<
    typeof trpcClient
  >();
  // and a router's type keeps working
  const byRouter = createTRPCContext<AppRouter>();
  void (() => {
    byRouter
      .useTRPC()
      .flakyQuery.queryOptions(undefined, { trpc: { context: { any: 1 } } });
  });
});

test('createTRPCContext takes the router type as `router`', async () => {
  const { appRouter, calls } = factory();
  await using ctx = testServerAndClientResource(appRouter);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { TRPCProvider, useTRPC } = createTRPCContext({
    router: routerType<AppRouter>(),
  });
  expectTypeOf(useTRPC).toEqualTypeOf<
    ReturnType<typeof createTRPCContext<AppRouter>>['useTRPC']
  >();

  function MyComponent() {
    const query = useQuery(useTRPC().byId.queryOptions({ id: '1' }));
    return <div>{query.data?.id ?? query.status}</div>;
  }
  const trpcClient = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [httpBatchLink({ url: ctx.httpUrl })],
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <MyComponent />
      </TRPCProvider>
    </QueryClientProvider>,
  );
  await vi.waitFor(() => expect(utils.container).toHaveTextContent('1'));
  expect(calls.query).toHaveBeenCalledTimes(0);

  // `keyPrefix: true` makes the provider take the prefix
  const prefixed = createTRPCContext({
    router: routerType<AppRouter>(),
    keyPrefix: true,
  });
  expectTypeOf(prefixed.useTRPC).toEqualTypeOf<
    ReturnType<
      typeof createTRPCContext<AppRouter, { keyPrefix: true }>
    >['useTRPC']
  >();
  void (() => (
    // @ts-expect-error -- `keyPrefix` is required with `keyPrefix: true`
    <prefixed.TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      {null}
    </prefixed.TRPCProvider>
  ));
});
