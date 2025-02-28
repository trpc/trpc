import { trpc } from './multipleFunctions.trpc';

export function Component1() {
  trpc.post.list.useQuery();
  trpc.a.b.c.d.useQuery();

  return 'ok';
}

export function Component2() {
  trpc.post.list.useQuery();
  trpc.a.b.c.d.useQuery();

  return 'ok';
}
