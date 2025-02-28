import '@testing-library/dom';
import '@testing-library/jest-dom/vitest';
import type { TestServerAndClientResourceOpts } from '../../client/src/__tests__/testClientResource';
import { testServerAndClientResource } from '../../client/src/__tests__/testClientResource';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { getUntypedClient } from '@trpc/client';
import * as rq from '@trpc/react-query';
import { type AnyTRPCRouter } from '@trpc/server';
import * as trq from '@trpc/tanstack-react-query';
import * as React from 'react';

export function testReactResource<TRouter extends AnyTRPCRouter>(
  appRouter: TRouter,
  opts?: TestServerAndClientResourceOpts<TRouter>,
) {
  const ctx = testServerAndClientResource(appRouter, opts);

  const queryClient = new QueryClient();

  const untypedClient = getUntypedClient(ctx.client);
  const optionsProxyClient = trq.createTRPCOptionsProxy({
    client: untypedClient,
    queryClient,
  });

  const optionsProxyServer = trq.createTRPCOptionsProxy({
    router: appRouter,
    ctx: {},
    queryClient,
  });

  const trpcRq = rq.createTRPCReact<TRouter>();
  const baseProxy = trpcRq as rq.CreateTRPCReactBase<TRouter, unknown>;

  const trpcTrq = trq.createTRPCContext<TRouter>();

  function renderApp(ui: React.ReactNode) {
    return render(
      <QueryClientProvider client={queryClient}>
        <baseProxy.Provider client={ctx.client} queryClient={queryClient}>
          <trpcTrq.TRPCProvider
            trpcClient={ctx.client}
            queryClient={queryClient}
          >
            <React.Suspense fallback="suspended...">{ui}</React.Suspense>
          </trpcTrq.TRPCProvider>
        </baseProxy.Provider>
      </QueryClientProvider>,
    );
  }

  return {
    ...ctx,
    opts: ctx,
    queryClient,
    renderApp,
    trq: trpcTrq,
    rq: trpcRq,
    optionsProxyClient,
    optionsProxyServer,
    /** @deprecated use resource manager instead */
    close: ctx.close,
  };
}
