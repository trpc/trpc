import { useQuery } from '@tanstack/react-query';
import { trpc } from './trpc';

export function Component() {
  useQuery(trpc.post.list.queryOptions());
}
