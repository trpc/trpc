import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Operation, httpBatchLink, splitLink, wsLink } from '@trpc/client';
import React, { ReactNode } from 'react';
import { createTRPCReact } from '../../../react/src';
import { AnyRouter } from '../../src/core';

export function getServerAndReactClient<TRouter extends AnyRouter>(
  appRouter: TRouter,
) {
  const spyLink = jest.fn((_op: Operation<unknown>) => {
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
  const proxy = createTRPCReact<typeof appRouter>();
  const client = opts.client;

  function App(props: { children: ReactNode }) {
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
    spyLink,
  };
}
