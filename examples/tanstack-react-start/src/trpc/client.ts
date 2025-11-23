import { createIsomorphicFn } from '@tanstack/react-start';
import {
  createTRPCClient,
  httpBatchStreamLink,
  httpSubscriptionLink,
  splitLink,
  unstable_localLink,
} from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { appRouter, type AppRouter } from '~/trpc/router/_app';
import { createTRPCContextInner } from './init';
import { transformer } from './transformer';

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

/**
 * Create a TRPC client that on the server invokes procedures
 * locally, and on the client uses HTTP batch streaming.
 */
export const makeTRPCClient = createIsomorphicFn()
  .server(() => {
    return createTRPCClient<AppRouter>({
      links: [
        unstable_localLink({
          router: appRouter,
          transformer,
          createContext: () => createTRPCContextInner(),
        }),
      ],
    });
  })
  .client(() => {
    return createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: httpSubscriptionLink({
            url: '/api/trpc',
            transformer,
          }),
          false: httpBatchStreamLink({
            url: '/api/trpc',
            transformer,
          }),
        }),
      ],
    });
  });

export type RouterOutputs = inferRouterOutputs<AppRouter>;
