import '@testing-library/dom';
import '@testing-library/jest-dom/vitest';
import type { TestServerAndClientResourceOpts } from '@trpc/client/__tests__/testClientResource';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { getUntypedClient } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import * as React from 'react';
import { createTRPCContext, createTRPCOptionsProxy } from '../src';

export function testReactResource<TRouter extends AnyTRPCRouter>(
  appRouter: TRouter,
  opts?: TestServerAndClientResourceOpts<TRouter>,
) {
  const ctx = testServerAndClientResource(appRouter, opts);

  const queryClient = new QueryClient();

  const optionsProxyClient = createTRPCOptionsProxy({
    client: getUntypedClient(ctx.client),
    queryClient,
  });

  const optionsProxyServer = createTRPCOptionsProxy({
    router: appRouter,
    ctx: {},
    queryClient,
  });

  const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<TRouter>();

  function renderApp(ui: React.ReactNode) {
    return render(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={ctx.client} queryClient={queryClient}>
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
    useTRPC,
    useTRPCClient,
    optionsProxyClient,
    optionsProxyServer,
    /** @deprecated use resource manager instead */
    close: ctx.close,
  };
}
