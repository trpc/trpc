import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTRPC } from './existingRqMix.trpc';

export function Component1() {
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

export function Component2() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  useQuery({ queryKey: ['a'], queryFn: () => 1 });
  useQuery(trpc.post.byId.queryOptions({ id: 1 }));

  return queryClient.isFetching() ? 'loading' : 'loaded';
}

export function Component3() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  useQuery({ queryKey: ['a'], queryFn: () => 1 });
  useQuery(trpc.post.byId.queryOptions({ id: 1 }));

  useEffect(() => {
    queryClient.cancelQueries(trpc.post.byId.queryFilter({ id: 1 }));
  }, []);

  return queryClient.isFetching() ? 'loading' : 'loaded';
}
