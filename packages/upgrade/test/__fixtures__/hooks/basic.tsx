import { useQueryClient } from '@tanstack/react-query';
import { trpc } from './basic.trpc';

export function Component() {
  trpc.post.list.useQuery();
  trpc.a.b.c.d.useQuery();

  trpc.post.byId.useQuery({ id: 1 });
  trpc.num.useQuery(1);
  // eslint-disable-next-line @typescript-eslint/dot-notation
  trpc['num'].useQuery(21);

  trpc.post.list.useQuery(undefined, { staleTime: 1000 });
  trpc.post.byId.useQuery({ id: 1 }, { staleTime: 1000 });

  return useQueryClient().isFetching() ? 'loading' : 'loaded';
}
