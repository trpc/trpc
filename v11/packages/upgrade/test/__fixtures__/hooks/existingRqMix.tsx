import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { trpc } from './existingRqMix.trpc';

export function Component1() {
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

export function Component2() {
  const queryClient = useQueryClient();

  useQuery({ queryKey: ['a'], queryFn: () => 1 });
  trpc.post.byId.useQuery({ id: 1 });

  return queryClient.isFetching() ? 'loading' : 'loaded';
}

export function Component3() {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  useQuery({ queryKey: ['a'], queryFn: () => 1 });
  trpc.post.byId.useQuery({ id: 1 });

  useEffect(() => {
    utils.post.byId.cancel({ id: 1 });
  }, []);

  return queryClient.isFetching() ? 'loading' : 'loaded';
}
