import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';
import superjson from 'superjson';

/**
 * Used by the browser's provider and, once per request, by server components.
 * @see https://trpc.io/docs/client/nextjs/app-router-setup#4-create-a-query-client-factory
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // keep server-rendered data fresh for a while, so the
        // client doesn't fetch it again as soon as the page loads
        staleTime: 30 * 1000,
      },
      dehydrate: {
        // the tasks' `createdAt` reach the browser as a `Date`
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
        // Next.js reads the digest of the errors it throws, so don't redact them
        shouldRedactErrors: () => false,
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
