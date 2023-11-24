import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { createTRPCReact, getUntypedClient } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React, { createContext } from 'react';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouterA = t.router({
      serverAQuery: t.procedure.query(() => 'serverA'),
    });
    const appRouterB = t.router({
      serverBQuery: t.procedure.query(() => 'serverB'),
    });
    const appRouterC = t.router({
      serverCQuery: t.procedure.query(() => 'serverC'),
    });

    return {
      A: routerToServerAndClientNew(appRouterA),
      B: routerToServerAndClientNew(appRouterB),
      C: routerToServerAndClientNew(appRouterC),
    };
  })
  .afterEach(async (ctx) => {
    await ctx.A?.close();
    await ctx.B?.close();
    await ctx.C?.close();
  })
  .done();

test('multiple trpcProviders', async () => {
  const A = (() => {
    return {
      trpc: createTRPCReact<(typeof ctx)['A']['router']>({
        // default context
      }),
      queryClient: createQueryClient(),
    };
  })();

  const B = (() => {
    return {
      trpc: createTRPCReact<(typeof ctx)['B']['router']>({
        context: createContext(null),
      }),
      queryClient: createQueryClient(),
    };
  })();

  const C = (() => {
    return {
      trpc: createTRPCReact<(typeof ctx)['C']['router']>({
        context: createContext(null),
      }),
      queryClient: createQueryClient(),
    };
  })();

  function MyComponent() {
    const queryA = A.trpc.serverAQuery.useQuery();
    const queryB = B.trpc.serverBQuery.useQuery();
    const queryC = C.trpc.serverCQuery.useQuery();

    return (
      <ul>
        <li>A:{queryA.data}</li>
        <li>B:{queryB.data}</li>
        <li>C:{queryC.data}</li>
      </ul>
    );
  }
  function App() {
    return (
      <A.trpc.Provider
        queryClient={A.queryClient}
        client={getUntypedClient(ctx.A.client)}
      >
        <QueryClientProvider client={A.queryClient}>
          <B.trpc.Provider
            queryClient={B.queryClient}
            client={getUntypedClient(ctx.B.client)}
          >
            <QueryClientProvider client={B.queryClient}>
              <C.trpc.Provider
                queryClient={C.queryClient}
                client={getUntypedClient(ctx.C.client)}
              >
                <QueryClientProvider client={C.queryClient}>
                  <MyComponent />
                </QueryClientProvider>
              </C.trpc.Provider>
            </QueryClientProvider>
          </B.trpc.Provider>
        </QueryClientProvider>
      </A.trpc.Provider>
    );
  }

  const utils = render(<App />);

  await waitFor(() => {
    expect(utils.container).toHaveTextContent('A:serverA');
  });
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('B:serverB');
  });
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('C:serverC');
  });
});
