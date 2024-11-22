import { useSuspenseQuery } from '@tanstack/react-query';
import { trpc } from './trpc';

export function Component() {
  const query = useSuspenseQuery(trpc.post.list.queryOptions());

  const data = query.data;

  const [a, b] = [1, 2];
}
