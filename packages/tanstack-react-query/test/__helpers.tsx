import '@testing-library/dom';
import '@testing-library/jest-dom/vitest';
import type { TestServerAndClientResourceOpts } from '@trpc/client/__tests__/testClientResource';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderResult } from '@testing-library/react';
import { render } from '@testing-library/react';
import { getUntypedClient } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import * as React from 'react';
import { createTRPCContext, createTRPCOptionsProxy } from '../src';

type TestReactResourceExtraOpts = { queryKeyPrefix?: string };

export function testReactResource<TRouter extends AnyTRPCRouter>(
  appRouter: TRouter,
  opts?: TestServerAndClientResourceOpts<TRouter> & TestReactResourceExtraOpts,
) {
  const ctx = testServerAndClientResource(appRouter, opts);

  const queryClient = new QueryClient();

  const optionsProxyClient = createTRPCOptionsProxy<
    TRouter,
    { enablePrefix: true }
  >({
    client: getUntypedClient(ctx.client),
    queryClient,
    queryKeyPrefix: opts?.queryKeyPrefix,
  });

  const optionsProxyServer = createTRPCOptionsProxy<
    TRouter,
    { enablePrefix: true }
  >({
    router: appRouter,
    ctx: {},
    queryClient,
    queryKeyPrefix: opts?.queryKeyPrefix,
  });

  const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<
    TRouter,
    {
      enablePrefix: true;
    }
  >();

  function renderApp(ui: React.ReactNode) {
    return render(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider
          trpcClient={ctx.client}
          queryClient={queryClient}
          queryKeyPrefix={opts?.queryKeyPrefix ?? 'trpc'}
        >
          {ui}
        </TRPCProvider>
      </QueryClientProvider>,
    );
  }

  function rerenderApp(render: RenderResult, ui: React.ReactNode) {
    return render.rerender(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider
          trpcClient={ctx.client}
          queryClient={queryClient}
          queryKeyPrefix={opts?.queryKeyPrefix}
        >
          {ui}
        </TRPCProvider>
      </QueryClientProvider>,
    );
  }

  return {
    ...ctx,
    opts: ctx,
    queryClient,
    renderApp,
    rerenderApp,
    useTRPC,
    useTRPCClient,
    optionsProxyClient,
    optionsProxyServer,
    /** @deprecated use resource manager instead */
    close: ctx.close,
  };
}
