import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // keep server-rendered data fresh for a while, so the
        // client doesn't fetch it again as soon as the page loads
        staleTime: 30 * 1000,
      },
      dehydrate: {
        // also send queries that are still loading; they stream in
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
        // Next.js finds dynamic pages by the errors it throws, so keep
        // them as they are; Next.js redacts them itself
        shouldRedactErrors: () => false,
      },
    },
  });
}
