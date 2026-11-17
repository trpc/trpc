import { useTRPC } from './getQueryKey.trpc';

export function useKeys() {
  const trpc = useTRPC();
  return [
    trpc.post.list.pathKey(),
    trpc.post.byId.queryKey({ id: 1 }),
    trpc.post.byId.queryKey({ id: 1 }),
    trpc.post.list.infiniteQueryKey(),
  ];
}
