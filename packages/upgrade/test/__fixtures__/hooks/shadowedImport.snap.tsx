import { useQuery as useQuery2 } from '@tanstack/react-query';
import { useTRPC } from './basic.trpc';

// The component's own `useQuery` doesn't hide the imported one
export function Component({ useQuery }: { useQuery: () => void }) {
  const trpc = useTRPC();
  useQuery();
  return useQuery2(trpc.post.list.queryOptions()).data;
}
