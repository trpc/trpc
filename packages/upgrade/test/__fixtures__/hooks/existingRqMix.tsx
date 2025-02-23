import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trpc } from './existingRqMix.trpc';

export function Component() {
  useQuery({ queryKey: ['a'], queryFn: () => 1 });
  useMutation({ mutationFn: async () => 1 });

  trpc.post.byId.useQuery({ id: 1 });
  trpc.num.useQuery(1);
  trpc.post.list.useInfiniteQuery(
    {},
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  return useQueryClient().isFetching() ? 'loading' : 'loaded';
}
