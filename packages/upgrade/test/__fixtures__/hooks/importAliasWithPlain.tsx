import { api } from './basic.trpc';
import { api as other } from './other';

// `api` and `api as other` both look like setups: don't pick one
export function Component() {
  other.post.list.useQuery();
  return api.post.list.useQuery().data;
}
