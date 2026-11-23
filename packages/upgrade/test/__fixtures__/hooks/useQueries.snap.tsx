import { useQueries } from '@tanstack/react-query';
import { useTRPC } from './useQueries.trpc';

export function Component() {
  const trpc = useTRPC();
  const queries = useQueries({
    queries: [
      trpc.post.byId.queryOptions({ id: 1 }),
      trpc.num.queryOptions(2, { staleTime: 1000 }),
    ],
  });
  const ids = [1, 2];
  const byIds = useQueries({
    queries: ids.map((id) => trpc.post.byId.queryOptions({ id })),
  });

  return [...queries, ...byIds].every((query) => query.data !== undefined)
    ? 'loaded'
    : 'loading';
}
