import { trpc } from './trpc';

export function Component1() {
  trpc.post.list.useQuery();
  trpc.post.useQuery();
  trpc.a.b.c.d.useQuery();
}

export function Component2() {
  trpc.post.list.useQuery();
  trpc.post.useQuery();
  trpc.a.b.c.d.useQuery();
}
