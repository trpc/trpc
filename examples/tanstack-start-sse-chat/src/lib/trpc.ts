import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import {
  createTRPCClient,
  experimental_pipelining,
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
import { slowQueriesHeaders } from '~/lib/blog-settings';
import { meteredFetch } from '~/lib/request-meter';
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
          // Lets a query read its input from another query's data, in one
          // request. The blog pages load a post and its author this way
          experimental_pipelining: experimental_pipelining(),
          // Queries go as POST, so the Network tab shows their inputs as JSON
          methodOverride: 'POST',
          // The blog's "Slow queries" setting, from its search params
          headers: () => slowQueriesHeaders(),
          // Only for the request meter on the blog pages: it counts the requests
          fetch: meteredFetch,
        }),
      }),
    ];
  });

export const makeTRPCClient = () =>
  createTRPCClient<AppRouter>({ links: getLinks() });
