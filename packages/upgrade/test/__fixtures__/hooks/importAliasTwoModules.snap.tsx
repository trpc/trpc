import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './basic.trpc';
import { api as restApi } from './rest';

// Two modules export `api`; only `trpc` is used like the setup
export function Component() {
  const trpc = useTRPC();
  const post = useQuery(trpc.post.byId.queryOptions({ id: 1 }));
  return [restApi.get('/x'), post.data];
}
