import { getQueryKey } from '@trpc/react-query';
import { useTRPC } from './getQueryKey.trpc';

export function useKeys() {
  const trpc = useTRPC();
  // TODO(@trpc/upgrade): use `trpc.x.queryKey(input)` or `trpc.x.infiniteQueryKey(input)`, see https://trpc.io/docs/client/tanstack-react-query/migrating
  return [
    trpc.post.list.pathKey(),
    getQueryKey(trpc.post.byId, { id: 1 }),
    trpc.post.byId.queryKey({ id: 1 }),
    trpc.post.list.infiniteQueryKey(),
  ];
}
