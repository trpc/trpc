import { api as trpc } from './basic.trpc';
import { api as restApi } from './other';

// Both aliases look like a setup: don't guess, say so
export function Component() {
  restApi.useQuery();
  return trpc.post.list.useQuery().data;
}
