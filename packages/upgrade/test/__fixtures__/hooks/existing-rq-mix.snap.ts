import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';

export function Component() {
  const trpc = useTRPC();
  useQuery({ queryKey: ['a'], queryFn: () => 1 });
  useMutation({ mutationFn: () => 1 });

  useQuery(trpc.post.byId.queryOptions({ id: 1 }));
  useQuery(trpc.num.queryOptions(1));
  useInfiniteQuery(trpc.post.list.infiniteQueryOptions());
}
