import { trpc } from './basic.trpc';

// A local function named like the hook doesn't hide the imported one either
export function Component() {
  function useQuery() {
    return null;
  }
  useQuery();
  return trpc.post.list.useQuery().data;
}
