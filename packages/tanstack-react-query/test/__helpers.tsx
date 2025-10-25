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
import type { FeatureFlags } from '../src';
import { createTRPCContext, createTRPCOptionsProxy } from '../src';

export function testReactResource<
  TRouter extends AnyTRPCRouter,
  TExtras extends {
    queryKeyPrefix?: string;
  },
>(
  appRouter: TRouter,
  opts?: TestServerAndClientResourceOpts<TRouter> & TExtras,
) {
  const ctx = testServerAndClientResource(appRouter, opts);

  const queryClient = new QueryClient();

  type ofFeatureFlags<T extends FeatureFlags> = T;
  type $Flags = undefined extends TExtras['queryKeyPrefix']
    ? ofFeatureFlags<{ enablePrefix: false }>
    : ofFeatureFlags<{ enablePrefix: true }>;

  const queryKeyPrefix = opts?.queryKeyPrefix as any;

  const optionsProxyClient = createTRPCOptionsProxy<TRouter, $Flags>({
    client: getUntypedClient(ctx.client),
    queryClient,
    queryKeyPrefix,
  });

  const optionsProxyServer = createTRPCOptionsProxy<TRouter, $Flags>({
    router: appRouter,
    ctx: {},
    queryClient,
    queryKeyPrefix,
  });

  const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<
    TRouter,
    $Flags
  >();

  function renderApp(ui: React.ReactNode) {
    return render(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider
          trpcClient={ctx.client}
          queryClient={queryClient}
          queryKeyPrefix={queryKeyPrefix}
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
          queryKeyPrefix={opts?.queryKeyPrefix as any}
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
