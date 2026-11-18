import { QueryClient } from '@tanstack/react-query';

/**
 * Used by `_app` and by `getStaticProps`.
 * @see https://trpc.io/docs/client/nextjs/pages-router/setup#4-create-a-query-client-factory
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // keep server-rendered data fresh for a while, so the
        // client doesn't fetch it again as soon as the page loads
        staleTime: 30 * 1000,
      },
    },
  });
}
