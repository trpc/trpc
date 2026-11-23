import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client.
        staleTime: 30 * 1000,
      },
      dehydrate: {
        // Send pending queries too; they stream in as they settle
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
        // Next.js detects dynamic pages by the `digest` on the errors it
        // throws, so keep them intact
        shouldRedactErrors: () => false,
      },
    },
  });
}
