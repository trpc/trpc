import { api as trpc } from './basic.trpc';
import { api as restApi } from './rest';

// Two modules export `api`; only `trpc` is used like the setup
export function Component() {
  const post = trpc.post.byId.useQuery({ id: 1 });
  return [restApi.get('/x'), post.data];
}
