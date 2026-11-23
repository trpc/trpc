// TODO(@trpc/upgrade): more than one import looks like your tRPC setup `api`, migrate this file by hand
import { api } from './basic.trpc';
// TODO(@trpc/upgrade): more than one import looks like your tRPC setup `api`, migrate this file by hand
import { api as other } from './other';

// `api` and `api as other` both look like setups: don't pick one
export function Component() {
  other.post.list.useQuery();
  return api.post.list.useQuery().data;
}
