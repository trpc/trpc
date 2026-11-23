import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './basic.trpc';

// A parameter named like the setup is not the setup
export function Component({
  trpc: client,
}: {
  trpc: { post: { list: { useQuery(): { data: unknown } } } };
}) {
  return client.post.list.useQuery().data;
}

export function Component2({
  trpc,
}: {
  trpc: { post: { list: { useQuery(): { data: unknown } } } };
}) {
  const outer = useOuter();
  return [trpc.post.list.useQuery().data, outer];
}

function useOuter() {
  const trpc = useTRPC();
  return useQuery(trpc.post.list.queryOptions()).data;
}
