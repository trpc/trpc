import { MutationCache, QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  const queryClient: QueryClient = new QueryClient({
    // Invalidate all queries after every successful mutation
    mutationCache: new MutationCache({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  });
  return queryClient;
}
