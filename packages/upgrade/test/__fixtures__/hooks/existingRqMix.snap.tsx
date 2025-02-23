import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTRPC } from './existingRqMix.trpc';

export function Component() {
  const trpc = useTRPC();
  useQuery({ queryKey: ['a'], queryFn: () => 1 });
  useMutation({ mutationFn: async () => 1 });

  useQuery(trpc.post.byId.queryOptions({ id: 1 }));
  useQuery(trpc.num.queryOptions(1));
  useInfiniteQuery(
    trpc.post.list.infiniteQueryOptions(
      {},
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );

  return useQueryClient().isFetching() ? 'loading' : 'loaded';
}
