import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';

export function Component() {
  const trpc = useTRPC();
  useQuery(trpc.post.list.queryOptions());
  useQuery(trpc.post.queryOptions());
  useQuery(trpc.a.b.c.d.queryOptions());
  // eslint-disable-next-line @typescript-eslint/dot-notation
  useQuery(trpc['post'].queryOptions());

  useQuery(trpc.post.byId.queryOptions({ id: 1 }));
  useQuery(trpc.num.queryOptions(1));

  useQuery(trpc.post.list.queryOptions(undefined, { staleTime: 1000 }));
  useQuery(trpc.post.byId.queryOptions({ id: 1 }, { staleTime: 1000 }));
}
