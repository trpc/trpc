// TODO(@trpc/upgrade): more than one import looks like your tRPC setup `api`, migrate this file by hand
import { api as trpc } from './basic.trpc';
// TODO(@trpc/upgrade): more than one import looks like your tRPC setup `api`, migrate this file by hand
import { api as restApi } from './other';

// Both aliases look like a setup: don't guess, say so
export function Component() {
  restApi.useQuery();
  return trpc.post.list.useQuery().data;
}
