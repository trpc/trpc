import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './multipleFunctions.trpc';

export function Component1() {
  const trpc = useTRPC();
  useQuery(trpc.post.list.queryOptions());
  useQuery(trpc.a.b.c.d.queryOptions());

  return 'ok';
}

export function Component2() {
  const trpc = useTRPC();
  useQuery(trpc.post.list.queryOptions());
  useQuery(trpc.a.b.c.d.queryOptions());

  return 'ok';
}
