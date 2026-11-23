import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';

/**
 * Used by `TRPCReactProvider` in the browser and by `trpc/server.tsx` once per request
 * @see https://trpc.io/docs/v11/client/nextjs/app-router-setup#4-create-a-query-client-factory
 * @see https://tanstack.com/query/v5/docs/reference/QueryClient
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client.
        staleTime: 30 * 1000,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
        // Next.js detects dynamic pages by the errors it throws, so keep them intact
        shouldRedactErrors: () => false,
      },
    },
  });
}
