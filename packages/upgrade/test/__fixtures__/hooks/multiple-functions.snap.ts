import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';

export function Component1() {
  const trpc = useTRPC();
  useQuery(trpc.post.list.queryOptions());
  useQuery(trpc.post.queryOptions());
  useQuery(trpc.a.b.c.d.queryOptions());
}

export function Component2() {
  const trpc = useTRPC();
  useQuery(trpc.post.list.queryOptions());
  useQuery(trpc.post.queryOptions());
  useQuery(trpc.a.b.c.d.queryOptions());
}
