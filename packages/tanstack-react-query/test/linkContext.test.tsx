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
  createTRPCUntypedClient,
  httpBatchLink,
  retryLink,
  routerType,
} from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import * as React from 'react';
import { expect, expectTypeOf, test, vi } from 'vitest';
import { createTRPCContext, createTRPCOptionsProxy } from '../src';

declare module '@trpc/client' {
  interface OperationContext {
    augmentedFlag?: boolean;
  }
}

function factory() {
  const calls = { query: vi.fn(), mutation: vi.fn() };
  const t = initTRPC.create();
  const appRouter = t.router({
    flakyQuery: t.procedure.query(() => {
      calls.query();
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    }),
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

test('`trpc.context` is typed from the client’s links and reaches them', async () => {
  const { appRouter, calls } = factory();
  await using ctx = testServerAndClientResource(appRouter);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // no type argument: the router and the context come from `client`
  const trpc = createTRPCOptionsProxy({
    client: makeClient(ctx.httpUrl),
    queryClient,
  });

  await expect(
    queryClient.fetchQuery(
      trpc.flakyQuery.queryOptions(undefined, {
        trpc: { context: { retry: false } },
      }),
    ),
  ).rejects.toMatchObject({ data: { code: 'INTERNAL_SERVER_ERROR' } });
  expect(calls.query).toHaveBeenCalledTimes(1);

  const mutationOptions = trpc.flakyMutation.mutationOptions({
    trpc: { context: { retry: false } },
  });
  await expect(
    mutationOptions.mutationFn?.(undefined, {} as any),
  ).rejects.toMatchObject({ data: { code: 'INTERNAL_SERVER_ERROR' } });
  expect(calls.mutation).toHaveBeenCalledTimes(1);

  void (() => {
    // @ts-expect-error -- no link reads `nope`
    trpc.flakyQuery.queryOptions(undefined, { trpc: { context: { nope: 1 } } });
    // @ts-expect-error -- `retry` only takes `false`
    trpc.flakyMutation.mutationOptions({ trpc: { context: { retry: true } } });
  });
});

test('other clients keep taking any context', () => {
  const { appRouter } = factory();
  const queryClient = new QueryClient();
  const url = 'http://localhost';

  const legacy = createTRPCOptionsProxy({
    client: createTRPCClient<AppRouter>({ links: [httpBatchLink({ url })] }),
    queryClient,
  });
  const untyped = createTRPCOptionsProxy({
    client: createTRPCUntypedClient<AppRouter>({
      links: [httpBatchLink({ url })],
    }),
    queryClient,
  });
  const server = createTRPCOptionsProxy({
    router: appRouter,
    ctx: {},
    queryClient,
  });
  const explicit = createTRPCOptionsProxy<AppRouter>({
    client: makeClient(url),
    queryClient,
  });

  for (const trpc of [legacy, untyped, server, explicit]) {
    trpc.flakyQuery.queryOptions(undefined, {
      trpc: { context: { anything: 1 } },
    });
    // fields added to `OperationContext` stay typed, as before
    trpc.flakyQuery.queryOptions(undefined, {
      // @ts-expect-error -- `augmentedFlag` is a boolean
      trpc: { context: { augmentedFlag: 'yes' } },
    });
  }
});

test('createTRPCContext takes the client’s type', async () => {
  const { appRouter, calls } = factory();
  await using ctx = testServerAndClientResource(appRouter);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const trpcClient = makeClient(ctx.httpUrl);
  const { TRPCProvider, useTRPC, useTRPCClient } =
    createTRPCContext<typeof makeClient>();

  function MyComponent() {
    const trpc = useTRPC();
    expectTypeOf(useTRPCClient()).toEqualTypeOf<typeof trpcClient>();
    const query = useQuery(
      trpc.flakyQuery.queryOptions(undefined, {
        trpc: { context: { retry: false } },
      }),
    );
    void (() => {
      trpc.flakyQuery.queryOptions(undefined, {
        // @ts-expect-error -- no link reads `nope`
        trpc: { context: { nope: 1 } },
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

  // `typeof client` works as well as the factory's type
  const byClient = createTRPCContext<typeof trpcClient>();
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
