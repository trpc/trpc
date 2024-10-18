import '@testing-library/jest-dom/vitest';
import { routerToServerAndClientNew } from '../../tests/server/___testHelpers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Operation } from '@trpc/client';
import {
  getUntypedClient,
  httpBatchLink,
  splitLink,
  unstable_httpBatchStreamLink,
  unstable_httpSubscriptionLink,
  wsLink,
} from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import * as React from 'react';
import { vi } from 'vitest';
import { createTRPCContext, createTRPCOptionsProxy } from '../src';

export { ignoreErrors } from '../../tests/server/___testHelpers';

export function getServerAndReactClient<TRouter extends AnyTRPCRouter>(
  appRouter: TRouter,
  opts?: {
    subscriptions?: 'ws' | 'http';
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

  const queryClient = new QueryClient();

  const trpcClient = createTRPCOptionsProxy({
    client: getUntypedClient(ctx.client),
    queryClient,
  });

  const trpcServer = createTRPCOptionsProxy({
    router: appRouter,
    ctx: {},
    queryClient,
  });

  const { TRPCProvider, useTRPC } = createTRPCContext<TRouter>();

  function App(props: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={ctx.client} queryClient={queryClient}>
          {props.children}
        </TRPCProvider>
      </QueryClientProvider>
    );
  }

  return {
    close: ctx.close,
    queryClient,
    App,
    appRouter,
    opts: ctx,
    spyLink,
    useTRPC,
    trpcClient,
    trpcServer,
  };
}
