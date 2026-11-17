import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useTRPC } from './basic.trpc';

// The setup is `api`; this file calls it `trpc`
export function Component() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const post = useQuery(trpc.post.byId.queryOptions({ id: 1 }));
  return [queryClient, post.data];
}
