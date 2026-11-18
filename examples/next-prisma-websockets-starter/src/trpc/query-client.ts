import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';
import superjson from 'superjson';

/**
 * @see https://trpc.io/docs/client/nextjs/app-router-setup#4-create-a-query-client-factory
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * Short, so the list refetches once the page loads and catches posts
         * sent before the WebSocket opened
         */
        staleTime: 60,
      },
      dehydrate: {
        // Hydrated data crosses to the browser with `Date`s intact
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
        // Next.js reads the `digest` of the errors it throws, so don't redact them
        shouldRedactErrors: () => false,
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
