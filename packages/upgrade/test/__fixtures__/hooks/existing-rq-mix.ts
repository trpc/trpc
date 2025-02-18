import { useMutation, useQuery } from '@tanstack/react-query';
import { trpc } from './trpc';

export function Component() {
  useQuery({ queryKey: ['a'], queryFn: () => 1 });
  useMutation({ mutationFn: () => 1 });

  trpc.post.byId.useQuery({ id: 1 });
  trpc.num.useQuery(1);
  trpc.post.list.useInfiniteQuery();
}
