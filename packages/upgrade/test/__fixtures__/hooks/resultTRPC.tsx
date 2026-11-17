import { trpc } from './basic.trpc';

// `mutation.trpc` is on the options now
export function Component() {
  const mutation = trpc.post.create.useMutation();
  const query = trpc.post.list.useQuery();
  return [mutation.trpc.path, query.trpc.path];
}
