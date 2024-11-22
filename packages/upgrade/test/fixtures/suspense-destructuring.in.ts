import { trpc } from './trpc';

export function Component() {
  const [data, query] = trpc.post.list.useSuspenseQuery();

  const [a, b] = [1, 2];
}
