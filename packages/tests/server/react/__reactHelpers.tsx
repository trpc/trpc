import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Operation, httpBatchLink, splitLink, wsLink } from '@trpc/client/src';
import { createTRPCReact } from '@trpc/react-query/src';
import { CreateTRPCReactBase } from '@trpc/react-query/src/createTRPCReact';
import { AnyRouter } from '@trpc/server/src';
import React, { ReactNode } from 'react';

export function getServerAndReactClient<TRouter extends AnyRouter>(
  appRouter: TRouter,
) {
  const spyLink = vi.fn((_op: Operation<unknown>) => {
    // noop
  });

  const opts = routerToServerAndClientNew(appRouter, {
    client: ({ wsClient, httpUrl }) => ({
      links: [
        () => {
          // here we just got initialized in the app - this happens once per app
          // useful for storing cache for instance
          return ({ next, op }) => {
            // this is when passing the result to the next link

            spyLink(op);
            return next(op);
          };
        },
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: wsLink({ client: wsClient }),
          false: httpBatchLink({ url: httpUrl }),
        }),
      ],
    }),
  });

  const queryClient = createQueryClient();
  const proxy = createTRPCReact<TRouter, unknown, 'ExperimentalSuspense'>();
  const baseProxy = proxy as CreateTRPCReactBase<TRouter, unknown>;

  const client = opts.client;

  function App(props: { children: ReactNode }) {
    return (
      <baseProxy.Provider {...{ queryClient, client }}>
        <QueryClientProvider client={queryClient}>
          {props.children}
        </QueryClientProvider>
      </baseProxy.Provider>
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
    spyLink,
  };
}
