import { QueryClient } from '@tanstack/react-query';

/**
 * Used by `_app` and by any page that prefetches on the server
 * @see https://trpc.io/docs/v11/client/nextjs/pages-router/setup#4-create-a-query-client-factory
 * @see https://tanstack.com/query/v5/docs/reference/QueryClient
 */
export function makeQueryClient() {
  return new QueryClient();
}
