import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/dom';
import '@testing-library/jest-dom/vitest';
import type { TestServerAndClientResourceOpts } from '@trpc/client/__tests__/testClientResource';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { RenderResult } from '@testing-library/react';
import { render } from '@testing-library/react';
import { getUntypedClient } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import * as React from 'react';
import type { ofFeatureFlags } from '../src';
import { createTRPCContext, createTRPCOptionsProxy } from '../src';

export function testReactResource<
  TRouter extends AnyTRPCRouter,
  TExtras extends {
    keyPrefix?: string;
  },
>(
  appRouter: TRouter,
  opts?: TestServerAndClientResourceOpts<TRouter> & TExtras,
) {
  const ctx = testServerAndClientResource(appRouter, opts);

  const queryClient = new QueryClient();

  type $Flags = undefined extends TExtras['keyPrefix']
    ? ofFeatureFlags<{ keyPrefix: false }>
    : ofFeatureFlags<{ keyPrefix: true }>;

  const keyPrefix = opts?.keyPrefix as any;

  const optionsProxyClient = createTRPCOptionsProxy<TRouter, $Flags>({
    client: getUntypedClient(ctx.client),
    queryClient,
    keyPrefix,
  });

  const optionsProxyServer = createTRPCOptionsProxy<TRouter, $Flags>({
    router: appRouter,
    ctx: {},
    queryClient,
    keyPrefix,
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
          keyPrefix={keyPrefix}
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
          keyPrefix={opts?.keyPrefix as any}
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
