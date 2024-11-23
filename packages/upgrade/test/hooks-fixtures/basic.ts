import { trpc } from './trpc';

export function Component() {
  trpc.post.list.useQuery();
  trpc.post.useQuery();
  trpc.a.b.c.d.useQuery();

  trpc.post.byId.useQuery({ id: 1 });
  trpc.num.useQuery(1);

  trpc.post.list.useQuery(undefined, { staleTime: 1000 });
  trpc.post.byId.useQuery({ id: 1 }, { staleTime: 1000 });
}
