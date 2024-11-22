import { trpc } from './trpc';

export function Component() {
  trpc.post.list.useQuery();
}
