import { routerToServerAndClientNew } from '../___testHelpers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, splitLink, wsLink } from '@trpc/client';
import React, { ReactNode, useState } from 'react';
import { createTRPCReact } from '../../../react/src';
import { AnyRouter } from '../../src/core';

export function getServerAndReactClient<TRouter extends AnyRouter>(
  appRouter: TRouter,
) {
  const opts = routerToServerAndClientNew(appRouter, {
    client: ({ wsClient, httpUrl }) => ({
      links: [
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: wsLink({ client: wsClient }),
          false: httpBatchLink({ url: httpUrl }),
        }),
      ],
    }),
  });

  const queryClient = new QueryClient();
  const proxy = createTRPCReact<typeof appRouter>();
  const client = opts.client;

  function App(props: { children: ReactNode }) {
    const [queryClient] = useState(
      () =>
        new QueryClient({
          defaultOptions: {
            queries: {
              retryDelay() {
                return 1;
              },
            },
          },
        }),
    );
    return (
      <proxy.Provider {...{ queryClient, client }}>
        <QueryClientProvider client={queryClient}>
          {props.children}
        </QueryClientProvider>
      </proxy.Provider>
    );
  }

  return {
    close: opts.close,
    client,
    queryClient,
    proxy,
    App,
    appRouter,
    opts,
  };
}
