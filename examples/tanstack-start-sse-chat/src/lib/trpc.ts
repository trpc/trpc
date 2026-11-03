import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import {
  createTRPCClient,
  httpBatchStreamLink,
  httpSubscriptionLink,
  localLink,
  loggerLink,
  splitLink,
  type TRPCLink,
} from '@trpc/client';
import {
  createTRPCContext,
  type TRPCOptionsProxy,
} from '@trpc/tanstack-react-query';
import SuperJSON from 'superjson';
import { createContext } from '~/server/context';
import type { AppRouter } from '~/server/routers/_app';
import { appRouter } from '~/server/routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export type TRPC = TRPCOptionsProxy<AppRouter>;

/**
 * During SSR, procedures are called in this process with the page request.
 * The browser calls them over HTTP.
 */
const getLinks = createIsomorphicFn()
  .server((): TRPCLink<AppRouter>[] => [
    localLink({
      router: appRouter,
      createContext: () => createContext({ req: getRequest() }),
      /**
       * @see https://trpc.io/docs/v11/data-transformers
       */
      transformer: SuperJSON,
    }),
  ])
  .client((): TRPCLink<AppRouter>[] => {
    const url = `${window.location.origin}/api/trpc`;
    return [
      // adds pretty logs to your console in development and logs errors in production
      loggerLink(),
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: httpSubscriptionLink({
          url,
          /**
           * @see https://trpc.io/docs/v11/data-transformers
           */
          transformer: SuperJSON,
        }),
        false: httpBatchStreamLink({
          url,
          /**
           * @see https://trpc.io/docs/v11/data-transformers
           */
          transformer: SuperJSON,
        }),
      }),
    ];
  });

export const makeTRPCClient = () =>
  createTRPCClient<AppRouter>({ links: getLinks() });
