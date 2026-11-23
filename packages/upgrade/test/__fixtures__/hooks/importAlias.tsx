import { api as trpc } from './basic.trpc';

// The setup is `api`; this file calls it `trpc`
export function Component() {
  const utils = trpc.useUtils();
  const post = trpc.post.byId.useQuery({ id: 1 });
  return [utils, post.data];
}
