import { QueryClient } from '@tanstack/react-query';

/**
 * Used by `_app` and by the pages that prefetch in `getServerSideProps`.
 * @see https://trpc.io/docs/client/nextjs/pages-router/setup#4-create-a-query-client-factory
 */
export function makeQueryClient() {
  return new QueryClient({
    /**
     * @see https://tanstack.com/query/v5/docs/reference/QueryClient
     */
    defaultOptions: { queries: { staleTime: 60 } },
  });
}
