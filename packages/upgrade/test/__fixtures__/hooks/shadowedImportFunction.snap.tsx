import { useQuery as useQuery2 } from '@tanstack/react-query';
import { useTRPC } from './basic.trpc';

// A local function named like the hook doesn't hide the imported one either
export function Component() {
  const trpc = useTRPC();
  function useQuery() {
    return null;
  }
  useQuery();
  return useQuery2(trpc.post.list.queryOptions()).data;
}
