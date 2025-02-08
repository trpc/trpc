import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Persister } from '@tanstack/react-query-persist-client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { Operation } from '@trpc/client';
import {
  getUntypedClient,
  httpBatchLink,
  splitLink,
  unstable_httpBatchStreamLink,
  unstable_httpSubscriptionLink,
  wsLink,
} from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { CreateTRPCReactBase } from '@trpc/react-query/createTRPCReact';
import type { AnyRouter } from '@trpc/server';
import type { ReactNode } from 'react';
import React from 'react';

export function getServerAndReactClient<TRouter extends AnyRouter>(
  appRouter: TRouter,
  opts?: {
    subscriptions?: 'ws' | 'http';
    persister?: Persister;
  },
) {
  const spyLink = vi.fn((_op: Operation<unknown>) => {
    // noop
  });

  const ctx = routerToServerAndClientNew(appRouter, {
    client: (clientOpts) => ({
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
          true:
            opts?.subscriptions === 'http'
              ? unstable_httpSubscriptionLink({
                  url: clientOpts.httpUrl,
                  transformer: clientOpts.transformer as any,
                })
              : wsLink({
                  client: clientOpts.wsClient,
                  transformer: clientOpts.transformer as any,
                }),
          false: splitLink({
            condition: (op) => !!op.context['stream'],
            true: unstable_httpBatchStreamLink({
              url: clientOpts.httpUrl,
              transformer: clientOpts.transformer as any,
            }),
            false: httpBatchLink({
              url: clientOpts.httpUrl,
              transformer: clientOpts.transformer as any,
            }),
          }),
        }),
      ],
    }),
  });

  const queryClient = createQueryClient();
  const proxy = createTRPCReact<TRouter, unknown>();
  const baseProxy = proxy as CreateTRPCReactBase<TRouter, unknown>;

  function App(props: { children: ReactNode }) {
    return (
      <baseProxy.Provider
        {...{ queryClient, client: getUntypedClient(ctx.client) }}
      >
        {opts?.persister ? (
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
              persister: opts.persister,
            }}
            onSuccess={() => {
              queryClient.resumePausedMutations().then(() => {
                queryClient.invalidateQueries();
              });
            }}
          >
            {props.children}
          </PersistQueryClientProvider>
        ) : (
          <QueryClientProvider client={queryClient}>
            {props.children}
          </QueryClientProvider>
        )}
      </baseProxy.Provider>
    );
  }

  return {
    ...ctx,
    queryClient,
    client: proxy,
    App,
    appRouter,
    opts: ctx,
    spyLink,
  };
}
