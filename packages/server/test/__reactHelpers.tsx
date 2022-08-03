import { routerToServerAndClientNew } from './___testHelpers';
import { httpBatchLink, splitLink, wsLink } from '@trpc/client';
import React, { ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import {
  createReactQueryHooks,
  createReactQueryHooksProxy,
} from '../../react/src';
import { AnyRouter } from '../src/core';

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
  const react = createReactQueryHooks<typeof appRouter>();
  const proxy = createReactQueryHooksProxy<typeof appRouter>(react);
  const client = opts.client;

  function App(props: { children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    return (
      <react.Provider {...{ queryClient, client }}>
        <QueryClientProvider client={queryClient}>
          {props.children}
        </QueryClientProvider>
      </react.Provider>
    );
  }

  return {
    close: opts.close,
    client,
    queryClient,
    react,
    proxy,
    App,
    appRouter,
    opts,
  };
}
