import { trpc } from './basic.trpc';

// The component's own `useQuery` doesn't hide the imported one
export function Component({ useQuery }: { useQuery: () => void }) {
  useQuery();
  return trpc.post.list.useQuery().data;
}
